import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { insertOwner } from "#lib/server/db/owner.ts";
import { findSession, ownerSession } from "#lib/server/db/owner-session.ts";
import { hashSessionToken } from "#lib/server/security/session-token.ts";
import {
	deleteExpiredSessions,
	endSession,
	lookUpSession,
	SESSION_IDLE_MS,
	SESSION_MAX_MS,
	SESSION_TOUCH_MS,
	startSession,
} from "./sessions.ts";

let root: string;
let db: Database;
const T0 = new Date("2026-11-16T12:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-sessions-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
	await insertOwner(db, { username: "Owner", passwordHash: "hash-1", createdAt: T0 });
});

beforeEach(async () => {
	await db.delete(ownerSession);
});

afterAll(async () => {
	await db.$client.close();
	await rm(root, { recursive: true, force: true });
});

/** A session started at `T0` for the owner's current password. */
async function started() {
	const session = await startSession(db, { passwordHash: "hash-1", now: T0 });
	if (session === undefined) throw new Error("no session");
	return session;
}

describe("the limits", () => {
	it("are 7 days unused, 30 days at most, and a last use written at most hourly", () => {
		expect(SESSION_IDLE_MS).toBe(7 * 24 * 60 * 60 * 1000);
		expect(SESSION_MAX_MS).toBe(30 * 24 * 60 * 60 * 1000);
		expect(SESSION_TOUCH_MS).toBe(60 * 60 * 1000);
	});
});

describe("startSession", () => {
	it("stores only the token's hash, ending 30 days after it starts", async () => {
		const { token, expiresAt } = await started();
		expect(expiresAt).toEqual(later(SESSION_MAX_MS));
		const stored = await db.select().from(ownerSession);
		expect(stored).toEqual([
			{ tokenHash: hashSessionToken(token), createdAt: T0, lastUsedAt: T0, expiresAt },
		]);
		expect(JSON.stringify(stored)).not.toContain(token);
	});

	it("starts nothing for a password that is no longer the owner's", async () => {
		expect(await startSession(db, { passwordHash: "an-older-hash", now: T0 })).toBeUndefined();
		expect(await db.select().from(ownerSession)).toEqual([]);
	});
});

describe("lookUpSession", () => {
	it("gives the owner for a live session, and nothing for an unknown token", async () => {
		const { token } = await started();
		expect(await lookUpSession(db, token, later(1000))).toEqual({ username: "Owner" });
		expect(await lookUpSession(db, "not-a-token", later(1000))).toBeUndefined();
	});

	it("ends a session 7 days after its last use, to the millisecond, and deletes it", async () => {
		const { token } = await started();
		expect(await lookUpSession(db, token, later(SESSION_IDLE_MS - 1))).toEqual({
			username: "Owner",
		});
		// That use renewed it, so the next 7 days run from there.
		const renewed = later(SESSION_IDLE_MS - 1);
		const stillLive = new Date(renewed.getTime() + SESSION_IDLE_MS - 1);
		expect(await lookUpSession(db, token, stillLive)).toEqual({ username: "Owner" });
		const idle = new Date(stillLive.getTime() + SESSION_IDLE_MS);
		expect(await lookUpSession(db, token, idle)).toBeUndefined();
		expect(await findSession(db, hashSessionToken(token))).toBeUndefined();
	});

	it("ends a session 30 days after it started, however recently it was used", async () => {
		const { token } = await started();
		for (let day = 6; day < 30; day += 6) {
			expect(await lookUpSession(db, token, later(day * 24 * 60 * 60 * 1000))).toBeDefined();
		}
		expect(await lookUpSession(db, token, later(SESSION_MAX_MS - 1))).toBeDefined();
		expect(await lookUpSession(db, token, later(SESSION_MAX_MS))).toBeUndefined();
		expect(await findSession(db, hashSessionToken(token))).toBeUndefined();
	});

	it("writes the last use at most once an hour", async () => {
		const { token } = await started();
		const hash = hashSessionToken(token);
		await lookUpSession(db, token, later(SESSION_TOUCH_MS - 1));
		expect((await findSession(db, hash))?.lastUsedAt).toEqual(T0);
		await lookUpSession(db, token, later(SESSION_TOUCH_MS));
		expect((await findSession(db, hash))?.lastUsedAt).toEqual(later(SESSION_TOUCH_MS));
	});
});

describe("deleteExpiredSessions", () => {
	it("removes ended and idle sessions, as startup does", async () => {
		const ending = await started();
		const now = later(SESSION_IDLE_MS);
		const fresh = await startSession(db, { passwordHash: "hash-1", now });
		await deleteExpiredSessions(db, now);
		const left = await db.select({ tokenHash: ownerSession.tokenHash }).from(ownerSession);
		expect(left).toEqual([{ tokenHash: hashSessionToken(fresh?.token ?? "") }]);
		expect(left).not.toContainEqual({ tokenHash: hashSessionToken(ending.token) });
	});
});

describe("endSession", () => {
	it("ends the session the token names, and only that one", async () => {
		const first = await started();
		const second = await started();
		await endSession(db, first.token);
		expect(await lookUpSession(db, first.token, T0)).toBeUndefined();
		expect(await lookUpSession(db, second.token, T0)).toEqual({ username: "Owner" });
		// A token that names no session ends nothing.
		await endSession(db, "made-up");
		expect(await lookUpSession(db, second.token, T0)).toEqual({ username: "Owner" });
	});
});
