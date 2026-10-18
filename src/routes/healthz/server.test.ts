import { describe, expect, it } from "vitest";
import { GET } from "./+server.ts";

describe("GET /healthz", () => {
	it("answers ok as plain text that is never cached", async () => {
		// The handler reads nothing from the request event.
		const response = await GET({} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).toBe("ok");
	});
});
