/** The headers every response that passes through `handle` gets (SPEC-setup.md). */
const ALWAYS = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	// Never `no-referrer`, which makes browsers send `Origin: null` on the app's own form posts.
	"Referrer-Policy": "same-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

/** Never `includeSubDomains`: other apps may share the domain. */
const HSTS = "max-age=31536000";

/**
 * The security headers for `request`. Strict transport is sent only over HTTPS, known when
 * `origin` (from `ORIGIN`) is https, or, without it, when the browser sent `Sec-Fetch-Site` to a
 * host that isn't localhost or a loopback address: browsers send it only to HTTPS and those hosts.
 */
export function securityHeaders(
	request: Request,
	origin: string | undefined,
): Record<string, string> {
	const https =
		origin === undefined
			? request.headers.has("sec-fetch-site") && !isLocalHost(request.headers.get("host") ?? "")
			: origin.startsWith("https:");
	return https ? { ...ALWAYS, "Strict-Transport-Security": HSTS } : { ...ALWAYS };
}

/** `localhost`, `*.localhost`, `127.0.0.0/8` or `[::1]`, with or without a port. */
function isLocalHost(host: string): boolean {
	const name = (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0])
		?.toLowerCase()
		.replace(/\.$/, "");
	if (name === undefined || name === "") return false;
	return (
		name === "localhost" ||
		name.endsWith(".localhost") ||
		name === "[::1]" ||
		/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
	);
}

/**
 * `response` with `headers` set. A response whose headers can't change, such as one from
 * `Response.redirect` or `fetch`, is copied first.
 */
export function withSecurityHeaders(response: Response, headers: Record<string, string>): Response {
	try {
		for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value);
		return copy;
	}
}
