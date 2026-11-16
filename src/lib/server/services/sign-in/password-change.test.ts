import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { findOwner, insertOwner, owner } from "#lib/server/db/owner.ts";
import { insertSessionForPassword, ownerSession } from "#lib/server/db/owner-session.ts";
import { hashSlots } from "#lib/server/security/hash-slots.ts";
import { hashSessionToken, newSessionToken } from "#lib/server/security/session-token.ts";

const verify = vi.hoisted(() => ({
	/** Runs while a verification is in flight, before it answers. */
	during: undefined as (() => Promise<void>) | undefined,
	/** How many verifications started. */
	calls: 0,
	/** Stands in for argon2id where a test makes many checks and only the answer matters. */
	fast: undefined as ((password: string) => boolean) | undefined,
}));

vi.mock("#lib/server/security/password.ts", async (importOriginal) => {
	const original = await importOriginal<typeof import("#lib/server/security/password.ts")>();
	return {
		...original,
		verifyPassword: async (password: string, hash: string) => {
			verify.calls++;
			const answer = verify.fast
				? verify.fast(password)
				: await original.verifyPassword(password, hash);
			const during = verify.during;
			// Once, so a sign-in or change it starts runs without it.
			verify.during = undefined;
			await during?.();
			return answer;
		},
	};
});

const { hashPassword, verifyPassword } = await import("#lib/server/security/password.ts");
const { changePassword } = await import("./password-change.ts");
const { signIn } = await import("./sign-in.ts");

const USERNAME = "Gunnhild";
const PASSWORD = "violet harbour lanterns";
const NEW_PASSWORD = "copper meadow tidewater";
let root: string;
let db: Database;
let ownerHash: string;
let logged: string[];
/** This browser's session, and another browser's. */
let mine: string;
let other: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-password-change-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
	ownerHash = await hashPassword(PASSWORD);
	await insertOwner(db, { username: USERNAME, passwordHash: ownerHash, createdAt: new Date() });
});

/** Stores a session for the owner's current password, returning its token. */
async function session(): Promise<string> {
	const { token, hash } = newSessionToken();
	const now = new Date();
	const end = new Date(now.getTime() + 60 * 60_000);
	const stored = await insertSessionForPassword(
		db,
		{ tokenHash: hash, createdAt: now, lastUsedAt: now, expiresAt: end },
		ownerHash,
	);
	if (!stored) throw new Error("no session");
	return token;
}

beforeEach(async () => {
	verify.during = undefined;
	verify.calls = 0;
	verify.fast = undefined;
	logged = [];
	await db.delete(ownerSession);
	await db.update(owner).set({ passwordHash: ownerHash });
	mine = await session();
	other = await session();
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

const storedHashes = async () =>
	(await db.select().from(ownerSession)).map((row) => row.tokenHash).sort();
const change = (input: { current?: string; next?: string; clientAddress?: string } = {}) =>
	changePassword(db, {
		sessionToken: mine,
		current: input.current ?? PASSWORD,
		next: input.next ?? NEW_PASSWORD,
		clientAddress: input.clientAddress,
	});

describe("changePassword", () => {
	it("replaces the hash, ends every other session and gives this one a new token", async () => {
		const result = await change();
		if (result.status !== "changed") throw new Error(`not changed: ${result.status}`);
		const stored = await findOwner(db);
		expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
		expect(await verifyPassword(NEW_PASSWORD, stored?.passwordHash ?? "")).toBe(true);
		expect(result.session.token).not.toBe(mine);
		expect(await storedHashes()).toEqual([hashSessionToken(result.session.token)]);
	});

	it("changes nothing for a wrong current password, which counts as a failed sign-in", async () => {
		// Eleven checks, so the owner's password is checked without argon2id; the tests above and
		// below check it for real.
		verify.fast = (password) => password === PASSWORD;
		const clientAddress = "203.0.113.40";
		expect(await change({ current: "not the password", clientAddress })).toEqual({
			status: "wrong-current",
		});
		expect((await findOwner(db))?.passwordHash).toBe(ownerHash);
		expect(await storedHashes()).toEqual([hashSessionToken(mine), hashSessionToken(other)].sort());
		// Nine more wrong passwords make ten failures in a row, so the address must wait.
		for (let i = 0; i < 9; i++) await change({ current: "not the password", clientAddress });
		expect(
			await signIn(db, { username: USERNAME, password: PASSWORD, clientAddress }),
		).toMatchObject({ status: "too-many", reason: "wait" });
	});

	it("shares signing in's window of 10 per 5 minutes", async () => {
		verify.fast = (password) => password === PASSWORD;
		const clientAddress = "203.0.113.41";
		for (let i = 0; i < 9; i++) {
			await signIn(db, { username: USERNAME, password: PASSWORD, clientAddress });
		}
		// The 10th request in the window is a change with a field error: it still counts.
		expect(await change({ next: "short", clientAddress })).toMatchObject({ status: "invalid" });
		verify.calls = 0;
		expect(await change({ clientAddress })).toMatchObject({ status: "too-many", reason: "limit" });
		expect(verify.calls).toBe(0);
	});

	it("checks the new password against setup's rules and the stored username, before any hash", async () => {
		expect(await change({ next: "short" })).toEqual({ status: "invalid", error: "too-short" });
		expect(await change({ next: `my name is ${USERNAME.toLowerCase()} ok` })).toEqual({
			status: "invalid",
			error: "username",
		});
		expect(verify.calls).toBe(0);
		expect((await findOwner(db))?.passwordHash).toBe(ownerHash);
	});

	it("is refused as busy, without verifying, when every hash slot is taken", async () => {
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		try {
			expect(await change()).toMatchObject({ status: "too-many", reason: "busy" });
			expect(verify.calls).toBe(0);
		} finally {
			for (const release of taken) release?.();
		}
		expect((await findOwner(db))?.passwordHash).toBe(ownerHash);
	});

	it("changes nothing when this session ended while the password was checked", async () => {
		verify.during = async () => {
			await db.delete(ownerSession);
		};
		expect(await change()).toEqual({ status: "signed-out" });
		expect((await findOwner(db))?.passwordHash).toBe(ownerHash);
		expect(await storedHashes()).toEqual([]);
	});

	it("changes nothing when the password changed while it was checked", async () => {
		const newer = await hashPassword("a newer passphrase here");
		verify.during = async () => {
			await db.update(owner).set({ passwordHash: newer });
		};
		expect(await change()).toEqual({ status: "signed-out" });
		expect((await findOwner(db))?.passwordHash).toBe(newer);
	});

	it("leaves a sign-in with the old password that ends after the change without a session", async () => {
		let changed: Awaited<ReturnType<typeof changePassword>> | undefined;
		verify.during = async () => {
			changed = await change();
		};
		expect(await signIn(db, { username: USERNAME, password: PASSWORD })).toEqual({
			status: "wrong",
		});
		if (changed?.status !== "changed") throw new Error("the change didn't happen");
		expect(await storedHashes()).toEqual([hashSessionToken(changed.session.token)]);
	});

	it("logs a change at info and a wrong current password at warn, never a password", async () => {
		const clientAddress = "203.0.113.42";
		await change({ current: "not the password", clientAddress });
		await change({ clientAddress });
		const entries = logged.map((line) => JSON.parse(line) as Record<string, unknown>);
		expect(entries).toEqual([
			expect.objectContaining({
				level: "warn",
				message: "a password change had the wrong current password",
				metadata: { clientAddress },
			}),
			expect.objectContaining({
				level: "info",
				message: "the owner changed their password",
				metadata: { clientAddress },
			}),
		]);
		expect(logged.join("")).not.toContain("not the password");
		expect(logged.join("")).not.toContain(NEW_PASSWORD);
	});
});
