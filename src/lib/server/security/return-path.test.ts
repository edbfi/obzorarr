import { describe, expect, it } from "vitest";
import { returnPath } from "./return-path.ts";

describe("returnPath", () => {
	it("keeps a same-origin path", () => {
		expect(returnPath("/admin/settings/security")).toBe("/admin/settings/security");
		expect(returnPath("/")).toBe("/");
	});

	it("keeps only the path, never the query string or fragment", () => {
		expect(returnPath("/admin/settings?tab=security#password")).toBe("/admin/settings");
		expect(returnPath("/admin#top")).toBe("/admin");
	});

	it("drops anything that isn't one leading slash and a path", () => {
		for (const unsafe of [
			null,
			undefined,
			"",
			"admin",
			"//evil.test/admin",
			"https://evil.test/admin",
			"/\\evil.test",
			"/admin\\..\\x",
			"/admin\nx",
			"/admin\u0000",
			"/admin\u007f",
			"/admin\u0085",
			"?next=/admin",
			"#/admin",
		]) {
			expect(returnPath(unsafe), JSON.stringify(unsafe)).toBeUndefined();
		}
	});

	it("percent-encodes what a Location header can't carry, and resolves dot segments", () => {
		expect(returnPath("/✓")).toBe("/%E2%9C%93");
		expect(returnPath("/é/ü")).toBe("/%C3%A9/%C3%BC");
		expect(returnPath("/admin/%E2%9C%93")).toBe("/admin/%E2%9C%93");
		expect(returnPath("/admin/../settings")).toBe("/settings");
	});

	it("allows 2,048 characters at most, counted before the query is dropped", () => {
		const path = `/${"a".repeat(2047)}`;
		expect(returnPath(path)).toBe(path);
		expect(returnPath(`/${"a".repeat(2048)}`)).toBeUndefined();
		expect(returnPath(`/a?${"q".repeat(2046)}`)).toBeUndefined();
	});
});
