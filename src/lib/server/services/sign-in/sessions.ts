import type { Executor } from "#lib/server/db/client.ts";
import {
	deleteExpiredSessions as deleteExpired,
	deleteSession,
	findSession,
	insertSessionForPassword,
	touchSession,
} from "#lib/server/db/owner-session.ts";
import { hashSessionToken, newSessionToken } from "#lib/server/security/session-token.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A session ends 7 days after it was last used (D28). */
export const SESSION_IDLE_MS = 7 * DAY_MS;
/** A session ends 30 days after it started, however recently it was used (D28). */
export const SESSION_MAX_MS = 30 * DAY_MS;
/**
 * How often a session's last use is written: at most once an hour. The 7 idle days count from
 * the last use written, so a session can end up to an hour before 7 days pass without any use.
 */
export const SESSION_TOUCH_MS = HOUR_MS;

/** A started session: the token for the cookie, and when it ends. */
export type StartedSession = { readonly token: string; readonly expiresAt: Date };

/**
 * Starts a session at `now` for the owner whose password hash is `passwordHash`, with a new
 * token (SPEC-sign-in.md, "Sessions"). Nothing starts if that is no longer the owner's password,
 * so a password check that began before a password change or recovery can't outlast it.
 */
export async function startSession(
	db: Executor,
	{ passwordHash, now }: { passwordHash: string; now: Date },
): Promise<StartedSession | undefined> {
	const { token, hash } = newSessionToken();
	const expiresAt = new Date(now.getTime() + SESSION_MAX_MS);
	const stored = await insertSessionForPassword(
		db,
		{ tokenHash: hash, createdAt: now, lastUsedAt: now, expiresAt },
		passwordHash,
	);
	return stored ? { token, expiresAt } : undefined;
}

/**
 * The owner signed in with the session `token` names, at `now`, or undefined. An ended session
 * (7 days unused, or 30 days old) is deleted as it is found; a live one has its last use written
 * when an hour or more has passed since.
 */
export async function lookUpSession(
	db: Executor,
	token: string,
	now: Date,
): Promise<{ username: string } | undefined> {
	const hash = hashSessionToken(token);
	const session = await findSession(db, hash);
	if (session === undefined) return undefined;
	const at = now.getTime();
	if (at >= session.expiresAt.getTime() || at - session.lastUsedAt.getTime() >= SESSION_IDLE_MS) {
		await deleteSession(db, hash);
		return undefined;
	}
	if (at - session.lastUsedAt.getTime() >= SESSION_TOUCH_MS) {
		await touchSession(db, hash, now, new Date(at - SESSION_TOUCH_MS));
	}
	return { username: session.username };
}

/** Ends the session `token` names, if there is one: signing out. */
export async function endSession(db: Executor, token: string): Promise<void> {
	await deleteSession(db, hashSessionToken(token));
}

/** Deletes every ended session, as startup does. */
export async function deleteExpiredSessions(db: Executor, now: Date): Promise<void> {
	await deleteExpired(db, now, SESSION_IDLE_MS);
}
