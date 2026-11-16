import { afterEach, expect, it, vi } from "vitest";
import { handleError } from "./hooks.server.ts";

afterEach(() => {
	vi.restoreAllMocks();
});

it("handles an unexpected error through the logger, not SvelteKit's console output", async () => {
	const lines: string[] = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		(rest.find((arg) => typeof arg === "function") as (() => void) | undefined)?.();
		return true;
	});
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
	const url = "http://app.test/";
	await handleError({
		kind: "unknown",
		error: new Error("boom"),
		status: 500,
		message: "Internal Error",
		event: { request: new Request(url), url: new URL(url), route: { id: "/" } },
	} as unknown as Parameters<typeof handleError>[0]);
	expect(lines.map((line) => JSON.parse(line))).toEqual([
		expect.objectContaining({ level: "error", source: "request", message: "unexpected error" }),
	]);
	expect(consoleError).not.toHaveBeenCalled();
});
