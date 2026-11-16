/** The longest return path kept, in characters, before its query string is dropped. */
const MAX_LENGTH = 2048;

/**
 * Where sign-in sends the browser back to (SPEC-sign-in.md, "Signing in"): a same-origin path
 * only, with one leading slash and not two, no backslashes or control characters, and at most
 * 2,048 characters. Only the path is kept, never the query string or fragment. Anything else gives
 * undefined, and the caller goes to `/admin`.
 */
export function returnPath(next: string | null | undefined): string | undefined {
	if (next === null || next === undefined || next.length > MAX_LENGTH) return undefined;
	if (!next.startsWith("/") || next.startsWith("//")) return undefined;
	if (/[\\\p{Cc}]/u.test(next)) return undefined;
	return next.split(/[?#]/, 1)[0];
}
