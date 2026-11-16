import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { insertOwner, owner } from "#lib/server/db/owner.ts";
import { ownerSession } from "#lib/server/db/owner-session.ts";
import { readSetting } from "#lib/server/db/settings.ts";
import { hashSlots } from "#lib/server/security/hash-slots.ts";
import { verifyPassword } from "#lib/server/security/password.ts";
import { hashSessionToken } from "#lib/server/security/session-token.ts";
import { SESSION_MAX_MS } from "#lib/server/services/sign-in/sessions.ts";
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
async function freshInstance() {
	const db = await newDatabase();
	const printed: string[] = [];
	await startFirstRun({ db, origin: undefined, print: (line) => printed.push(line) });
	const token = (index = printed.length - 1) =>
		/Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) /.exec(printed[index] ?? "")?.[1] ?? "";
	return { db, printed, token };
}

const PASSWORD = "violet harbour lanterns";

describe("claimInstance", () => {
	it("creates the owner with a hashed password and completes first run", async () => {
		const { db, token } = await freshInstance();
		const result = await claimInstance(db, {
			token: token().toUpperCase(),
			username: "  Owner  ",
			password: PASSWORD,
		});
		expect(result).toMatchObject({ status: "claimed" });
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
		).toMatchObject({ status: "claimed" });
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
		const { db, token } = await freshInstance();
		const expired = token();
		// The token is still the current one: only the clock has moved past its 15 minutes.
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now + 15 * 60 * 1000 + 1);
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

	it("prints no new token once shutdown has stopped first run", async () => {
		const { db, printed, token } = await freshInstance();
		await insertOwner(db, { username: "elsewhere", passwordHash: "h", createdAt: new Date() });
		vi.spyOn(process.stdout, "write").mockImplementation((_chunk, ...rest: unknown[]) => {
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			done?.();
			return true;
		});
		const used = token();
		stopFirstRun();
		expect(await claimInstance(db, { token: used, username: "owner", password: PASSWORD })).toEqual(
			{ status: "failed" },
		);
		expect(printed).toHaveLength(1);
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
		expect(await db.select().from(ownerSession)).toEqual([]);
	});

	it("logs a failed claim without the typed username or the password's hash", async () => {
		const { db, token } = await freshInstance();
		await insertOwner(db, { username: "elsewhere", passwordHash: "h", createdAt: new Date() });
		const written: string[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			written.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			done?.();
			return true;
		});
		const result = await claimInstance(db, {
			token: token(),
			username: "Gunnhild Østergaard",
			password: PASSWORD,
		});
		expect(result).toEqual({ status: "failed" });
		const entry = written
			.map((line) => JSON.parse(line))
			.find((e) => e.message === "the claim failed");
		expect(entry).toBeDefined();
		const text = JSON.stringify(entry);
		expect(text).not.toContain("Gunnhild");
		expect(text).not.toContain("$argon2");
		// What the database said is kept, so the failure can still be told apart.
		expect(text).toMatch(/constraint/i);
	});

	it("starts the owner's session in its transaction, and gives its token", async () => {
		const { db, token } = await freshInstance();
		const before = Date.now();
		const result = await claimInstance(db, {
			token: token(),
			username: "owner",
			password: PASSWORD,
		});
		if (result.status !== "claimed") throw new Error(`not claimed: ${result.status}`);
		const sessions = await db.select().from(ownerSession);
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.tokenHash).toBe(hashSessionToken(result.session.token));
		expect(result.session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_MAX_MS);
	});
});

describe("claimInstance's limits", () => {
	it("refuses when every hash slot is busy, before the token, so the token stays usable", async () => {
		const { db, token } = await freshInstance();
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		try {
			expect(
				await claimInstance(db, {
					token: token(),
					username: "owner",
					password: PASSWORD,
					clientAddress: "198.51.100.1",
				}),
			).toEqual({
				status: "too-many",
				reason: "busy",
				retryAfterSeconds: 5,
				headers: { "retry-after": "5" },
			});
		} finally {
			for (const release of taken) release?.();
		}
		expect(
			await claimInstance(db, {
				token: token(),
				username: "owner",
				password: PASSWORD,
				clientAddress: "198.51.100.1",
			}),
		).toMatchObject({ status: "claimed" });
	});

	it("refuses the sixth claim from one address within 5 minutes, before the token", async () => {
		const { db, token } = await freshInstance();
		const address = "198.51.100.2";
		for (let i = 0; i < 5; i++) {
			const result = await claimInstance(db, {
				token: token(),
				username: " ",
				password: "short",
				clientAddress: address,
			});
			expect(result.status).toBe("invalid");
		}
		const hash = vi.spyOn(Bun.password, "hash");
		const refused = await claimInstance(db, {
			token: token(),
			username: "owner",
			password: PASSWORD,
			clientAddress: address,
		});
		expect(refused).toMatchObject({ status: "too-many", reason: "limit" });
		if (refused.status !== "too-many") throw new Error("not refused");
		expect(refused.retryAfterSeconds).toBeGreaterThan(0);
		expect(refused.headers["x-ratelimit-limit"]).toBe("5");
		expect(hash).not.toHaveBeenCalled();
		// Another address isn't held back, and the token was never touched.
		expect(
			await claimInstance(db, {
				token: token(),
				username: "owner",
				password: PASSWORD,
				clientAddress: "198.51.100.3",
			}),
		).toMatchObject({ status: "claimed" });
	});

	it.each([
		[
			"throws",
			() => {
				throw new Error("no memory");
			},
		],
		["rejects", () => Promise.reject(new Error("no memory"))],
	])("frees its hash slot when the hash %s", async (_how, fail) => {
		const { db, token } = await freshInstance();
		vi.spyOn(Bun.password, "hash").mockImplementationOnce(fail as typeof Bun.password.hash);
		expect(
			await claimInstance(db, { token: token(), username: "owner", password: PASSWORD }),
		).toEqual({ status: "failed" });
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		expect(taken.every((release) => typeof release === "function")).toBe(true);
		for (const release of taken) release?.();
		// A new token was printed, and claims.
		expect(
			await claimInstance(db, { token: token(), username: "owner", password: PASSWORD }),
		).toMatchObject({ status: "claimed" });
	});

	it("skips the limit for a request with no known address", async () => {
		const { db, token } = await freshInstance();
		for (let i = 0; i < 6; i++) {
			const result = await claimInstance(db, { token: token(), username: " ", password: "short" });
			expect(result.status).toBe("invalid");
		}
	});
});
