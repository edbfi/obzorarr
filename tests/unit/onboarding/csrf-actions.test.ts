import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import {
	AppSettingsKey,
	deleteAppSetting,
	getAppSetting,
	setAppSetting
} from '$lib/server/admin/settings.service';
import {
	getOnboardingStep,
	ONBOARDING_CLAIM_REQUIRED_MESSAGE,
	OnboardingSteps,
	setOnboardingStep
} from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { env } from '$lib/server/private-env';
import { actions } from '../../../src/routes/onboarding/csrf/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

const ORIGIN = 'http://localhost:5173';
type SaveOriginAction = NonNullable<typeof actions.saveOrigin>;
type SaveAction = NonNullable<typeof actions.save>;
type SkipCsrfAction = NonNullable<typeof actions.skipCsrf>;
type TestOriginAction = NonNullable<typeof actions.testOrigin>;

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

function createCookies() {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	};
}

let cookies: ReturnType<typeof createCookies>;
let previousTrustProxyEnv: string | undefined;

function createThrowingClaimCookies(errorToThrow: Error): ReturnType<typeof createCookies> {
	return {
		get: () => {
			throw errorToThrow;
		},
		set: () => undefined,
		delete: () => undefined
	} as unknown as ReturnType<typeof createCookies>;
}

function createFormRequest(csrfOrigin: string, origin = ORIGIN, requestBase = ORIGIN): Request {
	const formData = new FormData();
	formData.set('csrfOrigin', csrfOrigin);

	return new Request(`${requestBase}/onboarding/csrf`, {
		method: 'POST',
		headers: { origin },
		body: formData
	});
}

function createFormRequestWithRefererOnly(
	csrfOrigin: string,
	referer = `${ORIGIN}/onboarding/csrf`
): Request {
	const formData = new FormData();
	formData.set('csrfOrigin', csrfOrigin);

	return new Request(`${ORIGIN}/onboarding/csrf`, {
		method: 'POST',
		headers: { referer },
		body: formData
	});
}

async function runSaveOrigin(request: Request) {
	const saveOrigin = actions.saveOrigin as SaveOriginAction;
	return saveOrigin({
		request,
		cookies,
		url: new URL(request.url)
	} as unknown as Parameters<SaveOriginAction>[0]);
}

async function runSave(request: Request) {
	const save = actions.save as SaveAction;
	return save({
		request,
		cookies,
		url: new URL(request.url)
	} as unknown as Parameters<SaveAction>[0]);
}

async function runTestOrigin(request: Request) {
	const testOrigin = actions.testOrigin as TestOriginAction;
	return testOrigin({ request, cookies } as unknown as Parameters<TestOriginAction>[0]);
}

async function runSkipCsrf(request: Request) {
	const skipCsrf = actions.skipCsrf as SkipCsrfAction;
	return skipCsrf({
		request,
		cookies,
		url: new URL(request.url)
	} as unknown as Parameters<SkipCsrfAction>[0]);
}

async function expectRedirect(run: () => Promise<unknown>, location: string) {
	try {
		await run();
		throw new Error('Expected action to redirect');
	} catch (error) {
		expect(isRedirect(error)).toBe(true);
		if (!isRedirect(error)) throw error;
		expect(error.status).toBe(303);
		expect(error.location).toBe(location);
	}
}

describe('onboarding CSRF actions', () => {
	beforeEach(async () => {
		previousTrustProxyEnv = envRecord().TRUST_PROXY;
		delete envRecord().TRUST_PROXY;
		await resetSharedTestDb();
		clearBootstrapToken();
		cookies = createCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('claimed');
		await setOnboardingStep(OnboardingSteps.CSRF);
	});

	afterEach(() => {
		if (previousTrustProxyEnv === undefined) delete envRecord().TRUST_PROXY;
		else envRecord().TRUST_PROXY = previousTrustProxyEnv;
	});

	it('does not export a default action alongside named actions', () => {
		expect('default' in actions).toBe(false);
		expect(actions.default).toBeUndefined();
		expect(typeof actions.testOrigin).toBe('function');
		expect(typeof actions.save).toBe('function');
		expect(typeof actions.saveOrigin).toBe('function');
		expect(typeof actions.skipCsrf).toBe('function');
	});

	it('does not expose the reverse-proxy diagnostic actions from this step anymore', () => {
		expect('diagnoseReverseProxy' in actions).toBe(false);
		expect('enableTrustProxy' in actions).toBe(false);
	});

	it('test origin succeeds when the submitted origin matches the browser origin', async () => {
		const result = await runTestOrigin(createFormRequest(ORIGIN));

		expect(result).toEqual({ testSuccess: true, testedOrigin: ORIGIN });
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin accepts browser origins with explicit default ports', async () => {
		const result = await runTestOrigin(
			createFormRequest('https://example.com', 'https://example.com:443')
		);

		expect(result).toEqual({ testSuccess: true, testedOrigin: 'https://example.com' });
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin accepts same-origin form submissions that only include a Referer header', async () => {
		const result = await runTestOrigin(createFormRequestWithRefererOnly(ORIGIN));

		expect(result).toEqual({ testSuccess: true, testedOrigin: ORIGIN });
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin rejects invalid URLs without advancing onboarding', async () => {
		const result = await runTestOrigin(createFormRequest('not-a-url'));

		expect(result).toEqual({
			status: 400,
			data: { testError: 'Invalid URL format' }
		});
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin rejects requests without a browser origin', async () => {
		const formData = new FormData();
		formData.set('csrfOrigin', ORIGIN);

		const request = new Request(`${ORIGIN}/onboarding/csrf`, {
			method: 'POST',
			body: formData
		});

		const result = await runTestOrigin(request);

		expect(result).toEqual({
			status: 400,
			data: {
				testError: 'Could not detect the browser origin. Open Obzorarr over HTTP or HTTPS.'
			}
		});
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('test origin rejects mismatches without advancing onboarding', async () => {
		const result = await runTestOrigin(createFormRequest('https://example.com'));

		expect(result).toEqual({
			status: 400,
			data: {
				testError:
					'Origin mismatch: browser sends "http://localhost:5173" but you configured "https://example.com"'
			}
		});
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('saves a matching CSRF origin, advances to proxy-trust, and redirects', async () => {
		await expectRedirect(() => runSaveOrigin(createFormRequest(ORIGIN)), '/onboarding/proxy-trust');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
	});

	it('saves a matching CSRF origin through the save alias', async () => {
		await expectRedirect(() => runSave(createFormRequest(ORIGIN)), '/onboarding/proxy-trust');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
	});

	it('returns setup-claim-required for the save alias without an active claim', async () => {
		cookies = createCookies();

		expect(await runSave(createFormRequest(ORIGIN))).toEqual({
			status: 403,
			data: { error: ONBOARDING_CLAIM_REQUIRED_MESSAGE }
		});
	});

	it('saves a matching CSRF origin when the browser origin has an explicit default port', async () => {
		await expectRedirect(
			() =>
				runSaveOrigin(
					createFormRequest('https://example.com', 'https://example.com:443', 'https://example.com')
				),
			'/onboarding/proxy-trust'
		);

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe('https://example.com');
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
	});

	it('saves a matching CSRF origin and advances when the form submission only includes a Referer header', async () => {
		await expectRedirect(
			() => runSaveOrigin(createFormRequestWithRefererOnly(ORIGIN)),
			'/onboarding/proxy-trust'
		);

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
	});

	it('does not advance when the origin URL is invalid', async () => {
		const result = await runSaveOrigin(createFormRequest('not-a-url'));

		expect(result).toEqual({
			status: 400,
			data: { error: 'Invalid URL format' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('does not advance when the submitted origin differs from the browser origin', async () => {
		const result = await runSaveOrigin(createFormRequest('https://example.com'));

		expect(result).toEqual({
			status: 400,
			data: {
				error:
					'Origin mismatch: browser sends "http://localhost:5173" but you configured "https://example.com"'
			}
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('saveOrigin rejects cross-origin submissions without persisting the submitted origin', async () => {
		const result = await runSaveOrigin(
			createFormRequest('https://evil.example', 'https://evil.example')
		);

		expect(result).toEqual({
			status: 403,
			data: { error: 'CSRF origin must be submitted from this Obzorarr origin' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('skips CSRF setup, advances to proxy-trust, and redirects', async () => {
		await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN);

		await expectRedirect(
			() => runSkipCsrf(createFormRequest('not-a-url')),
			'/onboarding/proxy-trust'
		);

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
	});

	it('skipCsrf writes CSRF_ORIGIN_SKIPPED=true as explicit opt-out', async () => {
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();

		await expectRedirect(
			() => runSkipCsrf(createFormRequest('not-a-url')),
			'/onboarding/proxy-trust'
		);

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBe('true');
	});

	it('skipCsrf rejects cross-origin submissions without advancing onboarding', async () => {
		const result = await runSkipCsrf(createFormRequest('not-a-url', 'https://evil.example'));

		expect(result).toEqual({
			status: 403,
			data: { error: 'CSRF skip must be submitted from this Obzorarr origin' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('skipCsrf rejects missing Origin/Referer headers', async () => {
		const request = new Request(`${ORIGIN}/onboarding/csrf`, { method: 'POST' });

		const result = await runSkipCsrf(request);

		expect(result).toEqual({
			status: 403,
			data: { error: 'CSRF skip must be submitted from this Obzorarr origin' }
		});
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CSRF);
	});

	it('saveOrigin clears CSRF_ORIGIN_SKIPPED on success', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');

		await expectRedirect(() => runSaveOrigin(createFormRequest(ORIGIN)), '/onboarding/proxy-trust');

		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
	});

	it('propagates unexpected claim errors for centralized sanitization', async () => {
		const unexpected = new Error('raw database path should stay server-side');
		cookies = createThrowingClaimCookies(unexpected);

		for (const run of [
			() => runTestOrigin(createFormRequest(ORIGIN)),
			() => runSaveOrigin(createFormRequest(ORIGIN)),
			() => runSkipCsrf(createFormRequest('not-a-url'))
		]) {
			try {
				await run();
				expect.unreachable('Expected unexpected claim error to be thrown');
			} catch (err) {
				expect(err).toBe(unexpected);
			}
		}
	});

	describe('onboarding-step guard', () => {
		it('testOrigin returns 403 when onboarding is already complete', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			const result = await runTestOrigin(createFormRequest(ORIGIN));

			expect(result).toEqual({
				status: 403,
				data: { testError: 'Not allowed at this onboarding stage' }
			});
		});

		it('saveOrigin returns 403 when current step is past CSRF', async () => {
			await setOnboardingStep(OnboardingSteps.PLEX);

			const result = await runSaveOrigin(createFormRequest(ORIGIN));

			expect(result).toEqual({
				status: 403,
				data: { error: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
		});

		it('skipCsrf returns 403 when onboarding is complete', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			const result = await runSkipCsrf(createFormRequest('not-a-url'));

			expect(result).toEqual({
				status: 403,
				data: { error: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		});

		it('skipCsrf returns 403 when current step is past CSRF', async () => {
			await setOnboardingStep(OnboardingSteps.SETTINGS);

			const result = await runSkipCsrf(createFormRequest('not-a-url'));

			expect(result).toEqual({
				status: 403,
				data: { error: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBeNull();
		});
	});
});
