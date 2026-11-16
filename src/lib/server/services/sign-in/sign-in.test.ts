import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { insertOwner, owner } from "#lib/server/db/owner.ts";
import { insertSessionForPassword, ownerSession } from "#lib/server/db/owner-session.ts";
import { hashSlots } from "#lib/server/security/hash-slots.ts";
import { hashSessionToken } from "#lib/server/security/session-token.ts";

const verify = vi.hoisted(() => ({
	/** Runs while a verification is in flight, before it answers. */
	during: undefined as (() => Promise<void>) | undefined,
	hashes: [] as string[],
}));

vi.mock("#lib/server/security/password.ts", async (importOriginal) => {
	const original = await importOriginal<typeof import("#lib/server/security/password.ts")>();
	return {
		...original,
		verifyPassword: async (password: string, hash: string) => {
			verify.hashes.push(hash);
			const answer = await original.verifyPassword(password, hash);
			await verify.during?.();
			return answer;
		},
	};
});

const { hashPassword } = await import("#lib/server/security/password.ts");
const { signIn } = await import("./sign-in.ts");

const PASSWORD = "violet harbour lanterns";
let root: string;
let db: Database;
let ownerHash: string;
let logged: string[];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-sign-in-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
	ownerHash = await hashPassword(PASSWORD);
	await insertOwner(db, { username: "Åse", passwordHash: ownerHash, createdAt: new Date() });
});

beforeEach(async () => {
	verify.during = undefined;
	verify.hashes = [];
	logged = [];
	await db.delete(ownerSession);
	await db.update(owner).set({ passwordHash: ownerHash });
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

const entries = () => logged.map((line) => JSON.parse(line) as Record<string, unknown>);

describe("signIn", () => {
	it("signs the owner in with the right username and password, starting a session", async () => {
		const result = await signIn(db, { username: "Åse", password: PASSWORD });
		if (result.status !== "signed-in") throw new Error(`not signed in: ${result.status}`);
		const stored = await db.select().from(ownerSession);
		expect(stored.map((session) => session.tokenHash)).toEqual([
			hashSessionToken(result.session.token),
		]);
	});

	it("compares the username trimmed, in NFC and ignoring case", async () => {
		const typed = "  ÅSE  ";
		expect(await signIn(db, { username: typed, password: PASSWORD })).toMatchObject({
			status: "signed-in",
		});
	});

	it("gives one answer for a wrong password and a wrong username", async () => {
		expect(await signIn(db, { username: "Åse", password: "the wrong password" })).toEqual({
			status: "wrong",
		});
		expect(await signIn(db, { username: "someone", password: PASSWORD })).toEqual({
			status: "wrong",
		});
		expect(await db.select().from(ownerSession)).toEqual([]);
	});

	it("verifies a wrong username against a dummy argon2id hash, so it takes as long", async () => {
		await signIn(db, { username: "someone", password: PASSWORD });
		expect(verify.hashes).toHaveLength(1);
		expect(verify.hashes[0]).toMatch(/^\$argon2id\$/);
		expect(verify.hashes[0]).not.toBe(ownerHash);
	});

	it("starts no session when the password changed while it was being checked", async () => {
		verify.during = async () => {
			await db.update(owner).set({ passwordHash: await hashPassword("a newer passphrase here") });
		};
		expect(await signIn(db, { username: "Åse", password: PASSWORD })).toEqual({ status: "wrong" });
		expect(await db.select().from(ownerSession)).toEqual([]);
	});

	it("is refused as busy, without verifying, when every hash slot is taken", async () => {
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		try {
			expect(await signIn(db, { username: "Åse", password: PASSWORD })).toEqual({
				status: "too-many",
				reason: "busy",
				retryAfterSeconds: 5,
				headers: { "retry-after": "5" },
			});
			expect(verify.hashes).toEqual([]);
		} finally {
			for (const release of taken) release?.();
		}
	});

	it("frees its hash slot however the verification ends", async () => {
		verify.during = () => Promise.reject(new Error("verification failed"));
		await expect(signIn(db, { username: "Åse", password: PASSWORD })).rejects.toThrow();
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		expect(taken.every((release) => release !== undefined)).toBe(true);
		for (const release of taken) release?.();
	});

	it("deletes ended sessions as it signs the owner in", async () => {
		const long = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		await insertSessionForPassword(
			db,
			{
				tokenHash: "ended",
				createdAt: long,
				lastUsedAt: long,
				expiresAt: new Date(long.getTime() + 1),
			},
			ownerHash,
		);
		await signIn(db, { username: "Åse", password: PASSWORD });
		expect(await db.select().from(ownerSession).where(eq(ownerSession.tokenHash, "ended"))).toEqual(
			[],
		);
	});

	it("logs a success at info and a failure at warn, with the address and never the username", async () => {
		await signIn(db, { username: "Åse", password: PASSWORD, clientAddress: "198.51.100.7" });
		await signIn(db, {
			username: "my-password-typed-here",
			password: PASSWORD,
			clientAddress: "198.51.100.8",
		});
		expect(entries()).toMatchObject([
			{ level: "info", source: "sign-in", metadata: { clientAddress: "198.51.100.7" } },
			{ level: "warn", source: "sign-in", metadata: { clientAddress: "198.51.100.8" } },
		]);
		expect(logged.join("\n")).not.toContain("my-password-typed-here");
		expect(logged.join("\n")).not.toContain("Åse");
	});
});
