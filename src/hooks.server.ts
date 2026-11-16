import type { RequestEvent } from "@sveltejs/kit";
import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence,
} from "@sveltejs/kit/hooks";
import * as m from "#lib/paraglide/messages.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { createLogger } from "#lib/server/logging/logger.ts";
import { logRequestError } from "#lib/server/logging/request-error.ts";
import { clientAddressReader } from "#lib/server/security/client-address.ts";
import { crossOriginAllowed } from "#lib/server/security/cross-origin.ts";
import { securityHeaders, withSecurityHeaders } from "#lib/server/security/headers.ts";
import { createRateLimiter } from "#lib/server/security/rate-limit.ts";
import { accessDenied, sessionEnded, tooManyRequests } from "#lib/server/security/refusal-page.ts";
import { SESSION_COOKIE, SESSION_COOKIE_DELETION } from "#lib/server/security/session-cookie.ts";
import { firstRunRedirect } from "#lib/server/services/setup/first-run.ts";
import {
	currentAddressHeader,
	currentDatabase,
	currentOrigin,
	startUp,
} from "#lib/server/services/setup/startup.ts";
import { ownerCheck } from "#lib/server/services/sign-in/owner-check.ts";
import { lookUpSession } from "#lib/server/services/sign-in/sessions.ts";
import { building, dev } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await startUp(env, { dev });
};

/**
 * Every error's message, which the error page shows under its title (SPEC-sign-in.md, "Errors and
 * error pages"). An unexpected error is logged as one redacted entry, instead of SvelteKit's
 * default, which writes its stack to the console unredacted, and gets "Something went wrong. Try
 * again."; an error the app raised with a message of its own keeps it; one raised without (which
 * SvelteKit calls "Error: <status>") and the framework's own get their status's description, in
 * the viewer's language. An error thrown in `handle` outside the language stage is described in
 * English, since the language is chosen inside it.
 */
export const handleError: HandleServerError = (input) => {
	logRequestError(input);
	if (input.kind === "unknown") return { message: m.error_something_went_wrong_description() };
	if (input.kind === "validation") return undefined;
	const status = input.error.status ?? 500;
	if (input.kind === "app" && input.error.message !== `Error: ${status}`) return undefined;
	return { message: describeStatus(status) };
};

/** What the error page says under each status's title. */
function describeStatus(status: number): string {
	switch (status) {
		case 403:
			return m.error_forbidden_description();
		case 404:
			return m.error_not_found_description();
		case 429:
			return m.error_too_many_requests_description();
		default:
			return m.error_something_went_wrong_description();
	}
}

/** Each request's language (SPEC-i18n.md); it refuses nothing. */
const language: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace("%lang%", locale) },
		),
	);

/** The security headers on every response from here on, an early return from a later stage too. */
const headers: Handle = async ({ event, resolve }) =>
	withSecurityHeaders(await resolve(event), securityHeaders(event.request, currentOrigin()));

/**
 * The cross-origin check on every state-changing request, which replaces SvelteKit's own form
 * check; a refusal is returned, never thrown, so it keeps the language and the headers.
 */
const crossOrigin: Handle = ({ event, resolve }) =>
	crossOriginAllowed(
		{
			method: event.request.method,
			headers: event.request.headers,
			isSubRequest: event.isSubRequest,
		},
		currentOrigin(),
	)
		? resolve(event)
		: accessDenied(event.request);

const rateLimitLog = createLogger("rate-limits");
const readClientAddress = clientAddressReader({
	addressHeader: currentAddressHeader,
	warn: (message) => rateLimitLog.warn(message),
});

/** Every request through `handle` but `/healthz`: 60 a minute per client address. */
const generalLimit = createRateLimiter({ limit: 60, windowMs: 60_000 });

/**
 * The client address and the general limit (SPEC-sign-in.md, "Rate limits and failed sign-ins").
 * `/healthz` and internal subrequests are exempt. With `ADDRESS_HEADER` set, a request that didn't
 * come through the proxy is refused; one with no address at all skips the limit. The claim's,
 * signing in's and recovery's own limits are checked in their actions, so their refusal can show
 * beside the form.
 */
const rateLimits: Handle = ({ event, resolve }) => {
	if (event.isSubRequest || event.url.pathname === "/healthz") return resolve(event);
	const address = readClientAddress(event.getClientAddress, event.request);
	if (address.kind === "refused") return accessDenied(event.request, "not-through-proxy");
	if (address.kind === "unknown") return resolve(event);
	event.locals.clientAddress = address.key;
	const decision = generalLimit.hit(address.key);
	return decision.allowed ? resolve(event) : tooManyRequests(event.request, decision);
};

/**
 * The session (SPEC-sign-in.md, "The request stages"): the owner a live session cookie signs in,
 * in `event.locals.owner`. It refuses nothing; a cookie whose session has ended or never existed
 * is cleared, with `secure: false`, since the browser's address isn't known on every request.
 * SvelteKit writes the clearing only on responses that pass through `resolve`, so a later stage's
 * own answer, a redirect or a refusal, gets it here, unless that response sets the cookie itself,
 * as signing in does.
 */
const session: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	if (token === undefined) return resolve(event);
	const owner = await lookUpSession(currentDatabase(), token, new Date());
	if (owner !== undefined) {
		event.locals.owner = owner;
		return resolve(event);
	}
	event.cookies.delete(SESSION_COOKIE, SESSION_COOKIE_DELETION);
	const response = await resolve(event);
	const setsCookie = response.headers
		.getSetCookie()
		.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
	if (setsCookie) return response;
	const clearing = event.cookies.serialize(SESSION_COOKIE, "", {
		...SESSION_COOKIE_DELETION,
		maxAge: 0,
	});
	return withHeaderAppended(response, "set-cookie", clearing);
};

/** `response` with one more `name` header; one whose headers can't change is copied first. */
function withHeaderAppended(response: Response, name: string, value: string): Response {
	try {
		response.headers.append(name, value);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		copy.headers.append(name, value);
		return copy;
	}
}

/**
 * A 303 a stage answers itself: for a data request, SvelteKit's own JSON redirect, built here
 * rather than left to SvelteKit, which would build it after `handle` and so without the security
 * headers. Neither is cached. The JSON lacks SvelteKit's `x-sveltekit-version` header, so the
 * client skips its new-deployment check for that one answer, which is harmless.
 */
function redirectFromHandle(event: RequestEvent, location: string): Response {
	if (event.isDataRequest) {
		return Response.json(
			{ type: "redirect", status: 303, location },
			{ headers: { "cache-control": "private, no-store" } },
		);
	}
	return new Response(null, {
		status: 303,
		headers: { location, "cache-control": "no-store" },
	});
}

/**
 * The setup gate: until first run is complete, every request but its current step
 * and `/healthz` is sent to that step, a data request through SvelteKit's JSON redirect; the
 * answer is returned, so it keeps the headers.
 */
const setupGate: Handle = ({ event, resolve }) => {
	const step = firstRunRedirect(event.url.pathname);
	return step === undefined ? resolve(event) : redirectFromHandle(event, step);
};

/**
 * The owner check, the last stage (SPEC-sign-in.md, "Owner-only pages"): a `handle` stage rather
 * than a layout `load`, since SvelteKit runs a form action before any `load`. Its redirect and its
 * refusal are returned, so both keep the headers. What it lets through to the owner is `no-store`.
 */
const ownerOnly: Handle = async ({ event, resolve }) => {
	const decision = ownerCheck({
		path: event.url.pathname,
		method: event.request.method,
		signedIn: event.locals.owner !== undefined,
	});
	switch (decision.action) {
		case "redirect":
			return redirectFromHandle(event, decision.location);
		case "refuse":
			return sessionEnded(event.request, decision.returnTo);
		case "pass": {
			const response = await resolve(event);
			return decision.noStore
				? withSecurityHeaders(response, { "cache-control": "no-store" })
				: response;
		}
	}
};

export const handle = sequence(
	language,
	headers,
	crossOrigin,
	rateLimits,
	session,
	setupGate,
	ownerOnly,
);
