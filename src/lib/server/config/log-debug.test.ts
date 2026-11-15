import { describe, expect, it } from "vitest";
import { ConfigError } from "./config-error.ts";
import { readLogDebug } from "./log-debug.ts";

describe("readLogDebug", () => {
	it("is off when unset or empty", () => {
		expect(readLogDebug({})).toBe(false);
		expect(readLogDebug({ OBZORARR_LOG_DEBUG: "" })).toBe(false);
	});

	it("reads true and false", () => {
		expect(readLogDebug({ OBZORARR_LOG_DEBUG: "true" })).toBe(true);
		expect(readLogDebug({ OBZORARR_LOG_DEBUG: "false" })).toBe(false);
	});

	it.each(["yes", "1", "TRUE", " true", "on"])("refuses %j without echoing it", (value) => {
		let error: unknown;
		try {
			readLogDebug({ OBZORARR_LOG_DEBUG: value });
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("OBZORARR_LOG_DEBUG");
		expect((error as ConfigError).message).toBe("OBZORARR_LOG_DEBUG must be true or false");
	});
});
