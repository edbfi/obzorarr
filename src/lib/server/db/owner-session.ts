import { and, eq, lte, or, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Executor } from "./client.ts";
import { owner } from "./owner.ts";

/**
 * The owner's sessions (SPEC-sign-in.md, "Sessions"): each one's token is stored only as its hash,
 * with when it started, when it was last used, and its 30-day end.
 */
export const ownerSession = sqliteTable("owner_session", {
	tokenHash: text("token_hash").primaryKey(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }).notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export type OwnerSession = typeof ownerSession.$inferSelect;

/**
 * Stores a session only while `passwordHash` is still the owner's, in one statement, so a check
 * with an old password can't start a session after a password change or recovery has ended them
 * all. Whether it was stored.
 */
export async function insertSessionForPassword(
	db: Executor,
	session: OwnerSession,
	passwordHash: string,
): Promise<boolean> {
	const stored = await db
		.insert(ownerSession)
		.select(
			sql`select ${session.tokenHash}, ${session.createdAt.getTime()}, ${session.lastUsedAt.getTime()}, ${session.expiresAt.getTime()} from ${owner} where ${owner.passwordHash} = ${passwordHash}`,
		)
		.returning({ tokenHash: ownerSession.tokenHash });
	return stored.length > 0;
}

/** The session stored under `tokenHash`, with its owner's username, or undefined. */
export async function findSession(
	db: Executor,
	tokenHash: string,
): Promise<(OwnerSession & { username: string }) | undefined> {
	const rows = await db
		.select({
			tokenHash: ownerSession.tokenHash,
			createdAt: ownerSession.createdAt,
			lastUsedAt: ownerSession.lastUsedAt,
			expiresAt: ownerSession.expiresAt,
			username: owner.username,
		})
		.from(ownerSession)
		.innerJoin(owner, sql`true`)
		.where(eq(ownerSession.tokenHash, tokenHash))
		.limit(1);
	return rows[0];
}

/**
 * Records that the session was used at `at`, only if its last use is at or before `cutoff`, so
 * lookups that arrive together write it once. Whether it was written.
 */
export async function touchSession(
	db: Executor,
	tokenHash: string,
	at: Date,
	cutoff: Date,
): Promise<boolean> {
	const touched = await db
		.update(ownerSession)
		.set({ lastUsedAt: at })
		.where(and(eq(ownerSession.tokenHash, tokenHash), lte(ownerSession.lastUsedAt, cutoff)))
		.returning({ tokenHash: ownerSession.tokenHash });
	return touched.length > 0;
}

/** Ends one session. */
export async function deleteSession(db: Executor, tokenHash: string): Promise<void> {
	await db.delete(ownerSession).where(eq(ownerSession.tokenHash, tokenHash));
}

/** Ends every session past its end at `now`, or unused for `idleMs` or longer. */
export async function deleteExpiredSessions(
	db: Executor,
	now: Date,
	idleMs: number,
): Promise<void> {
	await db
		.delete(ownerSession)
		.where(
			or(
				lte(ownerSession.expiresAt, now),
				lte(ownerSession.lastUsedAt, new Date(now.getTime() - idleMs)),
			),
		);
}
