import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "./config-error.ts";
import { databasePathSubject, readDatabasePath } from "./database-path.ts";

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-database-path-"));
});

afterAll(async () => {
	await chmod(join(root, "read-only"), 0o700).catch(() => {});
	await rm(root, { recursive: true, force: true });
});

async function failure(env: { OBZORARR_DATABASE_PATH?: string }, cwd = root): Promise<ConfigError> {
	try {
		await readDatabasePath(env, cwd);
	} catch (error) {
		if (error instanceof ConfigError) return error;
		throw error;
	}
	throw new Error("the path was accepted");
}

describe("databasePathSubject", () => {
	it("names the variable when it is set, and the default when it is unset or empty", () => {
		expect(databasePathSubject({ OBZORARR_DATABASE_PATH: "/srv/app.db" })).toBe(
			"OBZORARR_DATABASE_PATH",
		);
		const unset = "OBZORARR_DATABASE_PATH is unset, and the default data/obzorarr.db";
		expect(databasePathSubject({})).toBe(unset);
		expect(databasePathSubject({ OBZORARR_DATABASE_PATH: "" })).toBe(unset);
	});
});

describe("readDatabasePath", () => {
	it("defaults to data/obzorarr.db in the working directory, creating the folder", async () => {
		const cwd = join(root, "default");
		await mkdir(cwd);
		expect(await readDatabasePath({}, cwd)).toBe(join(cwd, "data", "obzorarr.db"));
		expect((await stat(join(cwd, "data"))).isDirectory()).toBe(true);
	});

	it("counts an empty variable as unset", async () => {
		const cwd = join(root, "empty");
		await mkdir(cwd);
		expect(await readDatabasePath({ OBZORARR_DATABASE_PATH: "" }, cwd)).toBe(
			join(cwd, "data", "obzorarr.db"),
		);
	});

	it("resolves a relative path against the working directory", async () => {
		expect(await readDatabasePath({ OBZORARR_DATABASE_PATH: "db/app.db" }, root)).toBe(
			join(root, "db", "app.db"),
		);
	});

	it("keeps an absolute path and creates its missing folders", async () => {
		const path = join(root, "nested", "deeper", "app.db");
		expect(await readDatabasePath({ OBZORARR_DATABASE_PATH: path })).toBe(path);
		expect((await stat(join(root, "nested", "deeper"))).isDirectory()).toBe(true);
	});

	it("refuses a folder that can't be created, naming the variable but not the path", async () => {
		// A regular file as the parent stops mkdir for every user, root included.
		const file = join(root, "a-file");
		await writeFile(file, "");
		const path = join(file, "data", "app.db");
		const error = await failure({ OBZORARR_DATABASE_PATH: path });
		expect(error.variable).toBe("OBZORARR_DATABASE_PATH");
		expect(error.message).toMatch(/^OBZORARR_DATABASE_PATH names a folder that can't be created/);
		expect(error.message).not.toContain(root);
	});

	it("names the default when the default folder can't be created", async () => {
		const cwd = join(root, "default-blocked");
		await mkdir(cwd);
		await writeFile(join(cwd, "data"), "");
		const error = await failure({}, cwd);
		expect(error.message).toMatch(/^OBZORARR_DATABASE_PATH is unset, and the default/);
		expect(error.message).not.toContain(cwd);
	});

	// Root can write to any folder, so this case only runs as another user.
	it.skipIf(process.getuid?.() === 0)("refuses a folder that can't be written", async () => {
		const folder = join(root, "read-only");
		await mkdir(folder);
		await chmod(folder, 0o500);
		const error = await failure({ OBZORARR_DATABASE_PATH: join(folder, "app.db") });
		expect(error.message).toMatch(/^OBZORARR_DATABASE_PATH names a folder that can't be written/);
		expect(error.message).not.toContain(root);
	});
});
