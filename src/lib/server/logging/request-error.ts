import type { HandleServerError } from "@sveltejs/kit/hooks";
import { createLogger } from "./logger.ts";

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
 * as SvelteKit requires.
 */
export function logRequestError({ kind, error, event }: RequestErrorInput): undefined {
	if (kind !== "unknown") return undefined;
	const request = { method: event.request.method, path: event.url.pathname };
	try {
		log.error("unexpected error", { ...request, route: event.route.id, error });
	} catch {
		try {
			log.error("unexpected error, which couldn't be logged in full", request);
		} catch {
			// Nothing can be written; SvelteKit still answers with its error page.
		}
	}
	return undefined;
}
