import type { RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { getTrustProxyConfigWithSource } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { env } from '$lib/server/private-env';
import { buildForwardedUrl, parseForwardedProtoHost } from './forwarded-headers';

let proxyStartupLogged = false;

// Module-level cache for the resolved TRUST_PROXY decision. The setting is
// operationally static (changes only when an admin toggles it in the UI), but
// getTrustProxyConfigWithSource() reads the full app_settings table on every
// call. Without this cache, every blocked/rate-limited request triggers a fresh
// SQLite scan via isProxiedHttps() — defensive short-circuits should shed load,
// not amplify it. Admin write sites MUST call _resetTrustProxyCache() AFTER the
// DB write completes so subsequent requests re-resolve the new value.
//
// We cache the in-flight Promise rather than the resolved boolean. This makes
// reset-during-resolve race-safe: a concurrent _resetTrustProxyCache() nulls
// the slot, but any request already awaiting the old promise keeps its
// reference via closure. The successful .then path never writes back to the
// slot on resolution, so it cannot pollute the cache after reset.
//
// If getTrustProxyConfigWithSource() rejects (or the .then callback throws),
// the chained .catch nulls the slot ONLY when its own promise is still the current
// one. That guard prevents a late rejection from a pre-reset chain from
// clobbering a freshly-populated post-reset chain. The current caller still
// fails fast, and the next miss starts a fresh fetch — so a transient DB error
// cannot stick a rejected promise in the cache indefinitely.
let trustProxyPromise: Promise<boolean> | null = null;

function resolveTrustProxy(): Promise<boolean> {
	if (trustProxyPromise !== null) return trustProxyPromise;

	const chain: Promise<boolean> = getTrustProxyConfigWithSource()
		.then((config) => {
			const trustProxy = config.trustProxy.value === 'true';

			if (!proxyStartupLogged && trustProxy) {
				proxyStartupLogged = true;
				const sourceLabel = config.trustProxy.source === 'env' ? 'environment' : 'database';
				logger.warn(
					`Trusting reverse-proxy x-forwarded-* headers (source: ${sourceLabel}). ` +
						'The upstream proxy MUST strip inbound x-forwarded-* headers from clients ' +
						'or attackers can poison event.url.host / event.url.protocol.',
					'Proxy'
				);
			}

			return trustProxy;
		})
		.catch((err) => {
			// Evict the rejected promise so the next caller retries instead of
			// re-throwing the same stale rejection forever. Guard with an
			// identity check so that if _resetTrustProxyCache() ran and another
			// request already populated a new chain, we do NOT clobber it.
			// Re-throw so the current caller still observes the failure.
			if (trustProxyPromise === chain) trustProxyPromise = null;
			throw err;
		});

	trustProxyPromise = chain;
	return trustProxyPromise;
}

// Resolve the effective URL for a request after honouring TRUST_PROXY and the
// forwarded headers — the same decision proxyHandle uses when it mutates
// event.url. Returns the rewritten URL or null when no rewrite should occur
// (TRUST_PROXY=false, forwarded headers missing/invalid, etc.).
//
// This is the single source of truth for "did the proxy decide this is HTTPS?"
// Handlers that run before proxyHandle in the request pipeline (such as
// requestFilterHandle and rateLimitHandle, which can short-circuit with a
// Response) must consult this rather than reading x-forwarded-proto directly
// or trusting event.url.protocol — both of those would either bypass the
// TRUST_PROXY gate or return the pre-rewrite protocol.
//
// A configured ORIGIN always wins: when scripts/serve.ts fronts the adapter it sets
// event.url from ORIGIN and exports OBZORARR_FRONT_ORIGIN, and forwarded headers
// then never override it, even with TRUST_PROXY enabled. The marker, not ORIGIN
// itself, is checked: build/index.js started directly (or vite dev) ignores ORIGIN,
// and TRUST_PROXY keeps working there. (The database CSRF origin is not considered
// here; it only governs csrfHandle.)
async function resolveForwardedUrl(event: RequestEvent): Promise<URL | null> {
	if (env.OBZORARR_FRONT_ORIGIN) return null;

	const trustProxy = await resolveTrustProxy();
	if (!trustProxy) return null;

	return buildForwardedUrl(event.url, parseForwardedProtoHost(event.request.headers));
}

// Decide whether the effective request protocol is HTTPS, honouring
// TRUST_PROXY exactly the same way proxyHandle does. Safe to call from
// handlers that run before proxyHandle (e.g. requestFilterHandle,
// rateLimitHandle) which need the post-proxy isHttps state to set HSTS on
// early-return responses without re-introducing a spoofable direct read of
// x-forwarded-proto.
export async function isProxiedHttps(event: RequestEvent): Promise<boolean> {
	const forwardedUrl = await resolveForwardedUrl(event);
	const effectiveUrl = forwardedUrl ?? event.url;
	return effectiveUrl.protocol === 'https:';
}

// NOTE: this handler does NOT touch event.getClientAddress(); the production
// adapter (@sveltejs/adapter-bun) resolves the client IP independently. Operators
// who need IP trust must configure their adapter / runtime separately.
export const proxyHandle: Handle = async ({ event, resolve }) => {
	const forwardedUrl = await resolveForwardedUrl(event);
	if (!forwardedUrl) return resolve(event);

	Object.defineProperty(event, 'url', {
		value: forwardedUrl,
		writable: true,
		configurable: true
	});

	return resolve(event);
};

// Test-only: reset the one-shot startup-log flag so tests can re-exercise it.
export function _resetProxyStartupLogged(): void {
	proxyStartupLogged = false;
}

// Invalidate the cached TRUST_PROXY decision so the next request re-reads it
// from settings. Admin action handlers MUST call this AFTER setAppSetting()
// completes — calling it before the write would seed the cache with a fresh
// fetch of the OLD value if a concurrent request misses in the same tick.
//
// Race-safety against in-flight resolves: clearing trustProxyPromise drops
// only the module slot. Any request that already awaited the pre-reset promise
// keeps its reference via closure and is unaffected. The successful .then path
// never writes back to the slot, and the .catch path only writes back when its
// own promise is still the current one (identity check) — so neither a late
// resolution nor a late rejection from a pre-reset chain can pollute the cache
// after reset + repopulation. The next miss after this call starts a fresh
// fetch and caches the new value.
export function _resetTrustProxyCache(): void {
	trustProxyPromise = null;
}
