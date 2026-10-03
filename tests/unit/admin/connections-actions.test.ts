import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AppSettingsKey,
	getApiConfigWithSources,
	getAppSetting,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { env } from '$lib/server/private-env';
import { actions } from '../../../src/routes/admin/settings/connections/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type UpdateApiConfigAction = NonNullable<typeof actions.updateApiConfig>;
type ClearOpenaiKeyAction = NonNullable<typeof actions.clearOpenaiKey>;
type ClearOpenaiModelAction = NonNullable<typeof actions.clearOpenaiModel>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function makeRequest(action: string, fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request(`http://localhost/admin/settings/connections?/${action}`, {
		method: 'POST',
		body: formData
	});
}

// The deeper "saving the Plex panel does not wipe OpenAI fields" semantics live
// in setApiConfigAtomic and are tested in tests/unit/admin/settings.service.test.ts
// (~ApiConfig integration). The tests here focus on the action-handler shapes
// (OCC + schema validation + the clear actions) that are specific to the
// nested-route +page.server.ts.

describe('connections nested route — updateApiConfig (OCC + schema)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	async function run(request: Request) {
		const handler = actions.updateApiConfig as UpdateApiConfigAction;
		return handler({ request, locals: adminLocals } as Parameters<UpdateApiConfigAction>[0]);
	}

	it('rejects blank apiConfigVersion as 409 conflict', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: 'http://plex.local:32400',
				plexToken: 'token',
				apiConfigVersion: ''
			})
		);
		expect(result).toMatchObject({
			status: 409,
			data: {
				conflict: true,
				error: 'Settings changed in another tab. Reload and try again.'
			}
		});
	});

	it('rejects missing apiConfigVersion (field absent) as 409 conflict', async () => {
		const formData = new FormData();
		formData.set('plexServerUrl', 'http://plex.local:32400');
		formData.set('plexToken', 'token');
		// Omitted on purpose; blank and absent versions must both enter the OCC path.
		const request = new Request('http://localhost/admin/settings/connections?/updateApiConfig', {
			method: 'POST',
			body: formData
		});
		const result = await run(request);
		expect(result).toMatchObject({ status: 409, data: { conflict: true } });
	});

	it('treats blank openaiModel as clear-to-default (not a 400)', async () => {
		// The OpenAI panel always submits openaiModel present-but-empty; a blank
		// value is an intentional clear-to-default, NOT invalid input. Seed a
		// stored custom model so we can prove the blank submit clears it.
		await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4o');
		expect((await getApiConfigWithSources()).openai.model.value).toBe('gpt-4o');

		const result = await run(
			makeRequest('updateApiConfig', {
				openaiModel: '',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);

		// The action succeeds rather than returning a fieldErrors.openaiModel 400.
		expect(result).toMatchObject({ success: true });

		// writeOrClearEchoed deletes the OPENAI_MODEL row on '', so the resolved
		// model falls back to the service's hardcoded default (source 'default',
		// e.g. 'gpt-5-mini'); the user's custom 'gpt-4o' is no longer in effect.
		const after = (await getApiConfigWithSources()).openai.model;
		expect(after.value).not.toBe('gpt-4o');
		expect(after.value).toMatch(/^gpt-/);
		expect(after.source).toBe('default');
		expect(after.isLocked).toBe(false);
	});

	it('treats whitespace-only openaiModel as clear-to-default (trimmed to blank)', async () => {
		// `.trim()` reduces '   ' to '', which is the same clear-to-default signal
		// as a blank submit — it must not be rejected as invalid input.
		await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4o');
		expect((await getApiConfigWithSources()).openai.model.value).toBe('gpt-4o');

		const result = await run(
			makeRequest('updateApiConfig', {
				openaiModel: '   ',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);

		expect(result).toMatchObject({ success: true });

		const after = (await getApiConfigWithSources()).openai.model;
		expect(after.value).not.toBe('gpt-4o');
		expect(after.value).toMatch(/^gpt-/);
		expect(after.source).toBe('default');
		expect(after.isLocked).toBe(false);
	});

	// ISSUE-001: false-accept-leaning OpenAI model validation. The rule is a
	// NARROW reject-list (control chars + shell metacharacters); everything else,
	// including provider slugs and INTERNAL SPACES in local aliases, must PASS.
	// A bad model degrades gracefully to template fun facts, so over-rejecting is
	// strictly worse than over-accepting — hence only one FAIL case (a shell
	// injection), and never a fail based solely on an internal space.
	it.each(['gpt-4o-mini', 'meta-llama/Llama-3.1-8B:free', 'anthropic/claude-3.5'])(
		'accepts and persists a valid OpenAI model id %s (ISSUE-001)',
		async (openaiModel) => {
			const result = await run(
				makeRequest('updateApiConfig', {
					openaiModel,
					apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
				})
			);

			expect(result).toMatchObject({ success: true });
			expect((await getApiConfigWithSources()).openai.model.value).toBe(openaiModel);
		}
	);

	it('PASSES a space-containing local alias (internal-space alias PASSES) (ISSUE-001)', async () => {
		// Local/aliased model names legitimately contain spaces — an internal space
		// must NEVER trigger a rejection.
		const openaiModel = 'My Local Model 7B';
		const result = await run(
			makeRequest('updateApiConfig', {
				openaiModel,
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);

		expect(result).toMatchObject({ success: true });
		expect((await getApiConfigWithSources()).openai.model.value).toBe(openaiModel);
	});

	it('rejects a shell-metacharacter OpenAI model as 400 with fieldErrors.openaiModel and does not persist (ISSUE-001)', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				openaiModel: 'gpt; rm -rf',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Invalid input' }
		});
		const fieldErrors = (result as { data: { fieldErrors?: Record<string, string[]> } }).data
			.fieldErrors;
		expect(fieldErrors?.openaiModel?.length).toBeGreaterThan(0);
		// The malicious value must NOT have been written.
		expect(await getAppSetting(AppSettingsKey.OPENAI_MODEL)).toBeNull();
	});

	it('rejects malformed Plex URL as 400 (Zod URL validator)', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: 'not a url',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400 });
	});

	// The blank-URL guard (ISSUE-005) only fires when the Plex URL is NOT
	// env-locked. The test harness mocks PLEX_SERVER_URL/PLEX_TOKEN (so the field
	// is locked by default), so these tests clear those env vars to exercise the
	// unlocked DB-backed path, then restore them.
	const dynamicEnv = env as Record<string, string | undefined>;
	async function withUnlockedPlex(fn: () => Promise<void>): Promise<void> {
		const prevUrl = dynamicEnv.PLEX_SERVER_URL;
		const prevToken = dynamicEnv.PLEX_TOKEN;
		dynamicEnv.PLEX_SERVER_URL = '';
		dynamicEnv.PLEX_TOKEN = '';
		try {
			await fn();
		} finally {
			dynamicEnv.PLEX_SERVER_URL = prevUrl;
			dynamicEnv.PLEX_TOKEN = prevToken;
		}
	}

	it('rejects a present-but-blank Plex URL as 400 and leaves the stored row intact (ISSUE-005)', async () => {
		await withUnlockedPlex(async () => {
			// Seed a stored Plex URL so we can prove the blank submit does not clear it.
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.local:32400');
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);

			const result = await run(
				makeRequest('updateApiConfig', {
					plexServerUrl: '',
					apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
				})
			);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Plex server URL is required' }
			});
			// The stored row must be untouched — a blank submit must not delete it.
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);
		});
	});

	it('rejects a whitespace-only Plex URL as 400 (trimmed to blank) (ISSUE-005)', async () => {
		await withUnlockedPlex(async () => {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.local:32400');

			const result = await run(
				makeRequest('updateApiConfig', {
					plexServerUrl: '   ',
					apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
				})
			);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Plex server URL is required' }
			});
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);
		});
	});

	it('does NOT 400 on a blank Plex URL when the field is ENV-locked', async () => {
		// With the harness's mocked PLEX_SERVER_URL env var, the field is locked;
		// a blank submit must NOT hit the required-field guard (the lock path owns
		// the value and setApiConfigAtomic ignores locked fields).
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: '',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).not.toMatchObject({ data: { error: 'Plex server URL is required' } });
	});

	it('does NOT trip the blank-URL guard when plexServerUrl is absent (OpenAI-only save)', async () => {
		await withUnlockedPlex(async () => {
			// An OpenAI-only panel save omits the Plex inputs entirely; the absent
			// field parses to `undefined` (not ''), so the required-URL guard is
			// skipped and the save succeeds without wiping the stored Plex URL.
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.local:32400');

			const formData = new FormData();
			formData.set('openaiModel', 'gpt-4o-mini');
			formData.set('apiConfigVersion', new Date(Date.now() + 60_000).toISOString());
			const request = new Request('http://localhost/admin/settings/connections?/updateApiConfig', {
				method: 'POST',
				body: formData
			});

			const result = await run(request);
			expect(result).not.toMatchObject({ data: { error: 'Plex server URL is required' } });
			expect((await getApiConfigWithSources()).plex.serverUrl.value).toBe(
				'http://plex.local:32400'
			);
		});
	});

	it('rejects checkbox-style boolean for plexAllowInsecureLocalHttp', async () => {
		// Same protection as the privacy tab's FormBooleanSchema fix
		// (commit adefc25): ApiConfigSchema.plexAllowInsecureLocalHttp uses
		// z.enum(['true', 'false']).transform() so HTML checkbox 'on' fails
		// schema validation instead of being silently coerced to false.
		// Without this guard, accidentally wiring a checkbox to this field
		// would unconditionally write `false` regardless of the checkbox
		// state.
		const result = await run(
			makeRequest('updateApiConfig', {
				plexAllowInsecureLocalHttp: 'on',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
	});

	it('rejects unchecked local HTTP Plex URL instead of relying on stored opt-in', async () => {
		const previousAllowInsecure = dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP;
		dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = undefined;
		try {
			await withUnlockedPlex(async () => {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://192.168.1.10:32400');
				await setAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP, 'true');

				const result = await run(
					makeRequest('updateApiConfig', {
						plexServerUrl: 'http://192.168.1.10:32400',
						apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
					})
				);

				expect(result).toMatchObject({
					status: 400,
					data: {
						error: 'HTTP Plex URLs require a local/private host and explicit local HTTP opt-in.'
					}
				});
				expect(await getAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP)).toBe('true');
			});
		} finally {
			dynamicEnv.PLEX_ALLOW_INSECURE_LOCAL_HTTP = previousAllowInsecure;
		}
	});

	it('returns fieldErrors.openaiBaseUrl for an invalid base URL (H5)', async () => {
		const result = await run(
			makeRequest('updateApiConfig', {
				openaiBaseUrl: 'not-a-url',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'Invalid input',
				fieldErrors: { openaiBaseUrl: ['Invalid URL format'] }
			}
		});
	});

	it.each([
		['http://api.openai.example/v1', 'OpenAI base URL must use HTTPS.'],
		[
			'https://user:pass@api.openai.example/v1',
			'Configured base URLs must not include credentials.'
		],
		[
			'https://api.openai.example/v1?token=abc',
			'Configured base URLs must not include query strings or fragments.'
		],
		[
			'https://api.openai.example/v1#models',
			'Configured base URLs must not include query strings or fragments.'
		]
	])(
		'rejects unsafe OpenAI base URL %s with no API key submitted',
		async (openaiBaseUrl, error) => {
			const result = await run(
				makeRequest('updateApiConfig', {
					openaiBaseUrl,
					apiConfigVersion: new Date(0).toISOString()
				})
			);

			expect(result).toMatchObject({ status: 400, data: { error } });
			expect(await getAppSetting(AppSettingsKey.OPENAI_BASE_URL)).toBeNull();
		}
	);

	it('returns a fresh apiConfigVersion on success (A2)', async () => {
		await withUnlockedPlex(async () => {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'https://plex.local:32400');

			const formData = new FormData();
			formData.set('openaiModel', 'gpt-4o-mini');
			formData.set('apiConfigVersion', new Date(Date.now() + 60_000).toISOString());
			const request = new Request('http://localhost/admin/settings/connections?/updateApiConfig', {
				method: 'POST',
				body: formData
			});

			const result = await run(request);
			expect(result).toMatchObject({ success: true });
			const version = (result as { apiConfigVersion?: string }).apiConfigVersion;
			expect(typeof version).toBe('string');
			expect(version!.length).toBeGreaterThan(0);
			expect(Number.isNaN(Date.parse(version!))).toBe(false);
		});
	});

	it('includes locked-field note in success message when a locked field is submitted (C2)', async () => {
		// The harness locks PLEX_SERVER_URL via ENV; the action should ignore the
		// submitted value but tell the operator why it was ignored.
		const result = await run(
			makeRequest('updateApiConfig', {
				plexServerUrl: 'https://plex.local:32400',
				apiConfigVersion: new Date(Date.now() + 60_000).toISOString()
			})
		);
		expect(result).toMatchObject({ success: true });
		const message = (result as { message?: string }).message ?? '';
		expect(message).toContain('Some fields are controlled by environment variables');

		// ISSUE-002 security property: the submitted value must be DROPPED, not just
		// flagged. The env-locked value still wins and the attacker-supplied URL is
		// never persisted — disabling the input is cosmetic; this is the real block.
		const after = await getApiConfigWithSources();
		expect(after.plex.serverUrl.value).toBe('https://test-plex-server:32400');
		expect(after.plex.serverUrl.value).not.toBe('https://plex.local:32400');
		expect(after.plex.serverUrl.isLocked).toBe(true);
	});
});

describe('connections nested route — clearOpenaiKey', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	async function run() {
		const handler = actions.clearOpenaiKey as ClearOpenaiKeyAction;
		return handler({
			request: new Request('http://localhost/admin/settings/connections?/clearOpenaiKey', {
				method: 'POST',
				body: new FormData()
			}),
			locals: adminLocals
		} as Parameters<ClearOpenaiKeyAction>[0]);
	}

	it('clears the stored OpenAI API key', async () => {
		await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'sk-stored');
		expect((await getApiConfigWithSources()).openai.apiKey.value).toBe('sk-stored');

		const result = await run();
		expect(result).toMatchObject({ success: true, message: 'OpenAI API key cleared' });
		expect((await getApiConfigWithSources()).openai.apiKey.value).toBe('');
	});

	it('is idempotent when no key is stored', async () => {
		const result = await run();
		expect(result).toMatchObject({ success: true });
	});
});

describe('connections nested route — clearOpenaiModel', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	async function run() {
		const handler = actions.clearOpenaiModel as ClearOpenaiModelAction;
		return handler({
			request: new Request('http://localhost/admin/settings/connections?/clearOpenaiModel', {
				method: 'POST',
				body: new FormData()
			}),
			locals: adminLocals
		} as Parameters<ClearOpenaiModelAction>[0]);
	}

	it('reports the cleared message even when no model was stored (idempotent)', async () => {
		const result = await run();
		expect(result).toMatchObject({
			success: true,
			message: 'OpenAI model cleared (will fall back to default)'
		});
	});

	it('clears a stored OpenAI model setting (falls back to the service default)', async () => {
		await setAppSetting(AppSettingsKey.OPENAI_MODEL, 'gpt-4o');
		expect((await getApiConfigWithSources()).openai.model.value).toBe('gpt-4o');

		const result = await run();
		expect(result).toMatchObject({ success: true });
		// clearApiConfigKey removes the DB row + bumps API_CONFIG_VERSION;
		// resolveConfigValue then returns the service's hardcoded default
		// model ('gpt-5-mini' per getApiConfigWithSources). The user's
		// custom 'gpt-4o' is no longer in effect.
		const after = (await getApiConfigWithSources()).openai.model;
		expect(after.value).not.toBe('gpt-4o');
		expect(after.value.length).toBeGreaterThan(0);
		expect(after.value).toMatch(/^gpt-/);
		// ISSUE-003: after a clear the resolved source is 'default', which is the
		// flag the page uses to blank the editable input (so the default shows as
		// the placeholder "gpt-5-mini (default)") instead of pre-filling it.
		expect(after.source).toBe('default');
		expect(after.isLocked).toBe(false);
	});

	it('returns 400 when the model is locked via env', async () => {
		const dynamicEnv = env as Record<string, string | undefined>;
		const previous = dynamicEnv.OPENAI_MODEL;
		dynamicEnv.OPENAI_MODEL = 'env-locked-model';
		try {
			const result = await run();
			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'OpenAI model is set via environment variable and cannot be cleared here'
				}
			});
		} finally {
			if (previous === undefined) delete dynamicEnv.OPENAI_MODEL;
			else dynamicEnv.OPENAI_MODEL = previous;
		}
	});
});

// ISSUE-001 was reported as "ENV badge missing for an env-set Plex URL". It was
// a FALSE POSITIVE: the dogfood `bun run dev` did not load `.env`, so the value
// was genuinely DB-sourced (editable, no pill = correct). These tests lock in
// the resolution contract that drives the page's ENV pill + disabled input, so
// a genuine lock regression behind that symptom would fail here. The page wires
// the pill/`disabled` to `settings.plexServerUrl.isLocked` (a source guard in
// dogfood-ui-invariants.test.ts pins that wiring).
describe('ISSUE-001 — env authority resolves to a locked, env-sourced config value', () => {
	const dynamicEnv = env as Record<string, string | undefined>;

	beforeEach(async () => {
		await resetSharedTestDb();
	});

	it('reports source=env + isLocked=true when an authoritative PLEX_SERVER_URL env value is present', async () => {
		const prev = dynamicEnv.PLEX_SERVER_URL;
		dynamicEnv.PLEX_SERVER_URL = 'http://plex.env.local:32400';
		try {
			// A DB row must NOT override an authoritative env value (env-over-DB).
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.db.local:32400');
			const resolved = (await getApiConfigWithSources()).plex.serverUrl;
			expect(resolved.source).toBe('env');
			expect(resolved.isLocked).toBe(true);
			expect(resolved.value).toBe('http://plex.env.local:32400');
		} finally {
			dynamicEnv.PLEX_SERVER_URL = prev;
		}
	});

	it('reports source=db + isLocked=false (editable, no pill) when only a DB value exists', async () => {
		const prevUrl = dynamicEnv.PLEX_SERVER_URL;
		const prevToken = dynamicEnv.PLEX_TOKEN;
		dynamicEnv.PLEX_SERVER_URL = '';
		dynamicEnv.PLEX_TOKEN = '';
		try {
			await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, 'http://plex.db.local:32400');
			const resolved = (await getApiConfigWithSources()).plex.serverUrl;
			expect(resolved.source).toBe('db');
			expect(resolved.isLocked).toBe(false);
			expect(resolved.value).toBe('http://plex.db.local:32400');
		} finally {
			dynamicEnv.PLEX_SERVER_URL = prevUrl;
			dynamicEnv.PLEX_TOKEN = prevToken;
		}
	});
});
