import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { insertOwner, owner } from "#lib/server/db/owner.ts";
import { readSetting } from "#lib/server/db/settings.ts";
import { verifyPassword } from "#lib/server/security/password.ts";
import { claimInstance } from "./claim.ts";
import {
	FIRST_RUN_STEP_KEY,
	isClaimed,
	isFirstRunComplete,
	startFirstRun,
	stopFirstRun,
} from "./first-run.ts";

let root: string;
let files = 0;
const opened: Database[] = [];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-claim-"));
});

afterEach(() => {
	stopFirstRun();
	vi.restoreAllMocks();
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

/** A fresh, unclaimed instance: its database, and the token lines it printed so far. */
async function freshInstance(lifetimeMs?: number) {
	const db = await newDatabase();
	const printed: string[] = [];
	await startFirstRun({
		db,
		origin: undefined,
		print: (line) => printed.push(line),
		...(lifetimeMs === undefined ? {} : { lifetimeMs }),
	});
	const token = (index = printed.length - 1) =>
		/Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) /.exec(printed[index] ?? "")?.[1] ?? "";
	return { db, printed, token };
}

const PASSWORD = "violet harbour lanterns";
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("claimInstance", () => {
	it("creates the owner with a hashed password and completes first run", async () => {
		const { db, token } = await freshInstance();
		const result = await claimInstance(db, {
			token: token().toUpperCase(),
			username: "  Owner  ",
			password: PASSWORD,
		});
		expect(result).toEqual({ status: "claimed" });
		const rows = await db.select().from(owner);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.username).toBe("Owner");
		expect(rows[0]?.passwordHash).not.toContain(PASSWORD);
		expect(await verifyPassword(PASSWORD, rows[0]?.passwordHash ?? "")).toBe(true);
		expect(await readSetting(db, FIRST_RUN_STEP_KEY)).toBe("complete");
		expect(isClaimed()).toBe(true);
		expect(isFirstRunComplete()).toBe(true);
	});

	it("reports field errors before the token, and leaves the token unused", async () => {
		const { db, token } = await freshInstance();
		const hash = vi.spyOn(Bun.password, "hash");
		expect(await claimInstance(db, { token: token(), username: " ", password: "short" })).toEqual({
			status: "invalid",
			username: "empty",
			password: "too-short",
		});
		expect(
			await claimInstance(db, {
				token: "wrong",
				username: "owner",
				password: "obzorarr is my home",
			}),
		).toEqual({ status: "invalid", password: "app-name" });
		expect(hash).not.toHaveBeenCalled();
		hash.mockRestore();
		expect(
			await claimInstance(db, { token: token(), username: "owner", password: PASSWORD }),
		).toEqual({ status: "claimed" });
	});

	it("refuses a wrong token without ever reaching the hash", async () => {
		const { db, printed } = await freshInstance();
		const hash = vi.spyOn(Bun.password, "hash");
		expect(
			await claimInstance(db, { token: "aaaa-bbbb-cccc", username: "owner", password: PASSWORD }),
		).toEqual({ status: "token" });
		expect(hash).not.toHaveBeenCalled();
		expect(await db.select().from(owner)).toEqual([]);
		// A wrong guess leaves the printed token as it was.
		expect(printed).toHaveLength(1);
	});

	it("refuses an expired token without ever reaching the hash", async () => {
		const { db, token } = await freshInstance(40);
		const expired = token(0);
		await settle(80);
		const hash = vi.spyOn(Bun.password, "hash");
		expect(
			await claimInstance(db, { token: expired, username: "owner", password: PASSWORD }),
		).toEqual({
			status: "token",
		});
		expect(hash).not.toHaveBeenCalled();
	});

	it("answers not found to a claim once the instance is claimed", async () => {
		const { db, token } = await freshInstance();
		const first = token();
		await claimInstance(db, { token: first, username: "owner", password: PASSWORD });
		expect(
			await claimInstance(db, { token: first, username: "other", password: PASSWORD }),
		).toEqual({
			status: "not-found",
		});
	});

	it("lets only one of two claims at once through, leaving one owner", async () => {
		const { db, token } = await freshInstance();
		const value = token();
		const results = await Promise.all([
			claimInstance(db, { token: value, username: "first", password: PASSWORD }),
			claimInstance(db, { token: value, username: "second", password: PASSWORD }),
		]);
		expect(results.map((result) => result.status).sort()).toEqual(["claimed", "token"]);
		expect(await db.select().from(owner)).toHaveLength(1);
	});

	it("prints a new token when the claim fails after the token was used up", async () => {
		const { db, printed, token } = await freshInstance();
		// An owner written behind first run's back makes the claim's insert fail.
		await insertOwner(db, { username: "elsewhere", passwordHash: "h", createdAt: new Date() });
		vi.spyOn(process.stdout, "write").mockImplementation((_chunk, ...rest: unknown[]) => {
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			done?.();
			return true;
		});
		const used = token();
		expect(await claimInstance(db, { token: used, username: "owner", password: PASSWORD })).toEqual(
			{
				status: "failed",
			},
		);
		expect(isClaimed()).toBe(false);
		expect(printed).toHaveLength(2);
		expect(token()).not.toBe(used);
		expect(await readSetting(db, FIRST_RUN_STEP_KEY)).toBeUndefined();
	});
});

describe("first run after a restart", () => {
	it("starts complete on a database an earlier process claimed, and prints nothing", async () => {
		const { db, token } = await freshInstance();
		await claimInstance(db, { token: token(), username: "owner", password: PASSWORD });
		stopFirstRun();
		const printed: string[] = [];
		await startFirstRun({ db, origin: undefined, print: (line) => printed.push(line) });
		expect(isClaimed()).toBe(true);
		expect(isFirstRunComplete()).toBe(true);
		expect(printed).toEqual([]);
	});
});
