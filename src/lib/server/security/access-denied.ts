import * as m from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

/**
 * The page's own policy: it is built here and never passes through SvelteKit's renderer, and it
 * has no scripts, styles or fonts to load (SPEC-setup.md, "Security headers and CSP").
 */
const POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * The 403 for a request the cross-origin check refused, in the viewer's language: a JSON error
 * (`{ message }`) for a caller that wants JSON, otherwise the "Access denied" page. Until
 * `sign-in` builds the error pages, the page is the title and its one line, unstyled but for its
 * colour scheme, since its policy allows no stylesheet.
 */
export function accessDenied(request: Request): Response {
	const title = m.error_access_denied_title();
	const description = m.error_access_denied_description();
	if (wantsJson(request)) {
		return Response.json({ message: description }, { status: 403 });
	}
	const html = `<!doctype html>
<html lang="${escapeHtml(getLocale())}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
</body>
</html>
`;
	return new Response(html, {
		status: 403,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": POLICY,
			"cache-control": "no-store",
		},
	});
}

/** A caller that asks for JSON and not for a page. */
function wantsJson(request: Request): boolean {
	const accept = request.headers.get("accept") ?? "";
	return accept.includes("application/json") && !accept.includes("text/html");
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
