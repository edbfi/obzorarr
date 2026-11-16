import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "./client.ts";
import { migrateDatabase } from "./migrate.ts";
import { deleteSetting, readSetting, writeSetting } from "./settings.ts";

let root: string;
let db: Database;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-settings-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
});

afterAll(async () => {
	await db.$client.close();
	await rm(root, { recursive: true, force: true });
});

describe("settings", () => {
	it("reads nothing for a key never written", async () => {
		expect(await readSetting(db, "never.written")).toBeUndefined();
	});

	it("deletes a key, and deleting one never written does nothing", async () => {
		await writeSetting(db, "setup.deleted", "value", new Date(1000));
		await deleteSetting(db, "setup.deleted");
		expect(await readSetting(db, "setup.deleted")).toBeUndefined();
		await deleteSetting(db, "setup.deleted");
	});

	it("writes a key, then replaces its value", async () => {
		await writeSetting(db, "setup.example", "first", new Date(1000));
		expect(await readSetting(db, "setup.example")).toBe("first");
		await writeSetting(db, "setup.example", "second", new Date(2000));
		expect(await readSetting(db, "setup.example")).toBe("second");
	});

	it("writes through a transaction, and a rolled-back write leaves nothing", async () => {
		await db
			.transaction(async (tx) => {
				await writeSetting(tx, "setup.rolled-back", "value", new Date());
				throw new Error("roll back");
			})
			.catch(() => {});
		expect(await readSetting(db, "setup.rolled-back")).toBeUndefined();
	});
});
