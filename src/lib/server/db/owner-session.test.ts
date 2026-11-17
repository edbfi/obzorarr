import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "./client.ts";
import { migrateDatabase } from "./migrate.ts";
import { insertOwner } from "./owner.ts";
import {
	countOtherSessions,
	deleteAllSessions,
	deleteExpiredSessions,
	deleteOtherSessions,
	deleteSession,
	findSession,
	insertSessionForPassword,
	ownerSession,
	touchSession,
} from "./owner-session.ts";

let root: string;
let db: Database;
const at = (ms: number) => new Date(1_800_000_000_000 + ms);

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-owner-session-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
	await insertOwner(db, { username: "Owner", passwordHash: "hash-1", createdAt: at(0) });
});

afterAll(async () => {
	await db.$client.close();
	await rm(root, { recursive: true, force: true });
});

const row = (tokenHash: string, ms = 0) => ({
	tokenHash,
	createdAt: at(ms),
	lastUsedAt: at(ms),
	expiresAt: at(ms + 1000),
});

describe("insertSessionForPassword", () => {
	it("stores the session only while the password it names is the owner's", async () => {
		expect(await insertSessionForPassword(db, row("a"), "hash-1")).toBe(true);
		expect(await insertSessionForPassword(db, row("b"), "an-older-hash")).toBe(false);
		const stored = await db.select().from(ownerSession);
		expect(stored.map((session) => session.tokenHash)).toEqual(["a"]);
	});
});

describe("findSession", () => {
	it("gives the session with its owner's username, or nothing for an unknown hash", async () => {
		await insertSessionForPassword(db, row("find"), "hash-1");
		expect(await findSession(db, "find")).toEqual({ ...row("find"), username: "Owner" });
		expect(await findSession(db, "nobody")).toBeUndefined();
	});
});

describe("touchSession and deleteSession", () => {
	it("moves the last use only once it is as old as the cutoff, so lookups at once write once", async () => {
		await insertSessionForPassword(db, row("cutoff"), "hash-1");
		expect(await touchSession(db, "cutoff", at(500), at(-1))).toBe(false);
		expect((await findSession(db, "cutoff"))?.lastUsedAt).toEqual(at(0));
		const writes = await Promise.all(
			Array.from({ length: 8 }, () => touchSession(db, "cutoff", at(500), at(0))),
		);
		expect(writes.filter(Boolean)).toHaveLength(1);
		expect((await findSession(db, "cutoff"))?.lastUsedAt).toEqual(at(500));
	});

	it("moves the last use, and removes the session", async () => {
		await insertSessionForPassword(db, row("touch"), "hash-1");
		await touchSession(db, "touch", at(500), at(0));
		expect((await findSession(db, "touch"))?.lastUsedAt).toEqual(at(500));
		expect(await deleteSession(db, "touch")).toBe(true);
		expect(await findSession(db, "touch")).toBeUndefined();
		expect(await deleteSession(db, "touch")).toBe(false);
	});
});

describe("deleteExpiredSessions", () => {
	it("removes sessions past their end or unused for too long, and keeps the rest", async () => {
		await db.delete(ownerSession);
		const now = at(10_000);
		await insertSessionForPassword(db, { ...row("ended"), expiresAt: now }, "hash-1");
		await insertSessionForPassword(
			db,
			{ ...row("idle"), lastUsedAt: at(10_000 - 300), expiresAt: at(99_999) },
			"hash-1",
		);
		await insertSessionForPassword(
			db,
			{ ...row("live"), lastUsedAt: at(10_000 - 299), expiresAt: at(99_999) },
			"hash-1",
		);
		await deleteExpiredSessions(db, now, 300);
		const left = await db.select({ tokenHash: ownerSession.tokenHash }).from(ownerSession);
		expect(left).toEqual([{ tokenHash: "live" }]);
	});
});

describe("countOtherSessions and deleteOtherSessions", () => {
	it("count the live sessions but one, and delete every session but one, saying how many", async () => {
		await db.delete(ownerSession);
		const now = at(10_000);
		const live = { lastUsedAt: at(10_000 - 299), expiresAt: at(99_999) };
		for (const hash of ["mine", "a", "b"]) {
			await insertSessionForPassword(db, { ...row(hash), ...live }, "hash-1");
		}
		await insertSessionForPassword(db, { ...row("ended"), expiresAt: now }, "hash-1");
		await insertSessionForPassword(
			db,
			{ ...row("idle"), lastUsedAt: at(10_000 - 300), expiresAt: at(99_999) },
			"hash-1",
		);
		expect(await countOtherSessions(db, "mine", now, 300)).toBe(2);
		expect(await deleteOtherSessions(db, "mine")).toBe(4);
		const left = await db.select({ tokenHash: ownerSession.tokenHash }).from(ownerSession);
		expect(left).toEqual([{ tokenHash: "mine" }]);
		expect(await countOtherSessions(db, "mine", now, 300)).toBe(0);
	});
});

describe("deleteAllSessions", () => {
	it("ends every session", async () => {
		await insertSessionForPassword(db, row("one"), "hash-1");
		await insertSessionForPassword(db, row("two"), "hash-1");
		await deleteAllSessions(db);
		expect(await db.select().from(ownerSession)).toEqual([]);
	});
});
