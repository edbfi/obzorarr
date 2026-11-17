import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "@tursodatabase/database";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "#lib/server/config/config-error.ts";
import { insertOwner } from "#lib/server/db/owner.ts";
import { insertSessionForPassword, ownerSession } from "#lib/server/db/owner-session.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import {
	closeServices,
	currentDatabase,
	handleShutdown,
	type ShutdownTarget,
	startUp,
} from "./startup.ts";

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-startup-"));
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

/** What startup wrote to standard output during the current test. */
let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		// `flushLogs` waits for each entry's write callback, so the mock calls it.
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** Runs `run`, ignoring its failure, and returns what it wrote to standard output. */
async function stdoutOf(run: () => Promise<unknown>): Promise<string[]> {
	await run().catch(() => {});
	return lines;
}

const key = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

async function failure(path: string): Promise<ConfigError> {
	try {
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
	} catch (error) {
		if (error instanceof ConfigError) return error;
		throw error;
	}
	throw new Error("startup finished");
}

describe("startUp", () => {
	it("opens and migrates the database at the path", async () => {
		const path = join(root, "data", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
		expect(await Bun.file(path).exists()).toBe(true);
	});

	it("deletes the sessions that ended while the app was down", async () => {
		const path = join(root, "sessions", "app.db");
		const env = { OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path };
		await startUp(env, { dev: true });
		const db = currentDatabase();
		const long = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		await insertOwner(db, { username: "owner", passwordHash: "h", createdAt: long });
		const ended = { createdAt: long, lastUsedAt: long, expiresAt: new Date(long.getTime() + 1) };
		const live = {
			createdAt: new Date(),
			lastUsedAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
		};
		await insertSessionForPassword(db, { tokenHash: "ended", ...ended }, "h");
		await insertSessionForPassword(db, { tokenHash: "live", ...live }, "h");
		await closeServices();
		await startUp(env, { dev: true });
		const left = await currentDatabase()
			.select({ tokenHash: ownerSession.tokenHash })
			.from(ownerSession);
		expect(left).toEqual([{ tokenHash: "live" }]);
		await closeServices();
	});

	// Turso's own messages hold the path, so startup replaces them.
	it("refuses a path that is a directory, naming the variable but not the path", async () => {
		const path = join(root, "a-directory");
		await mkdir(path);
		const error = await failure(path);
		expect(error.message).toBe(
			"OBZORARR_DATABASE_PATH names a file that can't be opened as a database (I/O error (open): is a directory)",
		);
	});

	it("logs a failed step as one error entry before throwing it", async () => {
		const path = join(root, "logged-directory");
		await mkdir(path);
		const lines = await stdoutOf(() =>
			startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true }),
		);
		expect(lines).toHaveLength(1);
		const entry = JSON.parse(lines[0] ?? "");
		expect(entry).toMatchObject({
			level: "error",
			source: "startup",
			message: "startup failed",
			metadata: { error: { name: "ConfigError" } },
		});
		expect(lines[0]).not.toContain(root);
	});

	describe("a failed start's error entry", () => {
		/** Writes whose completion the test holds back, released after each test either way. */
		const held: (() => void)[] = [];
		/** Resolves when the next held write arrives. */
		let written: Promise<void> = Promise.resolve();
		const holdWrites = () => {
			let arrived = () => {};
			written = new Promise((resolve) => {
				arrived = resolve;
			});
			vi.mocked(process.stdout.write).mockImplementation((chunk, ...rest: unknown[]) => {
				lines.push(String(chunk));
				const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
				if (done) held.push(done);
				arrived();
				return true;
			});
		};
		afterEach(() => {
			for (const done of held.splice(0)) done();
		});
		const failingStart = (file: string) =>
			startUp(
				{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: join(root, file), ORIGIN: "nope" },
				{ dev: true },
			);
		const settledWithin = (promise: Promise<unknown>, ms: number) =>
			Promise.race([
				promise.then(() => true),
				new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
			]);

		it("leaves the process before startup throws, so an exit right after doesn't lose it", async () => {
			holdWrites();
			const started = failingStart("held.db").catch((error: unknown) => error);
			await written;
			expect(lines).toHaveLength(1);
			// Still waiting on the write, well inside the quarter-second bound.
			expect(await settledWithin(started, 20)).toBe(false);
			for (const done of held.splice(0)) done();
			// It throws as soon as the write is done, not when the bound runs out.
			expect(await settledWithin(started, 100)).toBe(true);
			expect(await started).toBeInstanceOf(ConfigError);
		});

		it("throws after a quarter of a second when its entry never leaves", async () => {
			holdWrites();
			const begun = performance.now();
			expect(await failingStart("stuck.db").catch((error: unknown) => error)).toBeInstanceOf(
				ConfigError,
			);
			const waited = performance.now() - begun;
			expect(waited).toBeGreaterThanOrEqual(240);
			expect(waited).toBeLessThan(1000);
		});
	});

	it("refuses an OBZORARR_LOG_DEBUG that isn't true or false, before the database opens", async () => {
		const path = join(root, "never-created", "app.db");
		const error = await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path, OBZORARR_LOG_DEBUG: "yes" },
			{ dev: true },
		).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("OBZORARR_LOG_DEBUG");
		// `Bun.file().exists()` is false for any folder, so the folder is checked with `stat`.
		await expect(stat(join(root, "never-created"))).rejects.toThrow();
	});

	it("refuses an OBZORARR_RECOVERY that isn't true or false, before the database opens", async () => {
		const path = join(root, "recovery-never-created", "app.db");
		const error = await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path, OBZORARR_RECOVERY: "yes" },
			{ dev: true },
		).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("OBZORARR_RECOVERY");
		await expect(stat(join(root, "recovery-never-created"))).rejects.toThrow();
	});

	it("prints a recovery token on a claimed instance with OBZORARR_RECOVERY on", async () => {
		const path = join(root, "recovery", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
		await insertOwner(currentDatabase(), {
			username: "owner",
			passwordHash: "hash",
			createdAt: new Date(),
		});
		await closeServices();
		lines = [];
		await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path, OBZORARR_RECOVERY: "true" },
			{ dev: true },
		);
		expect(lines.filter((line) => line.startsWith("Recovery token: "))).toHaveLength(1);
		expect(lines.some((line) => line.startsWith("Setup token: "))).toBe(false);
		await closeServices();
	});

	it("prints no recovery token on an unclaimed instance with OBZORARR_RECOVERY on, only the setup token", async () => {
		const path = join(root, "recovery-unclaimed", "app.db");
		await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path, OBZORARR_RECOVERY: "true" },
			{ dev: true },
		);
		expect(lines.some((line) => line.startsWith("Recovery token: "))).toBe(false);
		expect(lines.filter((line) => line.startsWith("Setup token: "))).toHaveLength(1);
		await closeServices();
	});

	it("refuses a bad ORIGIN before the database opens", async () => {
		const path = join(root, "origin-never-created", "app.db");
		const error = await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path, ORIGIN: "https://host/app" },
			{ dev: true },
		).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("ORIGIN");
		await expect(stat(join(root, "origin-never-created"))).rejects.toThrow();
	});

	it("refuses a file that isn't a database, without echoing the path", async () => {
		const path = join(root, "text.db");
		await writeFile(path, "not a database, only text that is long enough to have a header\n");
		const error = await failure(path);
		expect(error.message).toMatch(/^OBZORARR_DATABASE_PATH names a file that can't be opened/);
		expect(error.message).not.toContain(root);
	});
});

/** A stand-in for the process: it records the signals sent, and the exit code in `steps`. */
function fakeProcess(steps: string[] = []) {
	const events = new EventEmitter();
	const sent: string[] = [];
	let exitCode: number | undefined;
	const target: ShutdownTarget = {
		pid: 4242,
		on: (event, listener) => events.on(event, listener),
		once: (event, listener) => events.once(event, listener),
		kill: (pid, signal) => {
			sent.push(`${pid} ${signal}`);
			return true;
		},
		exit: (code) => {
			exitCode = code;
			steps.push(`exit ${code}`);
		},
	};
	return { target, events, sent, exitCode: () => exitCode };
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("handleShutdown", () => {
	it("stops the work on SIGTERM and SIGINT, while adapter-bun drains", () => {
		const fake = fakeProcess();
		const stopped: string[] = [];
		handleShutdown(fake.target, async () => {}, { stopWork: () => stopped.push("stopped") });
		fake.events.emit("SIGTERM");
		fake.events.emit("SIGINT");
		expect(stopped).toEqual(["stopped", "stopped"]);
	});

	it("passes SIGHUP on as SIGTERM, which adapter-bun drains on", () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {});
		fake.events.emit("SIGHUP");
		expect(fake.sent).toEqual(["4242 SIGTERM"]);
	});

	it("exits 0 only after the cleanup on sveltekit:shutdown has finished", async () => {
		const steps: string[] = [];
		const fake = fakeProcess(steps);
		let finish!: () => void;
		handleShutdown(
			fake.target,
			() =>
				new Promise<void>((resolve) => {
					finish = () => {
						steps.push("cleaned up");
						resolve();
					};
				}),
		);
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(20);
		expect(steps).toEqual([]);
		finish();
		await settle(20);
		expect(steps).toEqual(["cleaned up", "exit 0"]);
	});

	it("exits non-zero when the cleanup never finishes by the deadline", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, () => new Promise(() => {}), { deadlineMs: 100 });
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(50);
		expect(fake.exitCode()).toBeUndefined();
		await settle(500);
		expect(fake.exitCode()).toBe(1);
		expect(lines.some((line) => line.includes("shutdown didn't finish in time"))).toBe(true);
	});

	it("exits non-zero once the deadline has fired, even if the cleanup finishes during its flush", async () => {
		// Hold every log write, so the deadline's bounded flush is still waiting when the cleanup ends.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		const fake = fakeProcess();
		let finish!: () => void;
		handleShutdown(
			fake.target,
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
			{ deadlineMs: 50 },
		);
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(100);
		expect(lines.some((line) => line.includes("shutdown didn't finish in time"))).toBe(true);
		finish();
		for (const release of held.splice(0)) release();
		await settle(50);
		expect(fake.exitCode()).toBe(1);
	});

	it("bounds the deadline's own flush, so a stuck stdout can't hold the exit", async () => {
		// Every write stays held, as if nothing read standard output, until the test ends.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		const fake = fakeProcess();
		handleShutdown(fake.target, () => new Promise(() => {}), { deadlineMs: 50 });
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		try {
			await settle(150);
			expect(fake.exitCode()).toBeUndefined();
			await settle(400);
			expect(fake.exitCode()).toBe(1);
		} finally {
			// The logger counts unfinished writes, so a held one would stall later flushes.
			for (const release of held.splice(0)) release();
		}
	});

	describe("with standard output broken, so every log call's write throws", () => {
		beforeEach(() => {
			vi.mocked(process.stdout.write).mockImplementation(() => {
				throw new Error("EPIPE: broken pipe");
			});
		});

		it("still stops the work on SIGTERM", () => {
			const fake = fakeProcess();
			const stopped: string[] = [];
			handleShutdown(fake.target, async () => {}, { stopWork: () => stopped.push("stopped") });
			fake.events.emit("SIGTERM");
			expect(stopped).toEqual(["stopped"]);
		});

		it("still exits 1 when the cleanup fails, and when it never finishes", async () => {
			const failed = fakeProcess();
			handleShutdown(failed.target, async () => {
				throw new Error("close failed");
			});
			failed.events.emit("sveltekit:shutdown", "SIGTERM");
			const stuck = fakeProcess();
			handleShutdown(stuck.target, () => new Promise(() => {}), { deadlineMs: 50 });
			stuck.events.emit("sveltekit:shutdown", "SIGTERM");
			await settle(500);
			expect(failed.exitCode()).toBe(1);
			expect(stuck.exitCode()).toBe(1);
		});
	});

	it("still exits 1 when the cleanup fails with an error that can't be logged", async () => {
		const hostile = new Error("close failed");
		Object.defineProperty(hostile, "stack", {
			get() {
				throw new Error("no stack for you");
			},
		});
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {
			throw hostile;
		});
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(100);
		expect(fake.exitCode()).toBe(1);
	});

	it("exits non-zero when the cleanup fails", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {
			throw new Error("close failed");
		});
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(100);
		expect(fake.exitCode()).toBe(1);
	});
});

describe("startUp's shutdown", () => {
	const watched = ["SIGHUP", "SIGTERM", "SIGINT", "sveltekit:shutdown"] as const;
	const counts = () => watched.map((event) => process.listenerCount(event));

	it("installs no handler in dev, where Ctrl+C must still end the dev server", async () => {
		const before = counts();
		await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: join(root, "dev", "app.db") },
			{ dev: true },
		);
		expect(counts()).toEqual(before);
		await closeServices();
	});

	it("installs the handlers in the built server, after adapter-bun's own", async () => {
		const before = watched.map((event) => process.listeners(event));
		await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: join(root, "built", "app.db") },
			{ dev: false },
		);
		try {
			// adapter-bun registers its handlers synchronously once `init` resolves; the app's come
			// on the next turn of the event loop, so a signal never reaches only the app's.
			expect(counts()).toEqual(before.map((listeners) => listeners.length));
			await new Promise((resolve) => setImmediate(resolve));
			expect(counts()).toEqual(before.map((listeners) => listeners.length + 1));
		} finally {
			watched.forEach((event, index) => {
				for (const listener of process.listeners(event)) {
					if (!before[index]?.includes(listener)) process.removeListener(event, listener);
				}
			});
			await closeServices();
		}
	});

	it("closeServices logs a failed close, flushes, and finishes, so the stop still exits 0", async () => {
		vi.spyOn(Database.prototype, "close").mockRejectedValueOnce(new Error("disk went away"));
		const path = join(root, "close-fails", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
		await expect(closeServices()).resolves.toBeUndefined();
		const entry = JSON.parse(lines.find((line) => line.includes("closing the database")) ?? "{}");
		expect(entry).toMatchObject({
			level: "error",
			metadata: { error: { message: "disk went away" } },
		});
	});

	it("closeServices still finishes when the failed close's error can't be logged", async () => {
		const hostile = new Error("disk went away");
		Object.defineProperty(hostile, "stack", {
			get() {
				throw new Error("no stack for you");
			},
		});
		vi.spyOn(Database.prototype, "close").mockRejectedValueOnce(hostile);
		const path = join(root, "close-fails-hostile", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
		await expect(closeServices()).resolves.toBeUndefined();
	});

	it("closeServices finishes the close before it flushes, and the flush before it returns", async () => {
		const path = join(root, "order", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
		let closed!: () => void;
		vi.spyOn(Database.prototype, "close").mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					closed = resolve;
				}),
		);
		// From here, each entry's write waits until `release` runs, like a slow reader.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		let finished = false;
		const closing = closeServices().then(() => {
			finished = true;
		});
		await settle(20);
		expect(finished).toBe(false);
		createLogger("test").info("written while closing");
		closed();
		await settle(20);
		expect(finished).toBe(false);
		for (const release of held.splice(0)) release();
		await closing;
		expect(finished).toBe(true);
	});

	it("closeServices closes the database startup opened, once", async () => {
		const close = vi.spyOn(Database.prototype, "close");
		const path = join(root, "closed", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
		await closeServices();
		await closeServices();
		expect(close).toHaveBeenCalledTimes(1);
	});
});
