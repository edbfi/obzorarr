import { describe, expect, it } from "vitest";
import { ConfigError } from "./config-error.ts";
import { readOrigin } from "./origin.ts";

function failure(value: string): ConfigError {
	try {
		readOrigin({ ORIGIN: value });
	} catch (error) {
		if (error instanceof ConfigError) return error;
		throw error;
	}
	throw new Error("the origin was accepted");
}

describe("readOrigin", () => {
	it("is undefined when unset", () => {
		expect(readOrigin({})).toBeUndefined();
	});

	it("returns a bare http or https origin, with or without a trailing slash, as parsed", () => {
		expect(readOrigin({ ORIGIN: "https://obzorarr.example" })).toBe("https://obzorarr.example");
		expect(readOrigin({ ORIGIN: "https://obzorarr.example/" })).toBe("https://obzorarr.example");
		expect(readOrigin({ ORIGIN: "http://192.168.1.20:3000" })).toBe("http://192.168.1.20:3000");
		expect(readOrigin({ ORIGIN: "HTTPS://Obzorarr.Example:443" })).toBe("https://obzorarr.example");
	});

	// adapter-bun refuses an empty ORIGIN before `init`, so ORIGIN is exempt from the rule that
	// an empty variable counts as unset (SPEC-setup.md, "ORIGIN").
	it("refuses an empty value", () => {
		expect(failure("").message).toBe(
			"ORIGIN is empty; leave it out or set it to an http or https origin",
		);
	});

	it.each([
		["https://u:p@obzorarr.example", "ORIGIN must not hold credentials"],
		["https://u@obzorarr.example", "ORIGIN must not hold credentials"],
		["https://@obzorarr.example", "ORIGIN must not hold credentials"],
		["https://obzorarr.example/app", "ORIGIN must not have a path"],
		["https://obzorarr.example//", "ORIGIN must not have a path"],
		// The parser removes dot segments, so the raw path is checked before it.
		["https://obzorarr.example/app/..", "ORIGIN must not have a path"],
		["https://obzorarr.example/%2e", "ORIGIN must not have a path"],
		["https://obzorarr.example/.", "ORIGIN must not have a path"],
		["https://obzorarr.example/?x=1", "ORIGIN must not have a query"],
		["https://obzorarr.example?", "ORIGIN must not have a query"],
		["https://obzorarr.example/#top", "ORIGIN must not have a fragment"],
		["ftp://obzorarr.example", "ORIGIN must use http or https"],
		[
			"obzorarr.example",
			"ORIGIN is not a URL; set it to an origin such as https://obzorarr.example",
		],
	])("refuses %s, naming the problem but not the value", (value, message) => {
		const error = failure(value);
		expect(error.variable).toBe("ORIGIN");
		expect(error.message).toBe(message);
	});
});
