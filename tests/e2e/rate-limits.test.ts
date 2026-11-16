import { expect, test } from "./fixture.ts";

test("the 61st request in a minute gets the Too many requests page, with when to try again", async ({
	request,
}) => {
	for (let i = 0; i < 60; i++) {
		expect((await request.get("/")).status()).toBe(200);
	}
	const refused = await request.get("/", { headers: { accept: "text/html" } });
	expect(refused.status()).toBe(429);
	const headers = refused.headers();
	expect(Number(headers["retry-after"])).toBeGreaterThan(0);
	expect(headers["x-ratelimit-limit"]).toBe("60");
	expect(headers["x-ratelimit-remaining"]).toBe("0");
	expect(Number(headers["x-ratelimit-reset"]) * 1000).toBeGreaterThan(Date.now());
	expect(headers["x-frame-options"]).toBe("DENY");
	expect(await refused.text()).toContain("<h1>Too many requests</h1>");
	// /healthz never counts, so a monitor keeps working.
	expect((await request.get("/healthz")).status()).toBe(200);
});

test("a request without the configured address header is refused, while /healthz still answers", async ({
	baseURL,
}) => {
	// A plain fetch, since Playwright's own request contexts send the fixture's header.
	const refused = await fetch(`${baseURL}/`, { headers: { accept: "text/html" } });
	expect(refused.status).toBe(403);
	expect(await refused.text()).toContain(
		"The request didn't come through the proxy Obzorarr expects.",
	);
	const health = await fetch(`${baseURL}/healthz`);
	expect(health.status).toBe(200);
	expect(await health.text()).toBe("ok");
});
