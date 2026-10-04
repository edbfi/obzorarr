import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import {
	clearBootstrapToken,
	ONBOARDING_CLAIM_REQUIRED_MESSAGE
} from '$lib/server/onboarding/bootstrap';
import { OnboardingSteps, setOnboardingStep } from '$lib/server/onboarding/status';
import { env } from '$lib/server/private-env';
import { load as layoutLoad } from '../../../src/routes/onboarding/+layout.server';
import { actions as completeActions } from '../../../src/routes/onboarding/complete/+page.server';
import { actions as plexActions } from '../../../src/routes/onboarding/plex/+page.server';
import { actions as settingsActions } from '../../../src/routes/onboarding/settings/+page.server';
import { actions as syncActions } from '../../../src/routes/onboarding/sync/+page.server';
import {
	claimOnboardingCookies,
	createOnboardingCookies,
	createThrowingOnboardingCookies,
	expectRedirect,
	type OnboardingTestCookies,
	onboardingAdminLocals,
	resetOnboardingTestState
} from '../../helpers/onboarding';

type Action = (event: unknown) => Promise<unknown>;

const adminLocals = onboardingAdminLocals as unknown as App.Locals;
const anonymousLocals = {} as App.Locals;
const nonAdminLocals = {
	user: { id: 2, plexId: 2, username: 'user', isAdmin: false }
} as unknown as App.Locals;

const claimCheckedActions = [
	['plex.verifyAdmin', plexActions.verifyAdmin],
	['plex.continueAfterServerSelection', plexActions.continueAfterServerSelection],
	['plex.forceManualSelection', plexActions.forceManualSelection],
	['plex.confirmOwnershipOverride', plexActions.confirmOwnershipOverride],
	['settings.saveSettings', settingsActions.saveSettings],
	['settings.skipSettings', settingsActions.skipSettings],
	['settings.testAIConnection', settingsActions.testAIConnection],
	['sync.startSync', syncActions.startSync],
	['sync.cancelSync', syncActions.cancelSync],
	['sync.continue', syncActions.continue],
	['complete.goToDashboard', completeActions.goToDashboard]
] as const;

const adminRequiredActions = [
	['settings.saveSettings', settingsActions.saveSettings],
	['settings.skipSettings', settingsActions.skipSettings],
	['settings.testAIConnection', settingsActions.testAIConnection],
	['sync.startSync', syncActions.startSync],
	['sync.cancelSync', syncActions.cancelSync],
	['sync.continue', syncActions.continue],
	['complete.goToDashboard', completeActions.goToDashboard]
] as const;

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

async function runLayout(
	pathname: string,
	cookies: Parameters<typeof layoutLoad>[0]['cookies'] = createOnboardingCookies()
) {
	return layoutLoad({
		cookies,
		locals: adminLocals,
		url: new URL(`http://localhost${pathname}`)
	} as unknown as Parameters<typeof layoutLoad>[0]);
}

async function runAction(
	action: unknown,
	cookies: OnboardingTestCookies | ReturnType<typeof createThrowingOnboardingCookies>,
	locals: App.Locals = adminLocals
): Promise<unknown> {
	const request = new Request('http://localhost/onboarding', {
		method: 'POST',
		body: new FormData()
	});

	return (action as Action)({ request, locals, cookies, url: new URL(request.url) });
}

describe('onboarding layout claim routing', () => {
	let previousPlexServerUrl: string | undefined;
	let previousPlexToken: string | undefined;

	beforeEach(async () => {
		await resetOnboardingTestState();
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'false');
		previousPlexServerUrl = envRecord().PLEX_SERVER_URL;
		previousPlexToken = envRecord().PLEX_TOKEN;
		envRecord().PLEX_SERVER_URL = '';
		envRecord().PLEX_TOKEN = '';
	});

	afterEach(() => {
		if (previousPlexServerUrl === undefined) delete envRecord().PLEX_SERVER_URL;
		else envRecord().PLEX_SERVER_URL = previousPlexServerUrl;
		if (previousPlexToken === undefined) delete envRecord().PLEX_TOKEN;
		else envRecord().PLEX_TOKEN = previousPlexToken;
	});

	it('lets a no-claim browser render the claim page after setup has advanced', async () => {
		await setOnboardingStep(OnboardingSteps.CSRF);
		const result = await runLayout('/onboarding/claim');
		if (!result) expect.unreachable('Expected onboarding layout data');
		expect(result.currentStep).toBe(OnboardingSteps.CLAIM);
		expect(result.currentStepIndex).toBe(0);
	});

	it('redirects no-claim browsers from guarded onboarding steps back to claim', async () => {
		await setOnboardingStep(OnboardingSteps.CSRF);
		await expectRedirect(() => runLayout('/onboarding/csrf'), '/onboarding/claim');
	});

	it('keeps active-claim browsers pinned to the current onboarding step', async () => {
		const cookies = await claimOnboardingCookies();
		await setOnboardingStep(OnboardingSteps.CSRF);
		await expectRedirect(() => runLayout('/onboarding/claim', cookies), '/onboarding/csrf');
	});
});

describe('onboarding page action claim and admin guards', () => {
	beforeEach(async () => {
		await resetOnboardingTestState();
		clearBootstrapToken();
	});

	it.each(claimCheckedActions)(
		'%s returns the shared claim-required failure',
		async (_name, action) => {
			const result = await runAction(action, createOnboardingCookies());
			expect(result).toMatchObject({
				status: 403,
				data: { error: ONBOARDING_CLAIM_REQUIRED_MESSAGE }
			});
		}
	);

	it.each(claimCheckedActions)('%s propagates unexpected claim errors', async (name, action) => {
		const unexpected = new Error(`unexpected claim renewal failure in ${name}`);
		try {
			await runAction(action, createThrowingOnboardingCookies(unexpected));
			expect.unreachable('Expected unexpected claim error to be thrown');
		} catch (error) {
			expect(error).toBe(unexpected);
		}
	});

	it.each(adminRequiredActions)(
		'%s preserves the admin failure after a valid setup claim',
		async (_name, action) => {
			const cookies = await claimOnboardingCookies();
			for (const locals of [anonymousLocals, nonAdminLocals]) {
				const result = await runAction(action, cookies, locals);
				expect(result).toMatchObject({
					status: 403,
					data: { error: 'Admin access required' }
				});
			}
		}
	);
});
