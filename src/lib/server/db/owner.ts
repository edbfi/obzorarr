import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Executor } from "./client.ts";

/** The instance's one owner (D20): the fixed id and its check allow one row at most. */
export const owner = sqliteTable(
	"owner",
	{
		id: integer("id").primaryKey(),
		username: text("username").notNull(),
		passwordHash: text("password_hash").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [check("owner_one_row", sql`${table.id} = 1`)],
);

/** Whether the instance has been claimed: an owner row exists. */
export async function ownerExists(db: Executor): Promise<boolean> {
	const rows = await db.select({ id: owner.id }).from(owner).limit(1);
	return rows.length > 0;
}

/** The owner's username and password hash, or undefined before the claim. */
export async function findOwner(
	db: Executor,
): Promise<{ username: string; passwordHash: string } | undefined> {
	const rows = await db
		.select({ username: owner.username, passwordHash: owner.passwordHash })
		.from(owner)
		.limit(1);
	return rows[0];
}

/**
 * Creates the owner under the fixed id, so it fails when an owner exists already; the claim runs
 * it inside its transaction.
 */
export async function insertOwner(
	db: Executor,
	values: { username: string; passwordHash: string; createdAt: Date },
): Promise<void> {
	await db.insert(owner).values({ id: 1, ...values });
}
