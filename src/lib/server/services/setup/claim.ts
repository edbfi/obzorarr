import type { Database } from "#lib/server/db/client.ts";
import { insertOwner } from "#lib/server/db/owner.ts";
import { writeSetting } from "#lib/server/db/settings.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import { HASH_SLOT_RETRY_SECONDS, hashSlots } from "#lib/server/security/hash-slots.ts";
import {
	checkPassword,
	checkUsername,
	hashPassword,
	type PasswordError,
	type UsernameError,
} from "#lib/server/security/password.ts";
import { createRateLimiter, rateLimitHeaders } from "#lib/server/security/rate-limit.ts";
import { type StartedSession, startSession } from "#lib/server/services/sign-in/sessions.ts";
import {
	FIRST_RUN_COMPLETE,
	FIRST_RUN_STEP_KEY,
	isClaimed,
	markClaimed,
	useToken,
	withClaimInProgress,
} from "./first-run.ts";

export type ClaimInput = {
	token: string;
	username: string;
	password: string;
	/** The rate limits' key for the request, or undefined when it has no known address. */
	clientAddress?: string | undefined;
};

export type ClaimResult =
	/** Claimed, with the owner's new session, which signs them in (D20). */
	| { status: "claimed"; session: StartedSession }
	/** The instance is claimed already: the claim no longer exists. */
	| { status: "not-found" }
	| { status: "invalid"; username?: UsernameError; password?: PasswordError }
	/** A wrong or expired token: one answer for both. */
	| { status: "token" }
	/**
	 * Refused for now, with when to try again and the headers saying so: the address used up the
	 * claim's limit, or every hash slot was busy.
	 */
	| {
			status: "too-many";
			reason: "limit" | "busy";
			retryAfterSeconds: number;
			headers: Record<string, string>;
	  }
	| { status: "failed" };

const log = createLogger("setup");

/** The claim: 5 tries per 5 minutes from one address (SPEC-sign-in.md, "Rate limits"). */
const claimLimit = createRateLimiter({ limit: 5, windowMs: 5 * 60_000 });

const SLOTS_BUSY: ClaimResult = {
	status: "too-many",
	reason: "busy",
	retryAfterSeconds: HASH_SLOT_RETRY_SECONDS,
	headers: { "retry-after": String(HASH_SLOT_RETRY_SECONDS) },
};

/**
 * Claims the instance for its one owner (SPEC-setup.md, "The claim"), in this order:
 * 1. the claim's limit for the request's address, when it has one;
 * 2. the fields, checked with nothing awaited, so a field error leaves the token unused;
 * 3. a hash slot, so a refused slot never burns the token (SPEC-sign-in.md, "Signing in");
 * 4. the token, checked and used up with no `await` between, so a wrong guess costs no hash;
 * 5. the hash of the password;
 * 6. one transaction that creates the owner, moves the step pointer and starts the owner's
 *    session, so the new owner is signed in (D20).
 * If anything after the token fails while the instance is still unclaimed, first run prints a
 * new token. The claim stores nothing but the owner row, the pointer and the session.
 */
export async function claimInstance(db: Database, input: ClaimInput): Promise<ClaimResult> {
	if (isClaimed()) return { status: "not-found" };
	if (input.clientAddress !== undefined) {
		const decision = claimLimit.hit(input.clientAddress);
		if (!decision.allowed) {
			return {
				status: "too-many",
				reason: "limit",
				retryAfterSeconds: decision.retryAfterSeconds,
				headers: rateLimitHeaders(decision),
			};
		}
	}
	return withClaimInProgress(async () => {
		const username = checkUsername(input.username);
		const password = checkPassword(
			input.password,
			username.ok ? username.username : input.username.trim(),
		);
		if (!username.ok || !password.ok) {
			return {
				status: "invalid",
				...(username.ok ? {} : { username: username.error }),
				...(password.ok ? {} : { password: password.error }),
			};
		}
		const releaseSlot = hashSlots.take();
		if (releaseSlot === undefined) return SLOTS_BUSY;
		if (!useToken(input.token)) {
			releaseSlot();
			return { status: "token" };
		}
		let session: StartedSession;
		try {
			let passwordHash: string;
			try {
				passwordHash = await hashPassword(password.password);
			} finally {
				// Freed however the hash ends, a throw before it returns a promise included.
				releaseSlot();
			}
			const now = new Date();
			session = await db.transaction(async (tx) => {
				await insertOwner(tx, { username: username.username, passwordHash, createdAt: now });
				await writeSetting(tx, FIRST_RUN_STEP_KEY, FIRST_RUN_COMPLETE, now);
				const started = await startSession(tx, { passwordHash, now });
				// The owner was written in this transaction, so their session always starts.
				if (started === undefined) throw new Error("the claim's session didn't start");
				return started;
			});
		} catch (error) {
			log.error("the claim failed", { error });
			return { status: "failed" };
		}
		markClaimed();
		return { status: "claimed", session };
	});
}
