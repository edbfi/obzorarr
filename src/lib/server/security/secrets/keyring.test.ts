import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { currentKeyring, type KeyringCheck, KeyringError, loadKeyring } from "./keyring.ts";

// Every key here is generated from bytes when the test runs; none is written in the repo.
const randomBytes = () => crypto.getRandomValues(new Uint8Array(32));
const randomKey = () => randomBytes().toBase64();

function keyOf(bytes: (index: number) => number): string {
	return Uint8Array.from({ length: 32 }, (_, index) => bytes(index) & 0xff).toBase64();
}

const NOT_LOADED = "no master key is loaded; loadKeyring must succeed first";
const HINT = "openssl rand -base64 32";
const FILE_SUBJECT = "the key in the file OBZORARR_SECRET_KEY_FILE names";

let dir: string;
let files = 0;
/** Each key file's content, by path, so the leak test can check it. */
const contents = new Map<string, string>();

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "obzorarr-keyring-"));
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** Writes `content` to a new file in the test's directory and returns its path. */
async function keyFile(content: string): Promise<string> {
	const path = join(dir, `key-${files++}`);
	await writeFile(path, content);
	contents.set(path, content);
	return path;
}

/** The key ID the spec defines, computed here without the keyring's code. */
async function expectedKeyId(text: string): Promise<string> {
	const base = await crypto.subtle.importKey("raw", Uint8Array.fromBase64(text), "HKDF", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: new TextEncoder().encode("edbfi:secrets:v1:key-id"),
		},
		base,
		128,
	);
	return Buffer.from(bits).toString("base64url");
}

async function failure(env: SecretKeyEnv): Promise<KeyringError> {
	try {
		await loadKeyring(env);
	} catch (error) {
		if (error instanceof KeyringError) return error;
		throw error;
	}
	throw new Error("the keyring was loaded");
}

/** Whether `message` holds 6 characters of `value` in a row, as a boolean so no key is printed. */
function leaks(message: string, value: string): boolean {
	for (let start = 0; start + 6 <= value.length; start++) {
		if (message.includes(value.slice(start, start + 6))) return true;
	}
	return false;
}

/**
 * One case per check. `names` are the variables the message names; `subject` starts the message
 * of task 1's checks. A new key is the fix, and the hint is given, only for `missing` and those.
 */
const failing: {
	name: string;
	env: () => Promise<SecretKeyEnv>;
	check: KeyringCheck;
	names: string[];
	subject?: string;
	hex?: boolean;
}[] = [
	{
		name: "neither variable",
		env: async () => ({}),
		check: "missing",
		names: ["OBZORARR_SECRET_KEY", "OBZORARR_SECRET_KEY_FILE"],
	},
	{
		name: "both variables set",
		env: async () => ({
			OBZORARR_SECRET_KEY: randomKey(),
			OBZORARR_SECRET_KEY_FILE: await keyFile(randomKey()),
		}),
		check: "both-set",
		names: ["OBZORARR_SECRET_KEY", "OBZORARR_SECRET_KEY_FILE"],
	},
	{
		name: "a missing file",
		env: async () => ({ OBZORARR_SECRET_KEY_FILE: join(dir, "missing") }),
		check: "unreadable",
		names: ["OBZORARR_SECRET_KEY_FILE"],
	},
	{
		name: "a file of 4,097 bytes",
		env: async () => ({ OBZORARR_SECRET_KEY_FILE: await keyFile("A".repeat(4097)) }),
		check: "too-large",
		names: ["OBZORARR_SECRET_KEY_FILE"],
	},
	{
		name: "a 43-character key",
		env: async () => ({ OBZORARR_SECRET_KEY: `${randomKey().slice(0, 42)}=` }),
		check: "format",
		names: ["OBZORARR_SECRET_KEY"],
		subject: "OBZORARR_SECRET_KEY",
	},
	{
		name: "an empty key file",
		env: async () => ({ OBZORARR_SECRET_KEY_FILE: await keyFile("") }),
		check: "format",
		names: ["OBZORARR_SECRET_KEY_FILE"],
		subject: FILE_SUBJECT,
	},
	{
		name: "a hex key",
		env: async () => ({ OBZORARR_SECRET_KEY: randomBytes().toHex() }),
		check: "format",
		names: ["OBZORARR_SECRET_KEY"],
		subject: "OBZORARR_SECRET_KEY",
		hex: true,
	},
	{
		name: "a repeated byte in a key file",
		env: async () => ({ OBZORARR_SECRET_KEY_FILE: await keyFile(`${keyOf(() => 0x61)}\n`) }),
		check: "entropy",
		names: ["OBZORARR_SECRET_KEY_FILE"],
		subject: FILE_SUBJECT,
	},
	{
		name: "a counter",
		env: async () => ({ OBZORARR_SECRET_KEY: keyOf((i) => 0xf0 + i) }),
		check: "constant-step",
		names: ["OBZORARR_SECRET_KEY"],
		subject: "OBZORARR_SECRET_KEY",
	},
	{
		name: "a base64-encoded passphrase in a key file",
		// 32 distinct letters, A to Z then a to f: one step of 7 between Z and a.
		env: async () => ({
			OBZORARR_SECRET_KEY_FILE: await keyFile(keyOf((i) => (i < 26 ? 0x41 + i : 0x61 + i - 26))),
		}),
		check: "printable-ascii",
		names: ["OBZORARR_SECRET_KEY_FILE"],
		subject: FILE_SUBJECT,
	},
];

describe("loadKeyring and currentKeyring", () => {
	it("has no keyring before any load", async () => {
		vi.resetModules();
		const fresh = await import("./keyring.ts");

		expect(() => fresh.currentKeyring()).toThrow(NOT_LOADED);
	});

	it("derives the key ID with HKDF-SHA-256 and its own label", async () => {
		const key = randomKey();
		await loadKeyring({ OBZORARR_SECRET_KEY: key });
		const { keyId } = currentKeyring();

		expect(keyId).toBe(await expectedKeyId(key));
		expect(keyId).toMatch(/^[A-Za-z0-9_-]{22}$/);
	});

	it("gives one key the same ID from the variable and from a key file", async () => {
		const key = randomKey();
		await loadKeyring({ OBZORARR_SECRET_KEY: key });
		const fromVariable = currentKeyring().keyId;
		await loadKeyring({ OBZORARR_SECRET_KEY_FILE: await keyFile(`${key}\n`) });

		expect(currentKeyring().keyId).toBe(fromVariable);
	});

	it("gives different keys different IDs, and keeps the latest", async () => {
		const [a, b] = [randomKey(), randomKey()];
		await loadKeyring({ OBZORARR_SECRET_KEY: a });
		const idOfA = currentKeyring().keyId;
		await loadKeyring({ OBZORARR_SECRET_KEY: b });

		expect(currentKeyring().keyId).toBe(await expectedKeyId(b));
		expect(currentKeyring().keyId).not.toBe(idOfA);
	});

	it("derives a non-extractable AES-256-GCM key for encrypting and decrypting", async () => {
		await loadKeyring({ OBZORARR_SECRET_KEY: randomKey() });
		const { aesKey } = currentKeyring();

		expect(aesKey.extractable).toBe(false);
		expect(aesKey.algorithm).toEqual({ name: "AES-GCM", length: 256 });
		expect([...aesKey.usages].sort()).toEqual(["decrypt", "encrypt"]);
		await expect(crypto.subtle.exportKey("raw", aesKey)).rejects.toThrow();
		expect(Object.isFrozen(currentKeyring())).toBe(true);
	});

	it("has no keyring after a failed load", async () => {
		await loadKeyring({ OBZORARR_SECRET_KEY: randomKey() });

		await expect(loadKeyring({})).rejects.toBeInstanceOf(KeyringError);
		expect(() => currentKeyring()).toThrow(NOT_LOADED);
	});

	it("never lets an older load bring its keyring back after a newer load fails", async () => {
		const older = loadKeyring({ OBZORARR_SECRET_KEY_FILE: await keyFile(randomKey()) });
		const newer = loadKeyring({});
		const [first, second] = await Promise.allSettled([older, newer]);

		expect(first.status).toBe("fulfilled");
		expect(second.status).toBe("rejected");
		expect(() => currentKeyring()).toThrow(NOT_LOADED);
	});

	for (const { name, env, check, names, subject, hex } of failing) {
		it(`refuses ${name} with the ${check} check in one line`, async () => {
			const error = await failure(await env());
			const { message } = error;

			expect(error).toBeInstanceOf(KeyringError);
			expect(error.check).toBe(check);
			for (const variable of names) expect(message.includes(variable)).toBe(true);
			if (subject !== undefined) expect(message.startsWith(`${subject} `)).toBe(true);
			expect(message.includes(HINT)).toBe(check === "missing" || subject !== undefined);
			expect(message.includes("hex")).toBe(hex === true);
			expect(message.includes("\n")).toBe(false);
			expect(error.cause).toBeUndefined();
		});
	}

	it("never puts 6 characters of a key or a path in a row into its message", async () => {
		const cases = await Promise.all(failing.map(({ env }) => env()));
		cases.push({ OBZORARR_SECRET_KEY_FILE: randomKey() });

		for (const env of cases) {
			const { message } = await failure(env);
			// Each variable's value, and the content of the file it names, if any.
			const values = Object.values(env).flatMap((value) =>
				value === undefined ? [] : [value, contents.get(value) ?? ""],
			);

			for (const value of values) expect(leaks(message, value)).toBe(false);
		}
	});
});
