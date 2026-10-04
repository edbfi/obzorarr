import { beforeEach, describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import type { Cookies } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import { getAppSetting } from '$lib/server/admin/settings.service';
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
import { actions } from '../../../src/routes/onboarding/proxy-trust/+page.server';
import { resetSharedTestDb } from '../../helpers/db';
import { TEST_REQUEST_URL } from '../../helpers/requests';

const OVERSIZED_BROWSER_ORIGIN = `https://wrapped.example.com/${'a'.repeat(2049)}`;
type ContinueAction = NonNullable<typeof actions.continue>;
type DiagnoseReverseProxyAction = NonNullable<typeof actions.diagnoseReverseProxy>;
// The app_settings key the retired enableTrustProxy action wrote; nothing may write it now.
const RETIRED_TRUST_PROXY_KEY = 'trust_proxy' as Parameters<typeof getAppSetting>[0];

function createCookies() {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	};
}

let cookies: ReturnType<typeof createCookies>;
let actionHeaders: Record<string, string>[] = [];

function createThrowingClaimCookies(errorToThrow: Error): ReturnType<typeof createCookies> {
	return {
		get: () => {
			throw errorToThrow;
		},
		set: () => undefined,
		delete: () => undefined
	} as unknown as ReturnType<typeof createCookies>;
}

function createReverseProxyDiagnosticRequest(
	browserOrigin = 'https://wrapped.example.com',
	requestBase = 'http://internal.local',
	headers: Record<string, string> = {}
): Request {
	const formData = new FormData();
	formData.set('browserOrigin', browserOrigin);

	return new Request(`${requestBase}/onboarding/proxy-trust`, {
		method: 'POST',
		headers: {
			origin: browserOrigin,
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'wrapped.example.com',
			...headers
		},
		body: formData
	});
}

function createContinueRequest(origin = 'http://localhost:5173'): Request {
	return new Request(`${origin}/onboarding/proxy-trust`, {
		method: 'POST',
		headers: { origin }
	});
}

async function runContinue(request: Request) {
	const action = actions.continue as ContinueAction;
	return action({
		request,
		cookies,
		url: new URL(request.url)
	} as unknown as Parameters<ContinueAction>[0]);
}

async function runDiagnoseReverseProxy(request: Request) {
	const action = actions.diagnoseReverseProxy as DiagnoseReverseProxyAction;
	actionHeaders = [];
	return action({
		request,
		cookies,
		url: new URL(request.url),
		getClientAddress: () => '172.18.0.2',
		setHeaders: (headers: Record<string, string>) => actionHeaders.push(headers)
	} as unknown as Parameters<DiagnoseReverseProxyAction>[0]);
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

describe('onboarding proxy-trust actions', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		clearBootstrapToken();
		cookies = createCookies();
		const token = createBootstrapToken();
		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('claimed');
		await setOnboardingStep(OnboardingSteps.PROXY_TRUST);
	});

	it('exposes diagnostic and continue actions only (header trust is retired)', () => {
		expect('default' in actions).toBe(false);
		expect(typeof actions.continue).toBe('function');
		expect(typeof actions.diagnoseReverseProxy).toBe('function');
		expect('enableTrustProxy' in actions).toBe(false);
	});
	it('uses the shared presenter and accessible progressive disclosure in the onboarding UI', async () => {
		const page = await readFile('src/routes/onboarding/proxy-trust/+page.svelte', 'utf8');

		expect(page).toContain('presentReverseProxyDiagnostic(diagnostic)');
		expect(page).toContain('documentationForGuide(guide)');
		expect(page).toContain('REVERSE_PROXY_PROVIDER_GUIDES');
		expect(page).toContain('role="status"');
		expect(page).toContain('role="alert"');
		expect(page).toContain('aria-controls="proxy-technical-details"');
		expect(page).toContain('REVERSE_PROXY_COPY.continueWarning');
		expect(page).toContain('navigator.clipboard.writeText');
		expect(page).toContain('<details class="provider-guide">');
		expect(page).toContain('role="status" aria-live="polite"');
		expect(page).toContain('Copy configuration');
		expect(page).toContain('REVERSE_PROXY_COPY.providerGuidesHeading');
		expect(page).not.toContain('enableTrustProxy');
		expect(page).not.toContain('TRUST_PROXY');
		expect(page).not.toContain('trustProxy');
		expect(page).toContain('presentation.documentationIds.includes(guide.documentationId)');
		expect(page).toContain('{#each applicableProviderGuides as guide}');
		expect(page).toContain('class="details-toggle tap-target"');
		expect(page).toContain('<SubmitButton class="tap-target">');
	});

	it('continue advances to plex and redirects', async () => {
		await expectRedirect(() => runContinue(createContinueRequest()), '/onboarding/plex');
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PLEX);
	});

	it('continue rejects cross-origin submissions', async () => {
		const request = new Request('http://localhost:5173/onboarding/proxy-trust', {
			method: 'POST',
			headers: { origin: 'https://evil.example' }
		});

		const result = await runContinue(request);
		expect(result).toEqual({
			status: 403,
			data: { error: 'Continue must be submitted from this Obzorarr origin' }
		});
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
	});

	it('continue returns 403 when current step is not proxy-trust', async () => {
		await setOnboardingStep(OnboardingSteps.PLEX);
		const result = await runContinue(createContinueRequest());
		expect(result).toEqual({
			status: 403,
			data: { error: 'Not allowed at this onboarding stage' }
		});
	});

	it('runs a read-only reverse proxy diagnostic that recommends ORIGIN', async () => {
		const result = await runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest());

		expect(result).toMatchObject({
			reverseProxyDiagnostic: {
				facts: {
					forwardedHeaders: {
						present: ['X-Forwarded-Host', 'X-Forwarded-Proto']
					}
				},
				action: 'set-origin',
				reasonCodes: ['request-origin-differs-from-browser']
			}
		});
		expect(
			(result as { reverseProxyDiagnostic: { facts: object } }).reverseProxyDiagnostic.facts
		).not.toHaveProperty('trustProxy');
		expect(await getAppSetting(RETIRED_TRUST_PROXY_KEY)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
		expect(actionHeaders).toEqual([{ 'Cache-Control': 'no-store' }]);
	});

	it('rejects structurally abusive reverse proxy diagnostic browser origins', async () => {
		const result = await runDiagnoseReverseProxy(
			createReverseProxyDiagnosticRequest(OVERSIZED_BROWSER_ORIGIN)
		);

		expect(result).toEqual({
			status: 400,
			data: { diagnosticError: 'browserOrigin is too long' }
		});
		expect(await getAppSetting(RETIRED_TRUST_PROXY_KEY)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
	});

	it('does not expose raw forwarded header values in the diagnostic payload', async () => {
		const result = await runDiagnoseReverseProxy(
			createReverseProxyDiagnosticRequest('https://wrapped.example.com', 'http://internal.local', {
				cookie: 'session=secret-cookie',
				authorization: 'Bearer secret-authorization',
				'x-forwarded-host': 'wrapped.example.com',
				'x-forwarded-for': '203.0.113.77',
				'x-real-ip': '198.51.100.88',
				forwarded: 'for=hidden-client;proto=https;host=hidden.example'
			})
		);

		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('secret-cookie');
		expect(serialized).not.toContain('secret-authorization');
		expect(serialized).not.toContain('203.0.113.77');
		expect(serialized).not.toContain('198.51.100.88');
		expect(serialized).not.toContain('hidden-client');
		expect(serialized).not.toContain('hidden.example');
		expect(actionHeaders).toEqual([{ 'Cache-Control': 'no-store' }]);
	});

	it('propagates unexpected claim errors for centralized sanitization', async () => {
		const unexpected = new Error('raw database path should stay server-side');
		cookies = createThrowingClaimCookies(unexpected);

		for (const run of [
			() => runContinue(createContinueRequest()),
			() => runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest())
		]) {
			try {
				await run();
				expect.unreachable('Expected unexpected claim error to be thrown');
			} catch (err) {
				expect(err).toBe(unexpected);
			}
		}
	});

	it('returns setup-claim-required for continue without an active claim', async () => {
		cookies = createCookies();

		expect(await runContinue(createContinueRequest())).toEqual({
			status: 403,
			data: { error: ONBOARDING_CLAIM_REQUIRED_MESSAGE }
		});
	});

	describe('onboarding-step guard', () => {
		it('diagnoseReverseProxy returns 403 when current step is not proxy-trust', async () => {
			await setOnboardingStep(OnboardingSteps.CSRF);

			const result = await runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest());

			expect(result).toEqual({
				status: 403,
				data: { diagnosticError: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(RETIRED_TRUST_PROXY_KEY)).toBeNull();
		});
	});
});
