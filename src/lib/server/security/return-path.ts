/** The longest return path kept, in characters: as typed, and again once percent-encoded. */
const MAX_LENGTH = 2048;

/**
 * Where sign-in sends the browser back to (SPEC-sign-in.md, "Signing in"): a same-origin path
 * only, with one leading slash and not two, no backslashes or control characters, and at most
 * 2,048 characters. Only the path is kept, never the query string or fragment, percent-encoded
 * as a `Location` header must be and with its dot segments resolved. The resolved path is checked
 * again: `/.//evil.test` resolves to `//evil.test`, which a browser reads as another host.
 * Anything else gives undefined, and the caller goes to `/admin`.
 */
export function returnPath(next: string | null | undefined): string | undefined {
	if (next === null || next === undefined || next.length > MAX_LENGTH) return undefined;
	if (!next.startsWith("/") || next.startsWith("//")) return undefined;
	if (/[\\\p{Cc}]/u.test(next)) return undefined;
	const path = new URL(next, "http://return.invalid").pathname;
	if (path.startsWith("//") || path.length > MAX_LENGTH) return undefined;
	return path;
}
