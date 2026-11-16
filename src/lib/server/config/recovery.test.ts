import { describe, expect, it } from "vitest";
import { ConfigError } from "./config-error.ts";
import { readRecovery } from "./recovery.ts";

describe("readRecovery", () => {
	it("is off when unset or empty", () => {
		expect(readRecovery({})).toBe(false);
		expect(readRecovery({ OBZORARR_RECOVERY: "" })).toBe(false);
	});

	it("reads true and false", () => {
		expect(readRecovery({ OBZORARR_RECOVERY: "true" })).toBe(true);
		expect(readRecovery({ OBZORARR_RECOVERY: "false" })).toBe(false);
	});

	it.each(["yes", "1", "TRUE", " true", "on"])("refuses %j without echoing it", (value) => {
		let error: unknown;
		try {
			readRecovery({ OBZORARR_RECOVERY: value });
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("OBZORARR_RECOVERY");
		expect((error as ConfigError).message).toBe("OBZORARR_RECOVERY must be true or false");
	});
});
