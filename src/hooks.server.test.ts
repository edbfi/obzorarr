import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { handleError } from "./hooks.server.ts";

type Input = Parameters<typeof handleError>[0];

let lines: string[];
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		(rest.find((arg) => typeof arg === "function") as (() => void) | undefined)?.();
		return true;
	});
	consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** `handleError` for a request from a browser that prefers `language`. */
async function handle(kind: Input["kind"], error: unknown, language = "en") {
	const url = "http://app.test/";
	const request = new Request(url, { headers: { "accept-language": language } });
	let result: Awaited<ReturnType<typeof handleError>> | undefined;
	await paraglideMiddleware(request, async () => {
		result = await handleError({
			kind,
			error,
			event: { request, url: new URL(url), route: { id: "/" } },
		} as unknown as Input);
		return new Response();
	});
	return result;
}

it("handles an unexpected error through the logger, not SvelteKit's console output", async () => {
	await handle("unknown", new Error("boom"));
	expect(lines.map((line) => JSON.parse(line))).toEqual([
		expect.objectContaining({ level: "error", source: "request", message: "unexpected error" }),
	]);
	expect(consoleError).not.toHaveBeenCalled();
});

it.each([
	["en", "Something went wrong. Try again."],
	["da", "Noget gik galt. Prøv igen."],
])("answers an unexpected error with the viewer's message (%s)", async (language, message) => {
	expect(await handle("unknown", new Error("boom"), language)).toEqual({ message });
});

it("keeps SvelteKit's own answer for app and framework errors", async () => {
	expect(await handle("app", { message: "Not found" })).toBeUndefined();
	expect(await handle("framework", { status: 404, message: "Not Found" })).toBeUndefined();
});
