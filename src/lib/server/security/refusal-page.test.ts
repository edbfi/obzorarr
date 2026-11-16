import { describe, expect, it } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import type { RateLimitDecision } from "./rate-limit.ts";
import { accessDenied, sessionEnded, tooManyRequests } from "./refusal-page.ts";

const POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * The refusal `make` builds for a browser that prefers `language` and accepts `accept`, with any
 * other `headers`.
 */
async function refusal(
	make: (request: Request) => Response,
	language: string,
	accept: string,
	headers: Record<string, string> = {},
): Promise<Response> {
	const request = new Request("http://obzorarr.example/", {
		method: "POST",
		headers: { "accept-language": language, accept, ...headers },
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
const decision: RateLimitDecision = {
	allowed: false,
	limit: 60,
	remaining: 0,
	resetAt: 1_700_000_000_000,
	retryAfterSeconds: 42,
};
const tooMany = (request: Request) => tooManyRequests(request, decision);

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
			expect(response.headers.get("cache-control")).toBe("no-store");
			expect(await response.json()).toEqual({ message: messages[language] });
		},
	);

	it("is a page for a browser that accepts anything", async () => {
		const response = await refusal(make, "en", "*/*");
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
	});
});

describe("tooManyRequests", () => {
	it("says when to try again and which limit it ran into, on the page and in JSON", async () => {
		for (const accept of [PAGE, "application/json"]) {
			const response = await refusal(tooMany, "en", accept);
			expect(response.headers.get("retry-after")).toBe("42");
			expect(response.headers.get("x-ratelimit-limit")).toBe("60");
			expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
			expect(response.headers.get("x-ratelimit-reset")).toBe("1700000000");
		}
	});
});

describe("accessDenied for a request that bypassed the proxy", () => {
	const bypassed = (request: Request) => accessDenied(request, "not-through-proxy");

	it.each([
		["en", "The request didn't come through the proxy Obzorarr expects."],
		["da", "Anmodningen kom ikke gennem den proxy, Obzorarr forventer."],
	])("says so on the page and in JSON (%s)", async (language, message) => {
		const page = await (await refusal(bypassed, language, PAGE)).text();
		expect(page).toContain(message);
		const json = await refusal(bypassed, language, "application/json");
		expect(json.status).toBe(403);
		expect(await json.json()).toEqual({ message });
	});
});

describe("sessionEnded", () => {
	const ended = (request: Request) => sessionEnded(request, "/admin/settings/security");

	it.each([
		["en", "Access denied", "Your session ended. Sign in again.", "Sign in", "Home"],
		["da", "Adgang nægtet", "Din session er udløbet. Log ind igen.", "Log ind", "Forside"],
	])(
		"is the Access denied page saying so (%s), with a link to sign in that returns to the page",
		async (language, title, message, signIn, home) => {
			const response = await refusal(ended, language, PAGE);
			expect(response.status).toBe(403);
			expect(response.headers.get("cache-control")).toBe("no-store");
			const html = await response.text();
			expect(html).toContain(`<title>${title}</title>`);
			expect(html).toContain(message);
			expect(html).toMatch(
				new RegExp(
					`<a [^>]*href="/admin/sign-in\\?next=%2Fadmin%2Fsettings%2Fsecurity"[^>]*>${signIn}</a>`,
				),
			);
			expect(html).toMatch(new RegExp(`<a [^>]*href="/"[^>]*>${home}</a>`));
		},
	);

	it.each([
		["en", "Your session ended. Sign in again."],
		["da", "Din session er udløbet. Log ind igen."],
	])("is a JSON error for a caller that wants JSON (%s)", async (language, message) => {
		const response = await refusal(ended, language, "application/json");
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ message });
	});
});

describe("a form enhanced with JavaScript", () => {
	it("gets SvelteKit's action error, with its status, so SvelteKit shows the right error page", async () => {
		for (const [make, message, status] of [
			[
				(request: Request) => sessionEnded(request, "/admin"),
				"Your session ended. Sign in again.",
				403,
			],
			[accessDenied, "The request was refused because it didn't come from this site.", 403],
			[tooMany, "Too many requests came from your address. Wait a moment, then try again.", 429],
		] as const) {
			const response = await refusal(make, "en", "application/json", {
				"x-sveltekit-action": "true",
			});
			expect(response.headers.get("cache-control")).toBe("no-store");
			// SvelteKit's client drops the response's status from an action error, so the body has it.
			expect(await response.json()).toEqual({ type: "error", error: { message, status } });
		}
	});
});
