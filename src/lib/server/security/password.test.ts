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
		expect(checkPassword("é".repeat(15), "owner")).toEqual({
			ok: true,
			password: "é".repeat(15),
		});
		expect(checkPassword("😀".repeat(128), "owner").ok).toBe(true);
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
