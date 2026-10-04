import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	AppSettingsKey,
	getPublicLandingLookupEnabled,
	setPublicLandingLookupEnabled
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import {
	appSettings,
	playHistory,
	plexAccounts,
	shareSettings,
	users
} from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import { buildPlexIdentityProofValue } from '$lib/server/plex/account-reconciliation';
import {
	isValidSlugFormat,
	resolveSlug,
	setGlobalShareDefaults
} from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import type { LiveSyncResult } from '$lib/server/sync/live-sync';
import * as liveSync from '$lib/server/sync/live-sync';
import { load as loadWrapped } from '../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { seedPlexAuthorityForTests } from '../helpers/sharing';

let liveSyncResult: LiveSyncResult = {
	triggered: false,
	syncInProgress: false,
	reason: 'disabled'
};
let liveSyncCalls: string[] = [];

let triggerLiveSyncSpy: ReturnType<typeof spyOn<typeof liveSync, 'triggerLiveSyncIfNeeded'>>;

const { actions, load } = await import('../../src/routes/+page.server');
type LookupAction = NonNullable<typeof actions.lookupUser>;
type LandingLoad = typeof load;

const USER_ID = 42;
const YEAR = new Date().getFullYear();

interface CookieCall {
	name: string;
	value: string;
	options?: unknown;
}

interface TestCookies {
	sets: CookieCall[];
	set: (name: string, value: string, options?: unknown) => void;
}

async function seedUser(mode?: (typeof ShareMode)[keyof typeof ShareMode]): Promise<void> {
	const confirmedAt = Date.now();
	await seedPlexAuthorityForTests();
	await db.insert(plexAccounts).values({
		accountId: 123,
		plexId: 456,
		username: 'alice',
		isOwner: false,
		updatedAt: new Date(confirmedAt)
	});
	await db.insert(users).values({
		id: USER_ID,
		plexId: 456,
		accountId: 123,
		username: 'alice',
		isAdmin: false
	});
	await db.insert(playHistory).values({
		historyKey: 'landing-lookup-history',
		ratingKey: 'landing-lookup-history',
		title: 'Landing lookup history',
		type: 'movie',
		viewedAt: Math.floor(Date.UTC(YEAR, 0, 2) / 1000),
		accountId: 123,
		librarySectionId: 1
	});
	await db.insert(appSettings).values({
		key: AppSettingsKey.PLEX_IDENTITY_PROOF,
		value: await buildPlexIdentityProofValue('machine-test', confirmedAt),
		updatedAt: new Date(confirmedAt)
	});

	if (mode) {
		await db.insert(shareSettings).values({
			userId: USER_ID,
			year: YEAR,
			mode,
			modeSource: ShareModeSource.EXPLICIT,
			shareToken: mode === ShareMode.PRIVATE_LINK ? '550e8400-e29b-41d4-a716-446655440000' : null,
			canUserControl: false
		});
	}
}

function createCookies(): TestCookies {
	return {
		sets: [],
		set(name: string, value: string, options?: unknown) {
			this.sets.push({ name, value, options });
		}
	};
}

async function invokeLookup(username: string, ip: string, cookies: TestCookies = createCookies()) {
	const formData = new FormData();
	formData.set('username', username);
	const request = new Request('https://obzorarr.example/', {
		method: 'POST',
		body: formData
	});

	const lookupUser = actions.lookupUser as LookupAction;
	return lookupUser({
		request,
		url: new URL(request.url),
		cookies,
		getClientAddress: () => ip,
		setHeaders: () => {}
	} as unknown as Parameters<LookupAction>[0]);
}

describe('landing username lookup', () => {
	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(playHistory);
		await db.delete(appSettings);
		await db.delete(users);
		await db.delete(plexAccounts);
		// The public lookup form is now gated behind PUBLIC_LANDING_LOOKUP (default
		// off). These cases all exercise the form being available, so enable it; the
		// dedicated toggle-off cases below disable it explicitly.
		await setPublicLandingLookupEnabled(true);
		liveSyncCalls = [];
		liveSyncResult = { triggered: false, syncInProgress: false, reason: 'disabled' };
		triggerLiveSyncSpy = spyOn(liveSync, 'triggerLiveSyncIfNeeded');
		triggerLiveSyncSpy.mockImplementation(async (source: string) => {
			liveSyncCalls.push(source);
			return liveSyncResult;
		});
	});

	afterEach(() => {
		triggerLiveSyncSpy.mockRestore();
	});

	it('redirects anonymous lookup to the opaque slug (not the integer id) for public wrapped pages (DF-04)', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();

		try {
			await invokeLookup('alice', '198.51.100.1');
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			// DF-04: the anonymous visitor must be sent to the opaque slug, never the
			// enumerable integer id (which now 404s for non-owners).
			const prefix = `/wrapped/${YEAR}/u/`;
			expect(error.location.startsWith(prefix)).toBe(true);
			const slug = error.location.slice(prefix.length);
			expect(slug).not.toBe(String(USER_ID));
			expect(isValidSlugFormat(slug)).toBe(true);
			expect(await resolveSlug(slug)).toEqual({ userId: USER_ID, year: YEAR });
		}
	});

	it('sets a short-lived wrapped marker when public lookup starts live sync', async () => {
		liveSyncResult = {
			triggered: true,
			syncInProgress: true
		};
		const cookies = createCookies();
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();

		try {
			await invokeLookup('alice', '198.51.100.5', cookies);
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
		}

		expect(liveSyncCalls).toEqual(['landing-page-lookup']);
		expect(cookies.sets).toEqual([
			{
				name: 'lookup_live_sync',
				value: '1',
				options: {
					path: '/wrapped',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60
				}
			}
		]);
	});

	it('logs trigger startup failures without setting the lookup marker', async () => {
		liveSyncResult = {
			triggered: false,
			syncInProgress: false,
			reason: 'error'
		};
		const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
		const cookies = createCookies();
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();

		try {
			await invokeLookup('alice', '198.51.100.6', cookies);
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			expect(warnSpy).toHaveBeenCalledWith(
				'Lookup-triggered live sync failed to start',
				'LandingLookup'
			);
			expect(cookies.sets).toHaveLength(0);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('returns the same generic response for an allowed opt-out and an unknown user', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: true
		});
		await seedUser(ShareMode.PRIVATE_OAUTH);

		const optedOutResult = await invokeLookup('alice', '198.51.100.2');
		const missingResult = await invokeLookup('nobody', '198.51.100.3');

		expect(optedOutResult).toEqual({
			status: 404,
			data: {
				error: 'No publicly shared Wrapped found for that username.',
				username: 'alice',
				requiresAuth: false
			}
		});
		expect(missingResult).toEqual({
			status: 404,
			data: {
				error: 'No publicly shared Wrapped found for that username.',
				username: 'nobody',
				requiresAuth: false
			}
		});
		expect(liveSyncCalls).toEqual([]);
	});

	it('returns the generic failure before live sync or slug creation when current-year history is absent', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();
		await db.delete(playHistory);

		const result = await invokeLookup('ALICE', '198.51.100.17');

		expect(result).toEqual({
			status: 404,
			data: {
				error: 'No publicly shared Wrapped found for that username.',
				username: 'ALICE',
				requiresAuth: false
			}
		});
		expect(liveSyncCalls).toEqual([]);
		expect(await db.select().from(shareSettings)).toHaveLength(0);
	});

	it('uses public lookup as the default even when the global share default is private', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: true
		});
		await seedUser();

		try {
			await invokeLookup('alice', '198.51.100.13');
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
		}
	});

	it('does not mint a private-link token for a new user during anonymous lookup', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: true
		});
		await seedUser();

		let slug = '';
		try {
			await invokeLookup('alice', '198.51.100.14');
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			slug = error.location.replace(`/wrapped/${YEAR}/u/`, '');
		}

		expect(isValidSlugFormat(slug)).toBe(true);
		const row = await db
			.select({ publicSlug: shareSettings.publicSlug, shareToken: shareSettings.shareToken })
			.from(shareSettings)
			.where(eq(shareSettings.userId, USER_ID))
			.limit(1);
		expect(row[0]).toEqual({ publicSlug: slug, shareToken: null });
	});

	it('redirects with a slug but denies destination access when sync makes the page private-link', async () => {
		const PRIVATE_TOKEN = '550e8400-e29b-41d4-a716-446655440999';
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: true });
		await seedUser(ShareMode.PUBLIC);
		triggerLiveSyncSpy.mockImplementation(async (source: string) => {
			liveSyncCalls.push(source);
			await db
				.update(shareSettings)
				.set({ mode: ShareMode.PRIVATE_LINK, shareToken: PRIVATE_TOKEN })
				.where(eq(shareSettings.userId, USER_ID));
			return { triggered: false, syncInProgress: false, reason: 'disabled' };
		});

		let slug = '';
		try {
			await invokeLookup('alice', '198.51.100.15');
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) throw error;
			slug = error.location.replace(`/wrapped/${YEAR}/u/`, '');
		}

		expect(isValidSlugFormat(slug)).toBe(true);
		expect(slug).not.toBe(PRIVATE_TOKEN);
		const row = await db
			.select({ publicSlug: shareSettings.publicSlug, shareToken: shareSettings.shareToken })
			.from(shareSettings)
			.where(eq(shareSettings.userId, USER_ID))
			.limit(1);
		expect(row[0]).toEqual({ publicSlug: slug, shareToken: PRIVATE_TOKEN });

		try {
			await loadWrapped({
				params: { year: String(YEAR), identifier: slug },
				locals: {},
				parent: async () => ({ availableYears: [YEAR] }),
				setHeaders: () => {}
			} as unknown as Parameters<typeof loadWrapped>[0]);
			expect.unreachable('Expected private-link slug destination to be denied');
		} catch (error) {
			expect((error as { status?: number }).status).toBe(404);
		}
	});

	it('does not create local users from anonymous lookup', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await db.insert(plexAccounts).values({
			accountId: 777,
			plexId: 888,
			username: 'synced-only',
			isOwner: false
		});

		await invokeLookup('synced-only', '198.51.100.4');

		const createdUsers = await db.select().from(users);
		const createdShareSettings = await db.select().from(shareSettings);
		expect(createdUsers).toHaveLength(0);
		expect(createdShareSettings).toHaveLength(0);
	});

	it('accepts trimmed, case-insensitive usernames and enforces the 100-character boundary', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		await seedUser();

		try {
			await invokeLookup('  ALICE  ', '198.51.100.9');
			throw new Error('Expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
		}

		const oneHundredCharacters = await invokeLookup('a'.repeat(100), '198.51.100.10');
		expect(oneHundredCharacters).toMatchObject({
			status: 404,
			data: { requiresAuth: false }
		});

		const oneHundredAndOneCharacters = await invokeLookup('a'.repeat(101), '198.51.100.11');
		expect(oneHundredAndOneCharacters).toMatchObject({
			status: 400,
			data: { error: 'Username is too long', requiresAuth: false }
		});
		expect(liveSyncCalls).toEqual(['landing-page-lookup']);
	});

	describe('public landing lookup gate', () => {
		it('rejects the lookup with 403 (no redirect) when the toggle is off', async () => {
			// The landing toggle is the outer gate; this proves it blocks lookup before
			// per-user share mode is considered.
			await setPublicLandingLookupEnabled(false);
			await setGlobalShareDefaults({
				defaultShareMode: ShareMode.PUBLIC,
				allowUserControl: false
			});
			await seedUser();

			const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
			try {
				const result = await invokeLookup('alice', '198.51.100.7');
				expect(result).toEqual({
					status: 403,
					data: {
						error: 'Public lookup is disabled on this server.',
						requiresAuth: true
					}
				});
				expect(liveSyncCalls).toHaveLength(0);
			} finally {
				warnSpy.mockRestore();
			}
		});
		it('does not mint a slug, start sync, or set cookies when disabled', async () => {
			await setGlobalShareDefaults({
				defaultShareMode: ShareMode.PUBLIC,
				allowUserControl: false
			});
			await seedUser(ShareMode.PUBLIC);
			await setPublicLandingLookupEnabled(false);
			const cookies = createCookies();

			const result = await invokeLookup('alice', '198.51.100.16', cookies);

			expect(result).toMatchObject({ status: 403, data: { requiresAuth: true } });
			expect(liveSyncCalls).toEqual([]);
			expect(cookies.sets).toEqual([]);
			const row = await db
				.select({ publicSlug: shareSettings.publicSlug, shareToken: shareSettings.shareToken })
				.from(shareSettings)
				.where(eq(shareSettings.userId, USER_ID))
				.limit(1);
			expect(row[0]).toEqual({ publicSlug: null, shareToken: null });
		});

		it('lets the administrator make every user public when user control is disabled', async () => {
			await setGlobalShareDefaults({
				defaultShareMode: ShareMode.PRIVATE_OAUTH,
				allowUserControl: false
			});
			await seedUser(ShareMode.PRIVATE_OAUTH);

			try {
				await invokeLookup('alice', '198.51.100.8');
				throw new Error('Expected redirect');
			} catch (error) {
				expect(isRedirect(error)).toBe(true);
			}
		});
	});

	describe('landing load gating', () => {
		// `load` is typed `void | PageData` (the authenticated branch redirects). These
		// cases pass an anonymous `locals`, so the data branch always returns; cast to
		// the known shape so the assertions type-check.
		const invokeLoad = async (): Promise<{
			currentYear: number;
			publicLookupEnabled: boolean;
			loginHref: string;
		}> =>
			(await (load as LandingLoad)({ locals: {} } as unknown as Parameters<LandingLoad>[0])) as {
				currentYear: number;
				publicLookupEnabled: boolean;
				loginHref: string;
			};

		it('returns publicLookupEnabled === toggle value regardless of default share mode', async () => {
			// The load contract mirrors only the landing toggle (sole-gate semantics)
			// and still surfaces the sign-in href.
			await setPublicLandingLookupEnabled(true);
			await setGlobalShareDefaults({
				defaultShareMode: ShareMode.PRIVATE_OAUTH,
				allowUserControl: false
			});

			const onData = await invokeLoad();
			expect(onData.publicLookupEnabled).toBe(true);
			expect(onData.loginHref).toBe('/auth/plex');

			await setPublicLandingLookupEnabled(false);
			const offData = await invokeLoad();
			expect(offData.publicLookupEnabled).toBe(false);
		});

		it('defaults publicLookupEnabled to false when no row exists', async () => {
			await db.delete(appSettings);
			expect(await getPublicLandingLookupEnabled()).toBe(false);
			const data = await invokeLoad();
			expect(data.publicLookupEnabled).toBe(false);
		});
	});
});
