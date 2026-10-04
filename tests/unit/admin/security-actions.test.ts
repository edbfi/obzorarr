import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AppSettingsKey,
	deleteAppSetting,
	getAppSetting,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { env } from '$lib/server/private-env';
import { actions } from '../../../src/routes/admin/settings/security/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type TestCsrfAction = NonNullable<typeof actions.testCsrfProtection>;
type UpdateCsrfOriginAction = NonNullable<typeof actions.updateCsrfOrigin>;
type ToggleCsrfSkipAction = NonNullable<typeof actions.toggleCsrfSkip>;
type ResetCsrfWarningAction = NonNullable<typeof actions.resetCsrfWarning>;
type UpdateTrustProxyAction = NonNullable<typeof actions.updateTrustProxy>;
type DiagnoseReverseProxyAction = NonNullable<typeof actions.diagnoseReverseProxy>;

const ORIGIN = 'http://localhost:5173';

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function csrfRequest(opts: {
	csrfOrigin?: string;
	confirmMismatch?: boolean;
	settingsVersion?: string;
	originHeader?: string | null;
}): Request {
	const formData = new FormData();
	if (opts.csrfOrigin !== undefined) formData.set('csrfOrigin', opts.csrfOrigin);
	if (opts.confirmMismatch) formData.set('confirmMismatch', 'true');
	formData.set('settingsVersion', opts.settingsVersion ?? new Date(0).toISOString());
	const headers: HeadersInit = {};
	if (opts.originHeader !== null) headers.Origin = opts.originHeader ?? ORIGIN;
	return new Request(`${ORIGIN}/admin/settings/security?/updateCsrfOrigin`, {
		method: 'POST',
		body: formData,
		headers
	});
}

describe('security nested route — testCsrfProtection', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		const dyn = env as Record<string, string | undefined>;
		delete dyn.ORIGIN;
	});

	async function run() {
		const handler = actions.testCsrfProtection as TestCsrfAction;
		return handler({
			request: new Request(`${ORIGIN}/admin/settings/security?/testCsrfProtection`, {
				method: 'POST',
				body: new FormData()
			}),
			locals: adminLocals
		} as Parameters<TestCsrfAction>[0]);
	}

	it('reports configured when an origin is set in the DB', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, ORIGIN);
		const result = await run();
		expect(result).toMatchObject({ success: true });
		expect((result as { message: string }).message).toContain(ORIGIN);
		expect((result as { message: string }).message).toMatch(/database/);
	});

	it('reports not configured when no origin is set', async () => {
		const result = await run();
		expect(result).toMatchObject({ status: 400 });
		expect((result as { data: { error: string } }).data.error).toMatch(
			/CSRF ORIGIN is not configured/
		);
	});
});

describe('security nested route — updateCsrfOrigin (OCC + set + clear)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		const dyn = env as Record<string, string | undefined>;
		delete dyn.ORIGIN;
	});

	async function run(request: Request, urlOverride?: string) {
		const handler = actions.updateCsrfOrigin as UpdateCsrfOriginAction;
		const url = new URL(urlOverride ?? request.url);
		return handler({
			request,
			url,
			locals: adminLocals
		} as Parameters<UpdateCsrfOriginAction>[0]);
	}

	it('saves a matching origin and reports success', async () => {
		const result = await run(csrfRequest({ csrfOrigin: ORIGIN }));
		expect(result).toEqual({ success: true, message: 'CSRF origin updated' });
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
	});

	it('requires confirmation when the saved origin mismatches the request Origin', async () => {
		const result = (await run(csrfRequest({ csrfOrigin: 'http://attacker.example.com:5173' }))) as {
			status: number;
			data: Record<string, unknown>;
		};
		expect(result.status).toBe(409);
		expect(result.data.requireConfirmation).toBe(true);
		expect(typeof result.data.csrfMismatchMessage).toBe('string');
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();
	});

	it('persists mismatch when confirmMismatch=true is sent', async () => {
		const result = await run(
			csrfRequest({
				csrfOrigin: 'http://attacker.example.com:5173',
				confirmMismatch: true
			})
		);
		expect(result).toMatchObject({ success: true, warning: true });
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(
			'http://attacker.example.com:5173'
		);
	});

	it('rejects blank settingsVersion as 409 conflict (inline OCC)', async () => {
		const result = await run(csrfRequest({ csrfOrigin: ORIGIN, settingsVersion: '' }));
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true, error: 'Settings changed in another tab. Reload and try again.' }
		});
	});

	it('refuses to clear origin when no ORIGIN env and no skip flag', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, ORIGIN);

		const futureVersion = new Date(Date.now() + 60_000).toISOString();
		const result = await run(csrfRequest({ csrfOrigin: '', settingsVersion: futureVersion }));
		expect(result).toMatchObject({ status: 400 });
		expect((result as { data: { error: string } }).data.error).toMatch(/Cannot clear CSRF origin/);
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBe(ORIGIN);
	});

	it('clears origin when the skip flag is enabled', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, ORIGIN);
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');

		const futureVersion = new Date(Date.now() + 60_000).toISOString();
		const result = await run(csrfRequest({ csrfOrigin: '', settingsVersion: futureVersion }));
		expect((result as { success: boolean }).success).toBe(true);
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN)).toBeNull();

		await deleteAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED);
	});
});

describe('security nested route — toggleCsrfSkip', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	async function run(enabled: boolean) {
		const handler = actions.toggleCsrfSkip as ToggleCsrfSkipAction;
		const formData = new FormData();
		formData.set('enabled', enabled ? 'true' : 'false');
		return handler({
			request: new Request(`${ORIGIN}/admin/settings/security?/toggleCsrfSkip`, {
				method: 'POST',
				body: formData
			}),
			locals: adminLocals
		} as Parameters<ToggleCsrfSkipAction>[0]);
	}

	it('refuses to enable skip when an origin is already configured', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, ORIGIN);
		const result = await run(true);
		expect(result).toMatchObject({ status: 400 });
		expect((result as { data: { error: string } }).data.error).toMatch(/already enforced/);
	});

	it('enables skip when no origin is configured', async () => {
		const result = await run(true);
		expect(result).toMatchObject({ success: true });
		expect(await getAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED)).toBe('true');
	});

	it('refuses to disable skip when no origin is configured (lockout guard)', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN_SKIPPED, 'true');
		const result = await run(false);
		expect(result).toMatchObject({ status: 400 });
		expect((result as { data: { error: string } }).data.error).toMatch(/Cannot disable CSRF skip/);
	});
});

describe('security nested route — resetCsrfWarning', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('returns success and reports the warning re-enabled', async () => {
		const handler = actions.resetCsrfWarning as ResetCsrfWarningAction;
		const result = await handler({
			request: new Request(`${ORIGIN}/admin/settings/security?/resetCsrfWarning`, {
				method: 'POST',
				body: new FormData()
			}),
			locals: adminLocals
		} as Parameters<ResetCsrfWarningAction>[0]);
		expect(result).toMatchObject({ success: true });
		expect((result as { message: string }).message).toMatch(/re-enabled/);
	});
});

describe('security nested route — diagnoseReverseProxy cache controls', () => {
	it('sets no-store when setHeaders is available', async () => {
		const handler = actions.diagnoseReverseProxy as DiagnoseReverseProxyAction;
		const formData = new FormData();
		formData.set('browserOrigin', ORIGIN);
		const headers: Record<string, string>[] = [];
		await handler({
			request: new Request(`${ORIGIN}/admin/settings/security?/diagnoseReverseProxy`, {
				method: 'POST',
				body: formData,
				headers: { Origin: ORIGIN }
			}),
			url: new URL(ORIGIN),
			getClientAddress: () => '127.0.0.1',
			setHeaders: (headersToSet: Record<string, string>) => headers.push(headersToSet),
			locals: adminLocals
		} as unknown as Parameters<DiagnoseReverseProxyAction>[0]);
		expect(headers).toEqual([{ 'Cache-Control': 'no-store' }]);
	});
});
describe('security nested route — updateTrustProxy (confirmRisk + OCC)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	// Match the diagnostic's boundary-confirmation shape: adapter request URL internal,
	// while the forwarded pair matches the submitted browser origin. The write gate
	// refuses enablement for every other recommendation.
	const TRUST_BROWSER_ORIGIN = 'https://obzorarr.example.com';
	const TRUST_FORWARDED_HOST = 'obzorarr.example.com';
	const TRUST_APP_URL = `${ORIGIN}/admin/settings/security?/updateTrustProxy`;

	function trustProxyRequest(
		fields: Record<string, string>,
		originHeader: string | null = TRUST_BROWSER_ORIGIN,
		requestUrl = TRUST_APP_URL
	): Request {
		const formData = new FormData();
		for (const [k, v] of Object.entries(fields)) formData.set(k, v);
		if (!formData.has('browserOrigin')) {
			formData.set('browserOrigin', TRUST_BROWSER_ORIGIN);
		}
		const headers: HeadersInit = {
			'x-forwarded-proto': 'https',
			'x-forwarded-host': TRUST_FORWARDED_HOST
		};
		if (originHeader !== null) headers.Origin = originHeader;
		return new Request(requestUrl, {
			method: 'POST',
			body: formData,
			headers
		});
	}

	async function run(request: Request, setHeaders?: (headers: Record<string, string>) => void) {
		const handler = actions.updateTrustProxy as UpdateTrustProxyAction;
		return handler({
			request,
			url: new URL(TRUST_APP_URL),
			getClientAddress: () => '203.0.113.1',
			setHeaders,
			locals: adminLocals
		} as Parameters<UpdateTrustProxyAction>[0]);
	}

	it('rejects checkbox-style boolean for enabled (z.enum guards against silent coercion)', async () => {
		// Same protection as plexAllowInsecureLocalHttp + privacy FormBoolean:
		// TrustProxySchema.enabled uses z.enum(['true', 'false']).transform so
		// HTML checkbox 'on' fails schema validation. A refactor to z.preprocess
		// or z.coerce.boolean would silently coerce 'on' to false (= disabled),
		// hiding accidental checkbox-vs-toggle wiring bugs.
		const result = await run(
			trustProxyRequest({
				enabled: 'on',
				confirmRisk: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400 });
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('refuses to enable without confirmRisk=true', async () => {
		const result = await run(
			trustProxyRequest({
				enabled: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400 });
		expect((result as { data: { error: string } }).data.error).toMatch(
			/Confirm the reverse-proxy header trust risk/
		);
	});

	it('rejects malformed risk confirmation with a specific validation message', async () => {
		const result = await run(
			trustProxyRequest({
				enabled: 'true',
				confirmRisk: 'false',
				settingsVersion: new Date(0).toISOString()
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error:
					'Invalid input: enabled must be "true" or "false"; confirmRisk must be "true" when provided'
			}
		});
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('persists TRUST_PROXY=true with confirmRisk=true', async () => {
		const result = await run(
			trustProxyRequest({
				enabled: 'true',
				confirmRisk: 'true',
				settingsVersion: new Date(0).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('true');
	});
	it('does not enable trust when the adapter request origin already matches the browser', async () => {
		const result = await run(
			trustProxyRequest(
				{
					enabled: 'true',
					confirmRisk: 'true',
					settingsVersion: new Date(0).toISOString()
				},
				TRUST_BROWSER_ORIGIN,
				`${TRUST_BROWSER_ORIGIN}/admin/settings/security?/updateTrustProxy`
			)
		);

		expect(result).toMatchObject({ status: 400 });
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});
	it('fails closed without a request Origin and does not write TRUST_PROXY', async () => {
		const result = await run(
			trustProxyRequest(
				{ enabled: 'true', confirmRisk: 'true', settingsVersion: new Date(0).toISOString() },
				null
			)
		);
		expect(result).toMatchObject({ status: 403 });
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('fails closed when request Origin mismatches browserOrigin and does not write TRUST_PROXY', async () => {
		const result = await run(
			trustProxyRequest(
				{ enabled: 'true', confirmRisk: 'true', settingsVersion: new Date(0).toISOString() },
				'https://attacker.example.com'
			)
		);
		expect(result).toMatchObject({ status: 403 });
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBeNull();
	});

	it('sets no-store for TRUST_PROXY actions when setHeaders is available', async () => {
		const headers: Record<string, string>[] = [];
		await run(
			trustProxyRequest({ enabled: 'false', settingsVersion: new Date(0).toISOString() }),
			(headersToSet) => headers.push(headersToSet)
		);
		expect(headers).toEqual([{ 'Cache-Control': 'no-store' }]);
	});

	it('rejects blank settingsVersion as 409 conflict', async () => {
		const result = await run(
			trustProxyRequest({
				enabled: 'true',
				confirmRisk: 'true',
				settingsVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: { conflict: true }
		});
	});

	it('allows disabling without confirmRisk (with a fresh settingsVersion)', async () => {
		await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');
		const futureVersion = new Date(Date.now() + 60_000).toISOString();
		const result = await run(
			trustProxyRequest({ enabled: 'false', settingsVersion: futureVersion })
		);
		expect(result).toMatchObject({ success: true });
		expect(await getAppSetting(AppSettingsKey.TRUST_PROXY)).toBe('false');
	});
});
