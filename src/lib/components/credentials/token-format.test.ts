import { describe, expect, it } from "vitest";
import { deleteAcrossDash, formatTokenInput } from "./token-format.ts";

describe("formatTokenInput", () => {
	it.each([
		["abcd", 4, "abcd", 4],
		["abcde", 5, "abcd-e", 6],
		["abcdefgh", 8, "abcd-efgh", 9],
		["abcdefghi", 9, "abcd-efgh-i", 11],
		["abcdefghijkl", 12, "abcd-efgh-ijkl", 14],
	])("inserts dashes as %j is typed", (value, caret, formatted, caretAfter) => {
		expect(formatTokenInput(value, caret)).toEqual({ value: formatted, caret: caretAfter });
	});

	it("keeps a pasted token, with or without dashes, in any case and with spaces", () => {
		expect(formatTokenInput("ABCD-EFGH-IJKL", 14).value).toBe("abcd-efgh-ijkl");
		expect(formatTokenInput("  abcd efgh ijkl ", 17).value).toBe("abcd-efgh-ijkl");
	});

	it("stops at 12 characters", () => {
		expect(formatTokenInput("abcd-efgh-ijklmn", 16)).toEqual({
			value: "abcd-efgh-ijkl",
			caret: 14,
		});
	});

	it("keeps the caret after the same character when editing in the middle", () => {
		// Typing "x" after "ab" in "abcd-efgh": the caret stays after the "x".
		expect(formatTokenInput("abxcd-efgh", 3)).toEqual({ value: "abxc-defg-h", caret: 3 });
		// The caret right after a group's fourth character stays before the dash.
		expect(formatTokenInput("abcd-efgh", 4)).toEqual({ value: "abcd-efgh", caret: 4 });
	});
});

describe("deleteAcrossDash", () => {
	it("deletes the character before a dash on Backspace", () => {
		expect(deleteAcrossDash("abcd-efgh", 5, "backward")).toEqual({ value: "abce-fgh", caret: 3 });
	});

	it("deletes the character after a dash on Delete", () => {
		expect(deleteAcrossDash("abcd-efgh", 4, "forward")).toEqual({ value: "abcd-fgh", caret: 4 });
	});

	it("does nothing when the caret isn't next to a dash", () => {
		expect(deleteAcrossDash("abcd-efgh", 3, "backward")).toBeUndefined();
		expect(deleteAcrossDash("abcd-efgh", 6, "forward")).toBeUndefined();
	});
});
