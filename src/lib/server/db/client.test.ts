import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "./client.ts";
import { migrateDatabase } from "./migrate.ts";
import { settings } from "./settings.ts";

let root: string;
let db: Database;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-client-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
});

afterAll(async () => {
	db.$client.close();
	await rm(root, { recursive: true, force: true });
});

const keys = async () => (await db.select({ key: settings.key }).from(settings)).map((r) => r.key);

describe("openDatabase", () => {
	// D5: Drizzle 1.0.0-rc.4 could roll back unrelated writes that share the connection.
	it("keeps a concurrent, unrelated write when a transaction rolls back", async () => {
		const updatedAt = new Date();
		let inserted!: () => void;
		const insertedInside = new Promise<void>((resolve) => {
			inserted = resolve;
		});
		let release!: () => void;
		const rollBack = new Promise<void>((resolve) => {
			release = resolve;
		});

		const transaction = db
			.transaction(async (tx) => {
				await tx.insert(settings).values({ key: "inside", value: "1", updatedAt });
				inserted();
				await rollBack;
				throw new Error("roll back");
			})
			.then(
				() => "committed",
				(error: Error) => error.message,
			);
		await insertedInside;
		const outside = db.insert(settings).values({ key: "outside", value: "1", updatedAt });
		release();

		expect(await transaction).toBe("roll back");
		await outside;
		expect(await keys()).toEqual(["outside"]);
	});
});
