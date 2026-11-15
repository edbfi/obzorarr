import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One value per key; modules add their own keys (SPEC-setup.md, "Tables"). */
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
