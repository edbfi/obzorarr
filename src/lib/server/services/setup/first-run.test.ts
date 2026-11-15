import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { owner } from "#lib/server/db/owner.ts";
import { isClaimed, startFirstRun, stopFirstRun, withClaimInProgress } from "./first-run.ts";

let root: string;
let files = 0;
const opened: Database[] = [];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-first-run-"));
});

afterEach(() => {
	stopFirstRun();
});

afterAll(async () => {
	for (const db of opened) await db.$client.close();
	await rm(root, { recursive: true, force: true });
});

async function newDatabase(): Promise<Database> {
	const db = await openDatabase(join(root, `app-${files++}.db`));
	await migrateDatabase(db);
	opened.push(db);
	return db;
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A token line's token, without its dashes. */
const tokenIn = (line: string | undefined) =>
	/([a-z0-9]{4})-([a-z0-9]{4})-([a-z0-9]{4})/
		.exec(line ?? "")
		?.slice(1)
		.join("");

describe("first run's bootstrap token", () => {
	it("is printed with /setup when the instance is unclaimed, and a new one at expiry", async () => {
		const printed: string[] = [];
		await startFirstRun({
			db: await newDatabase(),
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 60,
		});
		expect(isClaimed()).toBe(false);
		expect(printed).toHaveLength(1);
		expect(printed[0]).toMatch(/Setup token: [a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/);
		expect(printed[0]).toContain(" /setup ");
		expect(printed[0]).not.toContain("http");
		await settle(100);
		expect(printed).toHaveLength(2);
		expect(tokenIn(printed[1])).not.toBe(tokenIn(printed[0]));
	});

	it("names the full address when ORIGIN is set", async () => {
		const printed: string[] = [];
		await startFirstRun({
			db: await newDatabase(),
			origin: "https://obzorarr.example",
			print: (line) => printed.push(line),
		});
		expect(printed[0]).toContain(" https://obzorarr.example/setup ");
	});

	it("waits to print a new one while a claim is in progress", async () => {
		const printed: string[] = [];
		await startFirstRun({
			db: await newDatabase(),
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 40,
		});
		await withClaimInProgress(async () => {
			await settle(100);
			expect(printed).toHaveLength(1);
		});
		expect(printed).toHaveLength(2);
	});

	it("prints no more once stopped, as shutdown does", async () => {
		const printed: string[] = [];
		await startFirstRun({
			db: await newDatabase(),
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 40,
		});
		stopFirstRun();
		await settle(100);
		expect(printed).toHaveLength(1);
	});

	it("is never printed once the instance is claimed", async () => {
		const db = await newDatabase();
		await db
			.insert(owner)
			.values({ id: 1, username: "owner", passwordHash: "hash", createdAt: new Date() });
		const printed: string[] = [];
		await startFirstRun({
			db,
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 40,
		});
		await settle(100);
		expect(isClaimed()).toBe(true);
		expect(printed).toEqual([]);
	});
});
