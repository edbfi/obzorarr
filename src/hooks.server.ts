import { isHttpError, isRedirect } from '@sveltejs/kit';
import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence
} from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { env } from '$env/dynamic/private';
import { isSafeReturnPath } from '$lib/client/plex-login';
import { ensurePublicLandingLookupDefault } from '$lib/server/admin/settings.service';
import { getOrCreateDevSession, isDevBypassEnabled } from '$lib/server/auth/dev-bypass';
import { isAdminRouteId } from '$lib/server/auth/guards';
import {
	needsRevalidation,
	revalidateMembership,
	shouldRevalidateSession
} from '$lib/server/auth/revalidation';
import {
	invalidateSession,
	invalidateUserSessions,
	updateUserAndSessionAdmin,
	validateSession
} from '$lib/server/auth/session';
import { SESSION_DURATION_MS } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import {
	getOnboardingStep,
	printOnboardingBootstrapBanner,
	requiresOnboarding
} from '$lib/server/onboarding';
import {
	applySecurityHeaders,
	csrfHandle,
	proxyHandle,
	rateLimitHandle,
	requestFilterHandle
} from '$lib/server/security';
import { initializeServer } from '$lib/server/startup';

export const init: ServerInit = initializeServer;
// `event.url.protocol` is the single source of truth: proxyHandle rewrites
// event.url from x-forwarded-proto only when TRUST_PROXY is enabled, so reading
// it here keeps the HSTS decision aligned with the trust-proxy gate rather than
// reading the raw header twice.
const securityHeadersHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	return applySecurityHeaders(response, event.url.protocol === 'https:');
};

function redirectResponse(event: { url: URL }, location: string): Response {
	return applySecurityHeaders(
		new Response(null, {
			status: 303,
			headers: { Location: location }
		}),
		event.url.protocol === 'https:'
	);
}

const COOKIE_DELETE_OPTIONS = {
	path: '/'
};

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax' as const,
	maxAge: Math.floor(SESSION_DURATION_MS / 1000)
};

let devBypassLogged = false;
// Hot-path optimisation only: initializationHandle runs on every request, so this
// flag short-circuits the per-request PK lookup after the first successful backfill.
// The DB row-absence check keeps the backfill safe across replicas and restarts.
let publicLandingLookupBackfilled = false;

const initializationHandle: Handle = async ({ event, resolve }) => {
	// ServerInit has already reconciled ENV-backed authority before requests are
	// accepted. This separate upgrade backfill seeds only a missing landing default
	// before the first landing load; its row-absence check is replica-safe.
	if (!publicLandingLookupBackfilled) {
		try {
			await ensurePublicLandingLookupDefault();
			publicLandingLookupBackfilled = true;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to backfill public landing lookup default: ${errorMessage}`, 'Startup');
		}
	}
	try {
		await printOnboardingBootstrapBanner();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to prepare onboarding bootstrap token: ${errorMessage}`, 'Startup');
	}
	return resolve(event);
};

const authHandle: Handle = async ({ event, resolve }) => {
	if (isDevBypassEnabled()) {
		const devSessionId = await getOrCreateDevSession();

		const existingSessionId = event.cookies.get('session');
		if (existingSessionId !== devSessionId) {
			event.cookies.set('session', devSessionId, COOKIE_OPTIONS);
		}

		const session = await validateSession(devSessionId);

		if (session) {
			event.locals.user = {
				id: session.userId,
				plexId: session.plexId,
				username: session.username,
				isAdmin: session.isAdmin
			};

			if (!devBypassLogged) {
				logger.warn(
					`🔓 DEV_BYPASS_AUTH is enabled - using simulated user (${session.username})`,
					'DevBypass'
				);
				devBypassLogged = true;
			}

			return resolve(event);
		}
	}

	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const session = await validateSession(sessionId);

		if (session) {
			if (needsRevalidation(sessionId) && (await shouldRevalidateSession())) {
				const result = await revalidateMembership(sessionId, session.plexToken);

				switch (result.status) {
					case 'valid': {
						const newIsAdmin = result.membership.isOwner;
						if (newIsAdmin !== session.isAdmin) {
							await updateUserAndSessionAdmin(sessionId, session.userId, newIsAdmin);
							session.isAdmin = newIsAdmin;
						}
						break;
					}
					case 'revoked':
						logger.info(
							`Session revoked for user ${session.username}: ${result.reason}`,
							'Revalidation'
						);
						await invalidateUserSessions(session.userId);
						event.cookies.delete('session', COOKIE_DELETE_OPTIONS);
						return resolve(event);
					case 'error_grace_expired':
						logger.warn(
							`Grace period expired for user ${session.username}, invalidating session`,
							'Revalidation'
						);
						await invalidateSession(sessionId);
						event.cookies.delete('session', COOKIE_DELETE_OPTIONS);
						return resolve(event);
					case 'error_within_grace':
						break;
				}
			}

			event.locals.user = {
				id: session.userId,
				plexId: session.plexId,
				username: session.username,
				isAdmin: session.isAdmin
			};
		} else {
			event.cookies.delete('session', COOKIE_DELETE_OPTIONS);
		}
	}

	return resolve(event);
};

const onboardingHandle: Handle = async ({ event, resolve }) => {
	if (isDevBypassEnabled() && env.DEV_BYPASS_ONBOARDING === 'true') {
		return resolve(event);
	}

	const skipPaths = ['/_app', '/favicon', '/auth', '/api/onboarding', '/api/sync', '/onboarding'];

	if (skipPaths.some((p) => event.url.pathname.startsWith(p))) {
		return resolve(event);
	}

	try {
		const needsOnboarding = await requiresOnboarding();

		if (needsOnboarding) {
			const currentStep = await getOnboardingStep();
			return redirectResponse(event, `/onboarding/${currentStep}`);
		}
	} catch (error) {
		if (isRedirect(error)) {
			throw error;
		}

		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Onboarding check failed: ${errorMessage}`, 'OnboardingHandle');
	}

	return resolve(event);
};

// ISSUE-008 — SSE denial contract. Admin stream routes (/admin/logs/stream,
// /admin/sync/stream) are denied by `authorizationHandle` below with a 303
// (anon: '/?returnTo=<encodedPath>' for a safe path, else '/'; non-admin:
// '/dashboard') BEFORE their endpoint's own requireAdmin 403
// ever runs, so the 403 is unreachable for anonymous callers and the observable
// anon contract for admin streams is this hook 303. /api/sync/status/stream
// instead returns a 401 JSON from its own handler. The split is intentional and
// only matters for document navigation vs. programmatic clients (curl/fetch): a
// browser `EventSource` cannot consume either a 303 or a 401 — both surface as a
// generic `onerror` — so the status-code difference is cosmetic for SSE consumers.
// Admin streams are reached by in-app navigation that benefits from a
// redirect-to-login; the api endpoint is a programmatic surface where a 401 is
// cleaner. Do not "unify" these without re-reading this rationale.
const authorizationHandle: Handle = async ({ event, resolve }) => {
	if (isAdminRouteId(event.route.id)) {
		if (!event.locals.user || !event.locals.user.isAdmin) {
			// Authenticated non-admins go to their own dashboard; carrying a returnTo
			// would be pointless (they can never reach the admin route).
			if (event.locals.user) {
				return redirectResponse(event, '/dashboard');
			}

			// Anonymous: preserve the requested admin path so the sign-in flow can
			// land the user back where they were headed (ISSUE-002). The path is
			// built from the request URL (always same-origin) but is validated with
			// the shared open-redirect guard as defense-in-depth before it is encoded
			// into the returnTo carrier. The real open-redirect surface — the client
			// `window.location.href` on the landing page — re-validates it again.
			// Use pathname only (drop event.url.search): the returnTo value travels
			// through the Plex OAuth forwardUrl, so any admin query string (e.g.
			// /admin/logs?search=…) would otherwise leak via plex.tv logs, browser
			// history and Referer headers. Landing back on the bare admin path is
			// sufficient post-login; filter/tab params are not worth that exposure.
			const requestedPath = event.url.pathname;
			const location = isSafeReturnPath(requestedPath)
				? `/?returnTo=${encodeURIComponent(requestedPath)}`
				: '/';
			return redirectResponse(event, location);
		}
	}

	return resolve(event);
};

export const handleError: HandleServerError = async ({ error, event }) => {
	const metadata = {
		route: event.route.id ?? '<unmatched>',
		method: event.request.method
	};

	// Route-not-found and other expected HTTP errors are routine, not exceptions.
	// Demote them to [NotFound] / info so they don't dominate error-channel triage.
	if (isHttpError(error) && error.status === 404) {
		logger.info(`Not found: ${event.url.pathname}`, 'NotFound', metadata);
		return { message: error.body.message ?? 'Not found' };
	}

	// Unmatched routes (including param-matcher rejections like /wrapped/abc where
	// [year=year] rejects 'abc') surface as a SvelteKitError(404) — not an HttpError,
	// so it slips past the isHttpError branch above. SvelteKit produces two shapes:
	// a bare 'Not found' and a path-suffixed 'Not found: <pathname>' (respond.js).
	// Detect by the combination of: unmatched route (id === null) AND either message
	// shape. Keeping the id === null guard is what prevents this from swallowing an
	// app-thrown Error('Not found: …') on a *matched* route — only SvelteKit internals
	// produce these strings on an unmatched route.
	// NOTE: these strings are SvelteKit internals as of ^2.57.1, not a public API
	// contract. If a future upgrade changes them the guard silently degrades — the
	// error falls back to logger.error below, which is safe but noisy. Recheck after
	// SvelteKit major upgrades.
	if (
		event.route.id === null &&
		error instanceof Error &&
		(error.message === 'Not found' || error.message.startsWith('Not found: '))
	) {
		logger.info(`Not found: ${event.url.pathname}`, 'NotFound', metadata);
		return { message: 'Not found' };
	}

	// Remaining 4xx HttpErrors (403/422/etc — the 404 is handled above) are caller
	// mistakes, not server faults, so log them at WARN to keep the ERROR channel
	// reserved for genuine 5xx/unexpected failures (ISSUE-009). Placed after BOTH
	// 404 guards so neither 404 path is mis-leveled. SvelteKitError is not an
	// HttpError, so unmatched-route 404s never reach this branch.
	if (isHttpError(error) && error.status >= 400 && error.status < 500) {
		logger.warn(`Client error ${error.status}: ${event.url.pathname}`, 'ClientError', metadata);
		return { message: error.body.message ?? 'Request error' };
	}

	logger.error(`Unexpected error: ${error}`, 'ErrorHandler', metadata);

	return {
		message: 'Something went wrong. Try again.'
	};
};

export const handle = sequence(
	requestFilterHandle,
	rateLimitHandle,
	proxyHandle,
	csrfHandle,
	initializationHandle,
	securityHeadersHandle,
	authHandle,
	onboardingHandle,
	authorizationHandle
);
