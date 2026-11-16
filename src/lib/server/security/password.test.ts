import { describe, expect, it } from "vitest";
import { checkPassword, checkUsername, hashPassword, verifyPassword } from "./password.ts";

// A long password nothing else here refuses: it holds neither the app's name nor a username.
const GOOD = "violet harbour lanterns";

describe("checkUsername", () => {
	it("trims and normalises to NFC, keeping the case", () => {
		// "Åse" written as "A" plus a combining ring above, then composed.
		expect(checkUsername("  Åse  ")).toEqual({ ok: true, username: "Åse" });
		expect(checkUsername("Owner")).toEqual({ ok: true, username: "Owner" });
	});

	it("accepts 1 to 64 code points after trimming", () => {
		expect(checkUsername("a")).toEqual({ ok: true, username: "a" });
		expect(checkUsername("😀".repeat(64))).toEqual({ ok: true, username: "😀".repeat(64) });
	});

	it.each([
		["", "empty"],
		["   ", "empty"],
		["a".repeat(65), "too-long"],
		["😀".repeat(65), "too-long"],
		["own\u0000er", "control"],
		["own\ner", "control"],
	])("refuses %j: %s", (raw, error) => {
		expect(checkUsername(raw)).toEqual({ ok: false, error });
	});
});

describe("checkPassword", () => {
	it("normalises to NFC and accepts 15 to 128 code points of any characters", () => {
		expect(checkPassword(GOOD, "owner")).toEqual({ ok: true, password: GOOD });
		// The last "x" keeps each from being a repeat, which `pattern` refuses.
		expect(checkPassword(`${"é".repeat(14)}x`, "owner")).toEqual({
			ok: true,
			password: `${"é".repeat(14)}x`,
		});
		expect(checkPassword(`${"😀".repeat(127)}x`, "owner").ok).toBe(true);
		expect(checkPassword("  spaces count too  ", "owner").ok).toBe(true);
	});

	it.each([
		["a".repeat(14), "too-short"],
		// 30 code units, but 15 code points after NFC would be 15 "é"; 14 are too few.
		["é".repeat(14), "too-short"],
		["😀".repeat(129), "too-long"],
	])("refuses %j by its length in code points: %s", (raw, error) => {
		expect(checkPassword(raw, "owner")).toEqual({ ok: false, error });
	});

	it("refuses the app's name inside the password, in any case", () => {
		expect(checkPassword("my-ObzorArr-password", "someone")).toEqual({
			ok: false,
			error: "app-name",
		});
	});

	it("refuses the username inside the password, in any case, from 4 characters", () => {
		expect(checkPassword("correct-Owner-horse-battery", "owner")).toEqual({
			ok: false,
			error: "username",
		});
		// A 3-character username is too short to rule out.
		expect(checkPassword("correct-bob-horse-battery", "bob").ok).toBe(true);
		// Counted as written: "İab" is 3 characters, though lower-casing makes "İ" two.
		expect(checkPassword("terrace-\u0130ab-evenings", "\u0130ab").ok).toBe(true);
	});

	it.each([
		"bbbbbbbbbbbbbbb",
		"999999999999999",
		"abababababababab",
		"abcabcabcabcabc",
		"AbcDabcdABCDabcd",
		// A last repeat may be cut short.
		"wxyzwxyzwxyzwxy",
		"abcdefghijklmnop",
		"ZYXWVUTSRQPONMLK",
		// Digits run on from 9 to 0, and back.
		"567890123456789",
		"987654321098765",
		"aaaaaaaaaaaaaaa",
		// Case is ignored letter by letter: lower-casing the whole word would end it in "ς", and
		// would turn "İ" into two code points.
		"ΣΣΣΣΣΣΣΣΣΣΣΣΣΣΣ",
		"İabcİabcİabcİabc",
	])("refuses %j: the whole password is a repeat or a straight run", (raw) => {
		expect(checkPassword(raw, "owner")).toEqual({ ok: false, error: "pattern" });
	});

	it.each([
		// The rule covers the whole password, never a part of it.
		"aaaaaaaaaaaaaaa-terrace",
		"abcdefghijklmnop!",
		// A unit of 5 is out of scope; the list and length carry the rest.
		"abcdeabcdeabcde",
		// Runs that change direction, or skip, are not straight.
		"abcdefghgfedcbab",
		"acegikmoqsuwyace",
	])("accepts %j: not a whole-password repeat of up to 4 or a straight run", (raw) => {
		expect(checkPassword(raw, "owner").ok).toBe(true);
	});

	it("refuses an entry of the bundled list, after NFC and lower-casing", () => {
		expect(checkPassword("1qaz2wsx3edc4rfv", "owner")).toEqual({ ok: false, error: "common" });
		expect(checkPassword("1QAZ2WSX3EDC4RFV", "owner")).toEqual({ ok: false, error: "common" });
	});
});

describe("hashPassword and verifyPassword", () => {
	it("hash with argon2id, and verify the NFC form, however it is written", async () => {
		const hash = await hashPassword("café terrace evenings");
		expect(hash).toMatch(/^\$argon2id\$/);
		expect(await verifyPassword("café terrace evenings", hash)).toBe(true);
		expect(await verifyPassword("cafe terrace evenings", hash)).toBe(false);
	});
});
