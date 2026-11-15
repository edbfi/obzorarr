import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "@tursodatabase/database";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "#lib/server/config/config-error.ts";
import { closeServices, handleShutdown, type ShutdownTarget, startUp } from "./startup.ts";

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
		if (String(chunk) !== "") lines.push(String(chunk));
		// `flushLogs` waits for the write's callback, which may come second or third.
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

	it("refuses a file that isn't a database, without echoing the path", async () => {
		const path = join(root, "text.db");
		await writeFile(path, "not a database, only text that is long enough to have a header\n");
		const error = await failure(path);
		expect(error.message).toMatch(/^OBZORARR_DATABASE_PATH names a file that can't be opened/);
		expect(error.message).not.toContain(root);
	});
});

/** A stand-in for the process: it records the signals sent and the exit code. */
function fakeProcess() {
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
		},
	};
	return { target, events, sent, exitCode: () => exitCode };
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("handleShutdown", () => {
	it("passes SIGHUP on as SIGTERM, which adapter-bun drains on", () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {});
		fake.events.emit("SIGHUP");
		expect(fake.sent).toEqual(["4242 SIGTERM"]);
	});

	it("runs the cleanup on sveltekit:shutdown, then exits 0", async () => {
		const fake = fakeProcess();
		const done: string[] = [];
		handleShutdown(fake.target, async () => {
			await settle(5);
			done.push("cleaned up");
		});
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		expect(fake.exitCode()).toBeUndefined();
		await settle(30);
		expect(done).toEqual(["cleaned up"]);
		expect(fake.exitCode()).toBe(0);
	});

	it("exits non-zero when the cleanup never finishes by the deadline", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, () => new Promise(() => {}), 20);
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(10);
		expect(fake.exitCode()).toBeUndefined();
		await settle(40);
		expect(fake.exitCode()).toBe(1);
	});

	it("exits non-zero when the cleanup fails", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {
			throw new Error("close failed");
		});
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(10);
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

	it("installs the handlers in the built server", async () => {
		const before = watched.map((event) => process.listeners(event));
		await startUp(
			{ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: join(root, "built", "app.db") },
			{ dev: false },
		);
		try {
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

	it("closeServices closes the database startup opened, once", async () => {
		const close = vi.spyOn(Database.prototype, "close");
		const path = join(root, "closed", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }, { dev: true });
		await closeServices();
		await closeServices();
		expect(close).toHaveBeenCalledTimes(1);
	});
});
