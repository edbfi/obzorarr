import type { HandleServerError } from "@sveltejs/kit/hooks";
import { createLogger, type LogMetadata } from "./logger.ts";

/** What SvelteKit's `handleError` hook receives. */
export type RequestErrorInput = Parameters<HandleServerError>[0];

const log = createLogger("request");

/**
 * The `handleError` hook's logging (SPEC-setup.md, "Logging"). SvelteKit's default writes an
 * unexpected error's stack to the console, unredacted and not as JSON; this logs it as one
 * redacted entry instead. It keeps the default's choices otherwise: only `unknown` errors (thrown
 * by the app's code) are logged, never app or framework errors such as a 404, and it returns
 * nothing, so SvelteKit's status and message stand. Remote functions are off, so no validation
 * error reaches it. The path is logged without its query, which may hold a token. It never throws,
 * as SvelteKit requires: when the entry can't be written in full, a smaller one says what was
 * thrown.
 */
export function logRequestError({ kind, error, event }: RequestErrorInput): undefined {
	if (kind !== "unknown") return undefined;
	let request: LogMetadata = {};
	try {
		request = { method: event.request.method, path: event.url.pathname, route: event.route.id };
		log.error("unexpected error", { ...request, error });
	} catch {
		try {
			log.error("unexpected error, which couldn't be logged in full", {
				...request,
				thrown: thrownKind(error),
			});
		} catch {
			// Nothing can be written; SvelteKit still answers with its error page.
		}
	}
	return undefined;
}

/** An error's name, or the type of what was thrown, read so that nothing it does can throw. */
function thrownKind(error: unknown): string {
	try {
		return error instanceof Error ? String(error.name) : typeof error;
	} catch {
		return "unknown";
	}
}
