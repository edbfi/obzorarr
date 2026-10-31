import { describe, expect, it, vi } from "vitest";
import {
	decryptSecret,
	encryptSecret,
	type SecretBinding,
	SecretDecryptError,
	SecretFormatError,
	SecretKeyMismatchError,
} from "./cipher.ts";
import { currentKeyring, loadKeyring } from "./keyring.ts";
import { Secret } from "./secret.ts";

// Every key and secret here is generated when the test runs; none is written in the repo. Tests
// compare `reveal()` values, never `Secret`s: `toEqual` treats any two `Secret`s as equal.
const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const randomKey = () => randomBytes(32).toBase64();
const randomValue = () => randomBytes(24).toBase64();

const encode = (bytes: Uint8Array) => bytes.toBase64({ alphabet: "base64url", omitPadding: true });
const decode = (text: string) => Uint8Array.fromBase64(text, { alphabet: "base64url" });

const PLACE: SecretBinding = { table: "t", field: "f", rowId: "r-1" };
const NOT_LOADED = "no master key is loaded; loadKeyring must succeed first";
const NOT_V1 = "the stored secret isn't in the v1 format";
const UNKNOWN_VERSION = "the stored secret uses a version this app doesn't know";
const NOT_DECRYPTED =
	"the stored secret can't be decrypted: it was changed, or is read with another table, field or row ID";
const MISMATCH =
	"the secret in t.f of row r-1 was written under another master key; set the key it was written with, or enter this secret again";

/** Every key and plaintext a test made, so each cipher error can be checked against all of them. */
const keys: string[] = [];
const plaintexts: string[] = [];

/** Loads `key` as the master key and returns its key ID. */
async function load(key: string): Promise<string> {
	keys.push(key);
	await loadKeyring({ OBZORARR_SECRET_KEY: key });
	return currentKeyring().keyId;
}

async function encrypt(value: string, binding = PLACE): Promise<string> {
	plaintexts.push(value);
	return encryptSecret(new Secret(value), binding);
}

/** The AES-256-GCM key the spec defines, derived here without the keyring's code. */
async function aesKeyOf(key: string): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey("raw", Uint8Array.fromBase64(key), "HKDF", false, [
		"deriveKey",
	]);
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: new TextEncoder().encode("edbfi:secrets:v1:aes-256-gcm"),
		},
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

/** The associated data for `PLACE`, written out by hand. */
const placeData = (keyId: string, app = "obzorarr") => `["v1","${keyId}","${app}","t","f","r-1"]`;

/** Encrypts `plaintext` with the test's own key and associated data, in the stored format. */
async function seal(key: string, keyId: string, plaintext: Uint8Array<ArrayBuffer>, data: string) {
	const iv = randomBytes(12);
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(data), tagLength: 128 },
		await aesKeyOf(key),
		plaintext,
	);
	return `v1.${keyId}.${encode(iv)}.${encode(new Uint8Array(sealed))}`;
}

/** `stored` with segment `index` replaced by `replace(segment)`. */
function withSegment(stored: string, index: number, replace: (segment: string) => string): string {
	const parts = stored.split(".");
	parts[index] = replace(parts[index] ?? "");
	return parts.join(".");
}

/** A segment with bit `bit` of its decoded bytes flipped, encoded canonically again. */
function flipBit(segment: string, bit: number): string {
	const bytes = decode(segment);
	bytes[bit >> 3] = (bytes[bit >> 3] ?? 0) ^ (1 << (bit & 7));
	return encode(bytes);
}

/** Whether `text` holds 6 characters of `value` in a row, as a boolean so no value is printed. */
function leaks(text: string, value: string): boolean {
	for (let start = 0; start + 6 <= value.length; start++) {
		if (text.includes(value.slice(start, start + 6))) return true;
	}
	return false;
}

/**
 * The own keys a plain `Error` may have, plus `name`. JSC adds an error's source position only
 * when it knows it, which depends on how the throwing code was compiled, so those keys are named.
 */
const ERROR_KEYS = new Set<PropertyKey>([
	...Reflect.ownKeys(new Error("a plain error")),
	"line",
	"column",
	"sourceURL",
	"originalLine",
	"originalColumn",
	"name",
]);

type CipherError = SecretFormatError | SecretKeyMismatchError | SecretDecryptError;
type CipherErrorClass =
	| typeof SecretFormatError
	| typeof SecretKeyMismatchError
	| typeof SecretDecryptError;

/**
 * Awaits a rejection that must be one of `classes`, after checking that the error carries
 * nothing: no `cause`, one line, no own key a plain `Error` lacks (beyond `name`), and nothing
 * of any key, plaintext or `stored` (with its nonce and ciphertext) in what Bun prints for it.
 */
async function rejection(
	promise: Promise<unknown>,
	stored: string,
	...classes: CipherErrorClass[]
): Promise<CipherError> {
	const error: unknown = await promise.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	if (!classes.some((type) => error instanceof type)) {
		throw new Error(`expected ${classes.map((type) => type.name).join(" or ")}`);
	}
	const cipherError = error as CipherError;
	const printed = Bun.inspect(cipherError);
	const [, , nonce = "", sealed = ""] = stored.split(".");

	for (const value of [...keys, ...plaintexts, stored, nonce, sealed]) {
		expect(leaks(printed, value), "the error holds a key, plaintext or stored value").toBe(false);
	}
	expect(cipherError.cause).toBeUndefined();
	expect(cipherError.message.includes("\n")).toBe(false);
	expect(Reflect.ownKeys(cipherError).filter((key) => !ERROR_KEYS.has(key))).toEqual([]);
	return cipherError;
}

/** Decrypts `stored` at `binding`, expecting one of `classes`. */
const failure = (stored: string, binding: SecretBinding, ...classes: CipherErrorClass[]) =>
	rejection(decryptSecret(stored, binding), stored, ...classes);

describe("encryptSecret and decryptSecret", () => {
	it("round-trips every kind of value exactly", async () => {
		await load(randomKey());
		const values = [
			"x",
			"ab",
			"abc",
			randomValue(),
			` \t${randomValue()}  \n`,
			`${randomValue()}\r\n${randomValue()}`,
			`ключ ✓ 🔑 ${randomValue()}`,
			`\uFEFF${randomValue()}`,
			randomBytes(1536).toBase64(),
		];

		for (const value of values) {
			const stored = await encrypt(value);
			expect((await decryptSecret(stored, PLACE)).reveal()).toBe(value);
		}
	});

	it("stores v1, the key ID, a 12-byte nonce and the ciphertext with its tag", async () => {
		const keyId = await load(randomKey());

		for (const value of ["x", "ab", "abc", `ключ ${randomValue()}`]) {
			const [version, id, nonce, sealed, ...rest] = (await encrypt(value)).split(".");

			expect(rest).toEqual([]);
			expect(version).toBe("v1");
			expect(id).toBe(keyId);
			expect(nonce).toMatch(/^[A-Za-z0-9_-]{16}$/);
			expect(decode(sealed ?? "").length).toBe(new TextEncoder().encode(value).length + 16);
		}
	});

	it("takes a fresh nonce for every encryption", async () => {
		await load(randomKey());
		const value = randomValue();
		const [first, second] = [await encrypt(value), await encrypt(value)];

		expect(first.split(".")[2]).not.toBe(second.split(".")[2]);
		expect(first).not.toBe(second);
	});

	it("encrypts with the spec's AES key and compact associated data", async () => {
		const key = randomKey();
		const keyId = await load(key);
		const value = randomValue();
		const [, , nonce, sealed] = (await encrypt(value)).split(".");
		const aesKey = await aesKeyOf(key);
		const open = (data: string) =>
			crypto.subtle.decrypt(
				{
					name: "AES-GCM",
					iv: decode(nonce ?? ""),
					additionalData: new TextEncoder().encode(data),
				},
				aesKey,
				decode(sealed ?? ""),
			);

		expect(new TextDecoder().decode(await open(placeData(keyId)))).toBe(value);
		await expect(open(placeData(keyId).replaceAll(",", ", "))).rejects.toThrow();
	});

	it("decrypts a value the test encrypts with the spec's key and associated data", async () => {
		const key = randomKey();
		const keyId = await load(key);
		const value = randomValue();
		const stored = await seal(key, keyId, new TextEncoder().encode(value), placeData(keyId));

		expect((await decryptSecret(stored, PLACE)).reveal()).toBe(value);
	});

	it("refuses a value written for another app", async () => {
		const key = randomKey();
		const keyId = await load(key);
		const stored = await seal(
			key,
			keyId,
			new TextEncoder().encode(randomValue()),
			placeData(keyId, "comradarr"),
		);

		await failure(stored, PLACE, SecretDecryptError);
	});

	it("refuses a value read at another table, field or row ID", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());
		const elsewhere: SecretBinding[] = [
			{ ...PLACE, table: "u" },
			{ ...PLACE, field: "g" },
			{ ...PLACE, rowId: "r-2" },
		];

		for (const binding of elsewhere) {
			const error = await failure(stored, binding, SecretDecryptError);
			expect(error.message).toBe(NOT_DECRYPTED);
		}
	});

	it("binds each part of the place separately, whatever it holds", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue(), { table: 'a","b', field: "c", rowId: "r" });
		await failure(stored, { table: "a", field: 'b","c', rowId: "r" }, SecretDecryptError);

		const places: SecretBinding[] = [
			{ table: 'q"uo\\te', field: "a.b", rowId: "line\nbreak" },
			{ table: "таблица", field: "🔑", rowId: "éé" },
		];
		for (const binding of places) {
			const value = randomValue();
			const restored = await decryptSecret(await encrypt(value, binding), binding);
			expect(restored.reveal()).toBe(value);
		}
	});

	it("names another master key for every flipped bit of the key ID", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());

		for (let bit = 0; bit < 128; bit++) {
			const flipped = withSegment(stored, 1, (id) => flipBit(id, bit));
			await failure(flipped, PLACE, SecretKeyMismatchError);
		}
	});

	it("refuses a flipped bit in the nonce, the ciphertext and the tag", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());
		const sealedBits = decode(stored.split(".")[3] ?? "").length * 8;
		const flips = [
			withSegment(stored, 2, (nonce) => flipBit(nonce, 37)),
			withSegment(stored, 3, (sealed) => flipBit(sealed, 5)),
			withSegment(stored, 3, (sealed) => flipBit(sealed, sealedBits - 3)),
		];

		for (const flipped of flips) await failure(flipped, PLACE, SecretDecryptError);
	});

	it("refuses another version", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());

		for (const version of ["v0", "v2", "w1", "V1"]) {
			await failure(
				withSegment(stored, 0, () => version),
				PLACE,
				SecretFormatError,
			);
		}
	});

	it("names another master key, and decrypts again once the key is back", async () => {
		const a = randomKey();
		await load(a);
		const value = randomValue();
		const stored = await encrypt(value);
		await load(randomKey());

		const error = await failure(stored, PLACE, SecretKeyMismatchError);
		expect(error.message).toBe(MISMATCH);

		await load(a);
		expect((await decryptSecret(stored, PLACE)).reveal()).toBe(value);
	});

	it("refuses a value relabelled with the loaded key's ID", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());
		const idOfB = await load(randomKey());

		await failure(
			withSegment(stored, 1, () => idOfB),
			PLACE,
			SecretDecryptError,
		);
	});

	it("never returns a value for a truncated stored value", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());

		for (let length = 0; length < stored.length; length++) {
			await failure(
				stored.slice(0, length),
				PLACE,
				SecretFormatError,
				SecretKeyMismatchError,
				SecretDecryptError,
			);
		}
		const cut = withSegment(stored, 3, (sealed) => encode(decode(sealed).subarray(0, -1)));
		await failure(cut, PLACE, SecretDecryptError);
	});

	it("refuses a ciphertext that is only a tag", async () => {
		const key = randomKey();
		const keyId = await load(key);
		const stored = await seal(key, keyId, new Uint8Array(0), placeData(keyId));

		expect(decode(stored.split(".")[3] ?? "").length).toBe(16);
		const error = await failure(stored, PLACE, SecretFormatError);
		expect(error.message).toBe(NOT_V1);
	});

	it("checks every segment's length", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());
		const wrong = [
			withSegment(stored, 1, () => encode(randomBytes(15))),
			withSegment(stored, 1, () => encode(randomBytes(17))),
			withSegment(stored, 2, () => encode(randomBytes(11))),
			withSegment(stored, 2, () => encode(randomBytes(13))),
			withSegment(stored, 3, () => ""),
			withSegment(stored, 3, () => encode(randomBytes(16))),
		];

		for (const value of wrong) {
			const error = await failure(value, PLACE, SecretFormatError);
			expect(error.message).toBe(NOT_V1);
		}
		await failure(
			withSegment(stored, 3, () => encode(randomBytes(17))),
			PLACE,
			SecretDecryptError,
		);
	});

	it("refuses every non-canonical form of each segment", async () => {
		await load(randomKey());
		// Ciphertexts of 18, 19 and 20 bytes: no partial group, then one of 2 and one of 3
		// characters. The key ID has a 2-character group; the 12-byte nonce has none.
		const stored = [await encrypt("ab"), await encrypt("abc"), await encrypt("abcd")];
		const forms: ((segment: string) => string)[] = [
			(segment) => `${segment}=`,
			(segment) => `${segment}==`,
			(segment) => `${segment.slice(0, 4)} ${segment.slice(4)}`,
			(segment) => `${segment.slice(0, 4)}\n${segment.slice(4)}`,
			(segment) => ` ${segment}`,
			(segment) => `+${segment.slice(1)}`,
			(segment) => `/${segment.slice(1)}`,
			(segment) => segment.padEnd(segment.length + ((5 - (segment.length % 4)) % 4), "A"),
		];
		const values = stored.flatMap((value) =>
			[1, 2, 3].flatMap((index) => forms.map((form) => withSegment(value, index, form))),
		);
		// A non-zero bit after the last byte: the key ID and the 19- and 20-byte ciphertexts.
		const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
		const trailing = (segment: string) =>
			segment.slice(0, -1) + ALPHABET[ALPHABET.indexOf(segment.at(-1) ?? "") + 1];
		for (const value of stored) values.push(withSegment(value, 1, trailing));
		for (const value of stored.slice(1)) values.push(withSegment(value, 3, trailing));

		for (const value of values) {
			const error = await failure(value, PLACE, SecretFormatError);
			expect(error.message).toBe(NOT_V1);
		}
	});

	it("refuses empty and malformed stored text as not v1", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());
		const malformed = ["", "v1", "v1...", `.${stored}`, `${stored}.`, `${stored}.AAAA`, "garbage"];

		for (const value of malformed) {
			const error = await failure(value, PLACE, SecretFormatError);
			expect(error.message).toBe(NOT_V1);
		}
	});

	it("reports a later version as unknown, whatever its shape", async () => {
		await load(randomKey());

		for (const value of ["v2.a.b.c", "v10.x"]) {
			const error = await failure(value, PLACE, SecretFormatError);
			expect(error.message).toBe(UNKNOWN_VERSION);
		}
	});

	it("checks the format before the key ID", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());
		await load(randomKey());

		await failure(
			withSegment(stored, 2, () => encode(randomBytes(11))),
			PLACE,
			SecretFormatError,
		);
	});

	it("refuses a decrypted value that isn't UTF-8", async () => {
		const key = randomKey();
		const keyId = await load(key);
		const stored = await seal(key, keyId, new Uint8Array([0xff, 0xfe]), placeData(keyId));

		const error = await failure(stored, PLACE, SecretFormatError);
		expect(error.message).toBe(NOT_V1);
	});

	it("refuses an empty secret and an empty part of the place", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());
		const empty = [
			{ ...PLACE, table: "" },
			{ ...PLACE, field: "" },
			{ ...PLACE, rowId: "" },
		];
		const plainError = async (promise: Promise<unknown>) => {
			const error = await promise.then(
				() => undefined,
				(reason: unknown) => reason,
			);
			expect(error instanceof Error && error.constructor === Error).toBe(true);
			return (error as Error).message;
		};

		expect(await plainError(encryptSecret(new Secret(""), PLACE))).toBe(
			"an empty secret can't be encrypted",
		);
		for (const binding of empty) {
			const message = "a secret's binding needs a non-empty table, field and row ID";
			expect(await plainError(encryptSecret(new Secret(randomValue()), binding))).toBe(message);
			expect(await plainError(decryptSecret(stored, binding))).toBe(message);
		}
	});

	it("needs a loaded keyring, before any load and after a failed one", async () => {
		await load(randomKey());
		const stored = await encrypt(randomValue());

		vi.resetModules();
		const fresh = await import("./cipher.ts");
		await expect(fresh.encryptSecret(new Secret(randomValue()), PLACE)).rejects.toThrow(NOT_LOADED);
		await expect(fresh.decryptSecret(stored, PLACE)).rejects.toThrow(NOT_LOADED);

		await expect(loadKeyring({})).rejects.toThrow();
		await expect(encryptSecret(new Secret(randomValue()), PLACE)).rejects.toThrow(NOT_LOADED);
		await expect(decryptSecret(stored, PLACE)).rejects.toThrow(NOT_LOADED);
	});
});
