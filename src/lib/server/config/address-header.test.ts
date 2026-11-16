import { describe, expect, it } from "vitest";
import { readAddressHeader } from "./address-header.ts";

describe("readAddressHeader", () => {
	it("is the header adapter-bun reads the client's address from, lower-cased", () => {
		expect(readAddressHeader({ ADDRESS_HEADER: "X-Forwarded-For" })).toBe("x-forwarded-for");
		expect(readAddressHeader({ ADDRESS_HEADER: "cf-connecting-ip" })).toBe("cf-connecting-ip");
	});

	it("is unset when the variable is unset or empty, as adapter-bun reads it", () => {
		expect(readAddressHeader({})).toBeUndefined();
		expect(readAddressHeader({ ADDRESS_HEADER: "" })).toBeUndefined();
	});
});
