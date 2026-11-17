import { type Database, queryFailure } from "#lib/server/db/client.ts";
import { findOwner, writePasswordHash } from "#lib/server/db/owner.ts";
import { deleteAllSessions } from "#lib/server/db/owner-session.ts";
import { deleteSetting, readSetting, writeSetting } from "#lib/server/db/settings.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import {
	type ConsoleToken,
	formatToken,
	issueToken,
	isTokenValid,
	TOKEN_LIFETIME_MS,
	tokenMatches,
} from "#lib/server/security/console-token.ts";
import { hashSlots } from "#lib/server/security/hash-slots.ts";
import { checkPassword, hashPassword, type PasswordError } from "#lib/server/security/password.ts";
import { createRateLimiter, rateLimitHeaders } from "#lib/server/security/rate-limit.ts";
import { SLOTS_BUSY, type TooMany } from "./password-checks.ts";
import { type StartedSession, startSession } from "./sessions.ts";

/** The settings key that records that recovery's token was used, until the setting is off. */
export const RECOVERY_USED_KEY = "sign-in.recovery.used";

export type RecoveryOptions = {
	readonly db: Database;
	/** `OBZORARR_RECOVERY`, read at startup. */
	readonly enabled: boolean;
	/** Whether the instance had an owner at startup: until it had, the setting is ignored. */
	readonly claimed: boolean;
	/** `ORIGIN`, parsed, so the printed line can give the full address. */
	readonly origin: string | undefined;
	/** Where the token line goes: standard output, never the logs. */
	readonly print?: (line: string) => void;
};

const log = createLogger("sign-in");

/** Recovery's state, in memory (one process, D17): startup sets it; `/recovery` checks the token. */
let enabled = false;
let token: ConsoleToken | undefined;

/** Console output for whoever runs the server; it still reaches the container's output. */
const toStandardOutput = (line: string) => process.stdout.write(`${line}\n`);

/**
 * Recovery's startup work (SPEC-sign-in.md, "Recovery"). While the setting is on and the instance
 * claimed, a recovery token is printed, once per start, unless one was used since the setting was
 * turned on; startup warns whenever the setting is on, and ignores it on an unclaimed instance.
 * While the setting is off, the record that a token was used is cleared, so turning it on again
 * prints a new one.
 */
export async function startRecovery(options: RecoveryOptions): Promise<void> {
	enabled = options.enabled;
	token = undefined;
	if (!options.enabled) {
		await deleteSetting(options.db, RECOVERY_USED_KEY);
		return;
	}
	if (!options.claimed) {
		log.warn("recovery is ignored until the instance is claimed; remove OBZORARR_RECOVERY");
		return;
	}
	if ((await readSetting(options.db, RECOVERY_USED_KEY)) !== undefined) {
		log.warn("recovery is on, but its token was used; remove OBZORARR_RECOVERY and restart");
		return;
	}
	token = issueToken(Date.now(), TOKEN_LIFETIME_MS);
	const address = `${options.origin ?? ""}/recovery`;
	const minutes = Math.round(TOKEN_LIFETIME_MS / 60_000);
	(options.print ?? toStandardOutput)(
		`Recovery token: ${formatToken(token.value)} (valid for ${minutes} minutes). Open ${address} to set a new owner password.`,
	);
	log.warn(
		"recovery is on: a recovery token is printed to standard output; remove OBZORARR_RECOVERY and restart once it is used",
	);
}

/** Whether `OBZORARR_RECOVERY` is on, for the Security tab's warning. */
export function isRecoveryOn(): boolean {
	return enabled;
}

/** Whether `/recovery` is open: a recovery token was printed and hasn't been used. */
export function isRecoveryWaiting(): boolean {
	return token !== undefined;
}

export type RecoveryInput = {
	token: string;
	password: string;
	/** The rate limits' key for the request, or undefined when it has no known address. */
	clientAddress?: string | undefined;
};

export type RecoveryResult =
	/** Recovered, with this browser's new session; every other session ended. */
	| { status: "recovered"; session: StartedSession }
	/** No recovery token is waiting: `/recovery` doesn't exist. */
	| { status: "not-found" }
	/** The new password breaks one of `setup`'s rules. */
	| { status: "invalid"; error: PasswordError }
	/** A wrong or expired token: one answer for both. */
	| { status: "token" }
	| TooMany
	/** The token was used, but the change didn't commit: a restart prints a new one. */
	| { status: "failed" };

/** Recovery: 5 tries per 5 minutes from one address (SPEC-sign-in.md, "Rate limits"). */
const recoveryLimit = createRateLimiter({ limit: 5, windowMs: 5 * 60_000 });

/**
 * Sets a new owner password with the recovery token (SPEC-sign-in.md, "Recovery"), in the claim's
 * order: the address's limit; the password against `setup`'s rules; a hash slot; the token, then
 * the rule against the stored username, then the token used up, with nothing awaited in between,
 * so a wrong guess costs no hash and learns nothing of the username; the hash; then one
 * transaction that sets it, ends every session, starts this browser's and records that recovery
 * was used, so no new token is printed while the setting stays on.
 */
export async function recover(
	db: Database,
	input: RecoveryInput,
	now = new Date(),
): Promise<RecoveryResult> {
	if (token === undefined) return { status: "not-found" };
	const address = input.clientAddress;
	if (address !== undefined) {
		const decision = recoveryLimit.hit(address);
		if (!decision.allowed) {
			return {
				status: "too-many",
				reason: "limit",
				retryAfterSeconds: decision.retryAfterSeconds,
				headers: rateLimitHeaders(decision),
			};
		}
	}
	const found = await findOwner(db);
	if (found === undefined) return { status: "not-found" };
	// Every rule but the username's: that one would tell someone without the token whether a
	// string is the owner's username, which signing in never does, so it waits for the token.
	const rules = checkPassword(input.password, "");
	if (!rules.ok) return { status: "invalid", error: rules.error };
	const releaseSlot = hashSlots.take();
	if (releaseSlot === undefined) return SLOTS_BUSY;
	if (!tokenAccepted(input.token, now.getTime())) {
		releaseSlot();
		log.warn("a recovery token was refused", { clientAddress: address });
		return { status: "token" };
	}
	const named = checkPassword(input.password, found.username);
	if (!named.ok) {
		// The token stays, so the owner can try again with another password.
		releaseSlot();
		return { status: "invalid", error: named.error };
	}
	// The token is used up with nothing awaited since it was accepted, so two tries can't both use
	// it. From here any failure answers "failed": a restart prints a new one.
	token = undefined;
	let session: StartedSession;
	try {
		let passwordHash: string;
		try {
			passwordHash = await hashPassword(rules.password);
		} finally {
			// Freed however the hash ends, a throw before it returns a promise included.
			releaseSlot();
		}
		session = await db.transaction(async (tx) => {
			await writePasswordHash(tx, passwordHash);
			await deleteAllSessions(tx);
			const started = await startSession(tx, { passwordHash, now });
			// The hash was written in this transaction, so the session always starts.
			if (started === undefined) throw new Error("the recovered password's session didn't start");
			await writeSetting(tx, RECOVERY_USED_KEY, "true", now);
			return started;
		});
	} catch (error) {
		log.error("the recovery failed", { error: queryFailure(error) });
		return { status: "failed" };
	}
	log.info("the owner's password was recovered", { clientAddress: address });
	return { status: "recovered", session };
}

/**
 * Whether what someone typed is the recovery token, still valid. An expired token stays, so
 * `/recovery` still answers, naming the console.
 */
function tokenAccepted(entry: string, now: number): boolean {
	return token !== undefined && isTokenValid(token, now) && tokenMatches(token.value, entry);
}
