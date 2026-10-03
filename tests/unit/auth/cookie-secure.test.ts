import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
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
	it('follows the request protocol and stays Secure without a URL', () => {
		expect(isSecureRequest(new URL('https://a.example/'))).toBe(true);
		expect(isSecureRequest(new URL('http://a.example/'))).toBe(false);
		expect(isSecureRequest(new URL('http://localhost:5173/'))).toBe(false);
		expect(isSecureRequest(undefined)).toBe(true);
	});
});

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

	it('pass an explicit secure flag to every cookies.set, delete and serialize', async () => {
		let calls = 0;
		for (const file of await sourceFiles(SRC)) {
			const source = await Bun.file(file).text();
			for (const match of source.matchAll(/cookies\.(set|delete|serialize)\(/g)) {
				const line = source.slice(source.lastIndexOf('\n', match.index) + 1, match.index).trim();
				if (line.startsWith('//') || line.startsWith('*')) continue;
				calls += 1;
				// The call's arguments, up to the closing parenthesis of the statement.
				const call = source.slice(match.index, source.indexOf(');', match.index) + 2);
				expect(
					/secure|sessionCookieOptions\(|sessionCookieDeleteOptions\(|cookieOptions\(|cookieDeleteOptions\(/.test(
						call
					),
					`${file}: ${call}`
				).toBe(true);
			}
		}
		expect(calls).toBeGreaterThanOrEqual(12);
	});
});
