import { AppSettingsKey, getAppSetting } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import { env } from '$lib/server/private-env';
import { getSyncProgress, type LiveSyncProgress } from './progress';
import { startBackgroundSync } from './scheduler';
import { isSyncRunning } from './service';

const LIVE_SYNC_COOLDOWN_MS = 3 * 60 * 1000;
const LOCK_SAFETY_TIMEOUT_MS = 30 * 60 * 1000;
const SYNC_CHECK_INTERVAL_MS = 1000;
const _PROGRESS_CLEAR_DELAY_MS = 5000;

export interface LiveSyncResult {
	triggered: boolean;
	syncInProgress: boolean;
	reason?: 'disabled' | 'cooldown' | 'already_running' | 'lock_held' | 'error';
	cooldownRemaining?: number;
}

export interface SyncStatus {
	inProgress: boolean;
	progress: LiveSyncProgress | null;
}

let syncLock: {
	acquired: boolean;
	acquiredAt: Date | null;
	acquiredBy: string | null;
} = {
	acquired: false,
	acquiredAt: null,
	acquiredBy: null
};

export function tryAcquireSyncLock(source: string): boolean {
	if (syncLock.acquired) {
		return false;
	}

	syncLock = {
		acquired: true,
		acquiredAt: new Date(),
		acquiredBy: source
	};

	return true;
}

export function releaseSyncLock(): void {
	syncLock = {
		acquired: false,
		acquiredAt: null,
		acquiredBy: null
	};
}

export function isSyncLockHeld(): boolean {
	return syncLock.acquired;
}

export function getSyncLockInfo(): {
	acquired: boolean;
	acquiredAt: Date | null;
	acquiredBy: string | null;
} {
	return { ...syncLock };
}

let lastLiveSyncCompletedAt: Date | null = null;

export function canTriggerLiveSync(): boolean {
	if (!lastLiveSyncCompletedAt) {
		return true;
	}

	const elapsed = Date.now() - lastLiveSyncCompletedAt.getTime();
	return elapsed >= LIVE_SYNC_COOLDOWN_MS;
}

export function recordLiveSyncCompletion(): void {
	lastLiveSyncCompletedAt = new Date();
}

export function getTimeUntilNextSync(): number {
	if (!lastLiveSyncCompletedAt) {
		return 0;
	}

	const elapsed = Date.now() - lastLiveSyncCompletedAt.getTime();
	return Math.max(0, LIVE_SYNC_COOLDOWN_MS - elapsed);
}

export function getLiveSyncCooldownMs(): number {
	return LIVE_SYNC_COOLDOWN_MS;
}

export async function isLiveSyncEnabled(): Promise<boolean> {
	const envValue = env.ENABLE_LIVE_SYNC;
	if (envValue !== undefined && envValue !== '') {
		return envValue.toLowerCase() === 'true';
	}

	const dbValue = await getAppSetting(AppSettingsKey.ENABLE_LIVE_SYNC);
	if (dbValue !== null) {
		return dbValue.toLowerCase() === 'true';
	}

	return true;
}

export async function triggerLiveSyncIfNeeded(source: string): Promise<LiveSyncResult> {
	const enabled = await isLiveSyncEnabled();
	if (!enabled) {
		logger.debug('Live sync disabled, skipping', 'LiveSync');
		return { triggered: false, syncInProgress: false, reason: 'disabled' };
	}

	if (!canTriggerLiveSync()) {
		const remaining = getTimeUntilNextSync();
		logger.debug(
			`Live sync cooldown active (${Math.round(remaining / 1000)}s remaining)`,
			'LiveSync'
		);
		return {
			triggered: false,
			syncInProgress: await isSyncRunning(),
			reason: 'cooldown',
			cooldownRemaining: remaining
		};
	}

	if (await isSyncRunning()) {
		logger.debug('Sync already running, skipping live sync trigger', 'LiveSync');
		return { triggered: false, syncInProgress: true, reason: 'already_running' };
	}

	if (!tryAcquireSyncLock(source)) {
		logger.debug(`Failed to acquire sync lock (held by: ${syncLock.acquiredBy})`, 'LiveSync');
		return { triggered: false, syncInProgress: true, reason: 'lock_held' };
	}

	try {
		if (await isSyncRunning()) {
			releaseSyncLock();
			return { triggered: false, syncInProgress: true, reason: 'already_running' };
		}

		logger.info(`Live sync triggered from: ${source}`, 'LiveSync');
		const result = await startBackgroundSync();

		if (result.started) {
			schedulePostSyncCleanup();

			return { triggered: true, syncInProgress: true };
		} else {
			releaseSyncLock();
			logger.debug(`Background sync failed to start: ${result.error}`, 'LiveSync');
			return { triggered: false, syncInProgress: false, reason: 'error' };
		}
	} catch (error) {
		releaseSyncLock();
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error(`Live sync trigger failed: ${message}`, 'LiveSync');
		return { triggered: false, syncInProgress: false, reason: 'error' };
	}
}

function schedulePostSyncCleanup(): void {
	const checkInterval = setInterval(() => {
		const progress = getSyncProgress();

		if (!progress || progress.status !== 'running') {
			clearInterval(checkInterval);
			releaseSyncLock();

			if (progress?.status === 'completed') {
				recordLiveSyncCompletion();
				logger.debug('Live sync completed, cooldown started', 'LiveSync');
			} else if (progress?.status === 'failed') {
				logger.debug('Live sync failed, no cooldown applied', 'LiveSync');
			} else if (progress?.status === 'cancelled') {
				logger.debug('Live sync cancelled, no cooldown applied', 'LiveSync');
			}
		}
	}, SYNC_CHECK_INTERVAL_MS);

	setTimeout(() => {
		clearInterval(checkInterval);
		if (isSyncLockHeld()) {
			releaseSyncLock();
			logger.warn('Live sync lock released due to safety timeout', 'LiveSync');
		}
	}, LOCK_SAFETY_TIMEOUT_MS);
}

export async function getSyncStatus(): Promise<SyncStatus> {
	return {
		inProgress: await isSyncRunning(),
		progress: getSyncProgress()
	};
}
