import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { logger } from '$lib/server/logging';
import {
	getOnboardingStep,
	isOnboardingComplete,
	OnboardingClaimRequiredError,
	OnboardingSteps,
	requireActiveOnboardingClaim,
	setOnboardingStep
} from '$lib/server/onboarding';
import { createReverseProxyDiagnostic } from '$lib/server/security/reverse-proxy-diagnostic';
import type { Actions } from './$types';

async function isOnboardingProxyTrustStep(): Promise<boolean> {
	const [done, step] = await Promise.all([isOnboardingComplete(), getOnboardingStep()]);
	return !done && step === OnboardingSteps.PROXY_TRUST;
}

function getRequestOrigin(request: Request): string | null {
	const origin = request.headers.get('origin');
	if (origin) return origin;

	const referer = request.headers.get('referer');
	if (!referer) return null;

	try {
		return new URL(referer).origin;
	} catch {
		return null;
	}
}

function normalizeOrigin(origin: string): string | null {
	try {
		return new URL(origin).origin.toLowerCase();
	} catch {
		return null;
	}
}

function originsMatch(left: string, right: string): boolean {
	const normalizedLeft = normalizeOrigin(left);
	const normalizedRight = normalizeOrigin(right);
	return normalizedLeft !== null && normalizedLeft === normalizedRight;
}

function isSameOriginOnboardingAction(request: Request, url: URL): boolean {
	const requestOrigin = getRequestOrigin(request);
	return requestOrigin !== null && originsMatch(requestOrigin, url.origin);
}

const MAX_BROWSER_ORIGIN_LENGTH = 2048;

const BrowserOriginSchema = z.object({
	browserOrigin: z
		.string()
		.min(1, 'Browser origin is required')
		.max(MAX_BROWSER_ORIGIN_LENGTH, 'browserOrigin is too long')
		.url('Browser origin is invalid')
		.refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
			message: 'Browser origin must start with http:// or https://'
		})
		.transform((url) => new URL(url).origin)
});

async function requireOnboardingProxyTrustAction(
	cookies: Parameters<NonNullable<Actions['continue']>>[0]['cookies'],
	url: URL,
	errorKey: 'error' | 'diagnosticError'
) {
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			return fail(403, { [errorKey]: err.message });
		}
		throw err;
	}
	if (!(await isOnboardingProxyTrustStep())) {
		return fail(403, { [errorKey]: 'Not allowed at this onboarding stage' });
	}
	return null;
}

export const actions: Actions = {
	continue: async ({ request, cookies, url }) => {
		const guardResult = await requireOnboardingProxyTrustAction(cookies, url, 'error');
		if (guardResult) return guardResult;

		if (!isSameOriginOnboardingAction(request, url)) {
			return fail(403, { error: 'Continue must be submitted from this Obzorarr origin' });
		}

		await setOnboardingStep(OnboardingSteps.PLEX);
		redirect(303, '/onboarding/plex');
	},

	goBack: async ({ cookies, url }) => {
		const guardResult = await requireOnboardingProxyTrustAction(cookies, url, 'error');
		if (guardResult) return guardResult;

		await setOnboardingStep(OnboardingSteps.CSRF);
		redirect(303, '/onboarding/csrf');
	},

	diagnoseReverseProxy: async ({ request, cookies, url, getClientAddress, setHeaders }) => {
		setHeaders({ 'Cache-Control': 'no-store' });
		const guardResult = await requireOnboardingProxyTrustAction(cookies, url, 'diagnosticError');
		if (guardResult) return guardResult;

		const formData = await request.formData();
		const parsed = BrowserOriginSchema.safeParse({
			browserOrigin: formData.get('browserOrigin')
		});
		if (!parsed.success) {
			return fail(400, {
				diagnosticError:
					parsed.error.issues[0]?.message ?? 'Could not read the browser origin safely'
			});
		}

		try {
			const diagnostic = await createReverseProxyDiagnostic({
				request,
				effectiveAppUrl: url,
				browserOrigin: parsed.data.browserOrigin,
				sourceAddress: getClientAddress()
			});
			return { reverseProxyDiagnostic: diagnostic };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown diagnostic error';
			logger.error(`Onboarding reverse proxy diagnostic failed: ${message}`, 'Onboarding');
			return fail(500, { diagnosticError: 'Could not run reverse proxy diagnostic' });
		}
	}
};
