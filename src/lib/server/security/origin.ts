/**
 * ORIGIN, the one public-origin setting: the address people open in the browser.
 *
 * Parsed the same way everywhere: scripts/serve.ts (the front, which keeps its own copy because
 * it runs unbundled next to build/), src/env.ts (so build/index.js started directly and vite
 * preview refuse the same values), and the CSRF origin that csrfHandle compares. Trim; empty
 * means unset; the value must parse as an http(s) URL with no credentials, no path other than
 * `/` and no `?` or `#`. The canonical value is `url.origin`: lowercase scheme and host, no
 * default port, no trailing `/`. tests/unit/security/origin.test.ts keeps the front's copy equal.
 *
 * This module imports nothing, so src/env.ts can load it while SvelteKit reads the declarations.
 */

/** The startup error for an ORIGIN that is not a bare origin. It never contains the value. */
export const ORIGIN_FORMAT_ERROR =
	'ORIGIN must be a bare http(s) origin such as http://192.168.1.10:3000 (no path, query, fragment or credentials).';

/**
 * Returns the canonical origin, or `undefined` when the value is unset or blank. Throws a fresh
 * Error with {@link ORIGIN_FORMAT_ERROR} otherwise: never the URL parser's own error, which keeps
 * the raw input (and any credentials in it).
 */
export function canonicalOrigin(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	let url: URL | undefined;
	try {
		url = new URL(trimmed);
	} catch {
		// reported below without the value
	}
	if (
		!url ||
		(url.protocol !== 'http:' && url.protocol !== 'https:') ||
		url.username !== '' ||
		url.password !== '' ||
		url.pathname !== '/' ||
		// An empty query or fragment leaves no trace on the parsed URL.
		/[?#]/.test(trimmed)
	) {
		throw new Error(ORIGIN_FORMAT_ERROR);
	}
	return url.origin;
}
