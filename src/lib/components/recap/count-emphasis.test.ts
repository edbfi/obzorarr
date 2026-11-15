import { describe, expect, it } from "vitest";
import { splitAroundCount } from "./count-emphasis.ts";

// A large figure keeps its whole sentence: the formatted message is split around its formatted
// count, so the count can be styled large (SPEC-recap-spike.md, "The three slides").

describe("splitAroundCount", () => {
	it("splits an English message around its count", () => {
		expect(splitAroundCount("842 hours of everything you played in 2025", "842")).toEqual({
			before: "",
			count: "842",
			after: " hours of everything you played in 2025",
		});
	});

	it("splits a Danish message around its count", () => {
		expect(splitAroundCount("842 timer af alt, hvad du har afspillet i 2025", "842")).toEqual({
			before: "",
			count: "842",
			after: " timer af alt, hvad du har afspillet i 2025",
		});
	});

	it("finds a count with thousands in either language", () => {
		expect(splitAroundCount("1,234 hours of everything you played in 2025", "1,234")).toEqual({
			before: "",
			count: "1,234",
			after: " hours of everything you played in 2025",
		});
		expect(splitAroundCount("1.234 timer af alt, hvad du har afspillet i 2025", "1.234")).toEqual({
			before: "",
			count: "1.234",
			after: " timer af alt, hvad du har afspillet i 2025",
		});
	});

	it("keeps the text before a count that isn't first", () => {
		expect(splitAroundCount("Longest streak: 21 days", "21")).toEqual({
			before: "Longest streak: ",
			count: "21",
			after: " days",
		});
	});

	it("never finds the count inside the year", () => {
		expect(splitAroundCount("In 2025 you played 20 hours", "20")).toEqual({
			before: "In 2025 you played ",
			count: "20",
			after: " hours",
		});
		expect(splitAroundCount("In 2025 you played 25 hours", "25")).toEqual({
			before: "In 2025 you played ",
			count: "25",
			after: " hours",
		});
		expect(splitAroundCount("Everything you played in 2025", "20")).toBeUndefined();
	});

	it("never finds the count inside a larger grouped number", () => {
		expect(splitAroundCount("1,234 hours", "234")).toBeUndefined();
		expect(splitAroundCount("1.234 timer", "234")).toBeUndefined();
		expect(splitAroundCount("1,234 hours", "1")).toBeUndefined();
		expect(splitAroundCount("1.234 timer", "1")).toBeUndefined();
	});

	it("finds a count that ends a sentence", () => {
		expect(splitAroundCount("Movies: 5.", "5")).toEqual({
			before: "Movies: ",
			count: "5",
			after: ".",
		});
	});

	it("leaves a message without its count whole", () => {
		expect(splitAroundCount("Movie Buff", "842")).toBeUndefined();
		expect(splitAroundCount("", "842")).toBeUndefined();
	});
});
