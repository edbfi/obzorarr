import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { eq } from 'drizzle-orm';
import { isSafeReturnPath, resolveSafeReturnPath } from '$lib/client/plex-login';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { completePlexPinLogin } from '$lib/server/auth/login-completion';
import * as pinTransactions from '$lib/server/auth/pin-transactions';
import {
	clearPinTransaction,
	createPinTransaction,
	getPinTransactionForRequest,
	markPinCallbackVerified,
	verifyPinCallback
} from '$lib/server/auth/pin-transactions';
import * as plexOAuth from '$lib/server/auth/plex-oauth';
import {
	buildPlexOAuthUrl,
	checkPinStatus,
	getPinInfo,
	getPlexUserInfo,
	pollPinForToken,
	requestPin
} from '$lib/server/auth/plex-oauth';
import {
	cleanupExpiredSessions,
	createSession,
	extendSession,
	getSessionPlexToken,
	invalidateSession,
	invalidateUserSessions,
	updateUserAndSessionAdmin,
	validateSession
} from '$lib/server/auth/session';
import {
	AuthError,
	NotServerMemberError,
	PinExpiredError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	SESSION_DURATION_MS,
	SessionExpiredError
} from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { GET as plexLoginGet } from '../../../src/routes/auth/plex/+server';
import { load as redirectLoad } from '../../../src/routes/auth/plex/redirect/+page.server';
import { seedAuthUser } from '../../helpers/auth';
import { resetSharedTestDb } from '../../helpers/db';
import { createMockJsonResponse, createTestCookies } from '../../helpers/requests';

describe('auth core contracts', () => {
	describe('types and schemas', () => {
		it.each([
			['SESSION_DURATION_MS', SESSION_DURATION_MS, 7 * 24 * 60 * 60 * 1000],
			['PLEX_CLIENT_ID', PLEX_CLIENT_ID, 'obzorarr'],
			['PLEX_PRODUCT', PLEX_PRODUCT, 'Obzorarr'],
			['PLEX_VERSION', PLEX_VERSION, '1.0.0']
		] as const)('exports %s', (_name, actual, expected) => {
			expect(actual).toBe(expected);
		});

		it('preserves AuthError context', () => {
			const cause = new Error('Original error');
			const error = new AuthError('Wrapper message', 'WRAPPED', cause);

			expect(error).toBeInstanceOf(Error);
			expect(error).toMatchObject({
				message: 'Wrapper message',
				code: 'WRAPPED',
				cause,
				name: 'AuthError'
			});
		});

		it.each([
			[
				'NotServerMemberError',
				NotServerMemberError,
				'You are not a member of this Plex server.',
				'Custom not a member message',
				'NOT_SERVER_MEMBER'
			],
			[
				'PinExpiredError',
				PinExpiredError,
				'Login session expired. Sign in again.',
				'Custom PIN expired message',
				'PIN_EXPIRED'
			],
			[
				'SessionExpiredError',
				SessionExpiredError,
				'Your session expired. Sign in again.',
				'Custom session expired message',
				'SESSION_EXPIRED'
			]
		] as const)(
			'%s preserves default/custom messages, code, name, and inheritance',
			(name, ErrorClass, defaultMessage, customMessage, code) => {
				const defaultError = new ErrorClass();
				const customError = new ErrorClass(customMessage);

				expect(defaultError).toBeInstanceOf(AuthError);
				expect(defaultError).toBeInstanceOf(Error);
				expect(defaultError).toMatchObject({ message: defaultMessage, code, name });
				expect(customError.message).toBe(customMessage);
			}
		);

		it('stores Plex API error context and distinguishes concrete error classes', () => {
			const cause = new Error('Network failure');
			const apiError = new PlexAuthApiError('Request failed', 500, '/api', cause);
			const minimal = new PlexAuthApiError('Minimal error');
			const errors = [
				new NotServerMemberError(),
				new PinExpiredError(),
				new SessionExpiredError(),
				apiError
			];

			expect(apiError).toMatchObject({
				message: 'Request failed',
				code: 'PLEX_API_ERROR',
				name: 'PlexAuthApiError',
				statusCode: 500,
				endpoint: '/api',
				cause
			});
			expect(minimal.statusCode).toBeUndefined();
			expect(minimal.endpoint).toBeUndefined();
			expect(errors.every((error) => error instanceof AuthError)).toBe(true);
			expect(errors.map((error) => error.code)).toEqual([
				'NOT_SERVER_MEMBER',
				'PIN_EXPIRED',
				'SESSION_EXPIRED',
				'PLEX_API_ERROR'
			]);
			expect(errors[0]).toBeInstanceOf(NotServerMemberError);
			expect(errors[0]).not.toBeInstanceOf(SessionExpiredError);
			expect(errors[1]).toBeInstanceOf(PinExpiredError);
			expect(errors[1]).not.toBeInstanceOf(PlexAuthApiError);
		});
	});

	describe('session persistence', () => {
		beforeEach(async () => {
			await resetSharedTestDb();
			await seedAuthUser({ id: 1, plexId: 10_001, username: 'session-user' });
		});

		it('creates and validates a session joined with user identity', async () => {
			const sessionId = await createSession({ userId: 1, plexToken: 'plex-token', isAdmin: false });
			const session = await validateSession(sessionId);

			expect(session).toMatchObject({
				id: sessionId,
				userId: 1,
				plexId: 10_001,
				username: 'session-user',
				isAdmin: false,
				plexToken: 'plex-token'
			});
			expect(session?.expiresAt).toBeInstanceOf(Date);
		});

		it('invalidates expired sessions during validation', async () => {
			const sessionId = await createSession({
				userId: 1,
				plexToken: 'expired-token',
				isAdmin: false,
				durationMs: -1_000
			});

			expect(await validateSession(sessionId)).toBeNull();
			expect(await db.select().from(sessions).where(eq(sessions.id, sessionId))).toHaveLength(0);
		});

		it('returns active Plex tokens and hides expired or missing session tokens', async () => {
			const active = await createSession({ userId: 1, plexToken: 'active-token', isAdmin: false });
			const expired = await createSession({
				userId: 1,
				plexToken: 'expired-token',
				isAdmin: false,
				durationMs: -1_000
			});

			expect(await getSessionPlexToken(active)).toBe('active-token');
			expect(await getSessionPlexToken(expired)).toBeNull();
			expect(await getSessionPlexToken('missing-session')).toBeNull();
		});

		it('invalidates one session or all sessions for a user', async () => {
			const first = await createSession({ userId: 1, plexToken: 'token-1', isAdmin: false });
			const second = await createSession({ userId: 1, plexToken: 'token-2', isAdmin: false });

			await invalidateSession(first);
			expect(await validateSession(first)).toBeNull();
			expect(await validateSession(second)).not.toBeNull();

			await invalidateUserSessions(1);
			expect(await validateSession(second)).toBeNull();
		});

		it('cleans up only expired sessions', async () => {
			const active = await createSession({ userId: 1, plexToken: 'active-token', isAdmin: false });
			const expired = await createSession({
				userId: 1,
				plexToken: 'expired-token',
				isAdmin: false,
				durationMs: -1_000
			});

			await cleanupExpiredSessions();

			expect(await validateSession(active)).not.toBeNull();
			expect(await db.select().from(sessions).where(eq(sessions.id, expired))).toHaveLength(0);
		});

		it('updates admin flags together and extends existing sessions', async () => {
			const sessionId = await createSession({
				userId: 1,
				plexToken: 'admin-token',
				isAdmin: false,
				durationMs: 1_000
			});

			await updateUserAndSessionAdmin(sessionId, 1, true);
			await extendSession(sessionId, 60_000);

			const sessionRows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
			const userRows = await db.select().from(users).where(eq(users.id, 1));
			expect(sessionRows[0]?.isAdmin).toBe(true);
			expect(userRows[0]?.isAdmin).toBe(true);
			expect((await validateSession(sessionId))?.expiresAt.getTime()).toBeGreaterThan(
				Date.now() + 10_000
			);
		});
	});
});

const PIN = {
	id: 12345,
	code: 'ABCD',
	product: PLEX_PRODUCT,
	trusted: false,
	qr: 'https://plex.tv/api/v2/pins/12345/qr',
	clientIdentifier: PLEX_CLIENT_ID,
	expiresIn: 900,
	createdAt: new Date().toISOString(),
	expiresAt: new Date(Date.now() + 900000).toISOString(),
	authToken: null as string | null
};
const USER = {
	id: 67890,
	uuid: 'abc-123-def-456',
	username: 'testuser',
	email: 'test@example.com',
	title: 'Test User',
	thumb: 'https://plex.tv/users/67890/avatar'
};

const pin = (authToken: string | null = null) => ({ ...PIN, authToken });
const ok = (data: unknown) => Promise.resolve(createMockJsonResponse(data));
const httpError = (status: number) => Promise.resolve(createMockJsonResponse({}, false, status));

describe('Plex OAuth module', () => {
	let fetchMock: ReturnType<typeof spyOn>;

	beforeEach(() => {
		fetchMock = spyOn(globalThis, 'fetch').mockRejectedValue(
			new Error('Fetch not mocked for this test')
		);
	});

	afterEach(() => {
		fetchMock.mockRestore();
	});

	describe('buildPlexOAuthUrl', () => {
		it('builds Plex auth URLs with device context and optional forwardUrl', () => {
			const url = buildPlexOAuthUrl('TESTCODE', 'https://myapp.com/callback');
			const withoutForward = buildPlexOAuthUrl('TESTCODE');

			expect(url).toContain('https://app.plex.tv/auth#?');
			expect(url).toContain(`clientID=${PLEX_CLIENT_ID}`);
			expect(url).toContain('code=TESTCODE');
			expect(url).toContain(`context%5Bdevice%5D%5Bproduct%5D=${PLEX_PRODUCT}`);
			expect(url).toContain(`context%5Bdevice%5D%5Bversion%5D=${PLEX_VERSION}`);
			expect(url).toContain(`forwardUrl=${encodeURIComponent('https://myapp.com/callback')}`);
			expect(withoutForward).not.toContain('forwardUrl');
		});
	});

	describe('requestPin', () => {
		it('returns parsed PIN responses', async () => {
			fetchMock.mockImplementation(() => ok(pin()));

			expect(await requestPin()).toMatchObject({ id: 12345, code: 'ABCD', authToken: null });
		});

		it.each([
			['non-OK response', () => httpError(500)],
			['invalid schema', () => ok({ invalid: 'response' })],
			['network error', () => Promise.reject(new Error('Network error'))]
		] as const)('throws PlexAuthApiError on %s', async (_name, response) => {
			fetchMock.mockImplementation(response);

			await expect(requestPin()).rejects.toBeInstanceOf(PlexAuthApiError);
		});

		it.each([
			['status code', () => httpError(429), 'statusCode', 429],
			['endpoint', () => httpError(500), 'endpoint', '/api/v2/pins'],
			[
				'wrapped message',
				() => Promise.reject(new Error('Connection refused')),
				'message',
				'Connection refused'
			]
		] as const)('preserves %s in errors', async (_name, response, property, expected) => {
			fetchMock.mockImplementation(response);

			try {
				await requestPin();
				expect.unreachable('Expected requestPin to reject');
			} catch (error) {
				expect(error).toBeInstanceOf(PlexAuthApiError);
				expect(String((error as unknown as Record<string, unknown>)[property])).toContain(
					String(expected)
				);
			}
		});
	});

	describe('checkPinStatus', () => {
		it('returns parsed PIN responses including authToken', async () => {
			fetchMock.mockImplementation(() => ok(pin('valid-auth-token')));

			expect(await checkPinStatus(12345)).toMatchObject({
				id: 12345,
				code: 'ABCD',
				authToken: 'valid-auth-token'
			});
		});

		it.each([
			['404', () => httpError(404), PinExpiredError],
			['500', () => httpError(500), PlexAuthApiError],
			['invalid schema', () => ok({ missing: 'fields' }), PlexAuthApiError],
			['network error', () => Promise.reject(new Error('Network failure')), PlexAuthApiError],
			['non-Error rejection', () => Promise.reject('string error'), PlexAuthApiError]
		] as const)('throws %s error', async (_name, response, ErrorClass) => {
			fetchMock.mockImplementation(response);

			await expect(checkPinStatus(12345)).rejects.toBeInstanceOf(ErrorClass);
		});
	});

	describe('pollPinForToken', () => {
		it.each([
			['immediately', ['my-auth-token'], 'my-auth-token', 1],
			['after polling', [null, null, 'delayed-token'], 'delayed-token', 3]
		] as const)('returns token %s', async (_name, tokens, expected, calls) => {
			let callCount = 0;
			fetchMock.mockImplementation(() => ok(pin(tokens[callCount++] ?? null)));

			expect(await pollPinForToken(12345, { intervalMs: 10 })).toBe(expected);
			expect(callCount).toBe(calls);
		});

		it.each([
			['max attempts expire', () => ok(pin(null)), { maxAttempts: 2, intervalMs: 10 }],
			[
				'PIN expires mid-poll',
				(() => {
					let calls = 0;
					return () => (++calls >= 2 ? httpError(404) : ok(pin(null)));
				})(),
				{ maxAttempts: 5, intervalMs: 10 }
			]
		] as const)('throws PinExpiredError when %s', async (_name, response, options) => {
			fetchMock.mockImplementation(response);

			await expect(pollPinForToken(12345, options)).rejects.toBeInstanceOf(PinExpiredError);
		});

		it('uses default polling options', async () => {
			fetchMock.mockImplementation(() => ok(pin('token')));

			expect(await pollPinForToken(12345)).toBe('token');
		});
	});

	describe('getPlexUserInfo', () => {
		it('returns parsed user info including thumb', async () => {
			fetchMock.mockImplementation(() => ok(USER));

			expect(await getPlexUserInfo('valid-token')).toMatchObject({
				id: 67890,
				username: 'testuser',
				email: 'test@example.com',
				thumb: USER.thumb
			});
		});

		it('forwards a caller-provided abort signal to bound owner lookup latency', async () => {
			const signal = AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
			fetchMock.mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
				expect(init?.signal).toBe(signal);
				return Promise.reject(signal.reason);
			});

			await expect(getPlexUserInfo('valid-token', { signal })).rejects.toBeInstanceOf(
				PlexAuthApiError
			);
		});

		it.each([
			['non-OK response', () => httpError(401)],
			['invalid schema', () => ok({ id: 123 })],
			['network error', () => Promise.reject(new Error('Connection timeout'))],
			['non-Error rejection', () => Promise.reject({ code: 'TIMEOUT' })]
		] as const)('throws PlexAuthApiError on %s', async (_name, response) => {
			fetchMock.mockImplementation(response);

			await expect(getPlexUserInfo('valid-token')).rejects.toBeInstanceOf(PlexAuthApiError);
		});
	});

	describe('getPinInfo', () => {
		it('returns complete PIN info with auth URL and response expiry', async () => {
			const expiresAt = '2024-12-21T12:00:00.000Z';
			fetchMock.mockImplementation(() => ok({ ...pin(), expiresAt }));

			expect(await getPinInfo()).toMatchObject({
				pinId: 12345,
				code: 'ABCD',
				expiresAt
			});
		});

		it('generates fallback expiresAt when the response omits it', async () => {
			fetchMock.mockImplementation(() => ok({ ...pin(), expiresAt: undefined }));
			const before = Date.now();
			const result = await getPinInfo();
			const expiresTime = new Date(result.expiresAt).getTime();

			expect(result.authUrl).toContain('https://app.plex.tv/auth#?');
			expect(result.authUrl).toContain('code=ABCD');
			expect(expiresTime).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 1000);
			expect(expiresTime).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000);
		});

		it('propagates requestPin errors', async () => {
			fetchMock.mockImplementation(() => httpError(500));

			await expect(getPinInfo()).rejects.toBeInstanceOf(PlexAuthApiError);
		});
	});

	describe('error passthrough', () => {
		it.each([
			['PlexAuthApiError', requestPin, new PlexAuthApiError('Original error', 400, '/test')],
			['PinExpiredError', () => checkPinStatus(12345), new PinExpiredError()]
		] as const)('re-throws %s without wrapping', async (_name, action, originalError) => {
			fetchMock.mockImplementation(() => Promise.reject(originalError));

			try {
				await action();
				expect.unreachable('Expected passthrough error');
			} catch (error) {
				expect(error).toBe(originalError);
			}
		});
	});
});

const { load: logoutLoad, actions: logoutActions } = await import(
	'../../../src/routes/auth/logout/+page.server'
);

const FAKE_PIN = { id: 999001, code: 'WXYZ', expiresAt: '2026-06-01T00:15:00.000Z' };
const FAKE_OAUTH_URL = 'https://app.plex.tv/auth#?clientID=test&code=WXYZ&forwardUrl=fwd';
const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const NUL = String.fromCharCode(0);

type Spy = ReturnType<typeof spyOn>;

function isRedirect(thrown: unknown): thrown is { status: number; location: string } {
	return (
		typeof thrown === 'object' && thrown !== null && 'status' in thrown && 'location' in thrown
	);
}

async function expectRedirect(action: () => unknown, location: string) {
	try {
		await action();
		expect.unreachable(`Expected redirect to ${location}`);
	} catch (err) {
		expect(isRedirect(err)).toBe(true);
		if (isRedirect(err)) expect(err).toMatchObject({ status: 303, location });
	}
}

function invokePlexLoginGet(
	headers: Record<string, string>,
	recordedHeaders?: Record<string, string>
) {
	const url = new URL('http://localhost/auth/plex');
	return plexLoginGet({
		cookies: createTestCookies(),
		url,
		request: new Request(url, { headers }),
		setHeaders: (newHeaders: Record<string, string>) => {
			if (recordedHeaders) Object.assign(recordedHeaders, newHeaders);
		}
	} as unknown as Parameters<typeof plexLoginGet>[0]);
}

function redirectEvent(
	cookies: ReturnType<typeof createTestCookies>,
	state: string,
	referer?: string
) {
	const url = new URL(`http://localhost/auth/plex/redirect?state=${state}`);
	return {
		cookies,
		locals: {},
		request: new Request(url, referer ? { headers: { referer } } : undefined),
		url
	} as unknown as Parameters<typeof redirectLoad>[0];
}

const readSource = (path: string) => Bun.file(path).text();

describe('auth routes and browser login flow', () => {
	describe('logout route', () => {
		it.each([
			['GET load', 0],
			['POST action', 1]
		] as const)(
			'%s redirects to / and only POST clears the session cookie',
			async (_name, deletes) => {
				const cookies = createTestCookies({ session: 'session-abc' });
				const action =
					_name === 'GET load'
						? () => logoutLoad({ cookies } as never)
						: () =>
								logoutActions.default!({
									cookies,
									url: new URL('http://obzorarr.lan/auth/logout')
								} as never);

				await expectRedirect(action, '/');

				expect(cookies.deletes).toHaveLength(deletes);
				if (deletes)
					expect(cookies.deletes[0]).toEqual({
						name: 'session',
						options: { path: '/', secure: false }
					});
			}
		);
	});

	describe('GET /auth/plex content negotiation', () => {
		let requestPinSpy: Spy;
		let buildOAuthSpy: Spy;
		let createTxSpy: Spy;
		let parseForwardSpy: Spy;
		let appendForwardSpy: Spy;

		beforeEach(() => {
			requestPinSpy = spyOn(plexOAuth, 'requestPin').mockResolvedValue(FAKE_PIN);
			buildOAuthSpy = spyOn(plexOAuth, 'buildPlexOAuthUrl').mockReturnValue(FAKE_OAUTH_URL);
			createTxSpy = spyOn(pinTransactions, 'createPinTransaction').mockResolvedValue('state-token');
			parseForwardSpy = spyOn(pinTransactions, 'parsePinForwardUrl').mockReturnValue(
				new URL('http://localhost/auth/plex/redirect')
			);
			appendForwardSpy = spyOn(pinTransactions, 'appendPinStateToForwardUrl').mockReturnValue(
				'fwd'
			);
		});

		afterEach(() => {
			for (const spy of [
				requestPinSpy,
				buildOAuthSpy,
				createTxSpy,
				parseForwardSpy,
				appendForwardSpy
			]) {
				spy.mockRestore();
			}
		});

		it('303-redirects document navigation to Plex OAuth after minting a PIN', async () => {
			await expectRedirect(
				() => invokePlexLoginGet({ 'sec-fetch-dest': 'document' }),
				FAKE_OAUTH_URL
			);
			expect(requestPinSpy).toHaveBeenCalledTimes(1);
		});

		it('mints no PIN for link prefetches', async () => {
			const response = (await invokePlexLoginGet({
				'sec-fetch-dest': 'document',
				'sec-purpose': 'prefetch'
			})) as Response;

			expect(response.status).toBe(204);
			expect(requestPinSpy).not.toHaveBeenCalled();
			expect(createTxSpy).not.toHaveBeenCalled();
		});

		it.each([
			['XHR/fetch', { 'sec-fetch-dest': 'empty' }],
			['absent Sec-Fetch-Dest', {}]
		] as const)('returns JSON PIN payload for %s callers', async (_name, headers) => {
			const recordedHeaders: Record<string, string> = {};
			const response = (await invokePlexLoginGet(headers, recordedHeaders)) as Response;
			const body = (await response.json()) as { pinId: number; code: string; authUrl: string };

			expect(response.status).toBe(200);
			expect(body).toMatchObject({
				pinId: FAKE_PIN.id,
				code: FAKE_PIN.code,
				authUrl: FAKE_OAUTH_URL
			});
			expect(recordedHeaders['Cache-Control']).toBe('no-store');
		});
	});

	describe('Plex PIN transactions', () => {
		beforeEach(async () => {
			await resetSharedTestDb();
		});

		it('binds, verifies, and clears a PIN transaction with the browser state cookie', async () => {
			const cookies = createTestCookies();
			const state = await createPinTransaction(123, cookies);

			expect((await getPinTransactionForRequest(123, cookies))?.state).toBe(state);
			expect(await getPinTransactionForRequest(456, cookies)).toBeNull();
			expect(await getPinTransactionForRequest(123, createTestCookies())).toBeNull();
			expect(await markPinCallbackVerified(cookies, 'wrong-state')).toBe(false);
			expect((await getPinTransactionForRequest(123, cookies))?.callbackVerified).toBe(false);
			expect(await markPinCallbackVerified(cookies, state)).toBe(true);
			expect((await getPinTransactionForRequest(123, cookies))?.callbackVerified).toBe(true);

			await clearPinTransaction(cookies, state);
			expect(cookies.deletes).toHaveLength(1);
			expect(cookies.deletes[0]?.name).toBe('plex_login_state');
			const setOptions = cookies.sets[0]?.options;
			const deleteOptions = cookies.deletes[0]?.options;
			expect(deleteOptions?.path).toBe(setOptions?.path);
			expect(deleteOptions?.httpOnly).toBe(setOptions?.httpOnly);
			expect(deleteOptions?.secure).toBe(setOptions?.secure);
			expect(deleteOptions?.sameSite).toBe(setOptions?.sameSite);
		});

		it('returns a token-free server PIN fallback for verified callback state', async () => {
			const cookies = createTestCookies();
			const state = await createPinTransaction(123, cookies);
			const verified = await verifyPinCallback(cookies, state);

			expect(verified?.pinId).toBe(123);
			expect(verified?.expiresAt).toBeInstanceOf(Date);
			expect(JSON.stringify(verified)).not.toContain('token');
		});

		it.each([
			['onboarding', false, 456, 'https://app.plex.tv'],
			['landing', true, 789, undefined]
		] as const)(
			'redirect load exposes %s PIN fallback without tokens',
			async (context, onboarded, pinId, referer) => {
				if (onboarded) await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
				const cookies = createTestCookies();
				const state = await createPinTransaction(pinId, cookies);

				const result = await redirectLoad(redirectEvent(cookies, state, referer));

				expect(result).toMatchObject({
					stateVerified: true,
					serverPinFallback: { pinId, context }
				});
				expect(JSON.stringify(result)).not.toContain('token');
			}
		);

		it('does not poll Plex or create a session before callback verification', async () => {
			const cookies = createTestCookies();
			await createPinTransaction(123, cookies);

			await expect(completePlexPinLogin(123, cookies)).resolves.toEqual({ pending: true });
		});

		it('rejects PIN polling without the initiating browser transaction', async () => {
			await expect(completePlexPinLogin(123, createTestCookies())).rejects.toBeInstanceOf(
				PinExpiredError
			);
		});
	});

	describe('returnTo open-redirect protection', () => {
		it.each(['/admin/settings', '/admin', '/dashboard?tab=x', '/admin/users#section'] as const)(
			'accepts safe same-origin path %s',
			(path) => {
				expect(isSafeReturnPath(path)).toBe(true);
			}
		);

		it.each([
			'//evil.com',
			'//evil.com/admin',
			`/${BACKSLASH}evil.com`,
			`${BACKSLASH}evil`,
			`${BACKSLASH}${BACKSLASH}evil.com`,
			`/admin${BACKSLASH}evil`,
			'https://evil.com',
			'http://evil.com/admin',
			'javascript:alert(1)',
			'data:text/html,<script>',
			'',
			'admin/settings',
			'relative',
			null,
			undefined,
			42,
			`/admin${NEWLINE}/evil`,
			`/admin${TAB}x`,
			`/admin${NUL}`
		] as const)('rejects forged returnTo %p', (path) => {
			expect(isSafeReturnPath(path)).toBe(false);
		});

		it.each([
			['/admin/settings', '/admin', '/admin/settings'],
			['/dashboard', '/dashboard', '/dashboard'],
			['//evil.com', '/admin', '/admin'],
			['https://evil.com', '/dashboard', '/dashboard'],
			[`${BACKSLASH}evil`, '/admin', '/admin'],
			[null, '/admin', '/admin'],
			[undefined, '/dashboard', '/dashboard']
		] as const)('resolves %p against %s', (candidate, fallback, expected) => {
			expect(resolveSafeReturnPath(candidate, fallback)).toBe(expected);
		});
	});

	describe('returnTo source wiring guards', () => {
		it('redirect load validates returnTo before putting it in PageData', async () => {
			const source = await readSource('src/routes/auth/plex/redirect/+page.server.ts');
			expect(source).toContain("import { isSafeReturnPath } from '$lib/client/plex-login';");
			expect(source).toContain("url.searchParams.get('returnTo')");
			expect(source).toContain('isSafeReturnPath(rawReturnTo) ? rawReturnTo : null');
		});

		it('redirect page lets onboarding win and otherwise resolves the safe returnTo', async () => {
			const source = await readSource('src/routes/auth/plex/redirect/+page.svelte');
			const onboardingIdx = source.indexOf("pinData.context === 'onboarding'");
			const resolveIdx = source.indexOf('resolveSafeReturnPath(data.returnTo');

			expect(source).toContain('resolveSafeReturnPath');
			expect(onboardingIdx).toBeGreaterThan(-1);
			expect(resolveIdx).toBeGreaterThan(onboardingIdx);
		});

		it('landing page threads a validated returnTo into both auth flows', async () => {
			const source = await readSource('src/routes/+page.svelte');
			expect(source).toContain("params.get('returnTo')");
			expect(source).toContain('isSafeReturnPath(rawReturnTo)');
			expect(source).toContain('returnTo,');
			expect(source).toContain('resolveSafeReturnPath(');
		});
	});
});
