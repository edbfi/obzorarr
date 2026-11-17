import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as migrateFromFolder } from "drizzle-orm/tursodatabase/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "./client.ts";
import { LegacyDatabaseError, migrateDatabase, migrations, NewerDatabaseError } from "./migrate.ts";

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

/** Two migrations of a later build, named as Drizzle Kit names its folders. */
const FIRST = { "20260101000000_first": "CREATE TABLE `first` (`id` integer PRIMARY KEY);" };
const BOTH = {
	...FIRST,
	"20260102000000_second": "CREATE TABLE `second` (`id` integer PRIMARY KEY);",
};

/** Records a migration this build doesn't bundle, as a newer build's migrator would. */
async function recordUnknown(db: Database): Promise<void> {
	await (
		await db.$client.prepare(
			"INSERT INTO __drizzle_migrations (hash, created_at, name, applied_at) VALUES ('', 1767484800000, '20260104000000_from_a_newer_build', '2026-01-04T00:00:00.000Z')",
		)
	).run();
}

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

	it("applies a pending migration to a database at an earlier set", async () => {
		const db = await newDatabase("pending.db");
		await migrateDatabase(db, FIRST);
		await migrateDatabase(db, BOTH);
		expect(await tables(db)).toEqual(expect.arrayContaining(["first", "second"]));
		expect((await recorded(db)).map((row) => row.name)).toEqual(Object.keys(BOTH));
	});

	// SPEC-setup.md, "The database": migrations only go forward, so an older build never runs on
	// a schema a newer one wrote.
	it("refuses a database a newer build migrated, before applying anything", async () => {
		const db = await newDatabase("newer.db");
		await migrateDatabase(db, FIRST);
		await recordUnknown(db);
		const before = await recorded(db);

		const refusal = migrateDatabase(db, BOTH);
		await expect(refusal).rejects.toBeInstanceOf(NewerDatabaseError);
		await expect(refusal).rejects.toThrow(
			"The database was migrated by a newer Obzorarr: run that version again, or restore the backup taken with this one",
		);

		expect(await tables(db)).not.toContain("second");
		expect(await recorded(db)).toEqual(before);
	});

	it("refuses a recorded migration with no name as a table from before Drizzle 1.0", async () => {
		const db = await newDatabase("nameless.db");
		await migrateDatabase(db, FIRST);
		await (
			await db.$client.prepare(
				"INSERT INTO __drizzle_migrations (hash, created_at, name, applied_at) VALUES ('', 1767484800000, NULL, NULL)",
			)
		).run();
		await expect(migrateDatabase(db, BOTH)).rejects.toBeInstanceOf(LegacyDatabaseError);
		expect(await tables(db)).not.toContain("second");
	});

	it("names neither the path nor the unknown migration when it refuses", async () => {
		const db = await newDatabase("newer-quiet.db");
		await migrateDatabase(db, FIRST);
		await recordUnknown(db);
		const error = await migrateDatabase(db, FIRST).then(
			() => undefined,
			(error: unknown) => error,
		);
		expect(error).toBeInstanceOf(NewerDatabaseError);
		expect(String(error)).not.toContain(root);
		expect(String(error)).not.toContain("from_a_newer_build");
	});

	// obzorarr 0.1.x used Drizzle before 1.0, whose migrations table has no names, on the same
	// default path: a deliberate refusal, not a failed query.
	it("refuses a database whose migrations table is from before Drizzle 1.0, applying nothing", async () => {
		const db = await newDatabase("legacy.db");
		await (
			await db.$client.prepare(
				"CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)",
			)
		).run();
		await (
			await db.$client.prepare(
				"INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('abc', 1700000000000)",
			)
		).run();

		const refusal = migrateDatabase(db);
		await expect(refusal).rejects.toBeInstanceOf(LegacyDatabaseError);
		await expect(refusal).rejects.toThrow(
			"The database was made by an earlier Obzorarr (0.1), which this version can't use: keep running 0.1 on it, or start this version with OBZORARR_DATABASE_PATH naming a new database file",
		);
		expect(await tables(db)).not.toContain("owner");
	});
});
