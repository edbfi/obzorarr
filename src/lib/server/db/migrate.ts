import { migrate } from "drizzle-orm/tursodatabase/wasm-migrator";
import type { Database } from "./client.ts";

// Vite bundles every reviewed migration's SQL, so the built server needs no `drizzle/` folder.
const files = import.meta.glob<string>("/drizzle/*/migration.sql", {
	query: "?raw",
	import: "default",
	eager: true,
});

/** The migrations keyed by their folder's name, which Drizzle records as each one's name. */
export const migrations: Record<string, string> = Object.fromEntries(
	Object.entries(files).map(([path, sql]) => [path.split("/").at(-2) ?? path, sql]),
);

/** Applies the migrations `db` hasn't recorded yet, in one transaction. */
export async function migrateDatabase(db: Database): Promise<void> {
	await migrate(db, { migrations });
}
