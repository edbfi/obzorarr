import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DrizzleQueryError, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase, queryFailure } from "./client.ts";
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
		// Drizzle's queries are lazy, so `execute()` starts the write now, while the transaction is
		// open; the pause lets it reach the connection before the transaction rolls back.
		const outside = db
			.insert(settings)
			.values({ key: "outside", value: "1", updatedAt })
			.execute()
			.then(
				() => "written",
				(error: Error) => error.message,
			);
		await new Promise((resolve) => setTimeout(resolve, 50));
		release();

		expect(await transaction).toBe("roll back");
		expect(await outside).toBe("written");
		expect(await keys()).toEqual(["outside"]);
	});
});

describe("a failed query's error", () => {
	it("carries the query but never the values bound to it, which can be a password's hash", async () => {
		let failure: unknown;
		try {
			await db.run(sql`insert into ${settings} (key, value) values (${"a-secret-value"}, ${null})`);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(Error);
		const error = failure as Error & { params?: unknown; query?: string };
		expect(error.params).toBeUndefined();
		expect(error.message).not.toContain("a-secret-value");
		expect(error.query).toContain("insert into");
	});
});

describe("queryFailure", () => {
	it("keeps a failed query's text and the database's own error, never its values", () => {
		const cause = new Error("UNIQUE constraint failed: owner.id");
		const failed = new DrizzleQueryError(
			'insert into "owner" ("username", "password_hash") values (?, ?)',
			["Gunnhild", "$argon2id$v=19$m=65536,t=2,p=1$c2FsdA$aGFzaA"],
			cause,
		);
		expect(failed.message).toContain("Gunnhild");
		const kept = queryFailure(failed);
		expect(kept).toEqual({
			name: "DrizzleQueryError",
			query: 'insert into "owner" ("username", "password_hash") values (?, ?)',
			cause,
		});
		expect(JSON.stringify(kept)).not.toContain("Gunnhild");
	});

	it("returns any other error as it is", () => {
		const other = new Error("hashing failed");
		expect(queryFailure(other)).toBe(other);
		expect(queryFailure("text")).toBe("text");
	});
});
