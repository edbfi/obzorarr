import { getWrappedTheme } from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import { requiresOnboarding } from '$lib/server/onboarding';
import { isSecureRequest } from '$lib/server/security/cookie-security';
import { getSyncStatus } from '$lib/server/sync/live-sync';
import type { LayoutServerLoad } from './$types';

const LOOKUP_LIVE_SYNC_COOKIE = 'lookup_live_sync';

export const load: LayoutServerLoad = async ({ cookies, locals, url }) => {
	const lookupSyncTriggered = cookies.get(LOOKUP_LIVE_SYNC_COOKIE) === '1';
	if (lookupSyncTriggered) {
		cookies.delete(LOOKUP_LIVE_SYNC_COOKIE, { path: '/wrapped', secure: isSecureRequest(url) });
	}

	const [wrappedTheme, availableYears, onboardingPending] = await Promise.all([
		getWrappedTheme(),
		getAvailableYears(),
		requiresOnboarding()
	]);
	const syncStatusEnabled = Boolean(locals.user) || onboardingPending;
	const syncStatus = syncStatusEnabled ? await getSyncStatus() : null;

	return {
		wrappedTheme,
		syncStatusEnabled,
		syncStatus,
		availableYears,
		lookupSyncTriggered
	};
};
