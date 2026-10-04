import type { Handle } from '@sveltejs/kit/hooks';
import { logger } from '$lib/server/logging';
import {
	safeClientAddress,
	UNKNOWN_CLIENT_ADDRESS,
	warnIndeterminateClientAddress
} from './client-address';
import { isBlockedPath, isBlockedUserAgent } from './request-filter-patterns';
import { applySecurityHeaders } from './security-headers';

export const requestFilterHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const userAgent = event.request.headers.get('user-agent') ?? '';
	// `ip` only feeds debug-log context here. If the client address is
	// indeterminate (see safeClientAddress), fall back to a placeholder instead
	// of letting getClientAddress() throw into handleError.
	const clientAddress = safeClientAddress(event);
	if (clientAddress.indeterminate) {
		warnIndeterminateClientAddress('Security', path);
	}
	const ip = clientAddress.address ?? UNKNOWN_CLIENT_ADDRESS;

	// `/favicon.ico` has no static asset, so SvelteKit's router lets it reach
	// `handleError` and writes `[ErrorHandler] Unexpected error: Not found:
	// /favicon.ico` on every clean browser load. Short-circuit it here with a
	// quiet 404 so the noise stops without committing to shipping a binary
	// favicon. Other favicon variants (e.g. `/favicon.svg`) can still resolve
	// if added to static/ later.
	if (path === '/favicon.ico') {
		return applySecurityHeaders(
			new Response(null, { status: 404 }),
			event.url.protocol === 'https:'
		);
	}

	if (isBlockedPath(path)) {
		logger.debug(`Blocked scanner probe: ${path}`, 'Security', { ip });
		// event.url already carries the public origin (ORIGIN through the front, else the
		// adapter's), so HSTS matches what securityHeadersHandle sets on other responses.
		return applySecurityHeaders(
			new Response(JSON.stringify({ error: 'Not Found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}),
			event.url.protocol === 'https:'
		);
	}

	if (isBlockedUserAgent(userAgent)) {
		logger.debug(`Blocked suspicious user-agent: ${userAgent}`, 'Security', { ip });
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
