import { ConfigError } from "#lib/server/config/config-error.ts";
import {
	type DatabasePathEnv,
	databasePathSubject,
	readDatabasePath,
} from "#lib/server/config/database-path.ts";
import { type LogDebugEnv, readLogDebug } from "#lib/server/config/log-debug.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { configureLogging, createLogger, flushLogs } from "#lib/server/logging/logger.ts";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabasePathEnv & LogDebugEnv;

/** The parts of the process that shutdown uses, so tests can pass a stand-in. */
export type ShutdownTarget = {
	readonly pid: number;
	on(event: string, listener: (...args: unknown[]) => void): unknown;
	once(event: string, listener: (...args: unknown[]) => void): unknown;
	kill(pid: number, signal: string): unknown;
	exit(code: number): void;
};

const log = createLogger("startup");

/** How long shutdown's cleanup may take after adapter-bun has drained the requests. */
const CLEANUP_DEADLINE_MS = 5000;

let database: Database | undefined;

/**
 * Runs startup's steps in order, before any request is served (SPEC-setup.md, "Startup and
 * shutdown"). A step that fails is logged, then thrown, so the built server exits before it
 * listens. The built server also gets shutdown's handlers; `dev` gets none, because Vite never
 * emits `sveltekit:shutdown` and a `SIGINT` listener would stop Ctrl+C from ending it.
 */
export async function startUp(env: StartupEnv, options: { dev: boolean }): Promise<void> {
	try {
		await runSteps(env);
	} catch (error) {
		log.error("startup failed", { error });
		throw error;
	}
	if (!options.dev) handleShutdown(process, closeServices);
}

/**
 * Shutdown on top of adapter-bun 1.0.1, which drains requests on `SIGTERM` and `SIGINT`, then
 * emits `sveltekit:shutdown` without waiting for its listeners or exiting:
 * - `SIGHUP` counts as a stop and is passed on to the adapter as `SIGTERM`;
 * - on the signal, work stops while the adapter drains (no jobs, timers or streams yet);
 * - on `sveltekit:shutdown`, `cleanup` runs and the process exits 0, or exits 1 if the cleanup
 *   fails or hasn't finished by the deadline.
 */
export function handleShutdown(
	target: ShutdownTarget,
	cleanup: () => Promise<void>,
	deadlineMs = CLEANUP_DEADLINE_MS,
): void {
	target.on("SIGHUP", () => target.kill(target.pid, "SIGTERM"));
	for (const signal of ["SIGTERM", "SIGINT"]) {
		target.on(signal, () => log.info("stopping", { signal }));
	}
	target.once("sveltekit:shutdown", () => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<number>((resolve) => {
			timer = setTimeout(() => {
				log.error("shutdown didn't finish in time", { deadlineMs });
				resolve(1);
			}, deadlineMs);
		});
		const finished = cleanup().then(
			() => 0,
			async (error: unknown) => {
				log.error("shutdown failed", { error });
				await flushLogs();
				return 1;
			},
		);
		void Promise.race([finished, deadline]).then((code) => {
			clearTimeout(timer);
			target.exit(code);
		});
	});
}

/**
 * Closes what startup opened, then flushes the logs, so an error written while closing reaches
 * the output. Calling it again does nothing more.
 */
export async function closeServices(): Promise<void> {
	const db = database;
	database = undefined;
	try {
		await db?.$client.close();
	} finally {
		await flushLogs();
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
	database = db;
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
