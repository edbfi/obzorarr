import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { getPublicLandingLookupEnabled } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { playHistory } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import { isSecureRequest } from '$lib/server/security/cookie-security';
import { getEffectiveShareMode, getPublicShareIdentifier } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { createYearFilter } from '$lib/server/stats/utils';
import { triggerLiveSyncIfNeeded } from '$lib/server/sync/live-sync';
import { findUserByUsername } from '$lib/server/sync/plex-accounts.service';
import type { Actions, PageServerLoad } from './$types';

const LOOKUP_LIVE_SYNC_COOKIE = 'lookup_live_sync';
const LOOKUP_LIVE_SYNC_COOKIE_MAX_AGE_SECONDS = 60;

const UsernameSchema = z.object({
	username: z
		.string()
		.transform((val) => val.trim())
		.pipe(z.string().min(1, 'Username is required').max(100, 'Username is too long'))
});

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, locals.user.isAdmin ? '/admin' : '/dashboard');
	}

	// The administrator controls whether anonymous current-year lookup exists.
	// The same setting also establishes the effective public default enforced by
	// the action and destination loader, so the form cannot advertise a dead path.
	return {
		currentYear: new Date().getFullYear(),
		publicLookupEnabled: await getPublicLandingLookupEnabled(),
		loginHref: '/auth/plex'
	};
};

export const actions: Actions = {
	lookupUser: async ({ request, cookies, url }) => {
		// Defense in depth: the template hides the form when the toggle is off, but
		// a crafted POST would still reach this action. Refuse before doing any
		// lookup work. The per-user getEffectiveShareMode 404 below remains the
		// deepest data gate regardless of this toggle.
		if (!(await getPublicLandingLookupEnabled())) {
			logger.debug('Rejected landing lookup: public lookup is disabled', 'LandingLookup');
			return fail(403, {
				error: 'Public lookup is disabled on this server.',
				requiresAuth: true
			});
		}

		const formData = await request.formData();
		const rawUsername = formData.get('username')?.toString() ?? '';

		const parsed = UsernameSchema.safeParse({ username: rawUsername });
		if (!parsed.success) {
			return fail(400, {
				error: parsed.error.issues[0]?.message ?? 'Invalid username',
				username: rawUsername,
				requiresAuth: false
			});
		}

		const { username } = parsed.data;

		const userResult = await findUserByUsername(username, { createIfMissing: false });
		const currentYear = new Date().getFullYear();
		const publicLookupFailure = {
			error: 'No publicly shared Wrapped found for that username.',
			username,
			requiresAuth: false
		};

		if (!userResult) {
			return fail(404, publicLookupFailure);
		}
		const yearFilter = createYearFilter(currentYear);
		const history = await db
			.select({ id: playHistory.id })
			.from(playHistory)
			.where(
				and(
					eq(playHistory.accountId, userResult.accountId),
					gte(playHistory.viewedAt, yearFilter.startTimestamp),
					lt(playHistory.viewedAt, yearFilter.endTimestamp + 1)
				)
			)
			.limit(1);
		if (!history[0]) {
			return fail(404, publicLookupFailure);
		}

		const effectiveMode = await getEffectiveShareMode(userResult.userId, currentYear, currentYear);
		if (effectiveMode !== ShareMode.PUBLIC) {
			return fail(404, publicLookupFailure);
		}

		try {
			const liveSyncResult = await triggerLiveSyncIfNeeded('landing-page-lookup');

			if (liveSyncResult.reason === 'error') {
				logger.warn('Lookup-triggered live sync failed to start', 'LandingLookup');
			}

			if (liveSyncResult.triggered || liveSyncResult.syncInProgress) {
				cookies.set(LOOKUP_LIVE_SYNC_COOKIE, '1', {
					path: '/wrapped',
					httpOnly: true,
					secure: isSecureRequest(url),
					sameSite: 'lax',
					maxAge: LOOKUP_LIVE_SYNC_COOKIE_MAX_AGE_SECONDS
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error(`Lookup-triggered live sync failed: ${message}`, 'LandingLookup');
		}

		// The mode may become more restrictive while the nonblocking sync runs.
		// Landing lookup must still never mint or disclose a private-link token;
		// the opaque slug is authorized again by the destination loader.
		const publicSlug = await getPublicShareIdentifier(userResult.userId, currentYear);
		redirect(303, `/wrapped/${currentYear}/u/${publicSlug}`);
	}
};
