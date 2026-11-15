import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConfigError } from "#lib/server/config/config-error.ts";
import { startUp } from "./startup.ts";

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-startup-"));
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** Captures what startup writes to standard output while `run` runs. */
async function stdoutOf(run: () => Promise<unknown>): Promise<string[]> {
	const lines: string[] = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		lines.push(String(chunk));
		return true;
	});
	await run().catch(() => {});
	return lines;
}

const key = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

async function failure(path: string): Promise<ConfigError> {
	try {
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path });
	} catch (error) {
		if (error instanceof ConfigError) return error;
		throw error;
	}
	throw new Error("startup finished");
}

describe("startUp", () => {
	it("opens and migrates the database at the path", async () => {
		const path = join(root, "data", "app.db");
		await startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path });
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
			startUp({ OBZORARR_SECRET_KEY: key(), OBZORARR_DATABASE_PATH: path }),
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
		const error = await startUp({
			OBZORARR_SECRET_KEY: key(),
			OBZORARR_DATABASE_PATH: path,
			OBZORARR_LOG_DEBUG: "yes",
		}).catch((caught: unknown) => caught);
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
