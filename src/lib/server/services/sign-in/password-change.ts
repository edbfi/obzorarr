import type { Database } from "#lib/server/db/client.ts";
import { findOwner, replacePasswordHash } from "#lib/server/db/owner.ts";
import { deleteOtherSessions, deleteSession } from "#lib/server/db/owner-session.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import { hashSlots } from "#lib/server/security/hash-slots.ts";
import {
	checkPassword,
	hashPassword,
	type PasswordError,
	verifyPassword,
} from "#lib/server/security/password.ts";
import { hashSessionToken } from "#lib/server/security/session-token.ts";
import { type StartedSession, startSession } from "./sessions.ts";
import { countPasswordCheck, refuseOverLimit, SLOTS_BUSY, type TooMany } from "./sign-in.ts";

export type PasswordChangeInput = {
	/** The token of the session the change is made in, which it keeps with a new token. */
	sessionToken: string;
	current: string;
	next: string;
	/** The rate limits' key for the request, or undefined when it has no known address. */
	clientAddress?: string | undefined;
};

export type PasswordChangeResult =
	/** Changed, with this browser's new session; every other session ended. */
	| { status: "changed"; session: StartedSession }
	| { status: "wrong-current" }
	/** The new password breaks one of `setup`'s rules. */
	| { status: "invalid"; error: PasswordError }
	/**
	 * Nothing changed: this session ended, or the password changed, while the current one was
	 * checked, so the change no longer has a session to make it in.
	 */
	| { status: "signed-out" }
	| TooMany;

const log = createLogger("sign-in");

/** Thrown inside the transaction to undo it when the change finds its session or hash gone. */
class SignedOut extends Error {}

/**
 * Changes the owner's password (SPEC-sign-in.md, "The Security tab"), in this order:
 * 1. signing in's limit and waits for the address, which the change shares, before any hash;
 * 2. the new password, checked against `setup`'s rules and the stored username;
 * 3. a hash slot, for verifying the current password and hashing the new one;
 * 4. one transaction that ends this session, replaces the hash only while it is still the one
 *    verified, ends every other session and starts this browser's new one, so a change that lost
 *    a race with another, or with signing out everywhere, changes nothing.
 * A wrong current password counts as a failed sign-in, and a right one as a success.
 */
export async function changePassword(
	db: Database,
	input: PasswordChangeInput,
	now = new Date(),
): Promise<PasswordChangeResult> {
	const address = input.clientAddress;
	const refused = address === undefined ? undefined : refuseOverLimit(address);
	if (refused !== undefined) return refused;
	const found = await findOwner(db);
	if (found === undefined) return { status: "signed-out" };
	const rules = checkPassword(input.next, found.username);
	if (!rules.ok) return { status: "invalid", error: rules.error };
	const releaseSlot = hashSlots.take();
	if (releaseSlot === undefined) return SLOTS_BUSY;
	let newHash: string | undefined;
	try {
		if (await verifyPassword(input.current, found.passwordHash)) {
			newHash = await hashPassword(rules.password);
		}
	} finally {
		// Freed however the check ends, a throw before it returns a promise included.
		releaseSlot();
	}
	countPasswordCheck(address, newHash !== undefined);
	if (newHash === undefined) {
		log.warn("a password change had the wrong current password", { clientAddress: address });
		return { status: "wrong-current" };
	}
	const passwordHash = newHash;
	const sessionHash = hashSessionToken(input.sessionToken);
	let session: StartedSession;
	try {
		session = await db.transaction(async (tx) => {
			if (!(await deleteSession(tx, sessionHash))) throw new SignedOut();
			if (!(await replacePasswordHash(tx, found.passwordHash, passwordHash))) throw new SignedOut();
			// This session is gone already, so this ends every session.
			await deleteOtherSessions(tx, sessionHash);
			const started = await startSession(tx, { passwordHash, now });
			// The hash was written in this transaction, so the session always starts.
			if (started === undefined) throw new Error("the changed password's session didn't start");
			return started;
		});
	} catch (error) {
		if (error instanceof SignedOut) return { status: "signed-out" };
		throw error;
	}
	log.info("the owner changed their password", { clientAddress: address });
	return { status: "changed", session };
}
