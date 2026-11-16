import type { Database } from "#lib/server/db/client.ts";
import { findOwner } from "#lib/server/db/owner.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import { hashSlots } from "#lib/server/security/hash-slots.ts";
import { hashPassword, verifyPassword } from "#lib/server/security/password.ts";
import {
	countPasswordCheck,
	refuseOverLimit,
	SLOTS_BUSY,
	type TooMany,
} from "./password-checks.ts";
import { deleteExpiredSessions, type StartedSession, startSession } from "./sessions.ts";

export type SignInInput = {
	username: string;
	password: string;
	/** The rate limits' key for the request, or undefined when it has no known address. */
	clientAddress?: string | undefined;
};

export type SignInResult =
	| { status: "signed-in"; session: StartedSession }
	/** A wrong username or password: one answer for both. */
	| { status: "wrong" }
	| TooMany;

const log = createLogger("sign-in");

/**
 * What a wrong username is verified against, so it costs the same argon2id verification as a
 * wrong password. Hashed once, on first use, from a random password nobody keeps; a hash that
 * failed is made again next time, so it can't fail every wrong username until a restart.
 */
let dummyHash: Promise<string> | undefined;
const dummy = () => {
	dummyHash ??= hashPassword(crypto.randomUUID()).catch((error: unknown) => {
		dummyHash = undefined;
		throw error;
	});
	return dummyHash;
};

/** How a typed username is compared with the owner's: trimmed, in NFC, ignoring case. */
const comparable = (username: string) => username.trim().normalize("NFC").toLowerCase();

/**
 * Signs the owner in with their username and password (SPEC-sign-in.md, "Signing in"): the
 * address's limit and any wait after its failed sign-ins, both before any hash; a hash slot; one
 * verification, against the owner's hash or, for a wrong username, a dummy one; then a session,
 * which starts only while the verified hash is still the owner's. A failure counts towards the
 * address's next wait, and a success starts its count again. A request whose address isn't known
 * skips the limit and the count (Configuration). Ended sessions are deleted at every sign-in. The
 * typed username is never logged: it may be a password typed into the wrong field.
 */
export async function signIn(
	db: Database,
	input: SignInInput,
	now = new Date(),
): Promise<SignInResult> {
	const address = input.clientAddress;
	const refused = address === undefined ? undefined : refuseOverLimit(address);
	if (refused !== undefined) return refused;
	const found = await findOwner(db);
	const owner =
		found !== undefined && comparable(input.username) === comparable(found.username)
			? found
			: undefined;
	// The slot comes first, so making the dummy hash counts towards the cap too.
	const releaseSlot = hashSlots.take();
	if (releaseSlot === undefined) return SLOTS_BUSY;
	let verified: boolean;
	try {
		const hash = owner?.passwordHash ?? (await dummy());
		verified = await verifyPassword(input.password, hash);
	} finally {
		// Freed however the check ends, a throw before it returns a promise included.
		releaseSlot();
	}
	const session =
		owner !== undefined && verified
			? await startSignedInSession(db, owner.passwordHash, now)
			: undefined;
	// A right password whose session didn't start, because the password changed during the check,
	// is a failure too: that password is no longer the owner's.
	if (session === undefined) {
		log.warn("a sign-in failed", { clientAddress: address });
		countPasswordCheck(address, false);
		return { status: "wrong" };
	}
	log.info("the owner signed in", { clientAddress: address });
	countPasswordCheck(address, true);
	return { status: "signed-in", session };
}

/** Deletes the ended sessions, then starts one for the hash that was verified, if it still is. */
async function startSignedInSession(db: Database, passwordHash: string, now: Date) {
	await deleteExpiredSessions(db, now);
	return startSession(db, { passwordHash, now });
}
