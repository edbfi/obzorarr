import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getApiConfigWithSources } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import {
	type OnboardingClaimCookieContext,
	requireActiveOnboardingClaim,
	requiresOnboarding
} from '$lib/server/onboarding';
import { isSecureRequest } from '$lib/server/security/cookie-security';
import { requireServerMembership, verifyServerOwnership } from './membership';
import { clearPinTransaction, getPinTransactionForRequest } from './pin-transactions';
import { checkPinStatus, getPlexUserInfo } from './plex-oauth';
import { markSessionRevalidated } from './revalidation';
import { createSession } from './session';
import { NotServerMemberError, PinExpiredError, SESSION_DURATION_MS } from './types';

function sessionCookieOptions(requestUrl: URL) {
	return {
		path: '/',
		httpOnly: true,
		secure: isSecureRequest(requestUrl),
		sameSite: 'lax' as const,
		maxAge: Math.floor(SESSION_DURATION_MS / 1000)
	};
}

const ONBOARDING_OWNER_REQUIRED_MESSAGE =
	'Only the server owner can configure Obzorarr. Sign in with the owner account.';

// SvelteKit throws a bare `Error` (no subclass/`.code`) when `cookies.set(...)` runs
// after the response is generated, so this trailing substring of its message is the
// only available discriminator. It is stable across SvelteKit 2.x but is an undocumented
// internal — if a future version reworks the wording, the guard below logs `err.message`
// so the mismatch is diagnosable.
const RESPONSE_ALREADY_GENERATED_MESSAGE = 'after the response has been generated';

export interface CompletedLoginUser {
	username: string;
	isAdmin: boolean;
}

export interface CompletedLogin {
	user: CompletedLoginUser;
	redirectTo: '/admin' | '/dashboard';
}

export type PinLoginResult = { pending: true } | CompletedLogin;

export async function createSessionFromPlexToken(
	authToken: string,
	cookies: Cookies,
	context: OnboardingClaimCookieContext
): Promise<CompletedLogin> {
	const plexUser = await getPlexUserInfo(authToken);

	const isOnboarding = await requiresOnboarding();
	const apiConfig = await getApiConfigWithSources();
	const hasServerConfigured = !!apiConfig.plex.serverUrl.value;

	let isAdmin = false;
	let accountId: number;

	if (isOnboarding) {
		await requireActiveOnboardingClaim(cookies, context);

		if (hasServerConfigured) {
			const membership = await requireServerMembership(authToken);

			if (!membership.isOwner) {
				throw new NotServerMemberError(ONBOARDING_OWNER_REQUIRED_MESSAGE);
			}

			isAdmin = true;
			accountId = 1;
		} else {
			const ownership = await verifyServerOwnership(authToken);

			if (!ownership.isOwner) {
				throw new NotServerMemberError('You must own a Plex server to configure Obzorarr.');
			}

			isAdmin = true;
			accountId = 1;
		}
	} else {
		const membership = await requireServerMembership(authToken);

		isAdmin = membership.isOwner;
		accountId = membership.isOwner ? 1 : plexUser.id;
	}

	const existingUser = await db.query.users.findFirst({
		where: eq(users.plexId, plexUser.id)
	});

	let userId: number;

	if (existingUser) {
		await db
			.update(users)
			.set({
				username: plexUser.username,
				email: plexUser.email,
				thumb: plexUser.thumb ?? null,
				isAdmin,
				accountId
			})
			.where(eq(users.id, existingUser.id));

		userId = existingUser.id;
	} else {
		const result = await db
			.insert(users)
			.values({
				plexId: plexUser.id,
				accountId,
				username: plexUser.username,
				email: plexUser.email,
				thumb: plexUser.thumb ?? null,
				isAdmin
			})
			.returning({ id: users.id });

		const insertedUser = result[0];
		if (!insertedUser) {
			throw new Error('Failed to create user');
		}
		userId = insertedUser.id;
	}

	const sessionId = await createSession({
		userId,
		plexToken: authToken,
		isAdmin
	});

	// Membership/ownership was just verified above, so prime the revalidation
	// cache for this session. Without this, the very next request (e.g. the
	// GET /admin that follows onboarding completion) is the session's first-ever
	// revalidation and re-probes Plex immediately; a transient /identity blip on
	// that probe would hard-revoke a legitimately authenticated owner (observed
	// in the dogfood: owner revoked the instant onboarding completed). Seeding
	// does not alter the ownership/isAdmin decision made above.
	markSessionRevalidated(sessionId, { isMember: true, isOwner: isAdmin });

	// The session row is already persisted above; this cookie write is what
	// actually logs the browser in. In a race the underlying request can be
	// aborted before this runs (e.g. an overlapping `/auth/plex` poll whose
	// client already navigated after a sibling poll won the login). SvelteKit
	// then throws "Cannot use cookies.set(...) after the response has been
	// generated". That request's response is discarded anyway, so swallow only
	// that specific error instead of surfacing a spurious 500; re-throw the rest.
	try {
		cookies.set('session', sessionId, sessionCookieOptions(context.requestUrl));
	} catch (err) {
		if (!(err instanceof Error) || !err.message.includes(RESPONSE_ALREADY_GENERATED_MESSAGE)) {
			throw err;
		}
		logger.warn(
			'Skipped session cookie write on an already-generated response (aborted login race)',
			'Auth',
			{ errorType: err.name, errorMessage: err.message }
		);
	}

	return {
		user: {
			username: plexUser.username,
			isAdmin
		},
		redirectTo: isAdmin ? '/admin' : '/dashboard'
	};
}

export async function completePlexPinLogin(
	pinId: number,
	cookies: Cookies,
	context: OnboardingClaimCookieContext
): Promise<PinLoginResult> {
	const transaction = await getPinTransactionForRequest(pinId, cookies);
	if (!transaction) {
		throw new PinExpiredError('Login session expired or invalid. Sign in again.');
	}

	if (!transaction.callbackVerified) {
		return { pending: true };
	}

	const pinStatus = await checkPinStatus(pinId);

	if (!pinStatus.authToken) {
		return { pending: true };
	}

	const completed = await createSessionFromPlexToken(pinStatus.authToken, cookies, context);
	try {
		await clearPinTransaction(cookies, transaction.state, context.requestUrl);
	} catch (err) {
		logger.warn('Failed to clear Plex PIN transaction after successful login', 'Auth', {
			errorType: err instanceof Error ? err.name : typeof err
		});
	}
	return completed;
}
