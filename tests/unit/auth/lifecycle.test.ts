import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as settingsService from '$lib/server/admin/settings.service';
import * as membership from '$lib/server/auth/membership';
import * as plexOauth from '$lib/server/auth/plex-oauth';
import {
	clearRevalidationEntry,
	needsRevalidation,
	type RevalidationResult,
	revalidateMembership,
	shouldRevalidateSession
} from '$lib/server/auth/revalidation';
import { NotServerMemberError, PlexAuthApiError } from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import * as onboarding from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken,
	OnboardingClaimRequiredError
} from '$lib/server/onboarding/bootstrap';
import {
	createTestApiConfig,
	createTestPlexUser,
	type RestorableSpy,
	restoreSpies
} from '../../helpers/auth';
import { resetSharedTestDb } from '../../helpers/db';
import { createTestCookies, TEST_REQUEST_URL } from '../../helpers/requests';

const SESSION_ID = 'test-session';
const PLEX_TOKEN = 'test-token';
describe('createSessionFromPlexToken', () => {
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
	it('redacts Plex and internal identifiers from the browser-facing completion response', async () => {
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const cookies = createTestCookies();
		const result = await createSessionFromPlexToken('secret-auth-token', cookies, {
			requestUrl: TEST_REQUEST_URL
		});
		expect(result).toEqual({
			user: {
				username: 'alice',
				isAdmin: false
			},
			redirectTo: '/dashboard'
		});
		expect(cookies.sets[0]?.name).toBe('session');
		const responseText = JSON.stringify(result);
		for (const forbidden of [
			'authToken',
			'token',
			'secret',
			'plexToken',
			'plexId',
			'email',
			'services',
			'accessToken',
			'clientIdentifier',
			'connections',
			'resources'
		]) {
			expect(responseText).not.toContain(forbidden);
		}
		expect(responseText).not.toContain('secret-auth-token');
		expect(responseText).not.toContain('plex-user-token-from-profile');
		expect(responseText).not.toContain('service-secret');
	});
	it('rejects first-admin creation during fresh onboarding without an active setup claim', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			)
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await expect(
			createSessionFromPlexToken('secret-auth-token', createTestCookies(), {
				requestUrl: TEST_REQUEST_URL
			})
		).rejects.toBeInstanceOf(OnboardingClaimRequiredError);
	});
	it('rejects configured-Plex onboarding login without an active setup claim', async () => {
		spies.push(spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true));
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await expect(
			createSessionFromPlexToken('secret-auth-token', createTestCookies(), {
				requestUrl: TEST_REQUEST_URL
			})
		).rejects.toBeInstanceOf(OnboardingClaimRequiredError);
		expect(await db.select().from(sessions)).toHaveLength(0);
	});
	it('rejects configured-Plex onboarding login for non-owners before creating a session', async () => {
		spies.push(spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true));
		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token, { requestUrl: TEST_REQUEST_URL })).toBe(
			'claimed'
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		try {
			await createSessionFromPlexToken('secret-auth-token', cookies, {
				requestUrl: TEST_REQUEST_URL
			});
			expect.unreachable('Expected non-owner onboarding login to be rejected');
		} catch (err) {
			expect(err).toBeInstanceOf(NotServerMemberError);
			expect((err as Error).message).toBe(
				'Only the server owner can configure Obzorarr. Sign in with the owner account.'
			);
		}
		expect(await db.select().from(sessions)).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
	});
	it('allows configured-Plex onboarding login for the server owner', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			})
		);
		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token, { requestUrl: TEST_REQUEST_URL })).toBe(
			'claimed'
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const result = await createSessionFromPlexToken('secret-auth-token', cookies, {
			requestUrl: TEST_REQUEST_URL
		});
		expect(result).toEqual({
			user: { username: 'alice', isAdmin: true },
			redirectTo: '/admin'
		});
		expect(await db.select().from(sessions)).toHaveLength(1);
	});
	it('stores accountId = 1 (local owner id) for the server owner during normal login, not the plex.tv id', async () => {
		spies.push(
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			})
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', createTestCookies(), {
			requestUrl: TEST_REQUEST_URL
		});
		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.accountId).toBe(1);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(true);
	});
	it('stores the real plex.tv id as accountId for a non-owner member during normal login', async () => {
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', createTestCookies(), {
			requestUrl: TEST_REQUEST_URL
		});
		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.accountId).toBe(12345);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(false);
	});
	it('stores accountId = 1 for the owner via the bootstrap-claim onboarding path (configured Plex)', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			})
		);
		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token, { requestUrl: TEST_REQUEST_URL })).toBe(
			'claimed'
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', cookies, {
			requestUrl: TEST_REQUEST_URL
		});
		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.accountId).toBe(1);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(true);
	});
	it('stores accountId = 1 for the owner via the bootstrap-claim onboarding path (fresh, unconfigured Plex)', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			),
			spyOn(membership, 'verifyServerOwnership').mockResolvedValue({
				isOwner: true,
				serverName: 'Owned Plex'
			})
		);
		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token, { requestUrl: TEST_REQUEST_URL })).toBe(
			'claimed'
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await createSessionFromPlexToken('secret-auth-token', cookies, {
			requestUrl: TEST_REQUEST_URL
		});
		const stored = await db.select().from(users);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.accountId).toBe(1);
		expect(stored[0]?.plexId).toBe(12345);
		expect(stored[0]?.isAdmin).toBe(true);
	});
	it('propagates unexpected setup claim renewal errors during fresh onboarding', async () => {
		const unexpectedError = new Error('claim storage failed');
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			),
			spyOn(onboarding, 'requireActiveOnboardingClaim').mockRejectedValue(unexpectedError)
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		try {
			await createSessionFromPlexToken('secret-auth-token', createTestCookies(), {
				requestUrl: TEST_REQUEST_URL
			});
			throw new Error('Expected setup claim renewal to fail');
		} catch (err) {
			expect(err).toBe(unexpectedError);
			expect(err).not.toBeInstanceOf(OnboardingClaimRequiredError);
		}
	});
	it('allows first-admin creation during fresh onboarding with an active setup claim', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(
				createTestApiConfig({
					serverUrl: '',
					token: '',
					serverUrlSource: 'default',
					tokenSource: 'default'
				})
			),
			spyOn(membership, 'verifyServerOwnership').mockResolvedValue({
				isOwner: true,
				serverName: 'Owned Plex'
			})
		);
		const cookies = createTestCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token, { requestUrl: TEST_REQUEST_URL })).toBe(
			'claimed'
		);
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const result = await createSessionFromPlexToken('secret-auth-token', cookies, {
			requestUrl: TEST_REQUEST_URL
		});
		expect(result).toEqual({
			user: { username: 'alice', isAdmin: true },
			redirectTo: '/admin'
		});
	});
});
describe('revalidation module', () => {
	let mockVerifyServerMembership: ReturnType<typeof spyOn>;
	let mockRequiresOnboarding: ReturnType<typeof spyOn>;
	beforeEach(() => {
		mockVerifyServerMembership = spyOn(membership, 'verifyServerMembership').mockImplementation(
			() => Promise.resolve({ isMember: true, isOwner: false, serverName: 'TestServer' })
		);
		mockRequiresOnboarding = spyOn(onboarding, 'requiresOnboarding').mockImplementation(() =>
			Promise.resolve(false)
		);
		clearRevalidationEntry(SESSION_ID);
	});
	afterEach(() => {
		mockVerifyServerMembership.mockRestore();
		mockRequiresOnboarding.mockRestore();
	});
	describe('needsRevalidation', () => {
		it('returns true for unknown sessions', () => {
			expect(needsRevalidation('unknown-session-id')).toBe(true);
		});
		it('returns false within the revalidation interval after a successful check', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(needsRevalidation(SESSION_ID)).toBe(false);
		});
		it('returns true after cache entry is cleared', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(needsRevalidation(SESSION_ID)).toBe(false);
			clearRevalidationEntry(SESSION_ID);
			expect(needsRevalidation(SESSION_ID)).toBe(true);
		});
	});
	describe('revalidateMembership - success', () => {
		it('returns valid when user is still a member', async () => {
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.membership.isMember).toBe(true);
				expect(result.membership.isOwner).toBe(false);
				expect(result.membership.serverName).toBe('TestServer');
			}
			expect(mockVerifyServerMembership).toHaveBeenCalledWith(PLEX_TOKEN);
		});
		it('returns valid with ownership info when user is owner', async () => {
			mockVerifyServerMembership.mockImplementation(() =>
				Promise.resolve({ isMember: true, isOwner: true, serverName: 'MyServer' })
			);
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.membership.isOwner).toBe(true);
			}
		});
		it('resets consecutive failures after a successful check', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			mockVerifyServerMembership.mockImplementation(() =>
				Promise.resolve({ isMember: true, isOwner: false, serverName: 'TestServer' })
			);
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('valid');
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			const failResult = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(failResult.status).toBe('error_within_grace');
		});
	});
	describe('revalidateMembership - revocation', () => {
		it('returns revoked when isMember is false', async () => {
			mockVerifyServerMembership.mockImplementation(() =>
				Promise.resolve({ isMember: false, isOwner: false, serverName: 'TestServer' })
			);
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('revoked');
			if (result.status === 'revoked') {
				expect(result.reason).toContain('member');
			}
		});
		it('returns revoked on PlexAuthApiError with 401 status', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new PlexAuthApiError('Unauthorized', 401, '/api/v2/resources');
			});
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('revoked');
			if (result.status === 'revoked') {
				expect(result.reason).toContain('401');
			}
		});
	});
	describe('revalidateMembership - transient errors', () => {
		it('returns error_within_grace on first network error', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('error_within_grace');
		});
		it('returns error_within_grace on network error after prior success', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('error_within_grace');
		});
		it('returns error_grace_expired after MAX_CONSECUTIVE_FAILURES (4)', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			let result: RevalidationResult | undefined;
			for (let i = 0; i < 4; i++) {
				result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			}
			expect(result!.status).toBe('error_grace_expired');
		});
		it('stays error_within_grace below MAX_CONSECUTIVE_FAILURES threshold', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			let result: RevalidationResult | undefined;
			for (let i = 0; i < 3; i++) {
				result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			}
			expect(result!.status).toBe('error_within_grace');
		});
		it('returns error_grace_expired after MAX failures even with prior success', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			mockVerifyServerMembership.mockImplementation(() => {
				throw new Error('Network error');
			});
			let result: RevalidationResult | undefined;
			for (let i = 0; i < 4; i++) {
				result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			}
			expect(result!.status).toBe('error_grace_expired');
		});
		it('treats non-401 PlexAuthApiError as transient error', async () => {
			mockVerifyServerMembership.mockImplementation(() => {
				throw new PlexAuthApiError('Internal Server Error', 500, '/api/v2/resources');
			});
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('error_within_grace');
		});
	});
	describe('revalidateMembership - deduplication', () => {
		it('deduplicates concurrent calls for the same session', async () => {
			let resolveDelay: () => void;
			const delayPromise = new Promise<void>((r) => {
				resolveDelay = r;
			});
			mockVerifyServerMembership.mockImplementation(async () => {
				await delayPromise;
				return { isMember: true, isOwner: false, serverName: 'TestServer' };
			});
			const promise1 = revalidateMembership(SESSION_ID, PLEX_TOKEN);
			const promise2 = revalidateMembership(SESSION_ID, PLEX_TOKEN);
			resolveDelay!();
			const [result1, result2] = await Promise.all([promise1, promise2]);
			expect(result1.status).toBe('valid');
			expect(result2.status).toBe('valid');
			expect(mockVerifyServerMembership).toHaveBeenCalledTimes(1);
		});
		it('allows separate calls for different sessions', async () => {
			clearRevalidationEntry('session-a');
			clearRevalidationEntry('session-b');
			let resolveA: () => void;
			let resolveB: () => void;
			const delayA = new Promise<void>((r) => {
				resolveA = r;
			});
			const delayB = new Promise<void>((r) => {
				resolveB = r;
			});
			let callCount = 0;
			mockVerifyServerMembership.mockImplementation(async () => {
				callCount++;
				if (callCount === 1) await delayA;
				else await delayB;
				return { isMember: true, isOwner: false, serverName: 'TestServer' };
			});
			const promiseA = revalidateMembership('session-a', 'token-a');
			const promiseB = revalidateMembership('session-b', 'token-b');
			resolveA!();
			resolveB!();
			await Promise.all([promiseA, promiseB]);
			expect(mockVerifyServerMembership).toHaveBeenCalledTimes(2);
			clearRevalidationEntry('session-a');
			clearRevalidationEntry('session-b');
		});
	});
	describe('shouldRevalidateSession', () => {
		beforeEach(() => {
			mockRequiresOnboarding.mockClear();
		});
		it('returns false when onboarding is still required', async () => {
			mockRequiresOnboarding.mockImplementation(() => Promise.resolve(true));
			expect(await shouldRevalidateSession()).toBe(false);
		});
		it('returns true when onboarding is complete', async () => {
			mockRequiresOnboarding.mockImplementation(() => Promise.resolve(false));
			expect(await shouldRevalidateSession()).toBe(true);
		});
		it('returns false (and does not throw) when requiresOnboarding rejects', async () => {
			mockRequiresOnboarding.mockImplementation(() => Promise.reject(new Error('db failure')));
			expect(await shouldRevalidateSession()).toBe(false);
		});
	});
	describe('clearRevalidationEntry', () => {
		it('removes cache entry so needsRevalidation returns true', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(needsRevalidation(SESSION_ID)).toBe(false);
			clearRevalidationEntry(SESSION_ID);
			expect(needsRevalidation(SESSION_ID)).toBe(true);
		});
		it('does not throw for non-existent sessions', () => {
			expect(() => clearRevalidationEntry('nonexistent')).not.toThrow();
		});
		it('allows re-revalidation after clearing', async () => {
			await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			clearRevalidationEntry(SESSION_ID);
			const result = await revalidateMembership(SESSION_ID, PLEX_TOKEN);
			expect(result.status).toBe('valid');
			expect(mockVerifyServerMembership).toHaveBeenCalledTimes(2);
		});
	});
});
describe('revalidation login-session survival regressions', () => {
	let spies: RestorableSpy[] = [];
	beforeEach(async () => {
		await resetSharedTestDb();
		clearBootstrapToken();
		spies = [];
	});
	afterEach(() => {
		restoreSpies(spies);
	});
	it('seeds the revalidation cache at session creation so the next request skips revalidation', async () => {
		spies.push(
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue(createTestApiConfig()),
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: true,
				serverName: 'Test Plex'
			}),
			spyOn(plexOauth, 'getPlexUserInfo').mockResolvedValue(
				createTestPlexUser({
					username: 'owner',
					email: 'owner@example.com',
					thumb: undefined,
					authToken: 'plex-user-token',
					services: []
				})
			)
		);
		const cookies = createTestCookies();
		expect(
			await claimOnboardingInstance(cookies, createBootstrapToken(), {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('claimed');
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const result = await createSessionFromPlexToken('owner-auth-token', cookies, {
			requestUrl: TEST_REQUEST_URL
		});
		const sessionId = cookies.get('session') as string;
		expect(result.user.isAdmin).toBe(true);
		expect(sessionId).toBeTruthy();
		expect(needsRevalidation(sessionId)).toBe(false);
		clearRevalidationEntry(sessionId);
	});
	it.each([
		[
			'transient identity reachability blip',
			'sess-grace-transient',
			() =>
				Promise.resolve({
					isMember: false,
					isOwner: false,
					reason: 'not_reachable' as const,
					identityErrorReason: 'Connection timed out'
				}),
			'error_within_grace'
		],
		[
			'genuine non-membership',
			'sess-not-in-resources',
			() =>
				Promise.resolve({
					isMember: false,
					isOwner: false,
					reason: 'not_in_resources' as const
				}),
			'revoked'
		],
		[
			'invalid Plex token',
			'sess-401',
			() => Promise.reject(new PlexAuthApiError('Unauthorized', 401, '/identity')),
			'revoked'
		]
	] as const)('%s yields %s', async (_name, sessionId, membershipResult, expectedStatus) => {
		clearRevalidationEntry(sessionId);
		spies.push(spyOn(membership, 'verifyServerMembership').mockImplementation(membershipResult));
		const result = await revalidateMembership(sessionId, 'plex-token');
		expect(result.status).toBe(expectedStatus);
		if (_name === 'transient identity reachability blip') expect(result.status).not.toBe('revoked');
		clearRevalidationEntry(sessionId);
	});
});
