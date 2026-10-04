import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	AppSettingsKey,
	getAppSetting,
	getAppSettingsUpdatedAt,
	getSchedulerTimezone,
	LOG_SETTINGS_KEYS,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { getLogMaxCount, getLogRetentionDays, isDebugEnabled } from '$lib/server/logging';
import { env } from '$lib/server/private-env';
import { getSchedulerStatus, setupSyncScheduler, stopSyncScheduler } from '$lib/server/sync';
import { actions } from '../../../src/routes/admin/settings/system/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type UpdateLogSettingsAction = NonNullable<typeof actions.updateLogSettings>;
type UpdateSchedulerTimezoneAction = NonNullable<typeof actions.updateSchedulerTimezone>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function makeRequest(fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request('http://localhost/admin/settings/system?/updateLogSettings', {
		method: 'POST',
		body: formData
	});
}

describe('system nested route — updateLogSettings (Superforms + inline OCC)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	async function run(request: Request) {
		const handler = actions.updateLogSettings as UpdateLogSettingsAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateLogSettingsAction>[0]);
	}

	it('persists retentionDays + maxCount + debugEnabled on a fresh DB', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true, message: 'Logging settings updated' });
		expect(await getLogRetentionDays()).toBe(14);
		expect(await getLogMaxCount()).toBe(2000);
		expect(await isDebugEnabled()).toBe(true);
	});

	it('rejects blank settingsVersion as 409 conflict (Superforms zod error path)', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Reload and try again.'
			}
		});
		expect(await getLogRetentionDays()).toBe(7);
		expect(await getLogMaxCount()).toBe(50000);
	});

	it('rejects stale settingsVersion as 409 conflict', async () => {
		await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);

		const result = await run(
			makeRequest({
				retentionDays: '21',
				maxCount: '3000',
				debugEnabled: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true }
		});
		expect(await getLogRetentionDays()).toBe(14);
		expect(await getLogMaxCount()).toBe(2000);
	});

	it('rejects retentionDays out of range as 400 (Superforms validation failure)', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '999',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
		expect(await getLogRetentionDays()).toBe(7);
		expect(await getLogMaxCount()).toBe(50000);
	});

	it('rejects maxCount below floor as 400', async () => {
		const result = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '500',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
		expect(await getLogMaxCount()).toBe(50000);
	});

	it('allows a follow-up save with a bumped settingsVersion (no spurious 409)', async () => {
		await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		const result = await run(
			makeRequest({
				retentionDays: '21',
				maxCount: '5000',
				debugEnabled: 'false',
				settingsVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		expect(await getLogRetentionDays()).toBe(21);
		expect(await getLogMaxCount()).toBe(5000);
		expect(await isDebugEnabled()).toBe(false);
	});

	it('coerces debugEnabled from form-encoded "true"/"false" strings', async () => {
		// Superforms decodes form bodies; z.boolean() via standard Superforms
		// boolean handling accepts 'true' / 'false' / 'on' from form encoding.
		const trueResult = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(trueResult).toMatchObject({ success: true });
		expect(await isDebugEnabled()).toBe(true);

		// The second write must use the row version created by the first save.
		await setAppSetting('log_debug_enabled' as never, 'true');
		const falseResult = await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'false',
				settingsVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(falseResult).toMatchObject({ success: true });
		expect(await isDebugEnabled()).toBe(false);
	});

	it('rejects stale settingsVersion after an UPDATE (not just after INSERT)', async () => {
		await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);

		const afterInsert = await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS);
		expect(afterInsert).not.toBeNull();
		const preUpdateVersion = afterInsert!.toISOString();

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const updateResult = await run(
			makeRequest({
				retentionDays: '21',
				maxCount: '3000',
				debugEnabled: 'false',
				settingsVersion: preUpdateVersion
			})
		);
		expect(updateResult).toMatchObject({ success: true });

		const staleResult = await run(
			makeRequest({
				retentionDays: '90',
				maxCount: '9000',
				debugEnabled: 'true',
				settingsVersion: preUpdateVersion
			})
		);

		expect(staleResult).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Reload and try again.'
			}
		});
	});

	it('advances the returned settingsVersion so two consecutive saves both succeed', async () => {
		const first = (await run(
			makeRequest({
				retentionDays: '14',
				maxCount: '2000',
				debugEnabled: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };

		expect(first).toMatchObject({ success: true });
		const returnedVersion = first.form.data.settingsVersion;
		expect(returnedVersion).not.toBe(new Date(0).toISOString());
		expect(returnedVersion).toBe((await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS))!.toISOString());

		await new Promise<void>((resolve) => setTimeout(resolve, 10));

		const second = await run(
			makeRequest({
				retentionDays: '30',
				maxCount: '5000',
				debugEnabled: 'true',
				settingsVersion: returnedVersion
			})
		);
		expect(second).toMatchObject({ success: true });
	});
});

describe('system nested route — updateSchedulerTimezone (Superforms + inline OCC)', () => {
	function envRecord(): Record<string, string | undefined> {
		return env as unknown as Record<string, string | undefined>;
	}

	function timezoneRequest(fields: Record<string, string>): Request {
		const formData = new FormData();
		for (const [k, v] of Object.entries(fields)) formData.set(k, v);
		return new Request('http://localhost/admin/settings/system?/updateSchedulerTimezone', {
			method: 'POST',
			body: formData
		});
	}

	async function run(request: Request) {
		const handler = actions.updateSchedulerTimezone as UpdateSchedulerTimezoneAction;
		return handler({
			request,
			locals: adminLocals
		} as Parameters<UpdateSchedulerTimezoneAction>[0]);
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

	it('persists the canonical zone and echoes it in the message', async () => {
		const result = await run(
			timezoneRequest({
				timezone: 'europe/copenhagen',
				settingsVersion: new Date(0).toISOString()
			})
		);

		expect(result).toMatchObject({
			success: true,
			message: 'Scheduler timezone set to Europe/Copenhagen'
		});
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('Europe/Copenhagen');
		expect(await getSchedulerTimezone()).toBe('Europe/Copenhagen');
	});

	it('re-points a live scheduler at the new zone without changing its expression', async () => {
		setupSyncScheduler({ cronExpression: '0 0 * * *', timezone: 'UTC', startImmediately: true });

		await run(
			timezoneRequest({
				timezone: 'Europe/Copenhagen',
				settingsVersion: new Date(0).toISOString()
			})
		);

		const status = getSchedulerStatus();
		expect(status.cronExpression).toBe('0 0 * * *');
		expect(status.isRunning).toBe(true);
		expect(
			new Intl.DateTimeFormat('en-GB', {
				timeZone: 'Europe/Copenhagen',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23'
			}).format(status.nextRun!)
		).toBe('00:00');
	});

	it('rejects an unknown zone as 400 and writes nothing', async () => {
		const result = await run(
			timezoneRequest({
				timezone: 'Mars/Olympus_Mons',
				settingsVersion: new Date(0).toISOString()
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Unknown timezone. Use an IANA name such as Europe/Copenhagen' }
		});
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBeNull();
	});

	it('refuses to write while TZ owns the value', async () => {
		envRecord().TZ = 'Europe/Copenhagen';

		const result = await run(
			timezoneRequest({
				timezone: 'America/New_York',
				settingsVersion: new Date(0).toISOString()
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'The TZ environment variable sets the timezone and it cannot be changed here' }
		});
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBeNull();
	});

	it('rejects a blank settingsVersion as 409 conflict', async () => {
		const result = await run(
			timezoneRequest({ timezone: 'Europe/Copenhagen', settingsVersion: '' })
		);

		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: 'Settings changed in another tab. Reload and try again.' }
		});
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBeNull();
	});

	it('rejects a stale settingsVersion as 409 conflict', async () => {
		await run(
			timezoneRequest({
				timezone: 'Europe/Copenhagen',
				settingsVersion: new Date(0).toISOString()
			})
		);

		const result = await run(
			timezoneRequest({
				timezone: 'America/New_York',
				settingsVersion: new Date(0).toISOString()
			})
		);

		expect(result).toMatchObject({ status: 409, data: { conflict: true } });
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('Europe/Copenhagen');
	});

	it('lets only one of two concurrent same-version saves win', async () => {
		// Both submissions carry the same `settingsVersion`, so both can clear the
		// pre-write `inlineOccCheck` before either write runs. Only the OCC gate
		// inside the write transaction can stop the loser from silently clobbering
		// the winner's zone.
		const [a, b] = await Promise.all([
			run(
				timezoneRequest({
					timezone: 'Europe/Copenhagen',
					settingsVersion: new Date(0).toISOString()
				})
			),
			run(
				timezoneRequest({
					timezone: 'America/New_York',
					settingsVersion: new Date(0).toISOString()
				})
			)
		]);

		const outcomes = [a, b] as Array<{ status?: number; success?: boolean }>;
		expect(outcomes.filter((r) => r.success === true)).toHaveLength(1);
		expect(outcomes.filter((r) => r.status === 409)).toHaveLength(1);

		// The winner's zone is the one that survives; the loser wrote nothing.
		const winner = outcomes.find((r) => r.success === true) as unknown as {
			form: { data: { timezone: string } };
		};
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe(winner.form.data.timezone);
	});

	it('advances the returned settingsVersion so two consecutive saves both succeed', async () => {
		const first = (await run(
			timezoneRequest({
				timezone: 'Europe/Copenhagen',
				settingsVersion: new Date(0).toISOString()
			})
		)) as { form: { data: { settingsVersion: string } }; success?: boolean };

		expect(first).toMatchObject({ success: true });
		expect(first.form.data.settingsVersion).not.toBe(new Date(0).toISOString());

		const second = await run(
			timezoneRequest({
				timezone: 'America/New_York',
				settingsVersion: first.form.data.settingsVersion
			})
		);

		expect(second).toMatchObject({ success: true });
		expect(await getAppSetting(AppSettingsKey.SCHEDULER_TIMEZONE)).toBe('America/New_York');
	});

	it('does not touch the logging OCC group', async () => {
		await run(
			timezoneRequest({
				timezone: 'Europe/Copenhagen',
				settingsVersion: new Date(0).toISOString()
			})
		);

		expect(await getAppSettingsUpdatedAt(LOG_SETTINGS_KEYS)).toBeNull();
	});
});
