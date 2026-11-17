import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { insertOwner, owner } from "#lib/server/db/owner.ts";
import { writeSetting } from "#lib/server/db/settings.ts";
import {
	FIRST_RUN_COMPLETE,
	FIRST_RUN_STEP_KEY,
	firstRunRedirect,
	isClaimed,
	isFirstRunComplete,
	markClaimed,
	startFirstRun,
	stopFirstRun,
	withClaimInProgress,
} from "./first-run.ts";

let root: string;
let files = 0;
const opened: Database[] = [];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-first-run-"));
});

afterEach(() => {
	stopFirstRun();
	vi.useRealTimers();
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

/**
 * Fakes the clock from here on, so a token expires exactly when the test moves time on rather than
 * whenever a loaded machine gets to it. Called once the database is open, which doesn't wait on it.
 */
const fakeClock = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

/** A token line's token, without its dashes. */
const tokenIn = (line: string | undefined) =>
	/([a-z0-9]{4})-([a-z0-9]{4})-([a-z0-9]{4})/
		.exec(line ?? "")
		?.slice(1)
		.join("");

describe("first run's bootstrap token", () => {
	it("is printed with /setup when the instance is unclaimed, and a new one at expiry", async () => {
		const printed: string[] = [];
		const db = await newDatabase();
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 60,
		});
		expect(isClaimed()).toBe(false);
		expect(printed).toHaveLength(1);
		expect(printed[0]).toMatch(/Setup token: [a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/);
		expect(printed[0]).toContain(" /setup ");
		expect(printed[0]).not.toContain("http");
		vi.advanceTimersByTime(59);
		expect(printed).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(printed).toHaveLength(2);
		expect(tokenIn(printed[1])).not.toBe(tokenIn(printed[0]));
	});

	it("keeps renewing when printing a token throws, without the error escaping", async () => {
		const printed: string[] = [];
		let failing = true;
		const db = await newDatabase();
		fakeClock();
		await expect(
			startFirstRun({
				db,
				origin: undefined,
				print: (line) => {
					if (failing) throw new Error("EPIPE: broken pipe");
					printed.push(line);
				},
				lifetimeMs: 60,
			}),
		).resolves.toBeUndefined();
		// The next renewal was scheduled anyway, and its print throws from inside the timer too.
		expect(() => vi.advanceTimersByTime(60)).not.toThrow();
		expect(printed).toEqual([]);
		// Renewals still go on, and print once the output works again.
		failing = false;
		vi.advanceTimersByTime(60);
		expect(printed).toHaveLength(1);
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
		const db = await newDatabase();
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 40,
		});
		await withClaimInProgress(async () => {
			vi.advanceTimersByTime(100);
			expect(printed).toHaveLength(1);
		});
		expect(printed).toHaveLength(2);
	});

	it("prints no more once stopped, as shutdown does", async () => {
		const printed: string[] = [];
		const db = await newDatabase();
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 40,
		});
		stopFirstRun();
		vi.advanceTimersByTime(100);
		expect(printed).toHaveLength(1);
	});

	it("is never printed once the instance is claimed", async () => {
		const db = await newDatabase();
		await db
			.insert(owner)
			.values({ id: 1, username: "owner", passwordHash: "hash", createdAt: new Date() });
		const printed: string[] = [];
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (line) => printed.push(line),
			lifetimeMs: 40,
		});
		vi.advanceTimersByTime(100);
		expect(isClaimed()).toBe(true);
		expect(printed).toEqual([]);
	});
});

describe("the setup gate", () => {
	const PATHS = ["/", "/no-such-page", "/setup", "/setup/more", "/healthz", "/healthz/more"];

	it("sends every path but /setup and /healthz to /setup until the claim, then none", async () => {
		await startFirstRun({ db: await newDatabase(), origin: undefined, print: () => {} });
		expect(Object.fromEntries(PATHS.map((path) => [path, firstRunRedirect(path)]))).toEqual({
			"/": "/setup",
			"/no-such-page": "/setup",
			"/setup": undefined,
			"/setup/more": "/setup",
			"/healthz": undefined,
			"/healthz/more": "/setup",
		});

		markClaimed();
		for (const path of PATHS) expect(firstRunRedirect(path), path).toBeUndefined();
	});
});

describe("first run after a restart", () => {
	it("starts complete on a database an earlier process claimed, and prints nothing", async () => {
		// First a fresh instance, so the flags start false and must be read back from the database.
		await startFirstRun({ db: await newDatabase(), origin: undefined, print: () => {} });
		expect(isFirstRunComplete()).toBe(false);
		stopFirstRun();

		const db = await newDatabase();
		await db.transaction(async (tx) => {
			await insertOwner(tx, { username: "owner", passwordHash: "h", createdAt: new Date() });
			await writeSetting(tx, FIRST_RUN_STEP_KEY, FIRST_RUN_COMPLETE, new Date());
		});
		const printed: string[] = [];
		await startFirstRun({ db, origin: undefined, print: (line) => printed.push(line) });
		expect(isClaimed()).toBe(true);
		expect(isFirstRunComplete()).toBe(true);
		expect(firstRunRedirect("/")).toBeUndefined();
		expect(printed).toEqual([]);
	});
});
