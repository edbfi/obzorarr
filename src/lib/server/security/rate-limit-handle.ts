import type { Handle } from '@sveltejs/kit/hooks';
import { stringify } from 'devalue';
import { checkRateLimit, RATE_LIMIT_CONFIGS, type RateLimitConfig } from '$lib/server/ratelimit';
import { safeClientAddress, warnIndeterminateClientAddress } from './client-address';
import { applySecurityHeaders } from './security-headers';

function getConfigForPath(path: string, method: string): RateLimitConfig {
	if (method === 'GET' && path === '/') {
		return RATE_LIMIT_CONFIGS.landingPage;
	}

	if (method === 'POST' && path === '/') {
		return RATE_LIMIT_CONFIGS.landingLookup;
	}

	if (path === '/auth/plex') {
		return RATE_LIMIT_CONFIGS.authPoll;
	}

	if (path === '/auth/plex/redirect') {
		return RATE_LIMIT_CONFIGS.authRedirect;
	}

	if (path === '/auth/logout' || path === '/auth/plex/callback') {
		return RATE_LIMIT_CONFIGS.default;
	}

	if (method === 'POST' && path === '/onboarding/claim') {
		return RATE_LIMIT_CONFIGS.onboardingClaim;
	}

	if (path.startsWith('/auth/')) {
		return RATE_LIMIT_CONFIGS.auth;
	}

	if (path.startsWith('/api/')) {
		return RATE_LIMIT_CONFIGS.api;
	}

	return RATE_LIMIT_CONFIGS.default;
}

export const rateLimitHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (path.startsWith('/_app/') || path.startsWith('/favicon')) {
		return resolve(event);
	}

	// Fail safe toward availability: when the client address is indeterminate
	// (see safeClientAddress) we skip rate limiting entirely rather than funnel
	// every such request into one shared bucket — a proxy/adapter misconfig
	// could otherwise soft-DoS all clients. The deduped WARN surfaces the issue.
	const clientAddress = safeClientAddress(event);
	if (clientAddress.indeterminate || clientAddress.address === null) {
		warnIndeterminateClientAddress('Security', path);
		return resolve(event);
	}

	const ip = clientAddress.address;
	const config = getConfigForPath(path, event.request.method);
	const result = checkRateLimit(ip, config);

	if (!result.allowed) {
		const retryAfterSeconds = result.retryAfter ?? 60;
		const rateLimitHeaders = {
			'Retry-After': String(retryAfterSeconds),
			'X-RateLimit-Remaining': '0',
			'X-RateLimit-Reset': String(result.resetTime)
		};
		const isEnhancedActionRequest =
			event.request.method === 'POST' && event.request.headers.get('x-sveltekit-action') === 'true';
		// event.url already carries the public origin (ORIGIN through the front, else the
		// adapter's), so HSTS on early-return 429 responses matches what
		// securityHeadersHandle sets later in the pipeline.
		const isHttps = event.url.protocol === 'https:';

		if (isEnhancedActionRequest) {
			return applySecurityHeaders(
				new Response(
					JSON.stringify({
						type: 'failure',
						status: 429,
						data: stringify({
							error: `Too many requests. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`,
							requiresAuth: false
						})
					}),
					{
						status: 429,
						headers: {
							'Content-Type': 'application/json',
							...rateLimitHeaders
						}
					}
				),
				isHttps
			);
		}

		const isApiRequest =
			path.startsWith('/api/') ||
			(path.startsWith('/auth/') && path !== '/auth/plex/redirect') ||
			event.request.headers.get('accept')?.includes('application/json') ||
			event.request.headers.get('content-type')?.includes('application/json');

		if (isApiRequest) {
			return applySecurityHeaders(
				new Response(JSON.stringify({ error: 'Too many requests' }), {
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						...rateLimitHeaders
					}
				}),
				isHttps
			);
		}

		const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>429 Too Many Requests – Obzorarr</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5}div{max-width:400px;text-align:center;padding:2.5rem;background:#1a1a1a;border:1px solid #333;border-radius:12px}h1{font-size:1.5rem;font-weight:600;margin:0 0 .75rem}p{color:#a1a1aa;margin:0 0 1.5rem;line-height:1.5}a{display:inline-flex;align-items:center;padding:.625rem 1.25rem;background:#e5a00d;color:#000;text-decoration:none;border-radius:8px;font-size:.875rem;font-weight:500}</style>
</head>
<body>
<div>
<div style="font-size:4rem;font-weight:800;color:#e5a00d;line-height:1;margin-bottom:.5rem">429</div>
<h1>Too many requests</h1>
<p>Please slow down and try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.</p>
<a href="/">Home</a>
</div>
</body>
</html>`;

		return applySecurityHeaders(
			new Response(htmlBody, {
				status: 429,
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					...rateLimitHeaders
				}
			}),
			isHttps
		);
	}

	const response = await resolve(event);

	response.headers.set('X-RateLimit-Remaining', String(result.remaining));
	response.headers.set('X-RateLimit-Reset', String(result.resetTime));

	return response;
};
