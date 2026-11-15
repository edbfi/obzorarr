import { ConfigError } from "#lib/server/config/config-error.ts";
import {
	type DatabasePathEnv,
	databasePathSubject,
	readDatabasePath,
} from "#lib/server/config/database-path.ts";
import { type LogDebugEnv, readLogDebug } from "#lib/server/config/log-debug.ts";
import { type OriginEnv, readOrigin } from "#lib/server/config/origin.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { configureLogging, createLogger, flushLogs } from "#lib/server/logging/logger.ts";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";
import { startFirstRun, stopFirstRun } from "./first-run.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabasePathEnv & LogDebugEnv & OriginEnv;

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

/** How long the deadline waits for its own log entry to leave, in case stdout is what's stuck. */
const DEADLINE_FLUSH_MS = 250;

let database: Database | undefined;
let origin: string | undefined;

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
	// adapter-bun registers its own `SIGTERM` and `SIGINT` handlers synchronously once `init`
	// resolves. The app's come on the next turn of the event loop, so a signal never reaches only
	// the app's handlers, which would swallow it; until then, Bun's default ends the process.
	if (!options.dev) {
		setImmediate(() => handleShutdown(process, closeServices, { stopWork: stopFirstRun }));
	}
}

/** The database startup opened; it throws before startup has opened it. */
export function currentDatabase(): Database {
	if (database === undefined) throw new Error("the database is used before startup opened it");
	return database;
}

/** The browser's address from `ORIGIN`, which startup checked, or undefined when it is unset. */
export function currentOrigin(): string | undefined {
	return origin;
}

/**
 * Shutdown on top of adapter-bun 1.0.1, which drains requests on `SIGTERM` and `SIGINT`, then
 * emits `sveltekit:shutdown` without waiting for its listeners or exiting:
 * - `SIGHUP` counts as a stop and is passed on to the adapter as `SIGTERM`;
 * - on the signal, `stopWork` stops the jobs and timers while the adapter drains;
 * - on `sveltekit:shutdown`, `cleanup` runs and the process exits 0, or exits 1 if the cleanup
 *   throws or hasn't finished by the deadline, after a flush bounded so the deadline still holds.
 */
export function handleShutdown(
	target: ShutdownTarget,
	cleanup: () => Promise<void>,
	{
		deadlineMs = CLEANUP_DEADLINE_MS,
		stopWork = () => {},
	}: { deadlineMs?: number; stopWork?: () => void } = {},
): void {
	target.on("SIGHUP", () => target.kill(target.pid, "SIGTERM"));
	for (const signal of ["SIGTERM", "SIGINT"]) {
		target.on(signal, () => {
			log.info("stopping", { signal });
			stopWork();
		});
	}
	target.once("sveltekit:shutdown", () => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		// Once the deadline has fired, the exit is 1, even if the cleanup ends during its flush.
		let late = false;
		const deadline = new Promise<number>((resolve) => {
			timer = setTimeout(() => {
				late = true;
				log.error("shutdown didn't finish in time", { deadlineMs });
				const bounded = new Promise((done) => setTimeout(done, DEADLINE_FLUSH_MS));
				void Promise.race([flushLogs(), bounded]).then(() => resolve(1));
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
			target.exit(late ? 1 : code);
		});
	});
}

/**
 * Closes what startup opened, then flushes the logs, so an error written while closing reaches
 * the output. A failed close is logged rather than thrown: the stop still exits 0
 * (SPEC-setup.md, "Startup and shutdown"). Calling it again does nothing more.
 */
export async function closeServices(): Promise<void> {
	const db = database;
	database = undefined;
	try {
		await db?.$client.close();
	} catch (error) {
		log.error("closing the database failed", { error });
	}
	await flushLogs();
}

async function runSteps(env: StartupEnv): Promise<void> {
	// 1. The master key.
	await loadKeyring(env);
	// 2. The configuration.
	configureLogging({ debug: readLogDebug(env) });
	origin = readOrigin(env);
	const path = await readDatabasePath(env);
	// 3. The database, opened and migrated: the app is its one migration owner (D5).
	const db = await openDatabase(path).catch((error: unknown) => {
		throw openError(error, path, databasePathSubject(env));
	});
	await migrateDatabase(db);
	database = db;
	// 4. Each module's startup work: `setup` prints the bootstrap token while unclaimed.
	await startFirstRun({ db, origin });
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
