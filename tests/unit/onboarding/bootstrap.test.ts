import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import {
	AppSettingsKey,
	deleteAppSetting,
	getAppSetting,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	clearOnboardingClaim,
	createBootstrapToken,
	generateBootstrapToken,
	hasActiveOnboardingClaim,
	isBootstrapTokenExpired,
	ONBOARDING_CLAIM_COOKIE,
	printOnboardingBootstrapBanner,
	RESET_BOOTSTRAP_TOKEN_TTL_MS,
	renewOnboardingClaim,
	validateBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { resetSharedTestDb } from '../../helpers/db';
import { TEST_REQUEST_URL } from '../../helpers/requests';

function createCookies() {
	const values = new Map<string, string>();
	const options = new Map<string, { secure?: boolean }>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string, nextOptions: { secure?: boolean } = {}) => {
			values.set(name, value);
			options.set(name, nextOptions);
		},
		delete: (name: string) => {
			values.delete(name);
			options.delete(name);
		},
		values,
		options
	};
}

function printedBootstrapTokens(consoleInfoSpy: ReturnType<typeof spyOn>): string[] {
	return (consoleInfoSpy.mock.calls as Array<[unknown]>)
		.map(([message]) => String(message))
		.filter((message) => message.startsWith('Bootstrap token: '))
		.map((message) => message.replace('Bootstrap token: ', ''));
}

function printedSetupUrls(consoleInfoSpy: ReturnType<typeof spyOn>): string[] {
	return (consoleInfoSpy.mock.calls as Array<[unknown]>)
		.map(([message]) => String(message))
		.filter((message) => message.startsWith('Setup URL: '))
		.map((message) => message.replace('Setup URL: ', ''));
}

describe('onboarding bootstrap token and claim', () => {
	let consoleInfoSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		await resetSharedTestDb();
		clearBootstrapToken();
		consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleInfoSpy.mockRestore();
	});

	it('generates lowercase fixed-format bootstrap tokens', () => {
		expect(generateBootstrapToken()).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
	});

	it('validates active tokens, expires them, and clears them', () => {
		const token = createBootstrapToken(20);
		expect(validateBootstrapToken(token)).toBe(true);
		expect(validateBootstrapToken(`${token}x`)).toBe(false);
		clearBootstrapToken();
		expect(isBootstrapTokenExpired()).toBe(true);
		expect(validateBootstrapToken(token)).toBe(false);
	});

	it('prints the configured CSRF origin for the setup URL', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://trusted.example.com');

		await printOnboardingBootstrapBanner();

		expect(printedSetupUrls(consoleInfoSpy)).toEqual([
			'https://trusted.example.com/onboarding/claim'
		]);
	});

	it('prints a relative setup URL when no trusted origin is configured', async () => {
		await printOnboardingBootstrapBanner();

		expect(printedSetupUrls(consoleInfoSpy)).toEqual(['/onboarding/claim']);
	});

	it('prints only one valid bootstrap token when banner calls race', async () => {
		await Promise.all(Array.from({ length: 5 }, () => printOnboardingBootstrapBanner()));

		const tokens = printedBootstrapTokens(consoleInfoSpy);
		expect(tokens).toHaveLength(1);
		expect(validateBootstrapToken(tokens[0] ?? '')).toBe(true);
	});

	it('prints a replacement token after the current banner token expires', async () => {
		await printOnboardingBootstrapBanner();
		const firstToken = printedBootstrapTokens(consoleInfoSpy)[0] ?? '';
		expect(validateBootstrapToken(firstToken)).toBe(true);

		createBootstrapToken(0);
		await printOnboardingBootstrapBanner();

		const tokens = printedBootstrapTokens(consoleInfoSpy);
		const replacementToken = tokens[1] ?? '';
		expect(tokens).toHaveLength(2);
		expect(replacementToken).not.toBe(firstToken);
		expect(validateBootstrapToken(replacementToken)).toBe(true);
	});

	it('caches completed onboarding after claim cleanup resets banner state', async () => {
		await printOnboardingBootstrapBanner();
		expect(printedBootstrapTokens(consoleInfoSpy)).toHaveLength(1);
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
		await clearOnboardingClaim();

		await printOnboardingBootstrapBanner();
		await db.delete(appSettings);
		await printOnboardingBootstrapBanner();

		expect(printedBootstrapTokens(consoleInfoSpy)).toHaveLength(1);
	});

	it('stores only the claim proof hash and renews the same claimant', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();

		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('claimed');
		expect(await hasActiveOnboardingClaim(cookies as unknown as Cookies)).toBe(true);
		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('renewed');

		const rawProof = cookies.values.get(ONBOARDING_CLAIM_COOKIE);
		const storedHash = await getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH);
		expect(rawProof).toBeTruthy();
		expect(storedHash).toBeTruthy();
		expect(storedHash).not.toBe(rawProof);
	});

	it('sets a non-secure claim cookie for HTTP request URLs', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();

		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: new URL('http://example.com/onboarding/claim')
			})
		).toBe('claimed');

		expect(cookies.options.get(ONBOARDING_CLAIM_COOKIE)?.secure).toBe(false);
	});

	it('sets a secure claim cookie for HTTPS request URLs', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();

		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: new URL('https://example.com/onboarding/claim')
			})
		).toBe('claimed');

		expect(cookies.options.get(ONBOARDING_CLAIM_COOKIE)?.secure).toBe(true);
	});

	it('rejects a competing claimant while the claim is active', async () => {
		const token = createBootstrapToken();
		const first = createCookies();
		const second = createCookies();

		expect(
			await claimOnboardingInstance(first as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('claimed');
		expect(
			await claimOnboardingInstance(second as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('already-claimed');
	});

	// The admin instance reset (PR #168) mints a 60-minute bootstrap token on a
	// LIVE instance — stage 2 hands it to the browser before anything is wiped,
	// because the token lives in module state and minting after the wipe is not an
	// option. Dismissing that dialog is deliberately side-effect-free, so the token
	// stays valid in memory on a fully onboarded install, and nothing upstream
	// notices: /onboarding sits in onboardingHandle's skipPaths and form actions
	// bypass the layout load. These pin the completion guard that makes such a
	// token inert until the wipe actually happens.
	describe('refuses claims on an already-onboarded instance (dismissed instance reset)', () => {
		let consoleWarnSpy: ReturnType<typeof spyOn>;

		beforeEach(() => {
			consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		});

		afterEach(async () => {
			consoleWarnSpy.mockRestore();
			// The refusal warning is buffered behind a 100ms timer; drain it here so it
			// cannot flush into a later file's `logs` assertions.
			await logger.forceFlush();
		});

		async function claimKeys(): Promise<Array<string | null>> {
			return Promise.all([
				getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED),
				getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH),
				getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT)
			]);
		}

		it('refuses a live bootstrap token while onboarding is already complete, writing nothing', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			const cookies = createCookies();
			const token = createBootstrapToken(RESET_BOOTSTRAP_TOKEN_TTL_MS);

			expect(
				await claimOnboardingInstance(cookies as unknown as Cookies, token, {
					requestUrl: TEST_REQUEST_URL
				})
			).toBe('invalid-token');

			expect(await claimKeys()).toEqual([null, null, null]);
			expect(cookies.values.get(ONBOARDING_CLAIM_COOKIE)).toBeUndefined();
		});

		it('refuses without burning the token, so the same token claims once the wipe clears the flag', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
			const cookies = createCookies();
			const token = createBootstrapToken(RESET_BOOTSTRAP_TOKEN_TTL_MS);

			expect(
				await claimOnboardingInstance(cookies as unknown as Cookies, token, {
					requestUrl: TEST_REQUEST_URL
				})
			).toBe('invalid-token');
			// Refuse only, never burn: burning would turn any reachable POST into a way
			// to strand a reset mid-flight, leaving the admin unable to claim after
			// their own wipe.
			expect(validateBootstrapToken(token)).toBe(true);

			// Standing in for the wipe, which deletes the key outright.
			await deleteAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);

			expect(
				await claimOnboardingInstance(cookies as unknown as Cookies, token, {
					requestUrl: TEST_REQUEST_URL
				})
			).toBe('claimed');
		});

		it('suppresses renewal too: an active claim cookie cannot renew on a completed instance', async () => {
			const cookies = createCookies();
			const token = createBootstrapToken();
			expect(
				await claimOnboardingInstance(cookies as unknown as Cookies, token, {
					requestUrl: TEST_REQUEST_URL
				})
			).toBe('claimed');
			const claimedAt = await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT);

			// A live claim alongside the completed flag is only reachable in production
			// inside completeOnboarding()'s own await window (it sets the flag, then
			// clears the claim). It still matters, because renewOnboardingClaim()
			// WRITES ONBOARDING_CLAIMED_AT — a byte-identical value after the refusal
			// is what proves the guard sits above that branch.
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			expect(
				await claimOnboardingInstance(cookies as unknown as Cookies, token, {
					requestUrl: TEST_REQUEST_URL
				})
			).toBe('invalid-token');
			expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT)).toBe(claimedAt);
		});

		it('treats only the exact string "true" as complete', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'false');
			const cookies = createCookies();
			const token = createBootstrapToken();

			// Guards against a refactor to truthiness: 'false' is a stored string.
			expect(
				await claimOnboardingInstance(cookies as unknown as Cookies, token, {
					requestUrl: TEST_REQUEST_URL
				})
			).toBe('claimed');
		});
	});

	it('clears claim state', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();
		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('claimed');

		await clearOnboardingClaim();

		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH)).toBeNull();
		expect(await hasActiveOnboardingClaim(cookies as unknown as Cookies)).toBe(false);
	});

	// ISSUE-002: the onboarding layout `load` renews the claim on every page view
	// so it survives a slow off-site Plex OAuth round-trip (the return path lands on
	// a load, not an action). These lock the renew-on-load primitive it calls.
	it('renews a still-active claim on load, extending its stored expiry (ISSUE-002)', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();
		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('claimed');

		// Backdate the claim to near-expiry (still valid, but old) to prove renewal
		// pushes the expiry forward rather than being a no-op.
		const backdated = Date.now() - 9 * 60 * 1000;
		await setAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT, String(backdated));

		const renewed = await renewOnboardingClaim(cookies as unknown as Cookies, {
			requestUrl: new URL('https://example.com/onboarding/plex')
		});
		expect(renewed).toBe(true);

		const claimedAt = Number(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT));
		expect(claimedAt).toBeGreaterThan(backdated);
		expect(await hasActiveOnboardingClaim(cookies as unknown as Cookies)).toBe(true);
	});

	it('does not let a foreign session renew an active claim (anti-theft preserved)', async () => {
		const owner = createCookies();
		const stranger = createCookies();
		const token = createBootstrapToken();
		expect(
			await claimOnboardingInstance(owner as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('claimed');

		const before = await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT);

		// A different session with no valid claim cookie must not be able to renew
		// (or thereby steal) the owner's active claim.
		const renewed = await renewOnboardingClaim(stranger as unknown as Cookies, {
			requestUrl: new URL('https://example.com/onboarding/plex')
		});
		expect(renewed).toBe(false);
		expect(stranger.values.get(ONBOARDING_CLAIM_COOKIE)).toBeUndefined();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT)).toBe(before);
	});
});
