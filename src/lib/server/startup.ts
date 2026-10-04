import {
	clearConflictingDbSettings,
	getSchedulerTimezone,
	removeRetiredTrustProxySetting
} from '$lib/server/admin/settings.service';
import { logger, setupLogRetentionScheduler, stopLogRetentionScheduler } from '$lib/server/logging';
import { env } from '$lib/server/private-env';
import { reconcileInterruptedSyncs } from '$lib/server/sync/reconcile';
import { stopSyncScheduler } from '$lib/server/sync/scheduler';
import { restoreSyncScheduler } from '$lib/server/sync/scheduler-state';

type StartupTask = () => Promise<unknown>;

export function createServerInitializer(task: StartupTask): () => Promise<void> {
	let initialization: Promise<void> | undefined;

	return () => {
		initialization ??= Promise.resolve()
			.then(task)
			.then(() => undefined);
		return initialization;
	};
}

/**
 * Brings both cron jobs up with the effective timezone before the first request.
 *
 * Neither job used to exist until an admin opened a page (`/admin/sync` for the
 * sync schedule, `/admin/logs` for retention), so a restart dropped a configured
 * schedule entirely and log retention only ran on instances whose admin happened
 * to visit the logs page. A failure here must not block startup: the request
 * pipeline is still serviceable without a scheduler.
 */
async function startSchedulers(): Promise<void> {
	try {
		const timezone = await getSchedulerTimezone();
		setupLogRetentionScheduler({ timezone });
		await restoreSyncScheduler(timezone);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to start schedulers: ${message}`, 'Startup');
	}
}

/**
 * The one startup warning for the retired TRUST_PROXY setting, or null when nobody still sets
 * it. `fromEnvironment`: TRUST_PROXY is set (to anything) in the environment; `fromSettings`:
 * a stored admin or onboarding toggle had turned header trust on (startup deletes the row).
 * It names the replacement and never repeats a configured value.
 */
export function retiredTrustProxyWarning(source: {
	fromEnvironment: boolean;
	fromSettings: boolean;
}): string | null {
	if (!source.fromEnvironment && !source.fromSettings) return null;
	const removed = source.fromSettings
		? ': the saved reverse-proxy header trust switch has been removed'
		: '';
	const unset = source.fromEnvironment ? ', and remove TRUST_PROXY from the environment' : '';
	return (
		`TRUST_PROXY is no longer supported and is ignored${removed}. ` +
		'Set ORIGIN to the address users open, with the scheme they use (http:// for plain HTTP), ' +
		`for example ORIGIN=https://obzorarr.example.com${unset}. ` +
		'Without ORIGIN, behind a proxy that every request passes through and that overwrites both ' +
		'headers, PROTOCOL_HEADER=x-forwarded-proto and HOST_HEADER=x-forwarded-host take its place.'
	);
}

async function warnAboutRetiredTrustProxy(): Promise<void> {
	const warning = retiredTrustProxyWarning({
		fromEnvironment: (env.TRUST_PROXY ?? '').trim() !== '',
		fromSettings: await removeRetiredTrustProxySetting()
	});
	if (warning) logger.warn(warning, 'Startup');
}

async function reconcileStartupState(): Promise<void> {
	const clearedSettings = await clearConflictingDbSettings();
	if (clearedSettings.length > 0) {
		logger.info(
			`Reconciled ${clearedSettings.length} startup configuration item(s): ${clearedSettings.join(', ')}`,
			'Startup'
		);
	}
	await warnAboutRetiredTrustProxy();
	await reconcileInterruptedSyncs();
	await startSchedulers();
	// The adapter stops HTTP on SIGTERM/SIGINT; cron timers must stop too.
	// Stop only in-memory jobs so persisted operator intent survives a restart.
	process.once('sveltekit:shutdown', () => {
		stopSyncScheduler();
		stopLogRetentionScheduler();
		void logger.forceFlush();
	});
}

export const initializeServer = createServerInitializer(reconcileStartupState);
