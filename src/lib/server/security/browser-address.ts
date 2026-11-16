import { parseOrigin } from "./cross-origin.ts";

/**
 * The address the browser is using (SPEC-sign-in.md, "The browser's address and cookies"):
 * `ORIGIN` when it is set, and otherwise the validated `Origin` of the POST, which the
 * cross-origin check has let through. Undefined when the browser stripped `Origin` (or sent one
 * that isn't a bare origin) and `ORIGIN` is unset: a POST that sets or deletes a cookie is then
 * refused with a 403 that says so. It never comes from the request's own URL, which adapter-bun
 * builds from what it was told rather than what the browser is on.
 */
export function browserAddress(request: Request, origin: string | undefined): string | undefined {
	if (origin !== undefined) return origin;
	const sent = request.headers.get("origin");
	return sent === null ? undefined : (parseOrigin(sent)?.origin ?? undefined);
}
