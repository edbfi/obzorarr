import { ConfigError } from "#lib/server/config/config-error.ts";
import {
	type DatabasePathEnv,
	databasePathSubject,
	readDatabasePath,
} from "#lib/server/config/database-path.ts";
import { type LogDebugEnv, readLogDebug } from "#lib/server/config/log-debug.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { configureLogging, createLogger } from "#lib/server/logging/logger.ts";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabasePathEnv & LogDebugEnv;

const log = createLogger("startup");

/**
 * Runs startup's steps in order, before any request is served (SPEC-setup.md, "Startup and
 * shutdown"). A step that fails is logged, then thrown, so the built server exits before it
 * listens.
 */
export async function startUp(env: StartupEnv): Promise<void> {
	try {
		await runSteps(env);
	} catch (error) {
		log.error("startup failed", { error });
		throw error;
	}
}

async function runSteps(env: StartupEnv): Promise<void> {
	// 1. The master key.
	await loadKeyring(env);
	// 2. The configuration.
	configureLogging({ debug: readLogDebug(env) });
	const path = await readDatabasePath(env);
	// 3. The database, opened and migrated: the app is its one migration owner (D5).
	const db = await openDatabase(path).catch((error: unknown) => {
		throw openError(error, path, databasePathSubject(env));
	});
	await migrateDatabase(db);
}

/**
 * Turso's errors put the path in their message, "failed to open database <path>: <reason>", so
 * only the reason is kept, and only when it no longer holds the path.
 */
function openError(error: unknown, path: string, subject: string): ConfigError {
	const message = error instanceof Error ? error.message : "";
	const prefix = `failed to open database ${path}: `;
	const reason = message.startsWith(prefix) ? message.slice(prefix.length) : "";
	return new ConfigError(
		"OBZORARR_DATABASE_PATH",
		`${subject} names a file that can't be opened as a database (${
			reason === "" || reason.includes(path) ? "unknown error" : reason
		})`,
	);
}
