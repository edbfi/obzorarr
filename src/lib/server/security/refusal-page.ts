import logo from "#lib/assets/obzorarr-icon.svg?raw";
import * as m from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import tokenDeclarations from "#styled-system/styles/tokens.css?raw";
import { token } from "#styled-system/tokens";
import { type RateLimitDecision, rateLimitHeaders } from "./rate-limit.ts";

/**
 * The pages' own policy: they are built here and never pass through SvelteKit's renderer, so
 * they get no nonce, load nothing and run no script (SPEC-setup.md, "Security headers and CSP").
 */
const POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Why a request was refused with "Access denied". */
export type AccessDeniedReason =
	/** The cross-origin check refused it. */
	| "cross-site"
	/** `ADDRESS_HEADER` is set, and the request didn't come through the proxy that sets it. */
	| "not-through-proxy";

const accessDeniedDescriptions: Record<AccessDeniedReason, () => string> = {
	"cross-site": m.error_access_denied_description,
	"not-through-proxy": m.error_access_denied_proxy_description,
};

/**
 * The 403 for a refused request, in the viewer's language: the "Access denied" page saying why,
 * or one of `refusal`'s JSON forms.
 */
export function accessDenied(
	request: Request,
	reason: AccessDeniedReason = "cross-site",
): Response {
	return refusal(request, 403, m.error_access_denied_title(), accessDeniedDescriptions[reason]());
}

/**
 * The 429 for a request over its limit, with when to try again and the limit it ran into in its
 * headers: the "Too many requests" page, or a JSON error for a caller that wants JSON.
 */
export function tooManyRequests(request: Request, decision: RateLimitDecision): Response {
	return refusal(
		request,
		429,
		m.error_too_many_requests_title(),
		m.error_too_many_requests_description(),
		{ headers: rateLimitHeaders(decision) },
	);
}

/**
 * The 403 for a request to an owner-only page without a session that a redirect can't answer, a
 * form action or any other method (SPEC-sign-in.md, "Owner-only pages"): "Your session ended.
 * Sign in again." on the "Access denied" page, with a link to sign in that returns to `returnTo`,
 * or as a JSON error. What was sent is never replayed.
 */
export function sessionEnded(request: Request, returnTo: string): Response {
	return refusal(request, 403, m.error_access_denied_title(), m.error_session_ended_description(), {
		signIn: `/admin/sign-in?next=${encodeURIComponent(returnTo)}`,
	});
}

/**
 * A refusal `handle` builds itself (SPEC-sign-in.md, "Errors and error pages"): the error page's
 * look, from Panda's token declarations inline, since the policy loads no stylesheet; its text in
 * the system fallbacks of the fonts, since it loads no font either; and only links, to sign in
 * where it applies and home, since Go back and the language switcher need script. A form enhanced
 * with JavaScript gets SvelteKit's own action error, so SvelteKit shows its error page with the
 * message and the status's title; any other caller that wants JSON gets `{ message }`.
 */
function refusal(
	request: Request,
	status: number,
	title: string,
	description: string,
	{ headers = {}, signIn }: { headers?: Record<string, string>; signIn?: string } = {},
): Response {
	const json = { status, headers: { ...headers, "cache-control": "no-store" } };
	if (request.headers.get("x-sveltekit-action") === "true") {
		// With its status, as SvelteKit's own `error()` has it: its client drops the response's.
		return Response.json({ type: "error", error: { message: description, status } }, json);
	}
	if (wantsJson(request)) return Response.json({ message: description }, json);
	const signInLink =
		signIn === undefined
			? ""
			: `<a class="primary" href="${escapeHtml(signIn)}">${escapeHtml(m.error_sign_in())}</a>\n`;
	const html = `<!doctype html>
<html lang="${escapeHtml(getLocale())}" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
<style>${tokenDeclarations}${STYLES}</style>
</head>
<body>
<div class="page">
<header>${logo.replace("<svg ", '<svg aria-hidden="true" ')}<span>Obzorarr</span></header>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<nav>${signInLink}<a href="/">${escapeHtml(m.error_home())}</a></nav>
</main>
</div>
</body>
</html>
`;
	return new Response(html, {
		status,
		headers: {
			...headers,
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": POLICY,
			"cache-control": "no-store",
		},
	});
}

/** The error page's layout (`routes/+error.svelte`), written with the same tokens. */
const STYLES = `
body {
	margin: 0;
	background: ${token("colors.background")};
	color: ${token("colors.text")};
	font-family: ${token("fonts.body")};
	font-size: ${token("fontSizes.body")};
	line-height: ${token("lineHeights.body")};
}
.page {
	max-width: ${token("sizes.formMax")};
	margin-inline: auto;
	padding: ${token("spacing.xl")} ${token("spacing.mobileGutter")};
}
header {
	display: flex;
	align-items: center;
	gap: ${token("spacing.sm")};
	font-family: ${token("fonts.display")};
	font-size: ${token("fontSizes.h3")};
	font-weight: ${token("fontWeights.semibold")};
	line-height: ${token("lineHeights.h3")};
}
header svg { width: 24px; height: 24px; }
main {
	margin-block-start: ${token("spacing.xl")};
	padding: ${token("spacing.lg")};
	background: ${token("colors.surface")};
	border: 1px solid ${token("colors.border")};
	border-radius: ${token("radii.panel")};
}
h1 {
	margin: 0;
	font-family: ${token("fonts.display")};
	font-size: ${token("fontSizes.h1")};
	font-weight: ${token("fontWeights.semibold")};
	line-height: ${token("lineHeights.h1")};
	letter-spacing: ${token("letterSpacings.h1")};
	text-wrap: balance;
}
p { margin: ${token("spacing.sm")} 0 0; color: ${token("colors.muted")}; }
nav {
	display: flex;
	flex-wrap: wrap;
	gap: ${token("spacing.md")};
	margin-block-start: ${token("spacing.xl")};
}
a {
	display: inline-flex;
	align-items: center;
	min-height: ${token("sizes.controlHeight")};
	padding-inline: ${token("spacing.lg")};
	color: ${token("colors.text")};
	font-size: ${token("fontSizes.label")};
	font-weight: ${token("fontWeights.semibold")};
	text-decoration: none;
	border: 1px solid ${token("colors.control-border")};
	border-radius: ${token("radii.control")};
}
a:hover { border-color: ${token("colors.muted")}; }
a.primary {
	background: ${token("colors.primary")};
	color: ${token("colors.background")};
	border-color: ${token("colors.primary")};
}
a.primary:hover { background: ${token("colors.secondary")}; border-color: ${token("colors.secondary")}; }
a:focus-visible { outline: 2px solid ${token("colors.secondary")}; outline-offset: 2px; }
@media (min-width: ${token("breakpoints.tablet")}) {
	.page { padding: ${token("spacing.section")} ${token("spacing.tabletGutter")}; }
	main { margin-block-start: ${token("spacing.xxl")}; padding: ${token("spacing.xxl")}; }
}
`;

/** A caller that asks for JSON and not for a page. */
function wantsJson(request: Request): boolean {
	const accept = request.headers.get("accept") ?? "";
	return accept.includes("application/json") && !accept.includes("text/html");
}

/** Text for the page's elements and its double-quoted attributes. */
function escapeHtml(text: string): string {
	return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}
