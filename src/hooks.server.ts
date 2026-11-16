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
import { accessDenied, tooManyRequests } from "#lib/server/security/refusal-page.ts";
import { SESSION_COOKIE, SESSION_COOKIE_DELETION } from "#lib/server/security/session-cookie.ts";
import { firstRunRedirect } from "#lib/server/services/setup/first-run.ts";
import {
	currentAddressHeader,
	currentDatabase,
	currentOrigin,
	startUp,
} from "#lib/server/services/setup/startup.ts";
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
 * The clearing reaches the browser only on responses that pass through `resolve`, not on the
 * setup gate's own redirect.
 */
const session: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	if (token !== undefined) {
		const owner = await lookUpSession(currentDatabase(), token, new Date());
		if (owner === undefined) event.cookies.delete(SESSION_COOKIE, SESSION_COOKIE_DELETION);
		else event.locals.owner = owner;
	}
	return resolve(event);
};

/**
 * The setup gate, the last stage: until first run is complete, every request but its current step
 * and `/healthz` gets a 303 to that step, returned so it keeps the headers.
 */
const setupGate: Handle = ({ event, resolve }) => {
	const step = firstRunRedirect(event.url.pathname);
	return step === undefined
		? resolve(event)
		: new Response(null, { status: 303, headers: { location: step } });
};

export const handle = sequence(language, headers, crossOrigin, rateLimits, session, setupGate);
