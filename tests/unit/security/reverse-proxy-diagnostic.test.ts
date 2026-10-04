import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type {
	ReverseProxyConfigSource,
	ReverseProxyDiagnosticReasonCode,
	ReverseProxyRecommendationAction
} from '$lib/security/reverse-proxy';
import { env } from '$lib/server/private-env';
import { clearRateLimitStore } from '$lib/server/ratelimit';
import {
	buildReverseProxyDiagnostic,
	classifySourceAddress
} from '$lib/server/security/reverse-proxy-diagnostic';
import { GET as diagnosticGET } from '../../../src/routes/api/security/reverse-proxy-diagnostic/+server';
import { resetSharedTestDb } from '../../helpers/db';

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

function diagnosticFor({
	browserOrigin = 'https://browser.example.com',
	requestUrl = 'http://internal.local/path',
	effectiveAppUrl = requestUrl,
	headers = {},
	csrfOrigin = '',
	csrfSource = 'default',
	fronted = false,
	sourceAddress = '172.18.0.2'
}: {
	browserOrigin?: string | null;
	requestUrl?: string;
	effectiveAppUrl?: string;
	headers?: Readonly<Record<string, string>>;
	csrfOrigin?: string;
	csrfSource?: ReverseProxyConfigSource;
	fronted?: boolean;
	sourceAddress?: string;
} = {}) {
	return buildReverseProxyDiagnostic({
		request: new Request(requestUrl, { headers: { ...headers } }),
		effectiveAppUrl,
		browserOrigin,
		sourceAddress,
		csrfOrigin: {
			value: csrfOrigin,
			source: csrfSource,
			isLocked: csrfSource === 'env'
		},
		fronted
	});
}

describe('reverse proxy diagnostic when scripts/serve.ts fronts the app with ORIGIN', () => {
	// SvelteKit 3: fronted, ORIGIN is the effective origin and forwarded headers never
	// override it.
	const fronted = {
		fronted: true,
		csrfOrigin: 'http://obzorarr.lan:3000',
		csrfSource: 'env' as const,
		requestUrl: 'http://obzorarr.lan:3000/admin',
		headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'other.example.com' }
	};

	it('reports ORIGIN as decisive whatever the forwarded headers say', () => {
		const diagnostic = diagnosticFor({ ...fronted, browserOrigin: 'http://obzorarr.lan:3000' });
		expect(diagnostic.action).toBe('origin-matches');
		expect(diagnostic.reasonCodes).toEqual(['origin-env-configured']);
		expect(diagnostic.facts.origins.effectiveApp).toBe('http://obzorarr.lan:3000');
	});

	it('asks to open the configured ORIGIN when the browser origin differs from it', () => {
		const diagnostic = diagnosticFor({ ...fronted, browserOrigin: 'https://other.example.com' });
		expect(diagnostic.action).toBe('unable-to-determine');
		expect(diagnostic.reasonCodes).toEqual(['origin-env-mismatch']);
	});

	it('judges the adapter origin, not ORIGIN, when ORIGIN is set but the front is not running', () => {
		const diagnostic = diagnosticFor({
			csrfOrigin: 'https://browser.example.com',
			csrfSource: 'env',
			headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'browser.example.com' }
		});
		expect(diagnostic.action).toBe('set-origin');
		expect(diagnostic.reasonCodes).toEqual(['request-origin-differs-from-browser']);
	});

	it('ignores a database CSRF origin for this decision', () => {
		const diagnostic = diagnosticFor({
			csrfOrigin: 'https://browser.example.com',
			csrfSource: 'db',
			headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'browser.example.com' }
		});
		expect(diagnostic.action).toBe('set-origin');
		expect(diagnostic.reasonCodes).toEqual(['request-origin-differs-from-browser']);
	});
});

describe('reverse proxy diagnostic contract', () => {
	it.each([
		{
			name: 'invalid browser origin',
			input: {
				browserOrigin: 'not a URL',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'unable-to-determine',
			reason: 'browser-origin-invalid'
		},
		{
			// The shape that used to ask for TRUST_PROXY: the proxy's pair matches the
			// browser, but Obzorarr's own origin is internal. ORIGIN is the repair now.
			name: 'matching forwarded pair with an internal origin',
			input: {
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'set-origin',
			reason: 'request-origin-differs-from-browser'
		},
		{
			name: 'direct access',
			input: {
				browserOrigin: 'http://internal.local',
				requestUrl: 'http://internal.local/path'
			},
			action: 'origin-matches',
			reason: 'request-origin-matches-browser'
		},
		{
			name: 'Caddy-shaped downstream values when the origin already matches',
			input: {
				requestUrl: 'https://browser.example.com/path',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'origin-matches',
			reason: 'request-origin-matches-browser'
		},
		{
			name: 'a non-default public port',
			input: {
				browserOrigin: 'https://browser.example.com:8443',
				requestUrl: 'https://browser.example.com:8443/path',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com:8443'
				}
			},
			action: 'origin-matches',
			reason: 'request-origin-matches-browser'
		},
		{
			// PROTOCOL_HEADER/HOST_HEADER (or ORIGIN through the front) already put the
			// public origin into event.url: the effective origin decides.
			name: 'an effective origin the adapter took from configured headers',
			input: {
				effectiveAppUrl: 'https://browser.example.com/path',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'origin-matches',
			reason: 'request-origin-matches-browser'
		},
		{
			name: 'partial forwarding metadata when the origin matches',
			input: {
				requestUrl: 'https://browser.example.com/path',
				headers: { 'x-forwarded-proto': 'https' }
			},
			action: 'origin-matches',
			reason: 'request-origin-matches-browser'
		},
		{
			name: 'missing forwarded pair with mismatched origins',
			input: {},
			action: 'set-origin',
			reason: 'request-origin-differs-from-browser'
		},
		{
			name: 'partial forwarded pair with mismatched origins',
			input: { headers: { 'x-forwarded-proto': 'https' } },
			action: 'set-origin',
			reason: 'request-origin-differs-from-browser'
		},
		{
			name: 'invalid forwarded pair when the origin matches',
			input: {
				requestUrl: 'https://browser.example.com/path',
				headers: {
					'x-forwarded-proto': 'ftp',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'origin-matches',
			reason: 'request-origin-matches-browser'
		},
		{
			name: 'invalid forwarded pair with mismatched origins',
			input: {
				headers: {
					'x-forwarded-proto': 'ftp',
					'x-forwarded-host': 'browser.example.com'
				}
			},
			action: 'set-origin',
			reason: 'request-origin-differs-from-browser'
		},
		{
			name: 'conflicting forwarded pair when the origin matches',
			input: {
				requestUrl: 'https://browser.example.com/path',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'different.example.com'
				}
			},
			action: 'origin-matches',
			reason: 'request-origin-matches-browser'
		},
		{
			name: 'conflicting forwarded pair with mismatched origins',
			input: {
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'different.example.com'
				}
			},
			action: 'set-origin',
			reason: 'request-origin-differs-from-browser'
		}
	] as const)('$name returns $action with $reason', ({ input, action, reason }) => {
		const diagnostic = diagnosticFor(input as Parameters<typeof diagnosticFor>[0]);
		expect(diagnostic.action).toBe(action as ReverseProxyRecommendationAction);
		expect(diagnostic.reasonCodes).toEqual([reason as ReverseProxyDiagnosticReasonCode]);
	});

	it('serializes only safe facts, action, and stable reason codes', () => {
		const diagnostic = diagnosticFor({
			requestUrl: 'http://internal.local/path?token=secret-query',
			effectiveAppUrl: 'http://internal.local/path?token=secret-query',
			browserOrigin: 'https://browser-secret.example.com',
			csrfOrigin: 'https://configured-secret.example.com',
			sourceAddress: '203.0.113.44',
			headers: {
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				forwarded: 'for=secret-client;proto=https;host=hidden.example',
				'x-forwarded-for': '203.0.113.77',
				'x-forwarded-host': 'secret-forwarded.example',
				'x-forwarded-proto': 'https',
				'x-real-ip': '198.51.100.88'
			}
		});

		expect(Object.keys(diagnostic).sort()).toEqual(['action', 'facts', 'reasonCodes']);
		expect(diagnostic.facts).toEqual({
			browserOrigin: { isValid: true, origin: 'https://browser-secret.example.com' },
			configuredPublicOrigin: {
				isConfigured: true,
				isValid: true,
				source: 'default',
				isLocked: false
			},
			origins: {
				effectiveApp: 'http://internal.local',
				forwardedPair: 'https://secret-forwarded.example'
			},
			forwardedHeaders: {
				present: [
					'Forwarded',
					'X-Forwarded-For',
					'X-Forwarded-Host',
					'X-Forwarded-Proto',
					'X-Real-IP'
				],
				pair: { status: 'usable', isUsable: true, protoPresent: true, hostPresent: true }
			},
			sourceAddress: { category: 'public' },
			originComparison: {
				browserMatchesEffectiveApp: false,
				forwardedPairMatchesBrowser: false
			}
		});

		const serialized = JSON.stringify(diagnostic);
		for (const secret of [
			'secret-cookie',
			'secret-authorization',
			'secret-client',
			'203.0.113.77',
			'198.51.100.88',
			'hidden.example',
			'203.0.113.44',
			'secret-query',
			'configured-secret.example.com'
		]) {
			expect(serialized).not.toContain(secret);
		}
	});

	it.each([
		['127.0.0.1', 'loopback'],
		['[::1]', 'loopback'],
		['10.0.0.4', 'private-lan'],
		['172.20.0.4', 'docker/private-range'],
		['100.64.0.1', 'tailscale/cgnat'],
		['169.254.10.20', 'link-local'],
		['8.8.8.8', 'public'],
		['not-an-address', 'unknown']
	] as const)('classifies %s as %s without returning the raw address', (address, category) => {
		expect(classifySourceAddress(address)).toBe(category);
	});
});

type HandlerArgs = Parameters<typeof diagnosticGET>[0];

const adminLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

const userLocals = {
	user: { id: 2, plexId: 200, username: 'viewer', isAdmin: false }
} as HandlerArgs['locals'];

function runDiagnosticGET({
	locals = adminLocals,
	requestUrl = 'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fwrapped.example.com',
	effectiveUrl,
	headers = {},
	ip = '172.18.0.2'
}: {
	locals?: HandlerArgs['locals'];
	requestUrl?: string;
	effectiveUrl?: string;
	headers?: Record<string, string>;
	ip?: string;
} = {}): ReturnType<typeof diagnosticGET> {
	const request = new Request(requestUrl, { headers });
	return diagnosticGET({
		getClientAddress: () => ip,
		locals,
		request,
		url: new URL(effectiveUrl ?? requestUrl)
	} as unknown as HandlerArgs);
}

describe('GET /api/security/reverse-proxy-diagnostic', () => {
	beforeEach(async () => {
		clearRateLimitStore();
		await resetSharedTestDb();
		delete envRecord().ORIGIN;
	});

	afterEach(() => {
		delete envRecord().ORIGIN;
	});

	it.each([
		['anonymous requests with 401', {} as HandlerArgs['locals'], 401, { message: 'Unauthorized' }],
		['non-admin requests with 403', userLocals, 403, { message: 'Admin access required' }]
	] as const)('rejects %s', async (_label, locals, status, body) => {
		const response = await runDiagnosticGET({ locals });
		expect(response.status).toBe(status);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual(body);
	});

	it('returns the client-safe diagnostic contract for admins with no-store', async () => {
		const response = await runDiagnosticGET({
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com',
				'x-forwarded-for': '203.0.113.77',
				'x-real-ip': '198.51.100.88',
				forwarded: 'for=secret-client;proto=https;host=hidden.example'
			}
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		const body = await response.json();
		expect(Object.keys(body).sort()).toEqual(['action', 'facts', 'reasonCodes']);
		expect(body.action).toBe('set-origin');
		expect(body.facts.forwardedHeaders.present).toEqual([
			'Forwarded',
			'X-Forwarded-For',
			'X-Forwarded-Host',
			'X-Forwarded-Proto',
			'X-Real-IP'
		]);
		expect(body.facts.sourceAddress).toEqual({ category: 'docker/private-range' });
	});

	it('reports normalized browser, forwarded, and effective origins without a raw app origin', async () => {
		const response = await runDiagnosticGET({
			effectiveUrl:
				'https://wrapped.example.com/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fwrapped.example.com',
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			}
		});
		const body = await response.json();
		expect(body.facts.browserOrigin).toEqual({
			origin: 'https://wrapped.example.com',
			isValid: true
		});
		expect(body.facts.origins).toEqual({
			effectiveApp: 'https://wrapped.example.com',
			forwardedPair: 'https://wrapped.example.com'
		});
		expect(body.facts.origins.rawApp).toBeUndefined();
		expect(body.facts.trustProxy).toBeUndefined();
		expect(body.action).toBe('origin-matches');
	});

	it('rejects an overlong browser origin with no-store', async () => {
		const response = await runDiagnosticGET({
			requestUrl: `http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=${'a'.repeat(2049)}`
		});
		expect(response.status).toBe(400);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual({ message: 'browserOrigin is too long' });
	});

	it('does not expose credentials, client addresses, queries, or unrelated forwarding values', async () => {
		const response = await runDiagnosticGET({
			requestUrl:
				'http://internal.local/api/security/reverse-proxy-diagnostic?browserOrigin=https%3A%2F%2Fbrowser.example.com&token=secret-query',
			headers: {
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'browser.example.com',
				'x-forwarded-for': '203.0.113.77',
				'x-real-ip': '198.51.100.88',
				forwarded: 'for=secret-client;proto=https;host=hidden.example'
			},
			ip: '203.0.113.44'
		});
		const serialized = JSON.stringify(await response.json());
		for (const secret of [
			'secret-cookie',
			'secret-authorization',
			'203.0.113.77',
			'198.51.100.88',
			'secret-client',
			'hidden.example',
			'203.0.113.44',
			'secret-query'
		]) {
			expect(serialized).not.toContain(secret);
		}
	});

	it('rate limits repeated diagnostics per admin and source address', async () => {
		let response: Response | undefined;
		for (let i = 0; i < 13; i++) response = await runDiagnosticGET();
		expect(response?.status).toBe(429);
		expect(response?.headers.get('Cache-Control')).toBe('no-store');
		expect(response?.headers.get('Retry-After')).toBeTruthy();
		expect(await response?.json()).toEqual({ error: 'Too many diagnostic requests' });
	});
});
