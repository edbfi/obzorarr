import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Database } from "./client.ts";

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
export async function ownerExists(db: Database): Promise<boolean> {
	const rows = await db.select({ id: owner.id }).from(owner).limit(1);
	return rows.length > 0;
}
