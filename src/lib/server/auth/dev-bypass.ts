import { eq } from 'drizzle-orm';
import { dev } from '$app/env';
import { getPlexConfig } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { playHistory, sessions, users } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import { env } from '$lib/server/private-env';
import {
	getRandomNonOwnerUser,
	getServerOwner,
	getServerUsers,
	resolveUserIdentifier
} from './dev-users';
import { getPlexUserInfo } from './plex-oauth';
import { type NormalizedServerUser, SESSION_DURATION_MS } from './types';

const FALLBACK_PLEX_ID = 999999999;
const FALLBACK_USERNAME = 'dev-admin';
const DEV_SESSION_ID = 'dev-bypass-session-00000000-0000-0000-0000-000000000000';

let cachedRandomUser: NormalizedServerUser | null = null;

function getDevPlexToken(): string | undefined {
	return env.DEV_PLEX_TOKEN?.trim() || undefined;
}

export function isDevBypassEnabled(): boolean {
	// Development-only: never permit an auth bypass outside SvelteKit dev mode.
	if (!dev) {
		return false;
	}

	return env.DEV_BYPASS_AUTH === 'true';
}

async function getFallbackUser(): Promise<NormalizedServerUser> {
	const adminUser = await db.query.users.findFirst({
		where: eq(users.isAdmin, true)
	});

	if (adminUser) {
		logger.info(
			`Dev bypass: Using existing admin user ${adminUser.plexId} (${adminUser.username}) as fallback`,
			'DevBypass'
		);
		return {
			plexId: adminUser.plexId,
			username: adminUser.username,
			email: adminUser.email,
			thumb: adminUser.thumb,
			isOwner: true
		};
	}

	// Prefer a history-backed fallback so dev dashboards exercise real stats.
	const userWithHistory = await db
		.selectDistinct({ accountId: playHistory.accountId })
		.from(playHistory)
		.limit(1);

	const firstUserWithHistory = userWithHistory[0];
	if (firstUserWithHistory) {
		const accountId = firstUserWithHistory.accountId;
		const existingUser = await db.query.users.findFirst({
			where: eq(users.plexId, accountId)
		});

		if (existingUser) {
			logger.info(
				`Dev bypass: Using user with play history ${existingUser.plexId} (${existingUser.username}) as fallback`,
				'DevBypass'
			);
			return {
				plexId: existingUser.plexId,
				username: existingUser.username,
				email: existingUser.email,
				thumb: existingUser.thumb,
				isOwner: existingUser.isAdmin ?? false
			};
		}

		// Orphaned history still has a usable local Plex account id for stats joins.
		logger.info(
			`Dev bypass: Using orphaned play history accountId ${accountId} as fallback (user may be deleted)`,
			'DevBypass'
		);
		return {
			plexId: accountId,
			username: `user-${accountId}`,
			email: null,
			thumb: null,
			isOwner: true
		};
	}

	logger.warn(
		'Dev bypass: No existing users found in database, using mock user (stats will be empty)',
		'DevBypass'
	);
	return {
		plexId: FALLBACK_PLEX_ID,
		username: FALLBACK_USERNAME,
		email: null,
		thumb: null,
		isOwner: true
	};
}

async function resolveTargetUser(): Promise<NormalizedServerUser> {
	const bypassUserSetting = env.DEV_BYPASS_USER?.trim() ?? '';
	const devPlexToken = getDevPlexToken();

	const config = await getPlexConfig();
	const hasConfiguredServer = Boolean(config.serverUrl && config.token);

	// DEV_PLEX_TOKEN lets onboarding tests use a real Plex identity before the
	// main server credentials exist.
	if (devPlexToken && !hasConfiguredServer && !bypassUserSetting) {
		try {
			const userInfo = await getPlexUserInfo(devPlexToken);
			logger.info(
				`Dev bypass: Using DEV_PLEX_TOKEN identity ${userInfo.id} (${userInfo.username}) for onboarding testing`,
				'DevBypass'
			);
			return {
				plexId: userInfo.id,
				username: userInfo.username,
				email: userInfo.email,
				thumb: userInfo.thumb ?? null,
				isOwner: true
			};
		} catch (error) {
			logger.warn(
				`Dev bypass: Failed to fetch user info using DEV_PLEX_TOKEN: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'DevBypass'
			);
		}
	}

	try {
		if (!bypassUserSetting) {
			const owner = await getServerOwner();
			logger.info(
				`Dev bypass: Using server owner ${owner.plexId} (${owner.username})`,
				'DevBypass'
			);
			return owner;
		}

		if (bypassUserSetting.toLowerCase() === 'random') {
			if (cachedRandomUser) {
				return cachedRandomUser;
			}

			const randomUser = await getRandomNonOwnerUser();

			if (randomUser) {
				cachedRandomUser = randomUser;
				logger.info(
					`Dev bypass: Randomly selected user ${randomUser.plexId} (${randomUser.username})`,
					'DevBypass'
				);
				return randomUser;
			}

			logger.warn(
				'Dev bypass: No shared users found for random selection, using server owner',
				'DevBypass'
			);
			const owner = await getServerOwner();
			cachedRandomUser = owner;
			return owner;
		}

		const specificUser = await resolveUserIdentifier(bypassUserSetting);

		if (specificUser) {
			logger.info(
				`Dev bypass: Using specified user ${specificUser.plexId} (${specificUser.username})`,
				'DevBypass'
			);
			return specificUser;
		}

		logger.info(
			`Dev bypass: User "${bypassUserSetting}" not found on Plex server, checking local database`,
			'DevBypass'
		);

		const plexIdNum = parseInt(bypassUserSetting, 10);
		const dbUser = await db.query.users.findFirst({
			where: Number.isNaN(plexIdNum)
				? eq(users.username, bypassUserSetting)
				: eq(users.plexId, plexIdNum)
		});

		if (dbUser) {
			logger.info(
				`Dev bypass: Found user in local database: ${dbUser.plexId} (${dbUser.username})`,
				'DevBypass'
			);
			return {
				plexId: dbUser.plexId,
				username: dbUser.username,
				email: dbUser.email,
				thumb: dbUser.thumb,
				isOwner: dbUser.isAdmin ?? false
			};
		}

		logger.warn(
			`Dev bypass: User "${bypassUserSetting}" not found in Plex or database, falling back to owner`,
			'DevBypass'
		);

		const { owner, sharedUsers } = await getServerUsers();
		const availableUsers = [owner, ...sharedUsers]
			.map((u) => `${u.plexId} (${u.username})`)
			.join(', ');
		logger.info(`Dev bypass: Available Plex users: ${availableUsers}`, 'DevBypass');

		return owner;
	} catch (error) {
		logger.warn(
			`Dev bypass: Failed to fetch Plex users, attempting to use existing database user. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			'DevBypass'
		);
		return await getFallbackUser();
	}
}

async function getOrCreateDevUser(targetUser: NormalizedServerUser): Promise<number> {
	// Plex history keys owner playback as accountId=1, while shared users use
	// their Plex ID; matching that split keeps dev-bypass stats populated.
	const accountId = targetUser.isOwner ? 1 : targetUser.plexId;

	const existingUser = await db.query.users.findFirst({
		where: eq(users.plexId, targetUser.plexId)
	});

	if (existingUser) {
		await db
			.update(users)
			.set({
				username: targetUser.username,
				email: targetUser.email,
				thumb: targetUser.thumb,
				isAdmin: targetUser.isOwner,
				accountId
			})
			.where(eq(users.id, existingUser.id));

		return existingUser.id;
	}

	const result = await db
		.insert(users)
		.values({
			plexId: targetUser.plexId,
			accountId,
			username: targetUser.username,
			email: targetUser.email,
			thumb: targetUser.thumb,
			isAdmin: targetUser.isOwner
		})
		.returning({ id: users.id });

	const newUser = result[0];
	if (!newUser) {
		throw new Error('Failed to create dev bypass user');
	}

	logger.info(
		`Created dev bypass user: ${targetUser.plexId} (${targetUser.username}) with ID ${newUser.id}`,
		'DevBypass'
	);
	return newUser.id;
}

export async function getOrCreateDevSession(): Promise<string> {
	const targetUser = await resolveTargetUser();

	const userId = await getOrCreateDevUser(targetUser);

	const existingSession = await db.query.sessions.findFirst({
		where: eq(sessions.id, DEV_SESSION_ID)
	});

	const now = new Date();

	if (existingSession && existingSession.expiresAt > now) {
		if (existingSession.userId === userId) {
			return DEV_SESSION_ID;
		}
		await db.delete(sessions).where(eq(sessions.id, DEV_SESSION_ID));
	} else if (existingSession) {
		await db.delete(sessions).where(eq(sessions.id, DEV_SESSION_ID));
	}

	const devPlexToken = getDevPlexToken();
	const config = await getPlexConfig();
	const plexToken = devPlexToken || config.token || 'dev-token';

	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await db.insert(sessions).values({
		id: DEV_SESSION_ID,
		userId,
		plexToken,
		isAdmin: targetUser.isOwner,
		expiresAt
	});

	logger.info(
		`Dev bypass session created for ${targetUser.username} (expires: ${expiresAt.toISOString()})`,
		'DevBypass'
	);

	return DEV_SESSION_ID;
}

export function clearCachedRandomUser(): void {
	cachedRandomUser = null;
}
