import { describe, expect, it } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { accessDenied } from "./access-denied.ts";

const POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The refusal for a request from a browser that prefers `language` and accepts `accept`. */
async function refusal(language: string, accept: string): Promise<Response> {
	const request = new Request("http://obzorarr.example/", {
		method: "POST",
		headers: { "accept-language": language, accept },
	});
	let response: Response | undefined;
	await paraglideMiddleware(request, ({ request: translated }) => {
		response = accessDenied(translated);
		return response;
	});
	if (response === undefined) throw new Error("no response");
	return response;
}

describe("accessDenied", () => {
	it.each([
		["en", "Access denied"],
		["da", "Adgang nægtet"],
	])(
		"is a 403 page in the viewer's language (%s), with its own fixed policy",
		async (language, title) => {
			const response = await refusal(language, "text/html,application/xhtml+xml");
			expect(response.status).toBe(403);
			expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
			expect(response.headers.get("content-security-policy")).toBe(POLICY);
			expect(response.headers.get("cache-control")).toBe("no-store");
			const html = await response.text();
			expect(html).toContain(`<html lang="${language}">`);
			expect(html).toContain(`<title>${title}</title>`);
			expect(html).toContain(`<h1>${title}</h1>`);
			expect(html).not.toMatch(/<script|<link|<style/);
		},
	);

	it.each([
		["en", "The request was refused because it didn't come from this site."],
		["da", "Anmodningen blev afvist, fordi den ikke kom fra dette websted."],
	])("is a JSON error for a caller that wants JSON (%s)", async (language, message) => {
		const response = await refusal(language, "application/json");
		expect(response.status).toBe(403);
		expect(response.headers.get("content-type")).toMatch(/^application\/json/);
		expect(await response.json()).toEqual({ message });
	});

	it("is a page for a browser that accepts anything", async () => {
		const response = await refusal("en", "*/*");
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
	});
});
