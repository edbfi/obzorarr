import { isRedirect } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";
import { load } from "./+page.server.ts";

describe("/admin", () => {
	it("sends the browser to the Security tab until the overview exists", () => {
		let thrown: unknown;
		try {
			load({} as Parameters<typeof load>[0]);
		} catch (redirect) {
			thrown = redirect;
		}
		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ status: 307, location: "/admin/settings/security" });
	});
});
