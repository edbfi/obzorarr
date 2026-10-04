import { beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { load } from '../../../src/routes/wrapped/+layout.server';
import { resetSharedTestDb } from '../../helpers/db';
import { createTestCookies } from '../../helpers/requests';

type WrappedLayoutLoad = typeof load;
type LoadArgs = Parameters<WrappedLayoutLoad>[0];
type WrappedLayoutData = Exclude<Awaited<ReturnType<WrappedLayoutLoad>>, void>;

async function invokeLoad(
	args: { locals?: LoadArgs['locals']; cookies?: LoadArgs['cookies'] } = {}
): Promise<WrappedLayoutData> {
	return (await load({
		cookies: args.cookies ?? createTestCookies(),
		locals: args.locals ?? {},
		url: new URL('http://localhost/wrapped/2026'),
		params: {},
		route: { id: '/wrapped' },
		setHeaders: () => {},
		getClientAddress: () => '127.0.0.1'
	} as unknown as LoadArgs)) as WrappedLayoutData;
}

describe('wrapped layout sync status privacy gate', () => {
	beforeEach(resetSharedTestDb);

	it('does not expose sync status to anonymous post-onboarding wrapped pages', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const result = await invokeLoad();

		expect(result.syncStatusEnabled).toBe(false);
		expect(result.syncStatus).toBeNull();
	});

	it('exposes sync status to authenticated wrapped pages after onboarding', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const result = await invokeLoad({
			locals: {
				user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
			} as LoadArgs['locals']
		});

		expect(result.syncStatusEnabled).toBe(true);
		expect(result.syncStatus).toMatchObject({ inProgress: false, progress: null });
	});

	it('keeps sync status available to anonymous onboarding flows', async () => {
		const result = await invokeLoad();

		expect(result.syncStatusEnabled).toBe(true);
		expect(result.syncStatus).toMatchObject({ inProgress: false, progress: null });
	});

	it('consumes lookup_live_sync even when anonymous sync status is disabled', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
		const cookies = createTestCookies({ lookup_live_sync: '1' });

		const result = await invokeLoad({ cookies });

		expect(result.lookupSyncTriggered).toBe(true);
		expect(result.syncStatusEnabled).toBe(false);
		expect(result.syncStatus).toBeNull();
		// Plain-HTTP request URL: the deletion is not Secure, or the browser would refuse it (M13).
		expect(cookies.deletes).toEqual([
			{ name: 'lookup_live_sync', options: { path: '/wrapped', secure: false } }
		]);
	});
});
