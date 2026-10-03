export function applySecurityHeaders(response: Response, isHttps: boolean): Response {
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	// Content-Security-Policy is managed by SvelteKit's kit csp option (`kitConfig` in vite.config.ts)
	// using nonce mode, which eliminates the need for 'unsafe-inline' on script-src.

	// Trust the protocol decision the caller made. proxyHandle is the single
	// gate that honours TRUST_PROXY when deciding whether to rewrite event.url
	// from x-forwarded-proto; reading the header here would bypass that gate
	// and let an upstream-spoofed `X-Forwarded-Proto: https` advertise HSTS on
	// an HTTP-only deployment, letting browsers cache a permanent upgrade hint
	// for an origin that cannot serve HTTPS.
	if (isHttps) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
}
