import { describe, expect, it, vi } from "vitest";
import {
	drawToken,
	formatToken,
	issueToken,
	isTokenValid,
	TOKEN_LIFETIME_MS,
	tokenMatches,
} from "./bootstrap-token.ts";

describe("drawToken", () => {
	it("draws 12 lowercase letters and digits", () => {
		for (let i = 0; i < 200; i++) expect(drawToken()).toMatch(/^[a-z0-9]{12}$/);
	});

	// Coverage only: a naive `byte % 36` would still pass this band, so the mocked byte stream
	// below is what guards against bias.
	it("draws every character of the alphabet, none far more or less often than the rest", () => {
		const counts = new Map<string, number>();
		const draws = 3000;
		for (let i = 0; i < draws; i++) {
			for (const char of drawToken()) counts.set(char, (counts.get(char) ?? 0) + 1);
		}
		expect(counts.size).toBe(36);
		const expected = (draws * 12) / 36;
		for (const count of counts.values()) {
			expect(count).toBeGreaterThan(expected * 0.8);
			expect(count).toBeLessThan(expected * 1.2);
		}
	});

	it("discards random bytes that would bias the draw", () => {
		// 252 is the largest multiple of 36 under 256, so bytes from 252 up are drawn again.
		const bytes = [255, 252, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
		const spy = vi
			.spyOn(crypto, "getRandomValues")
			.mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
				const view = array as unknown as Uint8Array;
				for (let i = 0; i < view.length; i++) view[i] = bytes.shift() ?? 0;
				return array;
			});
		try {
			expect(drawToken()).toBe("abcdefghijkl");
		} finally {
			spy.mockRestore();
		}
	});
});

describe("formatToken", () => {
	it("shows the token as xxxx-xxxx-xxxx", () => {
		expect(formatToken("abcd1234wxyz")).toBe("abcd-1234-wxyz");
	});
});

describe("tokenMatches", () => {
	const token = "abcd1234wxyz";

	it.each([
		"abcd-1234-wxyz",
		"abcd1234wxyz",
		"ABCD-1234-WXYZ",
		"  abcd-1234-wxyz \n",
		"AbCd1234-wxyz",
	])("accepts %j, with or without dashes, in any case, trimmed", (entry) => {
		expect(tokenMatches(token, entry)).toBe(true);
	});

	it.each([
		"abcd-1234-wxy",
		"abcd-1234-wxyza",
		"abcd-1234-wxyy",
		"abcd 1234 wxyz",
		"",
		"abcd-1234-wxyé",
	])("refuses %j", (entry) => {
		expect(tokenMatches(token, entry)).toBe(false);
	});
});

describe("issueToken and isTokenValid", () => {
	it("is valid for 15 minutes from when it was issued", () => {
		const issued = issueToken(1_000_000);
		expect(TOKEN_LIFETIME_MS).toBe(15 * 60 * 1000);
		expect(issued.value).toMatch(/^[a-z0-9]{12}$/);
		expect(isTokenValid(issued, 1_000_000 + TOKEN_LIFETIME_MS - 1)).toBe(true);
		expect(isTokenValid(issued, 1_000_000 + TOKEN_LIFETIME_MS)).toBe(false);
	});
});
