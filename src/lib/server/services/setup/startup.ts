import { type DatabasePathEnv, readDatabasePath } from "#lib/server/config/database-path.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabasePathEnv;

let database: Database | undefined;

/**
 * Runs startup's steps in order, before any request is served (SPEC-setup.md, "Startup and
 * shutdown"). A step that fails throws, so the built server exits before it listens.
 */
export async function startUp(env: StartupEnv): Promise<void> {
	// 1. The master key.
	await loadKeyring(env);
	// 2. The configuration.
	const path = await readDatabasePath(env);
	// 3. The database, opened and migrated: the app is its one migration owner (D5).
	const db = await openDatabase(path);
	await migrateDatabase(db);
	database = db;
}

/** The database startup opened; it throws before startup has finished. */
export function currentDatabase(): Database {
	if (database === undefined) throw new Error("the database is used before startup opened it");
	return database;
}
