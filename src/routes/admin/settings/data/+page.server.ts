import { fail, redirect } from '@sveltejs/kit';
import {
	claimSyncSlotForReset,
	INSTANCE_RESET_TABLES,
	isResetBlockedBySync,
	RESET_CONFIRMATION_MISMATCH_MESSAGE,
	RESET_CONFIRMATION_PHRASE,
	RESET_SYNC_RUNNING_MESSAGE,
	releaseResetSyncClaim,
	wipeInstanceData
} from '$lib/server/admin/reset.service';
import {
	clearPlayHistory,
	clearStatsCache,
	countPlayHistory,
	countStatsCache
} from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import { requireAdminActions } from '$lib/server/auth/guards';
import { logout } from '$lib/server/auth/logout';
import { logger } from '$lib/server/logging';
import {
	clearOnboardingClaimCookie,
	createBootstrapToken,
	RESET_BOOTSTRAP_TOKEN_TTL_MINUTES,
	RESET_BOOTSTRAP_TOKEN_TTL_MS,
	resetBootstrapBannerState
} from '$lib/server/onboarding';
import { sanitizeApiError } from '$lib/server/security';
import { clearSyncProgress, stopSyncScheduler } from '$lib/server/sync';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [availableYears, playHistoryTotalCount, syncRunning] = await Promise.all([
		getAvailableYears(),
		countPlayHistory(),
		isResetBlockedBySync()
	]);

	return {
		availableYears,
		currentYear: new Date().getFullYear(),
		playHistoryTotalCount,
		// Drives the disabled/annotated state of the Danger zone reset button. The
		// action re-checks server-side; this is only an affordance.
		syncRunning,
		resetTableCount: Object.keys(INSTANCE_RESET_TABLES).length,
		resetTokenTtlMinutes: RESET_BOOTSTRAP_TOKEN_TTL_MINUTES,
		resetConfirmationPhrase: RESET_CONFIRMATION_PHRASE
	};
};

/**
 * Parses the optional `year` form field.
 *
 * Returns:
 *   - `undefined` when the field is missing or blank/whitespace (meaning
 *     "all years" — passed to the service-layer count/clear helpers as
 *     "no scope").
 *   - A number when the value is parseable. parseInt is permissive: it
 *     accepts decimals (silently truncated, e.g. '2024.5' → 2024) and
 *     negative integers. tests/unit/admin/data-actions.test.ts pins this
 *     behavior — a future commit that tightens validation (e.g.,
 *     positive-integers-only or a year range) should update those tests
 *     in lockstep.
 *   - `fail(400, ...)` when the value is unparseable (e.g., 'twenty-two').
 */
function parseYear(formData: FormData): number | undefined | ReturnType<typeof fail> {
	const yearStr = formData.get('year')?.toString().trim();
	if (!yearStr) return undefined;
	const year = parseInt(yearStr, 10);
	if (Number.isNaN(year)) return fail(400, { error: 'Invalid year' });
	return year;
}

export const actions: Actions = requireAdminActions({
	getCacheCount: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const count = await countStatsCache(year);
			return { success: true, count, year };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to get cache count';
			return fail(500, { error: message });
		}
	},

	clearCache: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const deleted = await clearStatsCache(year);
			const message = year
				? `Cleared ${deleted} cache entries for ${year}`
				: `Cleared ${deleted} cache entries`;
			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear cache';
			return fail(500, { error: message });
		}
	},

	getPlayHistoryCount: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const count = await countPlayHistory(year);
			return { success: true, count, year };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to get history count';
			return fail(500, { error: message });
		}
	},

	clearPlayHistory: async ({ request }) => {
		const formData = await request.formData();
		const year = parseYear(formData);
		if (typeof year === 'object') return year;
		try {
			const deleted = await clearPlayHistory(year);
			const message = year
				? `Deleted ${deleted} play history records for ${year}`
				: `Deleted ${deleted} play history records`;
			logger.info(message, 'Settings', { year, deleted });
			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear play history';
			logger.error(`Failed to clear play history: ${message}`, 'Settings', { year });
			return fail(500, { error: message });
		}
	},

	/**
	 * Stage 2 of the complete reset: mint the claim token the admin will need on
	 * the post-wipe onboarding screen, and return it to the browser. Writes
	 * NOTHING to the database and deletes nothing — dismissing the dialog after
	 * this call leaves the instance untouched.
	 *
	 * Surfacing a bootstrap token in a response narrows the console-only trust
	 * boundary that normally proves "whoever claims this instance has server
	 * access". That is acceptable here and only here: the caller is an
	 * already-authenticated administrator (requireAdminActions), who is strictly
	 * more privileged in this flow than an anonymous console reader. The token is
	 * never logged (logging/redactor.ts scrubs Plex tokens, not this one) and never
	 * returned on any other path.
	 */
	prepareInstanceReset: async () => {
		if (await isResetBlockedBySync()) {
			return fail(409, { error: RESET_SYNC_RUNNING_MESSAGE });
		}

		// Minted BEFORE the wipe on purpose: the token lives in a module-level
		// variable that a DB wipe cannot touch, whereas clearOnboardingClaim() —
		// the usual way to reset claim state — would destroy it.
		const token = createBootstrapToken(RESET_BOOTSTRAP_TOKEN_TTL_MS);
		return {
			success: true,
			token,
			expiresInMinutes: RESET_BOOTSTRAP_TOKEN_TTL_MINUTES
		};
	},

	/**
	 * Stage 3: the destructive step. Deletes every application row, logs the
	 * administrator out and returns the instance to the onboarding claim screen.
	 *
	 * Deliberately does NOT call clearOnboardingClaim()/clearBootstrapToken(): the
	 * token handed to the admin by `prepareInstanceReset` must still validate after
	 * this returns. Truncating `app_settings` already removes ONBOARDING_CLAIMED /
	 * _CLAIM_PROOF_HASH / _CLAIMED_AT and the stored step, which is what
	 * clearOnboardingClaim would have persisted.
	 */
	resetInstance: async ({ request, cookies, locals, url }) => {
		const formData = await request.formData();
		const confirmation = formData.get('confirmation')?.toString() ?? '';
		if (confirmation !== RESET_CONFIRMATION_PHRASE) {
			return fail(400, { error: RESET_CONFIRMATION_MISMATCH_MESSAGE });
		}

		const actor = locals.user ? `${locals.user.username} (id ${locals.user.id})` : 'unknown admin';
		let deletedRows: number;

		// Not a check but a HOLD: claiming the single running-sync slot is what makes
		// the sync refusal atomic with the wipe. `await logger.forceFlush()` below
		// yields, so a bare isResetBlockedBySync() left a window in which a Cron
		// callback, a second admin tab or a live-sync trigger — any of which may
		// already be suspended on its own await — could claim the slot and then
		// repopulate the freshly emptied tables. While this claim is held every sync
		// entry path is rejected before it writes a single row.
		// INVARIANT: nothing may sit between this claim and the `try` below, or a
		// throw there would leak the claim and block sync until the next restart.
		const syncClaimId = await claimSyncSlotForReset();
		if (syncClaimId === null) {
			return fail(409, { error: RESET_SYNC_RUNNING_MESSAGE });
		}
		try {
			// Flush first so log entries buffered before the reset are written into the
			// table that is about to be deleted, instead of landing in the fresh one.
			await logger.forceFlush();
			// Also deletes the claim row above — sync_status is one of the wiped tables.
			deletedRows = wipeInstanceData();
		} catch (error) {
			// The wipe did not happen, so the hold has to go back or it would block
			// every future sync and every future reset until the next restart.
			await releaseResetSyncClaim(syncClaimId);
			// Form actions bypass handleError, so sanitize before this reaches the client.
			logger.error(`Instance reset failed: ${String(error)}`, 'AdminReset');
			return fail(500, { error: sanitizeApiError(error) });
		}

		// The hold ended with the wipe (it deleted its own claim row), so from here
		// the instance is protected by onboardingHandle redirecting new requests
		// rather than by the slot. Stopping the scheduler closes the one path that
		// does not go through a request: its cron configuration lived in the
		// app_settings rows just deleted, and the in-memory progress snapshot
		// describes a sync of an instance that no longer exists.
		stopSyncScheduler();
		clearSyncProgress();

		// The sessions table is gone, so the cookie is already dead — delete it too
		// so the redirect cannot land in a half-authenticated state.
		await logout(cookies, url);
		clearOnboardingClaimCookie(cookies, url);

		// Re-arm the console banner without touching the active token: the banner is
		// the recovery path if the admin loses the tab holding the token.
		resetBootstrapBannerState();

		// Audit AFTER the wipe — the logs table is one of the tables deleted, so an
		// entry written before it would delete itself. Also emitted to the console,
		// which survives regardless.
		const auditMessage = `Instance reset completed by ${actor}: ${deletedRows} rows deleted across ${
			Object.keys(INSTANCE_RESET_TABLES).length
		} tables`;
		logger.warn(auditMessage, 'AdminReset', { deletedRows });
		console.info(`[AdminReset] ${auditMessage}`);
		await logger.forceFlush();

		redirect(303, '/onboarding/claim');
	}
});
