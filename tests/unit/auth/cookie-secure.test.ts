import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Cookies } from '@sveltejs/kit';
import * as settingsService from '$lib/server/admin/settings.service';
import { logout } from '$lib/server/auth/logout';
import * as membership from '$lib/server/auth/membership';
import { clearPinTransaction, createPinTransaction } from '$lib/server/auth/pin-transactions';
import * as plexOauth from '$lib/server/auth/plex-oauth';
import * as onboarding from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	clearOnboardingClaimCookie,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { isSecureRequest } from '$lib/server/security/cookie-security';
import {
	createTestApiConfig,
	createTestPlexUser,
	type RestorableSpy,
	restoreSpies
} from '../../helpers/auth';
import { resetSharedTestDb } from '../../helpers/db';
import { createTestCookies } from '../../helpers/requests';

// M13: every cookie the app sets or deletes is Secure exactly when the request's public
// origin is https. Browsers refuse a Secure cookie, and a Secure deletion, over plain HTTP
// outside loopback, so a plain-HTTP deployment (ORIGIN=http://<LAN address>) must get
// non-Secure cookies to sign in and out.

const SCHEMES = [
	['https', new URL('https://obzorarr.example/auth/plex'), true],
	['plain http', new URL('http://obzorarr.lan:3000/auth/plex'), false]
] as const;

describe('isSecureRequest', () => {
	it('follows the request protocol', () => {
		expect(isSecureRequest(new URL('https://a.example/'))).toBe(true);
		expect(isSecureRequest(new URL('http://a.example/'))).toBe(false);
		expect(isSecureRequest(new URL('http://localhost:5173/'))).toBe(false);
	});

	it('has no Secure fallback when a caller has no request URL', () => {
		// A missing URL used to give `secure: true`, which a browser refuses on plain HTTP, so a
		// caller that forgot the URL broke sign-in or sign-out there silently.
		expect(() => isSecureRequest(undefined as unknown as URL)).toThrow(TypeError);
	});
});

// Type-level: every function that decides a cookie's Secure flag requires the request URL.
// Never called; `bun run check` fails if one of these lines compiles, that is, if the URL
// became optional again.
async function _theRequestUrlIsRequired(cookies: Cookies): Promise<void> {
	const { createSessionFromPlexToken, completePlexPinLogin } = await import(
		'$lib/server/auth/login-completion'
	);
	const { renewOnboardingClaim, requireActiveOnboardingClaim } = await import(
		'$lib/server/onboarding/bootstrap'
	);
	// @ts-expect-error the request URL is required
	isSecureRequest(undefined);
	// @ts-expect-error the request URL is required
	await logout(cookies);
	// @ts-expect-error the request URL is required
	await createPinTransaction(1, cookies);
	// @ts-expect-error the request URL is required
	await clearPinTransaction(cookies, 'state');
	// @ts-expect-error the request URL is required
	clearOnboardingClaimCookie(cookies);
	// @ts-expect-error the request URL is required
	await claimOnboardingInstance(cookies, 'token');
	// @ts-expect-error the request URL is required
	await claimOnboardingInstance(cookies, 'token', {});
	// @ts-expect-error the request URL is required
	await renewOnboardingClaim(cookies);
	// @ts-expect-error the request URL is required
	await requireActiveOnboardingClaim(cookies);
	// @ts-expect-error the request URL is required
	await createSessionFromPlexToken('token', cookies);
	// @ts-expect-error the request URL is required
	await completePlexPinLogin(1, cookies);
}
void _theRequestUrlIsRequired;

describe('cookie Secure flag per request scheme', () => {
	let spies: RestorableSpy[] = [];

	beforeEach(async () => {
		await resetSharedTestDb();
		clearBootstrapToken();
		spies = [
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(createTestApiConfig()),
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(false),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: false,
				serverName: 'Test Plex'
			}),
			spyOn(plexOauth, 'getPlexUserInfo').mockResolvedValue(createTestPlexUser())
		];
	});

	afterEach(() => {
		restoreSpies(spies);
	});

	for (const [label, url, secure] of SCHEMES) {
		it(`sets the login session cookie with secure=${secure} over ${label}`, async () => {
			const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
			const cookies = createTestCookies();
			await createSessionFromPlexToken('fake-auth-token', cookies, { requestUrl: url });

			const session = cookies.sets.find((entry) => entry.name === 'session');
			expect(session?.options).toMatchObject({
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure
			});
		});

		it(`sets and deletes the PIN state cookie with secure=${secure} over ${label}`, async () => {
			const cookies = createTestCookies();
			const state = await createPinTransaction(4242, cookies, url);
			await clearPinTransaction(cookies, state, url);

			expect(cookies.sets[0]).toMatchObject({
				name: 'plex_login_state',
				options: { path: '/', httpOnly: true, sameSite: 'lax', secure }
			});
			expect(cookies.deletes[0]).toEqual({
				name: 'plex_login_state',
				options: { path: '/', httpOnly: true, sameSite: 'lax', secure }
			});
		});

		it(`sets and deletes the onboarding claim cookie with secure=${secure} over ${label}`, async () => {
			const cookies = createTestCookies();
			expect(
				await claimOnboardingInstance(cookies, createBootstrapToken(), { requestUrl: url })
			).toBe('claimed');
			clearOnboardingClaimCookie(cookies, url);

			expect(cookies.sets[0]?.options).toMatchObject({ path: '/', httpOnly: true, secure });
			expect(cookies.deletes.at(-1)?.options).toEqual({ path: '/', secure });
		});

		it(`deletes the session cookie on logout with secure=${secure} over ${label}`, async () => {
			const cookies = createTestCookies({ session: 'fake-session-id' });
			await logout(cookies, url);
			expect(cookies.deletes).toEqual([{ name: 'session', options: { path: '/', secure } }]);
		});
	}
});

describe('cookie call sites', () => {
	const SRC = join(import.meta.dir, '..', '..', '..', 'src');

	async function sourceFiles(dir: string): Promise<string[]> {
		const entries = await readdir(dir, { withFileTypes: true });
		const nested = await Promise.all(
			entries.map((entry) => {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) return sourceFiles(path);
				return /\.(ts|js)$/.test(entry.name) ? [path] : [];
			})
		);
		return nested.flat();
	}

	// The options helpers a cookie call may use instead of an inline `secure: isSecureRequest(…)`.
	const OPTION_HELPERS = [
		'sessionCookieOptions',
		'sessionCookieDeleteOptions',
		'cookieOptions',
		'cookieDeleteOptions'
	];
	const derivesSecure = (code: string) =>
		/secure: isSecureRequest\(/.test(code) ||
		OPTION_HELPERS.some((name) => new RegExp(`\\b${name}\\(`).test(code));

	it('derive the secure flag of every cookies.set, delete and serialize from the request', async () => {
		let calls = 0;
		for (const file of await sourceFiles(SRC)) {
			const source = await Bun.file(file).text();
			for (const match of source.matchAll(/cookies\.(set|delete|serialize)\(/g)) {
				const line = source.slice(source.lastIndexOf('\n', match.index) + 1, match.index).trim();
				if (line.startsWith('//') || line.startsWith('*')) continue;
				calls += 1;
				// The call's arguments, up to the closing parenthesis of the statement.
				const call = source.slice(match.index, source.indexOf(');', match.index) + 2);
				expect(derivesSecure(call), `${file}: ${call}`).toBe(true);
			}
		}
		expect(calls).toBeGreaterThanOrEqual(12);
	});

	it('define every options helper with secure: isSecureRequest(…)', async () => {
		const definitions = new Map<string, string[]>();
		for (const file of await sourceFiles(SRC)) {
			const source = await Bun.file(file).text();
			for (const name of OPTION_HELPERS) {
				for (const match of source.matchAll(new RegExp(`function ${name}\\(`, 'g'))) {
					const body = source.slice(match.index, source.indexOf('\n}', match.index) + 2);
					definitions.set(name, [...(definitions.get(name) ?? []), `${file}: ${body}`]);
				}
			}
		}
		for (const name of OPTION_HELPERS) {
			const bodies = definitions.get(name) ?? [];
			expect(bodies.length, name).toBeGreaterThan(0);
			for (const body of bodies) {
				// Directly, or by spreading another helper that does (cookieDeleteOptions).
				expect(derivesSecure(body.slice(body.indexOf('{'))), body).toBe(true);
			}
		}
	});

	it('set no fixed or environment-derived secure flag anywhere', async () => {
		for (const file of await sourceFiles(SRC)) {
			const source = await Bun.file(file).text();
			for (const match of source.matchAll(/\bsecure:\s*([^,\n}]+)/g)) {
				const line = source.slice(source.lastIndexOf('\n', match.index) + 1, match.index).trim();
				if (line.startsWith('//') || line.startsWith('*')) continue;
				expect(match[1]?.trim(), `${file}: ${match[0]}`).toMatch(/^isSecureRequest\(/);
			}
		}
	});
});
