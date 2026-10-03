import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
// Namespace import so the persist-failure test can spy on the live `setAppSetting`
// binding without `mock.module` (which is process-global and leaks across files).
import * as settingsService from '$lib/server/admin/settings.service';
import {
	AppSettingsKey,
	clearConflictingDbSettings,
	getAppSetting,
	getSchedulerTimezone,
	getSchedulerTimezoneConfigWithSource,
	setAppSetting,
	setSchedulerTimezoneAtomic
} from '$lib/server/admin/settings.service';
import { env } from '$lib/server/private-env';
import {
	getSchedulerStatus,
	isSchedulerConfigured,
	setupSyncScheduler,
	stopSyncScheduler
} from '$lib/server/sync/scheduler';
import {
	persistSyncSchedulerState,
	readSyncSchedulerState,
	restoreSyncScheduler,
	SyncSchedulerState
} from '$lib/server/sync/scheduler-state';
import { actions } from '../../../src/routes/admin/sync/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type InitSchedulerAction = NonNullable<typeof actions.initScheduler>;
type UpdateScheduleAction = NonNullable<typeof actions.updateSchedule>;
type PauseSchedulerAction = NonNullable<typeof actions.pauseScheduler>;
type ResumeSchedulerAction = NonNullable<typeof actions.resumeScheduler>;
type StopSchedulerAction = NonNullable<typeof actions.stopScheduler>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function envRecord(): Record<string, string | undefined> {
	return env as unknown as Record<string, string | undefined>;
}

function formRequest(action: string, fields: Record<string, string> = {}): Request {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return new Request(`http://localhost/admin/sync?/${action}`, {
		method: 'POST',
		body: formData
	});
}

function runAction<T extends (arg: never) => unknown>(handler: T, request: Request) {
	return (handler as unknown as (arg: { request: Request; locals: App.Locals }) => ReturnType<T>)({
		request,
		locals: adminLocals
	});
}

/** Wall-clock `HH:mm` of `date` as read in `timezone`. */
function localTimeIn(date: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(date);
}

beforeEach(async () => {
	await resetSharedTestDb();
	stopSyncScheduler();
	delete envRecord().TZ;
});

afterEach(() => {
	stopSyncScheduler();
	delete envRecord().TZ;
});

describe('scheduler timezone resolution (TZ env over DB)', () => {
	it('defaults to UTC when neither TZ nor a stored row exists', async () => {
		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({ value: 'UTC', source: 'default', isLocked: false });
	});

	it('uses the stored row when TZ is unset, leaving the field editable', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');

		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({
			value: 'America/New_York',
			source: 'db',
			isLocked: false
		});
		expect(await getSchedulerTimezone()).toBe('America/New_York');
	});

	it('lets TZ shadow the stored row and lock the field', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Europe/Copenhagen';

		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({
			value: 'Europe/Copenhagen',
			source: 'env',
			isLocked: true
		});
	});

	it('canonicalizes a lowercase TZ value', async () => {
		envRecord().TZ = 'europe/copenhagen';

		expect(await getSchedulerTimezone()).toBe('Europe/Copenhagen');
	});

	it('ignores an unknown TZ instead of locking the field to it', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Mars/Olympus_Mons';

		const config = await getSchedulerTimezoneConfigWithSource();

		expect(config.timezone).toEqual({
			value: 'America/New_York',
			source: 'db',
			isLocked: false
		});
	});

	it('falls back to the default when the stored row is not a known zone', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'Not/AZone');

		expect(await getSchedulerTimezone()).toBe('UTC');
	});

	it('stores the canonical identifier and rejects an unknown zone', async () => {
		const written = await setSchedulerTimezoneAtomic({
			timezone: 'europe/copenhagen',
			submittedVersion: new Date(0).toISOString()
		});

		expect(written).toMatchObject({ status: 'ok', timezone: 'Europe/Copenhagen' });
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('Europe/Copenhagen');
		expect(
			setSchedulerTimezoneAtomic({
				timezone: 'Mars/Olympus_Mons',
				submittedVersion: new Date(0).toISOString()
			})
		).rejects.toThrow();
	});

	it('rejects a stale version inside the transaction and leaves the stored zone intact', async () => {
		const first = await setSchedulerTimezoneAtomic({
			timezone: 'Europe/Copenhagen',
			submittedVersion: new Date(0).toISOString()
		});
		expect(first.status).toBe('ok');

		// Second admin still holding the pre-write version: the in-transaction gate
		// is the only thing standing between this and a silent lost update, because
		// the route's pre-write `inlineOccCheck` already passed for both submissions.
		const second = await setSchedulerTimezoneAtomic({
			timezone: 'America/New_York',
			submittedVersion: new Date(0).toISOString()
		});

		expect(second).toEqual({ status: 'conflict' });
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('Europe/Copenhagen');
	});

	it('advances the stored version even when two writes land in the same millisecond', async () => {
		const first = await setSchedulerTimezoneAtomic({
			timezone: 'Europe/Copenhagen',
			submittedVersion: new Date(0).toISOString()
		});
		if (first.status !== 'ok') throw new Error('expected the first write to land');

		const second = await setSchedulerTimezoneAtomic({
			timezone: 'America/New_York',
			submittedVersion: first.version.toISOString()
		});
		if (second.status !== 'ok') throw new Error('expected the second write to land');

		// Strictly greater, not merely ">=": an exact-ms collision would otherwise
		// let a third save reusing `first.version` pass the strict `<` OCC check.
		expect(second.version.getTime()).toBeGreaterThan(first.version.getTime());

		const stale = await setSchedulerTimezoneAtomic({
			timezone: 'UTC',
			submittedVersion: first.version.toISOString()
		});
		expect(stale).toEqual({ status: 'conflict' });
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('America/New_York');
	});
});

describe('startup reconciliation of the timezone row', () => {
	it('drops the shadowed DB row when TZ is authoritative', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Europe/Copenhagen';

		const cleared = await clearConflictingDbSettings();

		expect(cleared).toContain('TZ');
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBeNull();
	});

	it('keeps the DB row when TZ is unset or unusable', async () => {
		await setAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE, 'America/New_York');
		envRecord().TZ = 'Mars/Olympus_Mons';

		const cleared = await clearConflictingDbSettings();

		expect(cleared).not.toContain('TZ');
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('America/New_York');
	});
});

describe('sync scheduler runs in the configured timezone', () => {
	it('interprets the cron expression in the configured zone', () => {
		const cron = setupSyncScheduler({
			cronExpression: '0 0 * * *',
			timezone: 'Europe/Copenhagen',
			startImmediately: true
		});

		expect(cron.options.timezone).toBe('Europe/Copenhagen');
		const nextRun = getSchedulerStatus().nextRun;
		expect(nextRun).not.toBeNull();
		expect(localTimeIn(nextRun!, 'Europe/Copenhagen')).toBe('00:00');
	});

	it('initScheduler builds the job with the TZ-configured zone', async () => {
		envRecord().TZ = 'Europe/Copenhagen';

		const result = await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);

		expect(result).toMatchObject({ success: true });
		const nextRun = getSchedulerStatus().nextRun;
		expect(nextRun).not.toBeNull();
		expect(localTimeIn(nextRun!, 'Europe/Copenhagen')).toBe('00:00');
	});

	it('keeps the configured zone when only the cron expression changes', async () => {
		envRecord().TZ = 'Europe/Copenhagen';
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);

		const result = await runAction(
			actions.updateSchedule as UpdateScheduleAction,
			formRequest('updateSchedule', { cronExpression: '0 4 * * *' })
		);

		expect(result).toMatchObject({ success: true });
		const status = getSchedulerStatus();
		expect(status.cronExpression).toBe('0 4 * * *');
		expect(localTimeIn(status.nextRun!, 'Europe/Copenhagen')).toBe('04:00');
	});

	it('falls back to UTC when nothing is configured', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);

		expect(localTimeIn(getSchedulerStatus().nextRun!, 'UTC')).toBe('00:00');
	});
});

describe('scheduler run state survives a restart', () => {
	it('restores a RUNNING schedule with the configured expression and zone', async () => {
		envRecord().TZ = 'Europe/Copenhagen';
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '30 2 * * *');
		await persistSyncSchedulerState(SyncSchedulerState.RUNNING);

		await restoreSyncScheduler();

		const status = getSchedulerStatus();
		expect(status.isRunning).toBe(true);
		expect(status.isPaused).toBe(false);
		expect(status.cronExpression).toBe('30 2 * * *');
		expect(localTimeIn(status.nextRun!, 'Europe/Copenhagen')).toBe('02:30');
	});

	it('restores a PAUSED schedule without resuming it', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '0 5 * * *');
		await persistSyncSchedulerState(SyncSchedulerState.PAUSED);

		await restoreSyncScheduler();

		const status = getSchedulerStatus();
		expect(status.isPaused).toBe(true);
		expect(status.isRunning).toBe(false);
		expect(status.cronExpression).toBe('0 5 * * *');
	});

	it('leaves a STOPPED instance inactive', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '0 5 * * *');
		await persistSyncSchedulerState(SyncSchedulerState.STOPPED);

		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});

	it('treats a pre-existing cron row without a state row as RUNNING and backfills it', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, '0 1 * * *');

		await restoreSyncScheduler();

		expect(getSchedulerStatus().isRunning).toBe(true);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);
	});

	it('stays inactive on an instance that never configured a schedule', async () => {
		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});

	it('refuses to restore a corrupted cron row instead of throwing on boot', async () => {
		await setAppSetting(AppSettingsKey.SYNC_CRON_EXPRESSION, 'not a cron');
		await persistSyncSchedulerState(SyncSchedulerState.RUNNING);

		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});
});

describe('scheduler actions persist operator intent', () => {
	it('records running / paused / stopped as the admin drives the scheduler', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);

		await runAction(actions.pauseScheduler as PauseSchedulerAction, formRequest('pauseScheduler'));
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.PAUSED);

		await runAction(
			actions.resumeScheduler as ResumeSchedulerAction,
			formRequest('resumeScheduler')
		);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);

		await runAction(actions.stopScheduler as StopSchedulerAction, formRequest('stopScheduler'));
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.STOPPED);
	});

	it('leaves the live scheduler untouched when the durable write fails', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);
		expect(getSchedulerStatus().isPaused).toBe(false);

		// Persisting the operator's intent runs BEFORE the live croner instance is
		// touched, so a failed write must report the error with both sides still on
		// the previous state — never a 500 for a scheduler that already flipped.
		const spy = spyOn(settingsService, 'setAppSetting').mockRejectedValueOnce(
			new Error('disk full')
		);
		try {
			const result = await runAction(
				actions.pauseScheduler as PauseSchedulerAction,
				formRequest('pauseScheduler')
			);
			expect(result).toMatchObject({ status: 500 });
		} finally {
			spy.mockRestore();
		}

		expect(getSchedulerStatus().isPaused).toBe(false);
		expect(await readSyncSchedulerState()).toBe(SyncSchedulerState.RUNNING);
	});

	it('does not resurrect a stopped scheduler on the next restart', async () => {
		await runAction(
			actions.initScheduler as InitSchedulerAction,
			formRequest('initScheduler', { cronExpression: '0 0 * * *' })
		);
		await runAction(actions.stopScheduler as StopSchedulerAction, formRequest('stopScheduler'));

		expect(await restoreSyncScheduler()).toBeNull();
		expect(isSchedulerConfigured()).toBe(false);
	});

	it('refuses to pause or resume when no scheduler is configured', async () => {
		stopSyncScheduler();

		for (const [action, name] of [
			[actions.pauseScheduler as PauseSchedulerAction, 'pauseScheduler'],
			[actions.resumeScheduler as ResumeSchedulerAction, 'resumeScheduler']
		] as const) {
			expect(await runAction(action, formRequest(name))).toMatchObject({
				status: 400,
				data: { error: 'No schedule is configured. Initialize it first.' }
			});
		}

		// Nothing may claim a run state the process cannot honour.
		expect(await readSyncSchedulerState()).toBeNull();
	});
});

describe('overlapping scheduler actions converge', () => {
	/** The run state the live croner instance is actually in. */
	function liveState(): string {
		if (!isSchedulerConfigured()) return SyncSchedulerState.STOPPED;
		return getSchedulerStatus().isPaused ? SyncSchedulerState.PAUSED : SyncSchedulerState.RUNNING;
	}

	// `resumeSyncScheduler` silently does nothing once the instance is gone, so
	// an unserialized resume racing a stop used to leave SYNC_SCHEDULER_STATE on
	// `running` with no job behind it, and the next restart restored a state the
	// admin never saw.
	const conflictingPairs: ReadonlyArray<readonly [string, string]> = [
		['pauseScheduler', 'resumeScheduler'],
		['resumeScheduler', 'pauseScheduler'],
		['initScheduler', 'pauseScheduler'],
		['pauseScheduler', 'initScheduler'],
		['stopScheduler', 'resumeScheduler'],
		['resumeScheduler', 'stopScheduler'],
		['initScheduler', 'stopScheduler'],
		['updateSchedule', 'stopScheduler'],
		['stopScheduler', 'updateSchedule']
	];

	for (const [first, second] of conflictingPairs) {
		it(`keeps the row and the live scheduler in agreement for ${first} || ${second}`, async () => {
			await runAction(
				actions.initScheduler as InitSchedulerAction,
				formRequest('initScheduler', { cronExpression: '0 0 * * *' })
			);

			for (let iteration = 0; iteration < 25; iteration++) {
				await Promise.all([
					runAction(
						actions[first as keyof typeof actions] as InitSchedulerAction,
						formRequest(first, { cronExpression: '0 0 * * *' })
					),
					runAction(
						actions[second as keyof typeof actions] as InitSchedulerAction,
						formRequest(second, { cronExpression: '0 0 * * *' })
					)
				]);

				expect({ iteration, state: liveState() }).toEqual({
					iteration,
					state: (await readSyncSchedulerState()) as string
				});
			}
		});
	}
});
