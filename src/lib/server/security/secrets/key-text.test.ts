import { describe, expect, it } from "vitest";
import { decodeKeyText, type KeyCheck, KeyTextError } from "./key-text.ts";

// Every key here is generated from bytes when the test runs; none is written in the repo.
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function randomBytes(length = 32): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(length));
}

function keyOf(bytes: (index: number) => number): string {
	return Uint8Array.from({ length: 32 }, (_, index) => bytes(index) & 0xff).toBase64();
}

const randomKey = () => randomBytes().toBase64();

function failure(text: string): KeyTextError {
	try {
		decodeKeyText(text);
	} catch (error) {
		if (error instanceof KeyTextError) return error;
		throw error;
	}
	throw new Error("the key text was accepted");
}

/** Each case expects the first check it trips; the comments name the later ones it also trips. */
const failing: { name: string; text: () => string; check: KeyCheck; hex?: boolean }[] = [
	{ name: "empty text", text: () => "", check: "format" },
	{ name: "whitespace-only text", text: () => " \t \n ", check: "format" },
	{ name: "43 characters", text: () => `${randomKey().slice(0, 42)}=`, check: "format" },
	{ name: "45 characters", text: () => `${randomKey().slice(0, 43)}A=`, check: "format" },
	{ name: "a missing =", text: () => `${randomKey().slice(0, 43)}A`, check: "format" },
	{
		name: "base64url",
		// 0xfb 0xef 0xbe and 0xff 0xff 0xff are "++++" and "////" in standard base64.
		text: () => {
			const bytes = randomBytes();
			bytes.set([0xfb, 0xef, 0xbe, 0xff, 0xff, 0xff]);
			return bytes.toBase64({ alphabet: "base64url" });
		},
		check: "format",
	},
	{
		name: "non-canonical trailing bits",
		// The last character before "=" carries 4 bits of the key and 2 bits that must be zero.
		text: () => {
			const key = randomKey();
			return `${key.slice(0, 42)}${BASE64[BASE64.indexOf(key.charAt(42)) | 1]}=`;
		},
		check: "format",
	},
	{
		name: "an embedded space",
		text: () => {
			const key = randomKey();
			return `${key.slice(0, 20)} ${key.slice(20)}`;
		},
		check: "format",
	},
	{
		name: "an embedded newline",
		text: () => {
			const key = randomKey();
			return `${key.slice(0, 20)}\n${key.slice(20)}`;
		},
		check: "format",
	},
	{ name: "a 64-character hex key", text: () => randomBytes().toHex(), check: "format", hex: true },
	{
		name: "an upper-case hex key",
		text: () => randomBytes().toHex().toUpperCase(),
		check: "format",
		hex: true,
	},
	// Also one constant step (zero) and all printable ASCII.
	{ name: "a repeated byte", text: () => keyOf(() => 0x61), check: "entropy" },
	// Exactly 4.0 bits per byte, and all printable ASCII.
	{
		name: "16 distinct values each twice",
		text: () => keyOf((i) => 0x41 + (i >> 1)),
		check: "entropy",
	},
	{
		name: "a doubled 16-byte key",
		text: () => {
			const half = randomBytes(16);
			return keyOf((i) => half[i % 16]);
		},
		check: "entropy",
	},
	// Also all printable ASCII.
	{ name: "an ascending counter", text: () => keyOf((i) => 0x20 + i), check: "constant-step" },
	// Also all printable ASCII.
	{ name: "a descending counter", text: () => keyOf((i) => 0x7e - i), check: "constant-step" },
	{
		name: "a counter wrapping past 0xff",
		text: () => keyOf((i) => 0xf0 + i),
		check: "constant-step",
	},
	{
		name: "a base64-encoded passphrase",
		// 32 distinct letters, A to Z then a to f: one step of 7 between Z and a.
		text: () => keyOf((i) => (i < 26 ? 0x41 + i : 0x61 + i - 26)),
		check: "printable-ascii",
	},
];

describe("decodeKeyText", () => {
	it("decodes canonical 44-character base64 to its 32 bytes", () => {
		const bytes = randomBytes();
		const text = bytes.toBase64();

		expect(text).toHaveLength(44);
		expect(decodeKeyText(text)).toEqual(bytes);
	});

	it("accepts 10,000 random keys", () => {
		for (let run = 0; run < 10_000; run++) {
			const bytes = randomBytes();
			expect(decodeKeyText(bytes.toBase64())).toEqual(bytes);
		}
	});

	for (const { name, text, check, hex } of failing) {
		it(`refuses ${name} with the ${check} check`, () => {
			const error = failure(text());

			expect(error.check).toBe(check);
			expect(error.message.includes("hex")).toBe(hex === true);
		});
	}

	it("never puts 6 characters of the failing text in a row into its message", () => {
		for (const { text } of failing) {
			const value = text();
			const { message } = failure(value);
			for (let start = 0; start + 6 <= value.length; start++) {
				expect(message).not.toContain(value.slice(start, start + 6));
			}
		}
	});
});
