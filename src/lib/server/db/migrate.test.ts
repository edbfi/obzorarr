import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as migrateFromFolder } from "drizzle-orm/tursodatabase/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "./client.ts";
import { migrateDatabase, migrations } from "./migrate.ts";

const FOLDER = join(import.meta.dirname, "../../../../drizzle");

let root: string;
const opened: Database[] = [];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-migrate-"));
});

afterAll(async () => {
	for (const db of opened) db.$client.close();
	await rm(root, { recursive: true, force: true });
});

async function newDatabase(name: string): Promise<Database> {
	const db = await openDatabase(join(root, name));
	opened.push(db);
	return db;
}

type Row = { name: string; hash: string; created_at: number };

const recorded = async (db: Database) =>
	(await (
		await db.$client.prepare("SELECT name, hash, created_at FROM __drizzle_migrations ORDER BY id")
	).all()) as Row[];

const tables = async (db: Database) =>
	(
		(await (
			await db.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
		).all()) as { name: string }[]
	).map((row) => row.name);

describe("the bundled migrations", () => {
	it("hold every reviewed migration in drizzle/, keyed by its folder", async () => {
		const folders = (await readdir(FOLDER, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		expect(Object.keys(migrations).sort()).toEqual(folders);
		for (const folder of folders) {
			expect(migrations[folder]).toBe(
				await readFile(join(FOLDER, folder, "migration.sql"), "utf8"),
			);
		}
	});
});

describe("migrateDatabase", () => {
	it("creates both tables on a new database and records each migration", async () => {
		const db = await newDatabase("new.db");
		await migrateDatabase(db);
		expect(await tables(db)).toEqual(expect.arrayContaining(["owner", "settings"]));
		expect((await recorded(db)).map((row) => row.name)).toEqual(Object.keys(migrations).sort());
	});

	it("applies nothing on a second run", async () => {
		const db = await newDatabase("twice.db");
		await migrateDatabase(db);
		const first = await recorded(db);
		await migrateDatabase(db);
		expect(await recorded(db)).toEqual(first);
	});

	it("records what Drizzle Kit's file migrator records, except the hash", async () => {
		const bundled = await newDatabase("bundled.db");
		await migrateDatabase(bundled);
		const fromFolder = await newDatabase("folder.db");
		await migrateFromFolder(fromFolder, { migrationsFolder: FOLDER });

		const ours = await recorded(bundled);
		const theirs = await recorded(fromFolder);
		const withoutHash = ({ name, created_at }: Row) => ({ name, created_at });
		expect(ours.map(withoutHash)).toEqual(theirs.map(withoutHash));
		// The record migrator leaves the hash empty; Drizzle reads it only to upgrade a v0 table.
		expect(ours.every((row) => row.hash === "")).toBe(true);
		expect(theirs.map((row) => row.hash)).toEqual(
			ours.map((row) =>
				createHash("sha256")
					.update(migrations[row.name] ?? "")
					.digest("hex"),
			),
		);
		expect(await tables(bundled)).toEqual(await tables(fromFolder));
	});
});
