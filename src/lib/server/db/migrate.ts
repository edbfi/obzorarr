import { sql } from "drizzle-orm";
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

/**
 * A newer Obzorarr migrated the database: it records a migration this build doesn't have. The
 * message names neither the path nor the migration (SPEC-setup.md, "The database").
 */
export class NewerDatabaseError extends Error {
	override readonly name = "NewerDatabaseError";

	constructor() {
		super(
			"The database was migrated by a newer Obzorarr: run that version again, or restore the backup taken with this one",
		);
	}
}

/**
 * The database's migrations table is from before Drizzle 1.0, as obzorarr 0.1.x left it on the same
 * default path: this version can't use it, and how such an install upgrades is decided with the
 * image (SPEC.md). The message names nothing from the database.
 */
export class LegacyDatabaseError extends Error {
	override readonly name = "LegacyDatabaseError";

	constructor() {
		super(
			"The database was made by an earlier Obzorarr (0.1), which this version can't use: keep running 0.1 on it, or start this version with OBZORARR_DATABASE_PATH naming a new database file",
		);
	}
}

/** The table Drizzle's migrator records each applied migration in. */
const TABLE = "__drizzle_migrations";

/**
 * The names of the migrations `db` has recorded; none on a new database. A table without names,
 * or with a record that has none, is from before Drizzle 1.0, and refused.
 */
async function recordedNames(db: Database): Promise<string[]> {
	const columns = await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info(${TABLE})`);
	if (columns.length === 0) return [];
	if (!columns.some((column) => column.name === "name")) throw new LegacyDatabaseError();
	const rows = await db.all<{ name: string | null }>(
		sql`SELECT name FROM ${sql.identifier(TABLE)}`,
	);
	const names = rows.map((row) => row.name);
	if (!names.every((name): name is string => name !== null)) throw new LegacyDatabaseError();
	return names;
}

/**
 * Applies the migrations `db` hasn't recorded yet, in one transaction, and only forward: a
 * database that records a migration not in `bundled` is refused before anything is applied, so an
 * older build never runs on a schema a newer one wrote, and so is one obzorarr 0.1 left
 * (`LegacyDatabaseError`). Nothing can record a migration between the check and the migrator: the
 * app is the database's one migration owner and runs this once at startup, on its one connection
 * (D5, D6).
 */
export async function migrateDatabase(
	db: Database,
	bundled: Record<string, string> = migrations,
): Promise<void> {
	const known = new Set(Object.keys(bundled));
	if ((await recordedNames(db)).some((name) => !known.has(name))) {
		throw new NewerDatabaseError();
	}
	await migrate(db, { migrations: bundled });
}
