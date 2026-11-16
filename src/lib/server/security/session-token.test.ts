import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashSessionToken, newSessionToken } from "./session-token.ts";

describe("newSessionToken", () => {
	it("is 32 random bytes in base64url, with its SHA-256 hash in hex", () => {
		const { token, hash } = newSessionToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(Buffer.from(token, "base64url")).toHaveLength(32);
		expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
	});

	it("draws a new token every time", () => {
		const tokens = new Set(Array.from({ length: 50 }, () => newSessionToken().token));
		expect(tokens.size).toBe(50);
	});
});

describe("hashSessionToken", () => {
	it("hashes what the cookie holds the way the stored hash was made", () => {
		const { token, hash } = newSessionToken();
		expect(hashSessionToken(token)).toBe(hash);
		expect(hashSessionToken(`${token}x`)).not.toBe(hash);
	});
});
