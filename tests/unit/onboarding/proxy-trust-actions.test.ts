import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import type { Cookies } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import { AppSettingsKey, getAppSetting, setAppSetting } from '$lib/server/admin/settings.service';
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
import { actions } from '../../../src/routes/onboarding/proxy-trust/+page.server';
import { resetSharedTestDb } from '../../helpers/db';
import { TEST_REQUEST_URL } from '../../helpers/requests';

const OVERSIZED_BROWSER_ORIGIN = `https://wrapped.example.com/${'a'.repeat(2049)}`;
type ContinueAction = NonNullable<typeof actions.continue>;
type DiagnoseReverseProxyAction = NonNullable<typeof actions.diagnoseReverseProxy>;
type EnableTrustProxyAction = NonNullable<typeof actions.enableTrustProxy>;

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

function createEnableTrustProxyRequest(confirmRisk = true): Request {
	const formData = new FormData();
	formData.set('browserOrigin', 'https://wrapped.example.com');
	if (confirmRisk) formData.set('confirmRisk', 'true');

	return new Request('http://internal.local/onboarding/proxy-trust', {
		method: 'POST',
		headers: {
			origin: 'https://wrapped.example.com',
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'wrapped.example.com'
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

async function runEnableTrustProxy(request: Request) {
	const action = actions.enableTrustProxy as EnableTrustProxyAction;
	actionHeaders = [];
	return action({
		request,
		cookies,
		url: new URL(request.url),
		getClientAddress: () => '172.18.0.2',
		setHeaders: (headers: Record<string, string>) => actionHeaders.push(headers)
	} as unknown as Parameters<EnableTrustProxyAction>[0]);
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
		previousTrustProxyEnv = envRecord().TRUST_PROXY;
		delete envRecord().TRUST_PROXY;
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

	afterEach(() => {
		if (previousTrustProxyEnv === undefined) delete envRecord().TRUST_PROXY;
		else envRecord().TRUST_PROXY = previousTrustProxyEnv;
	});

	it('exposes diagnostic, enable, and continue actions only', () => {
		expect('default' in actions).toBe(false);
		expect(typeof actions.continue).toBe('function');
		expect(typeof actions.diagnoseReverseProxy).toBe('function');
		expect(typeof actions.enableTrustProxy).toBe('function');
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
		expect(page).toContain("savedState = 'verifying'");
		expect(page).toContain('void runDiagnostic(true)');
		expect(page).toContain('REVERSE_PROXY_COPY.savedUnverified');
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

	it('runs a read-only reverse proxy diagnostic without persisting TRUST_PROXY', async () => {
		const result = await runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest());

		expect(result).toMatchObject({
			reverseProxyDiagnostic: {
				facts: {
					trustProxy: {
						enabled: false,
						source: 'default',
						isLocked: false
					},
					forwardedHeaders: {
						present: ['X-Forwarded-Host', 'X-Forwarded-Proto']
					}
				},
				action: 'confirm-trust-boundary',
				reasonCodes: ['forwarded-pair-matches-browser']
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
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
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
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

	it('rejects enabling TRUST_PROXY without explicit risk confirmation', async () => {
		const result = await runEnableTrustProxy(createEnableTrustProxyRequest(false));

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError: 'Confirm the reverse-proxy header trust risk before enabling TRUST_PROXY.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('rejects enabling TRUST_PROXY with a structurally abusive browser origin', async () => {
		const formData = new FormData();
		formData.set('browserOrigin', OVERSIZED_BROWSER_ORIGIN);
		formData.set('confirmRisk', 'true');

		const result = await runEnableTrustProxy(
			new Request('http://internal.local/onboarding/proxy-trust', {
				method: 'POST',
				headers: {
					origin: 'https://wrapped.example.com',
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'wrapped.example.com'
				},
				body: formData
			})
		);

		expect(result).toEqual({
			status: 400,
			data: { trustProxyError: 'browserOrigin is too long' }
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('rejects enabling TRUST_PROXY when environment controlled', async () => {
		envRecord().TRUST_PROXY = 'true';

		const result = await runEnableTrustProxy(createEnableTrustProxyRequest(true));

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError:
					'TRUST_PROXY is set via environment variable and must be changed in your environment or container configuration.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('rejects enabling TRUST_PROXY when the request origin differs from the submitted browser origin', async () => {
		const formData = new FormData();
		formData.set('browserOrigin', 'https://wrapped.example.com');
		formData.set('confirmRisk', 'true');
		const mismatchedRequest = new Request('http://internal.local/onboarding/proxy-trust', {
			method: 'POST',
			headers: {
				origin: 'https://other.example.com',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'wrapped.example.com'
			},
			body: formData
		});

		const mismatchedResult = await runEnableTrustProxy(mismatchedRequest);

		expect(mismatchedResult).toEqual({
			status: 403,
			data: {
				trustProxyError: 'Reverse proxy header trust must be enabled from this browser origin'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('persists TRUST_PROXY only after confirmation and a current enable recommendation', async () => {
		const result = await runEnableTrustProxy(createEnableTrustProxyRequest(true));

		expect(result).toEqual({
			trustProxySuccess: true,
			trustProxyMessage: 'Reverse-proxy header trust enabled.'
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('true');
		expect(await getOnboardingStep()).toBe(OnboardingSteps.PROXY_TRUST);
		expect(actionHeaders).toEqual([{ 'Cache-Control': 'no-store' }]);
	});

	it('rejects enabling TRUST_PROXY when the current diagnostic does not recommend it', async () => {
		const ORIGIN = 'http://localhost:5173';
		const result = await runEnableTrustProxy(
			new Request(`${ORIGIN}/onboarding/proxy-trust`, {
				method: 'POST',
				headers: { origin: ORIGIN },
				body: (() => {
					const formData = new FormData();
					formData.set('browserOrigin', ORIGIN);
					formData.set('confirmRisk', 'true');
					return formData;
				})()
			})
		);

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError:
					'The current diagnostic does not recommend enabling reverse proxy header trust.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	// ISSUE-001: when the diagnostic does NOT recommend enabling, the error
	// message must reflect that — even if confirmRisk is also missing — so an
	// API-direct caller that sends confirmRisk=true later does not pass the
	// guard simply because the prior failure message blamed confirmRisk.
	it('rejects with the diagnostic error first when diagnostic disagrees AND confirmRisk is absent', async () => {
		const ORIGIN = 'http://localhost:5173';
		const formData = new FormData();
		formData.set('browserOrigin', ORIGIN);
		// confirmRisk omitted on purpose

		const result = await runEnableTrustProxy(
			new Request(`${ORIGIN}/onboarding/proxy-trust`, {
				method: 'POST',
				headers: { origin: ORIGIN },
				body: formData
			})
		);

		expect(result).toEqual({
			status: 400,
			data: {
				trustProxyError:
					'The current diagnostic does not recommend enabling reverse proxy header trust.'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('propagates unexpected claim errors for centralized sanitization', async () => {
		const unexpected = new Error('raw database path should stay server-side');
		cookies = createThrowingClaimCookies(unexpected);

		for (const run of [
			() => runContinue(createContinueRequest()),
			() => runDiagnoseReverseProxy(createReverseProxyDiagnosticRequest()),
			() => runEnableTrustProxy(createEnableTrustProxyRequest(true))
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
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		});

		it('enableTrustProxy returns 403 when onboarding is complete', async () => {
			await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

			const result = await runEnableTrustProxy(createEnableTrustProxyRequest(true));

			expect(result).toEqual({
				status: 403,
				data: { trustProxyError: 'Not allowed at this onboarding stage' }
			});
			expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
		});
	});
});
