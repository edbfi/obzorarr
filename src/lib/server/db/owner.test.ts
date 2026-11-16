import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "./client.ts";
import { migrateDatabase } from "./migrate.ts";
import { findOwner, insertOwner, owner, ownerExists } from "./owner.ts";

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
		expect(await findOwner(db)).toBeUndefined();
		await db
			.insert(owner)
			.values({ id: 1, username: "owner", passwordHash: "hash", createdAt: new Date() });
		expect(await ownerExists(db)).toBe(true);
	});

	it("insertOwner refuses a second owner", async () => {
		await expect(
			insertOwner(db, { username: "second", passwordHash: "h", createdAt: new Date() }),
		).rejects.toThrow();
	});

	it("allows one owner row at most", async () => {
		await expect(
			db
				.insert(owner)
				.values({ id: 2, username: "other", passwordHash: "h", createdAt: new Date() }),
		).rejects.toThrow();
	});
});

describe("insertOwner", () => {
	it("creates the owner, as the claim's transaction does", async () => {
		const other = await openDatabase(join(root, "insert.db"));
		try {
			await migrateDatabase(other);
			await insertOwner(other, {
				username: "Owner",
				passwordHash: "$argon2id$hash",
				createdAt: new Date(5000),
			});
			expect(await other.select().from(owner)).toEqual([
				{ id: 1, username: "Owner", passwordHash: "$argon2id$hash", createdAt: new Date(5000) },
			]);
		} finally {
			await other.$client.close();
		}
	});
});

describe("findOwner", () => {
	it("reads the owner's username and password hash", async () => {
		expect(await findOwner(db)).toEqual({ username: "owner", passwordHash: "hash" });
	});
});
