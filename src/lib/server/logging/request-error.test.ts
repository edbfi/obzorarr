import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logRequestError, type RequestErrorInput } from "./request-error.ts";

let lines: string[];
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
	consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

/** The `error` the first entry logged, as the redaction rules wrote it. */
function loggedError<T>(): T {
	const [entry] = entries();
	expect(entry).toBeDefined();
	return (entry as { metadata: { error: T } }).metadata.error;
}

/** A request event with only what the hook reads. */
function input(
	kind: RequestErrorInput["kind"],
	error: unknown,
	url = "http://app.test/admin/settings?X-Plex-Token=secret-in-query",
): RequestErrorInput {
	return {
		kind,
		error,
		event: {
			request: new Request(url, { method: "POST" }),
			url: new URL(url),
			route: { id: "/admin/settings" },
		},
	} as unknown as RequestErrorInput;
}

describe("logRequestError", () => {
	it("logs an unexpected error as one redacted JSON entry, with the path but not the query", () => {
		const error = new Error("fetch https://plex.test/library?X-Plex-Token=leaked failed");
		expect(logRequestError(input("unknown", error))).toBeUndefined();
		const [entry, ...rest] = entries();
		expect(rest).toEqual([]);
		expect(entry).toMatchObject({
			level: "error",
			source: "request",
			message: "unexpected error",
			metadata: { method: "POST", path: "/admin/settings", route: "/admin/settings" },
		});
		const text = lines.join("");
		expect(text).not.toContain("leaked");
		expect(text).not.toContain("secret-in-query");
		const logged = loggedError<{ name: string; message: string; stack: string }>();
		expect(logged.name).toBe("Error");
		expect(logged.message).toContain("plex.test/library");
		expect(logged.stack).toContain("request-error.test.ts");
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("keeps the error's cause, redacted too", () => {
		const cause = new Error("GET https://plex.test/status?X-Plex-Token=leaked-cause failed");
		logRequestError(input("unknown", new Error("outer", { cause })));
		const logged = loggedError<{ cause: { message: string } }>();
		expect(logged.cause.message).toContain("plex.test/status");
		expect(lines.join("")).not.toContain("leaked-cause");
	});

	it("logs a thrown value that isn't an Error", () => {
		logRequestError(input("unknown", "plain text"));
		expect(entries()[0]?.metadata).toMatchObject({ error: "plain text" });
	});

	it("logs nothing for an app error or a framework error, such as a 404", () => {
		logRequestError(input("app", { message: "Not found" }));
		logRequestError(input("framework", { status: 404, message: "Not Found" }));
		expect(lines).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("never throws, logging a plain entry when the error itself can't be logged", () => {
		const hostile = new Error("boom");
		Object.defineProperty(hostile, "stack", {
			get() {
				throw new Error("no stack for you");
			},
		});
		expect(() => logRequestError(input("unknown", hostile))).not.toThrow();
		expect(entries()).toEqual([
			expect.objectContaining({
				level: "error",
				source: "request",
				message: "unexpected error, which couldn't be logged in full",
				metadata: {
					method: "POST",
					path: "/admin/settings",
					route: "/admin/settings",
					thrown: "Error",
				},
			}),
		]);
	});

	it("never throws when the request itself can't be read, logging what was thrown", () => {
		const broken = input("unknown", "plain text");
		Object.defineProperty(broken.event, "url", {
			get() {
				throw new Error("no url");
			},
		});
		expect(() => logRequestError(broken)).not.toThrow();
		expect(entries()).toEqual([
			expect.objectContaining({
				message: "unexpected error, which couldn't be logged in full",
				metadata: { thrown: "string" },
			}),
		]);
	});

	it("never throws, even when nothing can be written", () => {
		vi.spyOn(process.stdout, "write").mockImplementation(() => {
			throw new Error("stdout closed");
		});
		expect(() => logRequestError(input("unknown", new Error("boom")))).not.toThrow();
	});
});
