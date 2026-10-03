import type { Handle } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import {
	AppSettingsKey,
	getAppSetting,
	getCsrfConfigWithSource
} from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { isOnboardingComplete } from '$lib/server/onboarding/status';
import { applySecurityHeaders } from './security-headers';

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// CSRF self-lockout recovery carve-out (ISSUE-002). The ONLY in-app path to
// repair a misconfigured CSRF origin is POSTing the `updateCsrfOrigin` action on
// the security settings page. Once a bad origin is stored, csrfHandle would 403
// that very repair POST, wedging the admin out with no in-app recovery.
const CSRF_REPAIR_ROUTE_ID = '/admin/settings/security';
const CSRF_REPAIR_ACTION = 'updateCsrfOrigin';

let startupLogged = false;

/**
 * Returns true iff this request is the CSRF-origin repair POST on the security
 * settings page. Keyed PURELY on `event.route.id` + the resolved SvelteKit form
 * action — NO same-origin derivation. `event.url.origin` is rewritten from
 * `x-forwarded-*` by proxyHandle (ordered before csrfHandle) under TRUST_PROXY
 * and is spoofable, so a forged forwarded header must not be able to widen this
 * carve-out. The form action is encoded by SvelteKit as a search-param key
 * beginning with `/` (e.g. `?/updateCsrfOrigin` → key `/updateCsrfOrigin`),
 * which is independent of the proxy-influenced origin.
 */
function isCsrfOriginRepairRequest(event: Parameters<Handle>[0]['event']): boolean {
	if (event.route.id !== CSRF_REPAIR_ROUTE_ID) return false;

	for (const key of event.url.searchParams.keys()) {
		if (key.startsWith('/')) {
			return key.slice(1) === CSRF_REPAIR_ACTION;
		}
	}

	return false;
}

// Exported so admin actions (e.g. updateCsrfOrigin) use the same browser-supplied
// Origin/Referer evidence as csrfHandle. The adapter constructs `request.url`
// before hooks, so that URL is not an independent browser-origin observation.
export function getOriginFromRequest(request: Request): string | null {
	const origin = request.headers.get('origin');
	if (origin) return origin;

	const referer = request.headers.get('referer');
	if (referer) {
		try {
			return new URL(referer).origin;
		} catch {
			return null;
		}
	}

	return null;
}

export const csrfHandle: Handle = async ({ event, resolve }) => {
	const method = event.request.method;

	if (!STATE_CHANGING_METHODS.includes(method)) {
		return resolve(event);
	}

	// CSRF self-lockout recovery (ISSUE-002): exempt EXACTLY the security-route
	// `updateCsrfOrigin` repair POST from the hook-level origin check and let the
	// action's own confirm-mismatch gate govern the write. This is the one
	// setting whose misconfiguration this check exists to repair; every other
	// state-changing route keeps strict origin matching below. No same-origin
	// derivation happens here, so a forged `x-forwarded-*` cannot widen it.
	if (isCsrfOriginRepairRequest(event)) {
		logger.warn('CSRF self-repair: allowing updateCsrfOrigin POST to reach its action', 'CSRF', {
			route: event.route.id ?? '<unmatched>'
		});
		return resolve(event);
	}

	const config = await getCsrfConfigWithSource();
	const expectedOrigin = config.origin.value || null;

	if (!startupLogged) {
		startupLogged = true;
		if (expectedOrigin) {
			const sourceLabel = config.origin.source === 'db' ? 'database' : 'environment';
			logger.info(`CSRF protection active (origin from ${sourceLabel})`, 'CSRF');
		} else if (!dev) {
			logger.warn(
				'CSRF protection not configured - no ORIGIN set in environment or database. ' +
					'State-changing requests will be rejected once onboarding is complete ' +
					'(set CSRF_ORIGIN_SKIPPED=true in app settings to explicitly opt out).',
				'CSRF'
			);
		}
	}

	if (!expectedOrigin) {
		if (dev) return resolve(event);

		const [onboardingDone, explicitSkip] = await Promise.all([
			isOnboardingComplete(),
			getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)
		]);

		if (onboardingDone && explicitSkip !== 'true') {
			logger.warn('CSRF rejected: no origin configured and no explicit skip', 'CSRF', {
				method,
				route: event.route.id ?? '<unmatched>'
			});
			return applySecurityHeaders(
				new Response(JSON.stringify({ error: 'CSRF protection not configured' }), {
					status: 403,
					headers: { 'Content-Type': 'application/json' }
				}),
				event.url.protocol === 'https:'
			);
		}

		return resolve(event);
	}

	const requestOrigin = getOriginFromRequest(event.request);

	if (!requestOrigin) {
		logger.warn('CSRF check failed: missing origin header', 'CSRF', {
			method,
			route: event.route.id ?? '<unmatched>'
		});
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'Forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			}),
			event.url.protocol === 'https:'
		);
	}

	if (requestOrigin.toLowerCase() !== expectedOrigin.toLowerCase()) {
		logger.warn('CSRF check failed: origin mismatch', 'CSRF', {
			method,
			route: event.route.id ?? '<unmatched>',
			expected: expectedOrigin,
			received: requestOrigin
		});
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'Forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			}),
			event.url.protocol === 'https:'
		);
	}

	return resolve(event);
};
