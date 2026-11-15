import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "./client.ts";
import { migrateDatabase } from "./migrate.ts";
import { owner, ownerExists } from "./owner.ts";

let root: string;
let db: Database;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-owner-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
});

afterAll(async () => {
	await db.$client.close();
	await rm(root, { recursive: true, force: true });
});

describe("ownerExists", () => {
	it("is false until the owner row exists, then true", async () => {
		expect(await ownerExists(db)).toBe(false);
		await db
			.insert(owner)
			.values({ id: 1, username: "owner", passwordHash: "hash", createdAt: new Date() });
		expect(await ownerExists(db)).toBe(true);
	});

	it("allows one owner row at most", async () => {
		await expect(
			db
				.insert(owner)
				.values({ id: 2, username: "other", passwordHash: "h", createdAt: new Date() }),
		).rejects.toThrow();
	});
});
