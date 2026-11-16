import { error, isHttpError } from "@sveltejs/kit";
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

/** The body SvelteKit gives `error(status)` raised without a message. */
function raisedWithoutMessage(status: number): unknown {
	try {
		error(status);
	} catch (raised) {
		if (isHttpError(raised)) return raised.body;
	}
	throw new Error("error() didn't throw an HttpError");
}

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

it("keeps the message of an error the app raised with one", async () => {
	const ownMessage = { status: 403, message: "Your session ended. Sign in again." };
	expect(await handle("app", ownMessage)).toBeUndefined();
});

it.each([
	["en", "This page doesn't exist, or it has moved."],
	["da", "Siden findes ikke, eller den er flyttet."],
])(
	"gives an error raised without a message, and the framework's own, the status's description (%s)",
	async (language, message) => {
		// What SvelteKit itself gives `error(404)` raised without a message.
		expect(await handle("app", raisedWithoutMessage(404), language)).toEqual({
			message,
		});
		expect(await handle("framework", { status: 404, message: "Not Found" }, language)).toEqual({
			message,
		});
	},
);

it("describes each status the error page titles, and anything else as something gone wrong", async () => {
	const described = async (status: number) =>
		(await handle("framework", { status, message: "x" })) as { message: string };
	expect((await described(403)).message).toBe("You don't have access to this page.");
	expect((await described(429)).message).toBe(
		"Too many requests came from your address. Wait a minute, then try again.",
	);
	expect((await described(405)).message).toBe("Something went wrong. Try again.");
});
