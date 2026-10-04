import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
	AppSettingsKey,
	getAppSetting,
	getCachedServerName,
	setAppSetting
} from '$lib/server/admin/settings.service';
import * as sessionModule from '$lib/server/auth/session';
import { ONBOARDING_CLAIM_REQUIRED_MESSAGE } from '$lib/server/onboarding/bootstrap';
import { env } from '$lib/server/private-env';
import { POST as selectServerPost } from '../../../src/routes/api/onboarding/select-server/+server';
import { GET as serversGet } from '../../../src/routes/api/onboarding/servers/+server';
import { POST as testConnectionPost } from '../../../src/routes/api/onboarding/test-connection/+server';
import {
	claimOnboardingCookies,
	createJsonRequest,
	createOnboardingCookies,
	createPlexIdentityResponse,
	createPlexResourcesResponse,
	createThrowingOnboardingCookies,
	expectHttpError,
	expectUnexpectedClaimError,
	type OnboardingTestCookies,
	onboardingAdminLocals,
	resetOnboardingTestState,
	setOnboardingSessionCookie
} from '../../helpers/onboarding';

type SelectServerArgs = Parameters<typeof selectServerPost>[0];
type ServersArgs = Parameters<typeof serversGet>[0];
type TestConnectionArgs = Parameters<typeof testConnectionPost>[0];

let cookies: OnboardingTestCookies;
let fetchSpy: ReturnType<typeof spyOn> | undefined;
let getSessionPlexTokenSpy: ReturnType<typeof spyOn> | undefined;

const adminLocals = onboardingAdminLocals as SelectServerArgs['locals'] &
	ServersArgs['locals'] &
	TestConnectionArgs['locals'];

beforeEach(async () => {
	await resetOnboardingTestState();
	cookies = await claimOnboardingCookies();
});

afterEach(() => {
	fetchSpy?.mockRestore();
	getSessionPlexTokenSpy?.mockRestore();
	fetchSpy = undefined;
	getSessionPlexTokenSpy = undefined;
});

function runSelectServerPost(
	body: unknown,
	testCookies: SelectServerArgs['cookies'] = cookies
): ReturnType<typeof selectServerPost> {
	const request = createJsonRequest('/api/onboarding/select-server', body);
	return selectServerPost({
		request,
		url: new URL(request.url),
		locals: adminLocals,
		cookies: testCookies
	} as unknown as SelectServerArgs);
}

function runServersGet(
	locals: ServersArgs['locals'],
	testCookies: ServersArgs['cookies'] = cookies
): ReturnType<typeof serversGet> {
	return serversGet({
		cookies: testCookies,
		locals,
		url: new URL('http://localhost/api/onboarding/servers')
	} as unknown as ServersArgs);
}

function runTestConnectionPost(
	body: unknown,
	testCookies: TestConnectionArgs['cookies'] = cookies,
	locals: TestConnectionArgs['locals'] = adminLocals
): ReturnType<typeof testConnectionPost> {
	const request = createJsonRequest('/api/onboarding/test-connection', body);
	return testConnectionPost({
		request,
		url: new URL(request.url),
		locals,
		cookies: testCookies
	} as unknown as TestConnectionArgs);
}

function hasIdentityFetchWithToken(token: string) {
	const calls = fetchSpy?.mock.calls as Array<[string | URL | Request, RequestInit | undefined]>;
	return calls.some(([input, init]) => {
		const headers = init?.headers as Record<string, string> | undefined;
		return input === 'http://plex.local:32400/identity' && headers?.['X-Plex-Token'] === token;
	});
}

function plexServerResource(accessToken = 'server-token-secret') {
	return {
		name: 'Home Server',
		product: 'Plex Media Server',
		provides: 'server',
		owned: true,
		clientIdentifier: 'abc123',
		accessToken
	};
}

describe('onboarding API endpoint claim/auth guards', () => {
	it.each([
		[
			'GET /api/onboarding/servers',
			() => runServersGet({} as ServersArgs['locals']),
			ONBOARDING_CLAIM_REQUIRED_MESSAGE
		],
		[
			'POST /api/onboarding/select-server',
			() =>
				runSelectServerPost({
					serverUrl: 'https://plex.example.com:32400',
					accessToken: 'legacy-token',
					serverName: 'Legacy Server'
				}),
			ONBOARDING_CLAIM_REQUIRED_MESSAGE
		],
		[
			'POST /api/onboarding/test-connection',
			() =>
				runTestConnectionPost({
					url: 'https://plex.example.com:32400',
					accessToken: 'abc'
				}),
			ONBOARDING_CLAIM_REQUIRED_MESSAGE
		]
	] as const)('%s returns the shared claim-required error', async (_name, action, message) => {
		cookies = createOnboardingCookies();
		try {
			await action();
			expect.unreachable('Expected error to be thrown');
		} catch (error) {
			expectHttpError(error, 403, message);
		}
	});

	it.each([
		[
			'GET /api/onboarding/servers',
			(error: Error) => runServersGet(adminLocals, createThrowingOnboardingCookies(error))
		],
		[
			'POST /api/onboarding/select-server',
			(error: Error) =>
				runSelectServerPost(
					{
						serverUrl: 'https://plex.example.com:32400',
						accessToken: 'legacy-token',
						serverName: 'Legacy Server'
					},
					createThrowingOnboardingCookies(error)
				)
		],
		[
			'POST /api/onboarding/test-connection',
			(error: Error) =>
				runTestConnectionPost(
					{ url: 'https://plex.example.com:32400', accessToken: 'abc' },
					createThrowingOnboardingCookies(error)
				)
		]
	] as const)('%s propagates unexpected claim errors', async (_name, action) => {
		const unexpected = new Error('raw database path should stay server-side');
		try {
			await action(unexpected);
			expect.unreachable('Expected unexpected claim error to be thrown');
		} catch (error) {
			expectUnexpectedClaimError(error, unexpected);
		}
	});

	it('GET /api/onboarding/servers returns 401 when claim passes but request is unauthenticated', async () => {
		try {
			await runServersGet({} as ServersArgs['locals']);
			expect.unreachable('Expected error to be thrown');
		} catch (error) {
			expectHttpError(error, 401);
		}
	});

	it('GET /api/onboarding/servers returns 403 when the user is not an admin', async () => {
		const locals = {
			user: { id: 1, plexId: 100, username: 'nonadmin', isAdmin: false }
		} as ServersArgs['locals'];

		try {
			await runServersGet(locals);
			expect.unreachable('Expected error to be thrown');
		} catch (error) {
			expectHttpError(error, 403, 'Only server owners can configure Obzorarr');
		}
	});
});

describe('GET /api/onboarding/servers', () => {
	it('returns a sanitized Plex server list for authenticated admins', async () => {
		const publicUri = 'https://plex.example.plex.direct:32400';
		const resources = [
			{
				...plexServerResource(),
				connections: [
					{
						protocol: 'https',
						address: 'plex.example.plex.direct',
						port: 32400,
						uri: publicUri,
						local: false,
						relay: false
					},
					{
						protocol: 'http',
						address: '192.168.1.10',
						port: 32400,
						uri: 'http://192.168.1.10:32400',
						local: true,
						relay: false
					}
				]
			}
		];

		getSessionPlexTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue(
			'test-plex-token'
		);
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createPlexResourcesResponse(resources));

		const response = await runServersGet(
			adminLocals,
			setOnboardingSessionCookie(cookies, 'session-id')
		);
		expect(response.status).toBe(200);

		const body = (await response.json()) as {
			servers: Array<{
				name: string;
				clientIdentifier: string;
				bestConnectionUrl: string | null;
				accessToken?: string;
				authToken?: string;
				token?: string;
			}>;
		};

		expect(body.servers).toHaveLength(1);
		expect(body.servers[0]).toMatchObject({
			name: 'Home Server',
			clientIdentifier: 'abc123',
			bestConnectionUrl: publicUri
		});
		expect(body.servers[0]?.accessToken).toBeUndefined();
		expect(body.servers[0]?.authToken).toBeUndefined();
		expect(body.servers[0]?.token).toBeUndefined();
		expect(JSON.stringify(body)).not.toContain('server-token-secret');
	});
});

describe('POST /api/onboarding/select-server', () => {
	it('stores a server token resolved from clientIdentifier without returning token fields', async () => {
		getSessionPlexTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue(
			'admin-session-token'
		);
		fetchSpy = spyOn(global, 'fetch')
			.mockResolvedValueOnce(createPlexResourcesResponse([plexServerResource()]))
			.mockResolvedValueOnce(createPlexIdentityResponse());

		const response = await runSelectServerPost(
			{
				serverUrl: 'http://plex.local:32400',
				allowInsecureLocalHttp: true,
				clientIdentifier: 'abc123',
				serverName: 'Home Server'
			},
			setOnboardingSessionCookie(cookies, 'test-session-id')
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			success: boolean;
			serverName?: string;
			accessToken?: string;
			token?: string;
			authToken?: string;
		};
		expect(body.success).toBe(true);
		expect(body.serverName).toBe('Home Server');
		expect(body.accessToken).toBeUndefined();
		expect(body.token).toBeUndefined();
		expect(body.authToken).toBeUndefined();
		expect(JSON.stringify(body)).not.toContain('server-token-secret');
		expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('server-token-secret');
		expect(await getCachedServerName()).toBe('Home Server');
		expect(await getAppSetting(AppSettingsKey.SERVER_MACHINE_ID)).toBe('a'.repeat(32));
		expect(await getAppSetting(AppSettingsKey.PLEX_AUTHORITY_EPOCH)).toBe('1');
		expect(await getAppSetting(AppSettingsKey.PLEX_IDENTITY_PROOF)).toBeNull();
	});

	it('keeps legacy accessToken compatibility', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createPlexIdentityResponse());

		const response = await runSelectServerPost({
			serverUrl: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'legacy-token',
			serverName: 'Legacy Server'
		});

		expect(response.status).toBe(200);
		expect(((await response.json()) as { success: boolean }).success).toBe(true);
		expect(await getAppSetting(AppSettingsKey.PLEX_TOKEN)).toBe('legacy-token');
	});

	it('rejects unchecked local HTTP URLs instead of relying on stored opt-in', async () => {
		const dynamicEnv = env as Record<string, string | undefined>;
		const previousAllowInsecure = dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP;
		dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = undefined;

		try {
			await setAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP, 'true');
			fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createPlexIdentityResponse());

			const response = await runSelectServerPost({
				serverUrl: 'http://plex.local:32400',
				allowInsecureLocalHttp: false,
				accessToken: 'legacy-token',
				serverName: 'Legacy Server'
			});

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				success: false,
				error: 'HTTP Plex URLs require a local/private host and explicit local HTTP opt-in.'
			});
			expect(await getAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP)).toBe('true');
		} finally {
			dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = previousAllowInsecure;
		}
	});
});

describe('POST /api/onboarding/test-connection', () => {
	it.each([
		['canonical accessToken', { accessToken: 'plex-token-abc' }, 'plex-token-abc'],
		['legacy token alias', { token: 'plex-token-xyz' }, 'plex-token-xyz']
	] as const)('accepts the %s field', async (_name, tokenField, expectedToken) => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createPlexIdentityResponse());

		const response = await runTestConnectionPost({
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			...tokenField
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { success: boolean; serverName?: string };
		expect(body.success).toBe(true);
		if ('accessToken' in tokenField) expect(body.serverName).toBe('Test Server');
		expect(hasIdentityFetchWithToken(expectedToken)).toBe(true);
	});

	it('resolves a token server-side from clientIdentifier without echoing token fields', async () => {
		getSessionPlexTokenSpy = spyOn(sessionModule, 'getSessionPlexToken').mockResolvedValue(
			'admin-session-token'
		);
		fetchSpy = spyOn(global, 'fetch')
			.mockResolvedValueOnce(createPlexResourcesResponse([plexServerResource()]))
			.mockResolvedValueOnce(createPlexIdentityResponse());

		const response = await runTestConnectionPost(
			{
				url: 'http://plex.local:32400',
				allowInsecureLocalHttp: true,
				clientIdentifier: 'abc123'
			},
			setOnboardingSessionCookie(cookies, 'test-session-id')
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			success: boolean;
			accessToken?: string;
			token?: string;
		};
		expect(body.success).toBe(true);
		expect(body.accessToken).toBeUndefined();
		expect(body.token).toBeUndefined();
		expect(hasIdentityFetchWithToken('server-token-secret')).toBe(true);
	});

	it.each([
		['missing token source', { url: 'http://plex.local:32400' }, 400, 'Access token'],
		['invalid request schema', { url: 'not-a-url', accessToken: 'abc' }, 400, undefined]
	] as const)('returns %s as %s', async (_name, body, status, message) => {
		const response = await runTestConnectionPost(body);
		expect(response.status).toBe(status);
		const payload = (await response.json()) as { success: boolean; error?: string };
		expect(payload.success).toBe(false);
		if (message) expect(payload.error).toContain(message);
	});

	it.each([
		['401 from Plex', new Response('Unauthorized', { status: 401 }), 401, 'Authentication failed'],
		['non-OK upstream', new Response('boom', { status: 503 }), 502, undefined],
		[
			'non-Plex schema mismatch',
			new Response(JSON.stringify({ unexpected: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}),
			422,
			'Plex Media Server'
		],
		[
			'invalid JSON body',
			new Response('<html>Gateway</html>', { status: 200 }),
			422,
			'Plex Media Server'
		]
	] as const)('maps %s to %s', async (_name, upstream, status, message) => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(upstream);
		const response = await runTestConnectionPost({
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'abc'
		});

		expect(response.status).toBe(status);
		const body = (await response.json()) as { success: boolean; error?: string };
		expect(body.success).toBe(false);
		if (message) expect(body.error).toContain(message);
	});

	it('returns 503 when fetch throws', async () => {
		fetchSpy = spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

		const response = await runTestConnectionPost({
			url: 'http://plex.local:32400',
			allowInsecureLocalHttp: true,
			accessToken: 'abc'
		});

		expect(response.status).toBe(503);
		expect(((await response.json()) as { success: boolean }).success).toBe(false);
	});
});
