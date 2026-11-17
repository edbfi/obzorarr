import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { findOwner, insertOwner, owner } from "#lib/server/db/owner.ts";
import { insertSessionForPassword, ownerSession } from "#lib/server/db/owner-session.ts";
import { readSetting, settings, writeSetting } from "#lib/server/db/settings.ts";
import { hashSlots } from "#lib/server/security/hash-slots.ts";
import { hashSessionToken } from "#lib/server/security/session-token.ts";

const hashing = vi.hoisted(() => ({
	/** How many hashes started. */
	calls: 0,
	/** Whether the next hash fails. */
	fails: false,
	/** Whether the next settings write fails, inside recovery's transaction. */
	settingFails: false,
	/** Runs while a verification is in flight, before it answers. */
	during: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("#lib/server/security/password.ts", async (importOriginal) => {
	const original = await importOriginal<typeof import("#lib/server/security/password.ts")>();
	return {
		...original,
		hashPassword: (password: string) => {
			hashing.calls++;
			if (hashing.fails) {
				hashing.fails = false;
				return Promise.reject(new Error("out of memory"));
			}
			return original.hashPassword(password);
		},
		verifyPassword: async (password: string, hash: string) => {
			const answer = await original.verifyPassword(password, hash);
			const during = hashing.during;
			hashing.during = undefined;
			await during?.();
			return answer;
		},
	};
});

vi.mock("#lib/server/db/settings.ts", async (importOriginal) => {
	const original = await importOriginal<typeof import("#lib/server/db/settings.ts")>();
	return {
		...original,
		writeSetting: (...args: Parameters<typeof original.writeSetting>) => {
			if (hashing.settingFails) {
				hashing.settingFails = false;
				return Promise.reject(new Error("disk I/O error"));
			}
			return original.writeSetting(...args);
		},
	};
});

const { hashPassword, verifyPassword } = await import("#lib/server/security/password.ts");
const { isRecoveryOn, isRecoveryWaiting, recover, RECOVERY_USED_KEY, startRecovery } = await import(
	"./recovery.ts"
);
const { signIn } = await import("./sign-in.ts");

let root: string;
let db: Database;
let printed: string[];
let logged: string[];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-recovery-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
});

beforeEach(async () => {
	printed = [];
	logged = [];
	await db.delete(settings);
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		logged.push(String(chunk));
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	await db.$client.close();
	await rm(root, { recursive: true, force: true });
});

const start = (enabled: boolean, claimed: boolean, origin?: string) =>
	startRecovery({ db, enabled, claimed, origin, print: (line) => printed.push(line) });
const warnings = () =>
	logged
		.map((line) => JSON.parse(line) as { level: string; message: string })
		.filter((entry) => entry.level === "warn")
		.map((entry) => entry.message);

describe("recovery at startup", () => {
	it("prints a recovery token naming /recovery while the setting is on, the instance claimed and the token unused", async () => {
		await start(true, true);
		expect(printed).toHaveLength(1);
		expect(printed[0]).toMatch(
			/^Recovery token: [a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4} \(valid for 15 minutes\)\. Open \/recovery to set a new owner password\.$/,
		);
		expect(isRecoveryOn()).toBe(true);
		expect(warnings()).toEqual([
			"recovery is on: a recovery token is printed to standard output; remove OBZORARR_RECOVERY and restart once it is used",
		]);
		// The token is printed, never logged.
		const token = /Recovery token: (\S+)/.exec(printed[0] ?? "")?.[1] ?? "";
		expect(logged.join("")).not.toContain(token);
	});

	it("names the full address when ORIGIN is set, and a restart prints a new token", async () => {
		await start(true, true, "https://obzorarr.example");
		await start(true, true, "https://obzorarr.example");
		expect(printed[0]).toContain(" https://obzorarr.example/recovery ");
		expect(printed[1]).not.toBe(printed[0]);
	});

	it("prints none once the token was used, also after a restart, and warns", async () => {
		await writeSetting(db, RECOVERY_USED_KEY, "true", new Date());
		await start(true, true);
		expect(printed).toEqual([]);
		expect(isRecoveryOn()).toBe(true);
		expect(warnings()).toEqual([
			"recovery is on, but its token was used; remove OBZORARR_RECOVERY and restart",
		]);
	});

	it("is ignored on an unclaimed instance, with a warning", async () => {
		await start(true, false);
		expect(printed).toEqual([]);
		expect(warnings()).toEqual([
			"recovery is ignored until the instance is claimed; remove OBZORARR_RECOVERY",
		]);
	});

	it("does nothing while the setting is off, clearing that the token was used", async () => {
		await writeSetting(db, RECOVERY_USED_KEY, "true", new Date());
		await start(false, true);
		expect(printed).toEqual([]);
		expect(warnings()).toEqual([]);
		expect(isRecoveryOn()).toBe(false);
		expect(await readSetting(db, RECOVERY_USED_KEY)).toBeUndefined();
		// So turning it on again prints a new token.
		await start(true, true);
		expect(printed).toHaveLength(1);
	});
});

describe("recover", () => {
	const PASSWORD = "violet harbour lanterns";
	const NEW_PASSWORD = "copper meadow tidewater";
	let ownerHash: string;

	beforeAll(async () => {
		ownerHash = await hashPassword(PASSWORD);
		await insertOwner(db, { username: "Gunnhild", passwordHash: ownerHash, createdAt: new Date() });
	});

	beforeEach(async () => {
		hashing.calls = 0;
		hashing.during = undefined;
		await db.update(owner).set({ passwordHash: ownerHash });
		await db.delete(ownerSession);
		for (let i = 0; i < 2; i++) {
			const now = new Date();
			await insertSessionForPassword(
				db,
				{
					tokenHash: `old-${i}`,
					createdAt: now,
					lastUsedAt: now,
					expiresAt: new Date(now.getTime() + 60_000),
				},
				ownerHash,
			);
		}
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/** Starts recovery on the claimed instance and gives the token it printed. */
	async function printedToken(): Promise<string> {
		await start(true, true);
		return /Recovery token: (\S+)/.exec(printed.at(-1) ?? "")?.[1] ?? "";
	}

	it("sets the new password, ends every session, starts this one and records that it was used", async () => {
		const token = await printedToken();
		const result = await recover(db, { token: token.toUpperCase(), password: NEW_PASSWORD });
		if (result.status !== "recovered") throw new Error(`not recovered: ${result.status}`);
		expect(await verifyPassword(NEW_PASSWORD, (await findOwner(db))?.passwordHash ?? "")).toBe(
			true,
		);
		const sessions = await db.select().from(ownerSession);
		expect(sessions.map((row) => row.tokenHash)).toEqual([hashSessionToken(result.session.token)]);
		expect(await readSetting(db, RECOVERY_USED_KEY)).toBeDefined();
		// The token is used up: `/recovery` is gone, and a second try finds nothing.
		expect(isRecoveryWaiting()).toBe(false);
		expect(await recover(db, { token, password: NEW_PASSWORD })).toEqual({ status: "not-found" });
	});

	it("checks the new password against setup's rules and the stored username first, leaving the token unused", async () => {
		const token = await printedToken();
		expect(await recover(db, { token, password: "short" })).toEqual({
			status: "invalid",
			error: "too-short",
		});
		expect(await recover(db, { token, password: "gunnhild's new passphrase" })).toEqual({
			status: "invalid",
			error: "username",
		});
		expect(hashing.calls).toBe(0);
		expect(await recover(db, { token, password: NEW_PASSWORD })).toMatchObject({
			status: "recovered",
		});
	});

	it("refuses a wrong token and an expired one with one answer, never reaching the hash", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const token = await printedToken();
		expect(await recover(db, { token: "aaaa-bbbb-cccc", password: NEW_PASSWORD })).toEqual({
			status: "token",
		});
		vi.setSystemTime(Date.now() + 15 * 60_000);
		expect(await recover(db, { token, password: NEW_PASSWORD })).toEqual({ status: "token" });
		expect(hashing.calls).toBe(0);
		expect((await findOwner(db))?.passwordHash).toBe(ownerHash);
		// An expired token still shows the page: its answer names the console.
		expect(isRecoveryWaiting()).toBe(true);
	});

	it("is refused as busy before the token, so the token stays usable", async () => {
		const token = await printedToken();
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		try {
			expect(await recover(db, { token, password: NEW_PASSWORD })).toMatchObject({
				status: "too-many",
				reason: "busy",
			});
		} finally {
			for (const release of taken) release?.();
		}
		expect(await recover(db, { token, password: NEW_PASSWORD })).toMatchObject({
			status: "recovered",
		});
	});

	it("refuses the sixth try from one address within 5 minutes, before the token", async () => {
		const token = await printedToken();
		const clientAddress = "203.0.113.60";
		for (let i = 0; i < 5; i++) {
			expect(
				await recover(db, { token: "aaaa-bbbb-cccc", password: NEW_PASSWORD, clientAddress }),
			).toEqual({ status: "token" });
		}
		const refused = await recover(db, { token, password: NEW_PASSWORD, clientAddress });
		expect(refused).toMatchObject({
			status: "too-many",
			reason: "limit",
			headers: { "x-ratelimit-limit": "5" },
		});
		// Another address is counted apart, and the token was never used.
		expect(
			await recover(db, { token, password: NEW_PASSWORD, clientAddress: "203.0.113.61" }),
		).toMatchObject({ status: "recovered" });
	});

	it("fails as a whole when the transaction fails, leaving the old password and sessions, and the token used", async () => {
		const token = await printedToken();
		logged = [];
		hashing.settingFails = true;
		expect(await recover(db, { token, password: NEW_PASSWORD })).toEqual({ status: "failed" });
		expect((await findOwner(db))?.passwordHash).toBe(ownerHash);
		expect((await db.select().from(ownerSession)).map((row) => row.tokenHash).sort()).toEqual([
			"old-0",
			"old-1",
		]);
		expect(await readSetting(db, RECOVERY_USED_KEY)).toBeUndefined();
		// The token is used up, and a restart prints a new one, since nothing recorded its use.
		expect(isRecoveryWaiting()).toBe(false);
		const entries = logged.map((line) => JSON.parse(line) as Record<string, unknown>);
		expect(entries).toContainEqual(
			expect.objectContaining({ level: "error", message: "the recovery failed" }),
		);
		expect(logged.join("")).not.toContain(NEW_PASSWORD);
		expect(logged.join("")).not.toContain(token);
	});

	it("fails, logged, when hashing the new password fails after the token was used", async () => {
		const token = await printedToken();
		logged = [];
		hashing.fails = true;
		expect(await recover(db, { token, password: NEW_PASSWORD })).toEqual({ status: "failed" });
		expect((await findOwner(db))?.passwordHash).toBe(ownerHash);
		expect(logged.map((line) => JSON.parse(line) as Record<string, unknown>)).toContainEqual(
			expect.objectContaining({ level: "error", message: "the recovery failed" }),
		);
		// The hash slot was freed.
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		expect(taken.every((release) => release !== undefined)).toBe(true);
		for (const release of taken) release?.();
	});

	it("answers not found while recovery is off or the instance unclaimed", async () => {
		await start(false, true);
		expect(await recover(db, { token: "aaaa-bbbb-cccc", password: NEW_PASSWORD })).toEqual({
			status: "not-found",
		});
		await start(true, false);
		expect(isRecoveryWaiting()).toBe(false);
	});

	it("leaves a sign-in with the old password that ends after the recovery without a session", async () => {
		const token = await printedToken();
		let recovered: Awaited<ReturnType<typeof recover>> | undefined;
		hashing.during = async () => {
			recovered = await recover(db, { token, password: NEW_PASSWORD });
		};
		expect(await signIn(db, { username: "Gunnhild", password: PASSWORD })).toEqual({
			status: "wrong",
		});
		if (recovered?.status !== "recovered") throw new Error("the recovery didn't happen");
		const sessions = await db.select().from(ownerSession);
		expect(sessions.map((row) => row.tokenHash)).toEqual([
			hashSessionToken(recovered.session.token),
		]);
	});

	it("logs a recovery at info and a refused token at warn, never the token or a password", async () => {
		const token = await printedToken();
		logged = [];
		const clientAddress = "203.0.113.62";
		await recover(db, { token: "aaaa-bbbb-cccc", password: NEW_PASSWORD, clientAddress });
		await recover(db, { token, password: NEW_PASSWORD, clientAddress });
		const entries = logged.map((line) => JSON.parse(line) as Record<string, unknown>);
		expect(entries).toEqual([
			expect.objectContaining({
				level: "warn",
				message: "a recovery token was refused",
				metadata: { clientAddress },
			}),
			expect.objectContaining({
				level: "info",
				message: "the owner's password was recovered",
				metadata: { clientAddress },
			}),
		]);
		expect(logged.join("")).not.toContain(token);
		expect(logged.join("")).not.toContain(NEW_PASSWORD);
	});
});
