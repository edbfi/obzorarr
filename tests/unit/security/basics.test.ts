import { beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { isAdminRouteId, requireAdminAction } from '$lib/server/auth/guards';
import { csrfHandle } from '$lib/server/security/csrf-handle';
import { isBlockedPath, isBlockedUserAgent } from '$lib/server/security/request-filter-patterns';
import { applySecurityHeaders } from '$lib/server/security/security-headers';

// @migration-task svelte.config was removed; switch to `import { loadConfig } from '@sveltejs/load-config'` to read your config
import config from '../../../svelte.config.js';
import { resetSharedTestDb } from '../../helpers/db';

const readSource = (path: string) => Bun.file(path).text();

function makeCsrfEvent(options: { method: string; url: string; origin?: string }) {
	const headers = new Headers();
	if (options.origin !== undefined) headers.set('origin', options.origin);
	const request = new Request(options.url, { method: options.method, headers });
	return {
		request,
		url: new URL(options.url),
		route: { id: null }
	} as unknown as Parameters<typeof csrfHandle>[0]['event'];
}

async function invokeCsrf(event: ReturnType<typeof makeCsrfEvent>): Promise<Response> {
	const result = await csrfHandle({
		event,
		resolve: async () => new Response('resolved', { status: 200 })
	} as unknown as Parameters<typeof csrfHandle>[0]);
	return result as Response;
}

describe('security configuration and guard basics', () => {
	describe('CSP configuration', () => {
		it('allows Plex and Gravatar avatar image sources', () => {
			const imgSrc = config.kit?.csp?.directives?.['img-src'];

			expect(imgSrc).toBeDefined();
			expect(Array.isArray(imgSrc)).toBe(true);
			expect(imgSrc).toEqual(
				expect.arrayContaining([
					'self',
					'https://plex.tv',
					'https://*.plex.direct',
					'https://secure.gravatar.com',
					'data:'
				])
			);
		});
	});

	describe('request filter patterns', () => {
		it.each([
			['/.env', true],
			['/.git/config', true],
			['/wp-admin', true],
			['/admin', false]
		] as const)('classifies path %s as blocked=%s', (path, blocked) => {
			expect(isBlockedPath(path)).toBe(blocked);
		});

		it.each([
			['Mozilla/5.0 nuclei', true],
			['sqlmap/1.8', true],
			['Mozilla/5.0 Safari/605.1.15', false]
		] as const)('classifies user agent %s as blocked=%s', (userAgent, blocked) => {
			expect(isBlockedUserAgent(userAgent)).toBe(blocked);
		});
	});

	describe('security headers', () => {
		const freshResponse = () => new Response('ok');

		it('sets common hardening headers regardless of protocol', () => {
			const response = applySecurityHeaders(freshResponse(), false);

			expect(response.headers.get('X-Frame-Options')).toBe('DENY');
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
			expect(response.headers.get('Permissions-Policy')).toBe(
				'camera=(), microphone=(), geolocation=()'
			);
		});

		it.each([
			[false, null],
			[true, 'max-age=31536000; includeSubDomains']
		] as const)('sets HSTS=%p when isHttps=%s', (isHttps, expected) => {
			const response = applySecurityHeaders(freshResponse(), isHttps);
			expect(response.headers.get('Strict-Transport-Security')).toBe(expected);
		});
	});

	describe('admin auth guards', () => {
		it.each([
			['/admin', true],
			['/admin/logs/stream', true],
			['/%61dmin/logs/stream', false],
			['/dashboard', false],
			[null, false]
		] as const)('identifies admin route id %p as %s', (routeId, expected) => {
			expect(isAdminRouteId(routeId)).toBe(expected);
		});

		it.each([
			[{}, 403],
			[{ user: { id: 1, plexId: 1, username: 'u', isAdmin: false } }, 403],
			[{ user: { id: 1, plexId: 1, username: 'u', isAdmin: true } }, null]
		] as const)('requires admin locals for admin actions: %p', (locals, status) => {
			expect(requireAdminAction(locals as App.Locals)?.status ?? null).toBe(status);
		});
	});

	describe('hooks source guards', () => {
		it('keeps anonymous admin probes returnTo-safe and non-admin probes dashboard-only', async () => {
			const source = await readSource('src/hooks.server.ts');
			const handlerStart = source.indexOf('const authorizationHandle');
			expect(handlerStart).toBeGreaterThan(-1);
			const handlerSlice = source.slice(handlerStart, handlerStart + 1600);

			expect(source).toContain("import { isSafeReturnPath } from '$lib/client/plex-login';");
			expect(handlerSlice).toContain('if (event.locals.user) {');
			expect(handlerSlice).toContain("return redirectResponse(event, '/dashboard');");
			expect(handlerSlice).toContain('const requestedPath = event.url.pathname;');
			expect(handlerSlice).toContain('isSafeReturnPath(requestedPath)');
			expect(handlerSlice).toContain('/?returnTo=');
			expect(handlerSlice).toContain('encodeURIComponent(requestedPath)');
		});

		it('does not pass request-derived origin to the onboarding bootstrap banner', async () => {
			const source = await readSource('src/hooks.server.ts');

			expect(source).toContain('await printOnboardingBootstrapBanner();');
			expect(source).not.toContain('printOnboardingBootstrapBanner(event.url.origin');
		});
	});

	describe('dogfood CSRF and auth source guards', () => {
		beforeEach(resetSharedTestDb);

		it.each([
			['missing origin', undefined, ['missing origin', 'CSRF check']],
			['origin mismatch', 'https://attacker.example', ['mismatch', 'CSRF check']]
		] as const)('keeps the CSRF 403 body generic for %s', async (_name, origin, forbidden) => {
			await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://example.com');

			const response = await invokeCsrf(
				makeCsrfEvent({
					method: 'POST',
					url: 'https://example.com/admin/settings',
					origin
				})
			);

			expect(response.status).toBe(403);
			const body = await response.json();
			expect(body).toEqual({ error: 'Forbidden' });
			for (const text of forbidden) expect(JSON.stringify(body)).not.toContain(text);
		});

		it('keeps the Plex popup path free of token-bearing postMessage/logging patterns', async () => {
			const [plexLogin, authMode] = await Promise.all([
				readSource('src/lib/client/plex-login.ts'),
				readSource('src/lib/client/auth-mode.ts')
			]);

			expect(plexLogin).not.toContain('AUTH_COMPLETE');
			expect(plexLogin).not.toMatch(/console\.(log|warn|error|info)\s*\(/);
			expect(authMode).not.toContain('AUTH_COMPLETE');
			expect(authMode).not.toContain('postMessage');
		});
	});
});
