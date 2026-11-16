import { describe, expect, it } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { accessDenied, tooManyRequests } from "./refusal-page.ts";

const POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The refusal `make` builds for a browser that prefers `language` and accepts `accept`. */
async function refusal(
	make: (request: Request) => Response,
	language: string,
	accept: string,
): Promise<Response> {
	const request = new Request("http://obzorarr.example/", {
		method: "POST",
		headers: { "accept-language": language, accept },
	});
	let response: Response | undefined;
	await paraglideMiddleware(request, ({ request: translated }) => {
		response = make(translated);
		return response;
	});
	if (response === undefined) throw new Error("no response");
	return response;
}

const PAGE = "text/html,application/xhtml+xml";
const tooMany = (request: Request) => tooManyRequests(request, 42);

describe.each([
	{
		name: "accessDenied",
		make: accessDenied,
		status: 403,
		titles: { en: "Access denied", da: "Adgang nægtet" },
		messages: {
			en: "The request was refused because it didn't come from this site.",
			da: "Anmodningen blev afvist, fordi den ikke kom fra dette websted.",
		},
	},
	{
		name: "tooManyRequests",
		make: tooMany,
		status: 429,
		titles: { en: "Too many requests", da: "For mange anmodninger" },
		messages: {
			en: "Too many requests came from your address. Wait a moment, then try again.",
			da: "Der kom for mange anmodninger fra din adresse. Vent lidt, og prøv så igen.",
		},
	},
] as const)("$name", ({ make, status, titles, messages }) => {
	it.each(["en", "da"] as const)(
		"is a page in the viewer's language (%s), with its own fixed policy",
		async (language) => {
			const response = await refusal(make, language, PAGE);
			expect(response.status).toBe(status);
			expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
			expect(response.headers.get("content-security-policy")).toBe(POLICY);
			expect(response.headers.get("cache-control")).toBe("no-store");
			const html = await response.text();
			expect(html).toContain(`<html lang="${language}" class="dark">`);
			expect(html).toContain(`<title>${titles[language]}</title>`);
			expect(html).toMatch(new RegExp(`<h1[^>]*>${titles[language]}</h1>`));
			expect(html).toContain(messages[language]);
		},
	);

	it("is styled from Panda's token declarations inline, with the logo inline and a link home", async () => {
		const html = await (await refusal(make, "en", PAGE)).text();
		// The policy loads nothing, so every style, the tokens included, sits in the page.
		expect(html).toMatch(/<style>[\s\S]*--colors-background:[\s\S]*<\/style>/);
		expect(html).toContain("var(--colors-background)");
		expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
		expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Home<\/a>/);
		// No script, so there is no Go back, and nothing is fetched.
		expect(html).not.toMatch(/<script|<link|<img|Go back/);
	});

	it.each(["en", "da"] as const)(
		"is a JSON error for a caller that wants JSON (%s)",
		async (language) => {
			const response = await refusal(make, language, "application/json");
			expect(response.status).toBe(status);
			expect(response.headers.get("content-type")).toMatch(/^application\/json/);
			expect(await response.json()).toEqual({ message: messages[language] });
		},
	);

	it("is a page for a browser that accepts anything", async () => {
		const response = await refusal(make, "en", "*/*");
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
	});
});

describe("tooManyRequests", () => {
	it("says when to try again, on the page and in JSON", async () => {
		for (const accept of [PAGE, "application/json"]) {
			const response = await refusal(tooMany, "en", accept);
			expect(response.headers.get("retry-after")).toBe("42");
		}
	});
});
