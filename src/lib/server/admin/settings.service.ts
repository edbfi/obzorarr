import { createHash } from 'node:crypto';
import { and, between, eq, inArray, sql } from 'drizzle-orm';
import { DEFAULT_TIMEZONE, normalizeTimezone, TIMEZONE_UNKNOWN_MESSAGE } from '$lib/cron/timezone';
import { db } from '$lib/server/db/client';
import { appSettings, cachedStats, playHistory, shareSettings } from '$lib/server/db/schema';
import { env } from '$lib/server/private-env';
import {
	CredentialedUrlError,
	envAllowsInsecureLocalPlexHttp,
	normalizePlexServerUrl,
	shouldPersistPlexInsecureLocalHttpOptIn
} from '$lib/server/security/credentialed-url';
import { canonicalOrigin } from '$lib/server/security/origin';
import { ShareMode, ShareModeSource, ShareSettingsKey } from '$lib/server/sharing/types';
import { createYearFilter } from '$lib/server/stats/utils';

export const AppSettingsKey = {
	PLEX_SERVER_URL: 'plex_server_url',
	PLEX_TOKEN: 'plex_token',
	PLEX_ALLOW_INSECURE_LOCAL_HTTP: 'plex_allow_insecure_local_http',
	OPENAI_API_KEY: 'openai_api_key',
	OPENAI_BASE_URL: 'openai_base_url',
	OPENAI_MODEL: 'openai_model',
	/**
	 * Bookkeeping marker bumped on every successful `setApiConfigAtomic` mutation
	 * (write OR clear). Included in `API_CONFIG_KEYS` so the optimistic-concurrency
	 * version always advances, even when the only mutation was a row deletion.
	 * Never read as configuration; only its `updatedAt` matters.
	 */
	API_CONFIG_VERSION: 'api_config_version',
	UI_THEME: 'ui_theme',
	WRAPPED_THEME: 'wrapped_theme',
	/** @deprecated Use WRAPPED_THEME instead - kept for backward compatibility */
	CURRENT_THEME: 'current_theme',
	DEFAULT_YEAR: 'default_year',
	ENABLED_YEARS: 'enabled_years',
	ANONYMIZATION_MODE: 'anonymization_mode',
	SYNC_CRON_EXPRESSION: 'sync_cron_expression',
	/**
	 * Operator intent for the sync scheduler (`running` / `paused` / `stopped`).
	 * The croner instance only lives in process memory, so this row is what lets
	 * `restoreSyncScheduler()` rebuild the schedule after a restart instead of
	 * silently leaving the instance without automatic syncs.
	 */
	SYNC_SCHEDULER_STATE: 'sync_scheduler_state',
	/** IANA zone every scheduler runs in. Shadowed by the `TZ` env var. */
	SCHEDULER_TIMEZONE: 'scheduler_timezone',
	WRAPPED_LOGO_MODE: 'wrapped_logo_mode',
	SERVER_NAME: 'server_name',
	SERVER_MACHINE_ID: 'server_machine_id',
	PLEX_IDENTITY_PROOF: 'plex_identity_proof',
	PLEX_AUTHORITY_EPOCH: 'plex_authority_epoch',
	PLEX_AUTHORITY_DISCRIMINATOR: 'plex_authority_discriminator',
	FUN_FACT_FREQUENCY: 'fun_fact_frequency',
	FUN_FACT_CUSTOM_COUNT: 'fun_fact_custom_count',
	FUN_FACTS_AI_PERSONA: 'fun_facts_ai_persona',
	ENABLE_LIVE_SYNC: 'enable_live_sync',
	ONBOARDING_COMPLETED: 'onboarding_completed',
	ONBOARDING_CURRENT_STEP: 'onboarding_current_step',
	ONBOARDING_CLAIMED: 'onboarding_claimed',
	ONBOARDING_CLAIM_PROOF_HASH: 'onboarding_claim_proof_hash',
	ONBOARDING_CLAIMED_AT: 'onboarding_claimed_at',
	CSRF_ORIGIN: 'csrf_origin',
	CSRF_ORIGIN_SKIPPED: 'csrf_origin_skipped',
	CSRF_WARNING_DISMISSED: 'csrf_warning_dismissed',
	TRUST_PROXY: 'trust_proxy',
	THUMBNAIL_SIGNING_SECRET: 'thumbnail_signing_secret',
	/**
	 * Admin opt-in for public current-year Wrapped lookup from the landing page.
	 * When absent, `getPublicLandingLookupEnabled()` defaults to `false`
	 * (login-only). DB-only (no ENV companion), so it is not subject to
	 * `clearConflictingDbSettings`; upgrade backfill also stays disabled until an
	 * administrator explicitly enables the public access policy.
	 */
	PUBLIC_LANDING_LOOKUP: 'public_landing_lookup'
} as const;

export type AppSettingsKeyType = (typeof AppSettingsKey)[keyof typeof AppSettingsKey];

export const ThemePresets = {
	MODERN_MINIMAL: 'modern-minimal',
	SUPABASE: 'supabase',
	DOOM_64: 'doom-64',
	AMBER_MINIMAL: 'amber-minimal',
	SOVIET_RED: 'soviet-red'
} as const;

export type ThemePresetType = (typeof ThemePresets)[keyof typeof ThemePresets];

export const AnonymizationMode = {
	REAL: 'real',
	ANONYMOUS: 'anonymous',
	HYBRID: 'hybrid'
} as const;

export type AnonymizationModeType = (typeof AnonymizationMode)[keyof typeof AnonymizationMode];

export const WrappedLogoMode = {
	ALWAYS_SHOW: 'always_show',
	ALWAYS_HIDE: 'always_hide',
	USER_CHOICE: 'user_choice'
} as const;

export type WrappedLogoModeType = (typeof WrappedLogoMode)[keyof typeof WrappedLogoMode];

export const FunFactFrequency = {
	FEW: 'few',
	NORMAL: 'normal',
	MANY: 'many',
	CUSTOM: 'custom'
} as const;

export type FunFactFrequencyType = (typeof FunFactFrequency)[keyof typeof FunFactFrequency];

export interface FunFactFrequencyConfig {
	mode: FunFactFrequencyType;
	count: number;
}

export async function getAppSetting(key: AppSettingsKeyType): Promise<string | null> {
	const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);

	return result[0]?.value ?? null;
}

export async function setAppSetting(key: AppSettingsKeyType, value: string): Promise<void> {
	const now = new Date();
	await db
		.insert(appSettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value, updatedAt: now }
		});
}

/**
 * Returns the latest `updatedAt` across the given app-settings keys, or `null`
 * if none of the keys exist. Used by the admin settings page to detect
 * concurrent saves from another tab: the load path returns an ISO timestamp,
 * and each form action compares it against the current max before writing.
 */
export async function getAppSettingsUpdatedAt(keys: readonly string[]): Promise<Date | null> {
	if (keys.length === 0) return null;
	const rows = await db
		.select({ updatedAt: appSettings.updatedAt })
		.from(appSettings)
		.where(inArray(appSettings.key, keys as string[]));
	if (rows.length === 0) return null;
	let max = 0;
	for (const row of rows) {
		const t = row.updatedAt.getTime();
		if (t > max) max = t;
	}
	return new Date(max);
}

/**
 * Keys covered by the "Server-wide Wrapped" privacy form (anonymization +
 * server-wide share mode). Each form has its own optimistic-locking version so
 * a stale value on one form doesn't false-409 the other.
 */
export const SERVER_WRAPPED_SETTINGS_KEYS = [
	AppSettingsKey.ANONYMIZATION_MODE,
	ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE
] as const;

/**
 * Keys covered by the "User Sharing Defaults" privacy form (per-user default
 * share mode + allow-user-control flag).
 */
export const USER_DEFAULTS_SETTINGS_KEYS = [
	ShareSettingsKey.DEFAULT_SHARE_MODE,
	ShareSettingsKey.ALLOW_USER_CONTROL
] as const;

/**
 * Keys covered by the System tab Logging form (retention days + max log count
 * + debug flag). The three values land via `setLogRetentionDays`,
 * `setLogMaxCount`, and `setDebugEnabled` from `$lib/server/logging/service`;
 * each writes its own `app_settings` row, so the OCC version is the max of
 * their `updatedAt` columns. Used for the inline `settingsVersion` retrofit on
 * `updateLogSettings` (US-020 partial / inline-OCC pattern).
 */
export const LOG_SETTINGS_KEYS = [
	'log_retention_days',
	'log_max_count',
	'log_debug_enabled'
] as const;

/**
 * Single-key OCC tuple for the Security tab Trust Proxy toggle. The form has
 * exactly one persisted value (`AppSettingsKey.TRUST_PROXY`) so the version
 * is just that row's `updatedAt`. Wrapped in a tuple to share the
 * `getAppSettingsUpdatedAt(...)` helper that the multi-key OCC paths use.
 */
export const TRUST_PROXY_SETTINGS_KEYS = [AppSettingsKey.TRUST_PROXY] as const;

/**
 * Single-key OCC tuple for the System tab "Scheduler timezone" field. Kept out
 * of `LOG_SETTINGS_KEYS` so saving the retention form and saving the timezone
 * cannot false-409 each other, matching the split between the privacy groups.
 */
export const SCHEDULER_TIMEZONE_SETTINGS_KEYS = [AppSettingsKey.SCHEDULER_TIMEZONE] as const;

/**
 * Single-key OCC tuple for the Privacy tab "Allow public Wrapped lookup" toggle.
 * Intentionally NOT folded into `SERVER_WRAPPED_SETTINGS_KEYS` or
 * `USER_DEFAULTS_SETTINGS_KEYS`: each privacy form keeps its own optimistic-lock
 * version so the toggle and the server-wide / user-default share-mode forms can
 * never false-409 one another (same rationale as the split between the existing
 * server-wide and user-default groups above).
 */
export const PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS = [AppSettingsKey.PUBLIC_LANDING_LOOKUP] as const;

/**
 * Single-key OCC tuple for the Security tab CSRF Origin field (the textarea
 * + "Save CSRF Origin" / "Clear" form). Only covers the origin value; the
 * skip flag (`CSRF_ORIGIN_SKIPPED`) has its own toggle and is intentionally
 * NOT part of this group so the two controls don't false-409 each other.
 */
export const CSRF_ORIGIN_SETTINGS_KEYS = [AppSettingsKey.CSRF_ORIGIN] as const;

/**
 * Single-key OCC tuples for the three Appearance-tab `z.enum` forms. Per
 * v3 plan §A5 Table D2 these use EXTERNAL OCC (validated before
 * `safeParse` in the action) because the schemas are top-level `z.enum`,
 * not `z.object`, and wrapping them in `z.object({...})` would change the
 * payload shape.
 */
export const UI_THEME_SETTINGS_KEYS = [AppSettingsKey.UI_THEME] as const;
export const WRAPPED_THEME_SETTINGS_KEYS = [AppSettingsKey.WRAPPED_THEME] as const;
export const WRAPPED_LOGO_MODE_SETTINGS_KEYS = [AppSettingsKey.WRAPPED_LOGO_MODE] as const;

/**
 * Keys covered by the API configuration panel (Plex + OpenAI connections).
 * Used for the optimistic-concurrency timestamp on `updateApiConfig`.
 *
 * `API_CONFIG_VERSION` is a write-only bookkeeping row included so a successful
 * mutation that *only deletes* config rows still advances `max(updatedAt)` — without
 * it, a clear in tab A could leave the version unchanged and let stale tab B
 * resurrect the cleared value while passing the OCC check.
 */
export const API_CONFIG_KEYS = [
	AppSettingsKey.PLEX_SERVER_URL,
	AppSettingsKey.PLEX_TOKEN,
	AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP,
	AppSettingsKey.OPENAI_API_KEY,
	AppSettingsKey.OPENAI_BASE_URL,
	AppSettingsKey.OPENAI_MODEL,
	AppSettingsKey.API_CONFIG_VERSION
] as const;

/**
 * Returns a `Date` whose ms value is strictly greater than `dbFloorMs` (the
 * highest existing `updatedAt` over the OCC key group, read inside the same
 * transaction). `new Date()` only has ms resolution, so two writes against the
 * same key group landing in the same wall-clock millisecond would store
 * identical `updatedAt` timestamps; the OCC check uses strict `<`, so an
 * exact-ms collision lets a stale tab pass and clobber a value just written by
 * the first writer.
 *
 * Reading the floor from the DB (rather than only from in-process state) also
 * survives server restarts and backward clock corrections (NTP, container
 * drift): if `Date.now()` regresses below the persisted `max(updatedAt)`, the
 * new write would otherwise lower `max(updatedAt)` and reopen the OCC window
 * for stale tabs holding the previous higher version. SQLite serializes
 * transactions, so within a single process two concurrent writers will each
 * see the other's stored value via the SELECT that produces `dbFloorMs`.
 *
 * Used by every atomic write path that participates in OCC (the
 * API_CONFIG_VERSION bump in `setApiConfigAtomic`/`clearApiConfigKey`, and the
 * row writes in `setServerWrappedSettingsAtomic`/`setUserDefaultsAtomic`) so
 * `max(updatedAt)` over each key group strictly advances on every successful
 * mutation.
 */
export function nextOccVersionDate(dbFloorMs: number): Date {
	return new Date(Math.max(Date.now(), dbFloorMs + 1));
}

/**
 * Result of an OCC-guarded atomic write. On success it carries the exact
 * `version` (`updatedAt`) the transaction wrote, so the calling action can set
 * the form's `settingsVersion` from the value it actually persisted rather than
 * re-reading `max(updatedAt)` afterwards. That post-write re-read is a TOCTOU
 * hole: a concurrent writer landing between the commit and the re-read would
 * return ITS newer timestamp, handing the client a version it never wrote and
 * letting the client's next stale-UI save slip past the OCC check.
 */
export type OccWriteResult = { status: 'ok'; version: Date } | { status: 'conflict' };

/**
 * A drizzle transaction handle as produced by `db.transaction(...)`. Named so the
 * in-transaction OCC gate and row writers below can be shared between the
 * single-group `set*Atomic` writers and the cross-group `setPrivacyPresetAtomic`.
 */
type SettingsTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The OCC gate every atomic settings write runs INSIDE its transaction: read
 * `max(updatedAt)` over `keys`, reject a stale/blank `submittedVersion`, and
 * return the strictly-advancing timestamp the caller must stamp its rows with.
 *
 * Extracted so a multi-group write can gate several key groups against one
 * transaction snapshot. Semantics are byte-for-byte the ones the three
 * single-group writers used inline before:
 *   - a missing/blank/unparseable `submittedVersion` is a conflict regardless of
 *     row count (closes the fresh-install/all-cleared loophole where a row-count
 *     gate would silently skip OCC);
 *   - with rows present, `submittedMs < maxMs` is a conflict;
 *   - the write timestamp comes from `nextOccVersionDate(maxMs)`, so it shares
 *     the DB floor the check just read and `max(updatedAt)` strictly advances.
 */
async function occGateInTx(
	tx: SettingsTx,
	keys: readonly string[],
	submittedVersion: string
): Promise<OccWriteResult> {
	const rows = await tx
		.select({ updatedAt: appSettings.updatedAt })
		.from(appSettings)
		.where(inArray(appSettings.key, keys as unknown as string[]));

	const submittedMs = submittedVersion ? Date.parse(submittedVersion) : Number.NaN;
	if (Number.isNaN(submittedMs)) {
		return { status: 'conflict' };
	}
	let maxMs = 0;
	for (const row of rows) {
		const t = row.updatedAt.getTime();
		if (t > maxMs) maxMs = t;
	}
	if (rows.length > 0 && submittedMs < maxMs) {
		return { status: 'conflict' };
	}

	return { status: 'ok', version: nextOccVersionDate(maxMs) };
}

/** Upsert a single `app_settings` row inside `tx` at the OCC-issued timestamp. */
async function upsertSettingInTx(
	tx: SettingsTx,
	key: string,
	value: string,
	now: Date
): Promise<void> {
	await tx
		.insert(appSettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

/** The two `SERVER_WRAPPED_SETTINGS_KEYS` rows. */
async function writeServerWrappedRowsInTx(
	tx: SettingsTx,
	opts: { anonymizationMode: AnonymizationModeType; serverWrappedShareMode: string },
	now: Date
): Promise<void> {
	await upsertSettingInTx(tx, AppSettingsKey.ANONYMIZATION_MODE, opts.anonymizationMode, now);
	await upsertSettingInTx(
		tx,
		ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE,
		opts.serverWrappedShareMode,
		now
	);
}

/**
 * The two `USER_DEFAULTS_SETTINGS_KEYS` rows, plus the private-link token purge
 * that has always been part of this write (see `setUserDefaultsAtomic` below for
 * why it does NOT fan out to explicit per-user overrides).
 */
async function writeUserDefaultsRowsInTx(
	tx: SettingsTx,
	opts: { defaultShareMode: string; allowUserControl: boolean },
	now: Date
): Promise<void> {
	await upsertSettingInTx(tx, ShareSettingsKey.DEFAULT_SHARE_MODE, opts.defaultShareMode, now);
	await upsertSettingInTx(
		tx,
		ShareSettingsKey.ALLOW_USER_CONTROL,
		String(opts.allowUserControl),
		now
	);

	if (opts.defaultShareMode !== ShareMode.PRIVATE_LINK) {
		await tx
			.update(shareSettings)
			.set({ shareToken: null })
			.where(eq(shareSettings.modeSource, ShareModeSource.DEFAULT));
	}
}

/** The single `PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS` row. */
async function writePublicLandingLookupRowInTx(
	tx: SettingsTx,
	enabled: boolean,
	now: Date
): Promise<void> {
	await upsertSettingInTx(tx, AppSettingsKey.PUBLIC_LANDING_LOOKUP, String(enabled), now);
}

/**
 * Synchronous sibling of {@link occGateInTx}, with byte-for-byte identical
 * conflict semantics.
 *
 * drizzle's bun-sqlite driver invokes the `db.transaction` callback
 * synchronously inside bun:sqlite's `BEGIN`/`COMMIT` wrapper. An `async`
 * callback therefore returns a promise at its first `await` and the transaction
 * COMMITS right there, leaving the rest of the callback — the gate's verdict and
 * the row write — running outside any transaction. Two interleaved requests can
 * then both read the same pre-write version and both write, which is exactly the
 * lost update OCC exists to prevent.
 *
 * Keeping the gate and the write in one synchronous callback (`.all()` /
 * `.run()`, never `await`) is what makes check-then-write indivisible: JS is
 * single-threaded, so nothing can interleave between BEGIN and COMMIT.
 * `clearConflictingDbSettings` uses the same synchronous-callback shape.
 */
function occGateInTxSync(
	tx: SettingsTx,
	keys: readonly string[],
	submittedVersion: string
): OccWriteResult {
	const rows = tx
		.select({ updatedAt: appSettings.updatedAt })
		.from(appSettings)
		.where(inArray(appSettings.key, keys as unknown as string[]))
		.all();

	const submittedMs = submittedVersion ? Date.parse(submittedVersion) : Number.NaN;
	if (Number.isNaN(submittedMs)) {
		return { status: 'conflict' };
	}
	let maxMs = 0;
	for (const row of rows) {
		const t = row.updatedAt.getTime();
		if (t > maxMs) maxMs = t;
	}
	if (rows.length > 0 && submittedMs < maxMs) {
		return { status: 'conflict' };
	}

	return { status: 'ok', version: nextOccVersionDate(maxMs) };
}

/** The single `SCHEDULER_TIMEZONE_SETTINGS_KEYS` row, already canonicalized. */
function writeSchedulerTimezoneRowInTxSync(
	tx: SettingsTx,
	canonicalTimezone: string,
	now: Date
): void {
	tx.insert(appSettings)
		.values({ key: AppSettingsKey.SCHEDULER_TIMEZONE, value: canonicalTimezone, updatedAt: now })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: canonicalTimezone, updatedAt: now }
		})
		.run();
}

/**
 * Atomically validates that the "Server-wide Wrapped" settings (anonymization
 * mode + server-wide share mode) have not changed since `submittedVersion`
 * and, if so, writes both values in a single SQLite transaction. Returns
 * `'conflict'` when the submitted version is stale.
 */
export async function setServerWrappedSettingsAtomic(opts: {
	anonymizationMode: AnonymizationModeType;
	serverWrappedShareMode: string;
	submittedVersion: string;
}): Promise<OccWriteResult> {
	return db.transaction(async (tx) => {
		const gate = await occGateInTx(tx, SERVER_WRAPPED_SETTINGS_KEYS, opts.submittedVersion);
		if (gate.status === 'conflict') return gate;

		await writeServerWrappedRowsInTx(tx, opts, gate.version);
		return gate;
	});
}

/**
 * Atomically validates that the "User Sharing Defaults" settings (default
 * share mode + allow-user-control flag) have not changed since
 * `submittedVersion` and, if so, writes both values in a single SQLite
 * transaction. Returns `'conflict'` when the submitted version is stale.
 *
 * ISSUE-012 (explicit-apply, new-users-auto): this writes ONLY the global
 * `ALLOW_USER_CONTROL` / `DEFAULT_SHARE_MODE` appSettings rows. It does NOT
 * fan out to existing per-user `share_settings.can_user_control` rows — that
 * would be a surprising destructive side effect of a single toggle save.
 * The new global takes effect for NEW rows on creation (via
 * `getOrCreateShareSettings`) and is applied to EXISTING default-sourced rows
 * only through the explicit `bulkApplyShareDefaults` admin action (which still
 * skips explicit per-user overrides). See `bulkApplyShareDefaults` in
 * `$lib/server/sharing/service`.
 */
export async function setUserDefaultsAtomic(opts: {
	defaultShareMode: string;
	allowUserControl: boolean;
	submittedVersion: string;
}): Promise<OccWriteResult> {
	return db.transaction(async (tx) => {
		const gate = await occGateInTx(tx, USER_DEFAULTS_SETTINGS_KEYS, opts.submittedVersion);
		if (gate.status === 'conflict') return gate;

		await writeUserDefaultsRowsInTx(tx, opts, gate.version);
		return gate;
	});
}

/**
 * Per-field intent for `setApiConfigAtomic`:
 *  - `undefined` — field was not present in the submitted form (e.g. saved from
 *    the OpenAI panel which doesn't include Plex fields). The row must NOT be
 *    touched.
 *  - `''` — field was present and submitted empty. For echoed-back keys
 *    (PLEX_SERVER_URL, OPENAI_BASE_URL, OPENAI_MODEL) this clears the row so
 *    `resolveConfigValue` falls through to env / default. For secret keys
 *    (PLEX_TOKEN, OPENAI_API_KEY) the value is never echoed to the client, so
 *    an empty submission means "leave the stored secret alone" — clearing those
 *    is done via dedicated actions (e.g. `clearOpenaiKey`).
 *  - non-empty string — write the new value (subject to the lock check).
 */
export interface SetApiConfigInput {
	plexServerUrl: string | undefined;
	plexToken: string | undefined;
	plexAllowInsecureLocalHttp?: boolean;
	openaiApiKey: string | undefined;
	openaiBaseUrl: string | undefined;
	openaiModel: string | undefined;
}

export interface SetApiConfigLocks {
	plexServerUrl: boolean;
	plexToken: boolean;
	openaiApiKey: boolean;
	openaiBaseUrl: boolean;
	openaiModel: boolean;
}

export interface SetApiConfigResult {
	status: 'ok' | 'conflict';
	plexCredentialsChanged: boolean;
}

/**
 * Atomically validates that the API config keys have not changed since
 * `submittedVersion` and, if so, writes any non-empty, non-locked values,
 * authority epoch/discriminator, and cache/proof invalidation in one SQLite
 * transaction. Returns `'conflict'` when the submitted version is stale.
 */
export async function setApiConfigAtomic(opts: {
	values: SetApiConfigInput;
	locks: SetApiConfigLocks;
	submittedVersion: string;
}): Promise<SetApiConfigResult> {
	return db.transaction((tx) => {
		const configRows = tx
			.select({
				key: appSettings.key,
				value: appSettings.value,
				updatedAt: appSettings.updatedAt
			})
			.from(appSettings)
			.where(inArray(appSettings.key, API_CONFIG_KEYS as unknown as string[]))
			.all();
		const authorityRows = tx
			.select({ key: appSettings.key, value: appSettings.value })
			.from(appSettings)
			.where(
				inArray(appSettings.key, [
					AppSettingsKey.PLEX_AUTHORITY_EPOCH,
					AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR
				])
			)
			.all();

		// Treat a missing/blank submittedVersion as a stale tab regardless of row
		// count — defends against the fresh-install/all-cleared loophole where the
		// row-count gate would silently skip OCC.
		const submittedMs = opts.submittedVersion ? Date.parse(opts.submittedVersion) : Number.NaN;
		if (Number.isNaN(submittedMs)) {
			return { status: 'conflict', plexCredentialsChanged: false };
		}
		// Compute `maxMs` over the existing rows so the OCC check and the
		// version bump share the same DB floor. With no rows, `maxMs = 0` is
		// fine — `Date.now()` dominates inside `nextOccVersionDate`.
		let maxMs = 0;
		for (const row of configRows) {
			const t = row.updatedAt.getTime();
			if (t > maxMs) maxMs = t;
		}
		if (configRows.length > 0 && submittedMs < maxMs) {
			return { status: 'conflict', plexCredentialsChanged: false };
		}
		const currentValues = new Map(
			[...configRows, ...authorityRows].map((row) => [row.key, row.value])
		);

		const now = nextOccVersionDate(maxMs);
		let plexCredentialsChanged = false;

		const upsert = (key: AppSettingsKeyType, value: string) => {
			tx.insert(appSettings)
				.values({ key, value, updatedAt: now })
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value, updatedAt: now }
				})
				.run();
		};

		// Secret keys: never echoed back to the client. `undefined` (field absent)
		// AND `''` (field present but blank) both mean "leave the stored secret
		// alone" — explicit clearing is done via dedicated actions.
		const writeSecret = (key: AppSettingsKeyType, value: string | undefined, locked: boolean) => {
			if (locked || value === undefined || value === '') return;
			upsert(key, value);
		};

		// Echoed-back keys (URLs, model name): the client renders the current
		// value into the input. `undefined` (field absent — e.g. saved from a
		// different panel that doesn't include this field) is a strict no-op.
		// `''` means "user cleared the field" → delete the row so
		// resolveConfigValue falls through to env / default.
		const writeOrClearEchoed = (
			key: AppSettingsKeyType,
			value: string | undefined,
			locked: boolean
		) => {
			if (locked || value === undefined) return;
			if (value === '') {
				tx.delete(appSettings).where(eq(appSettings.key, key)).run();
				return;
			}
			upsert(key, value);
		};

		const submittedServerUrl =
			opts.values.plexServerUrl === '' ? undefined : opts.values.plexServerUrl;
		if (
			opts.values.plexServerUrl !== undefined &&
			!opts.locks.plexServerUrl &&
			currentValues.get(AppSettingsKey.PLEX_SERVER_URL) !== submittedServerUrl
		) {
			plexCredentialsChanged = true;
		}
		if (
			opts.values.plexToken &&
			!opts.locks.plexToken &&
			currentValues.get(AppSettingsKey.PLEX_TOKEN) !== opts.values.plexToken
		) {
			plexCredentialsChanged = true;
		}

		writeOrClearEchoed(
			AppSettingsKey.PLEX_SERVER_URL,
			opts.values.plexServerUrl,
			opts.locks.plexServerUrl
		);
		if (opts.values.plexServerUrl !== undefined && !opts.locks.plexServerUrl) {
			if (opts.values.plexServerUrl === '') {
				tx.delete(appSettings)
					.where(eq(appSettings.key, AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP))
					.run();
			} else if (
				opts.values.plexAllowInsecureLocalHttp &&
				shouldPersistPlexInsecureLocalHttpOptIn(opts.values.plexServerUrl)
			) {
				upsert(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP, 'true');
			} else {
				tx.delete(appSettings)
					.where(eq(appSettings.key, AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP))
					.run();
			}
		}
		writeSecret(AppSettingsKey.PLEX_TOKEN, opts.values.plexToken, opts.locks.plexToken);
		writeSecret(AppSettingsKey.OPENAI_API_KEY, opts.values.openaiApiKey, opts.locks.openaiApiKey);
		writeOrClearEchoed(
			AppSettingsKey.OPENAI_BASE_URL,
			opts.values.openaiBaseUrl,
			opts.locks.openaiBaseUrl
		);
		writeOrClearEchoed(
			AppSettingsKey.OPENAI_MODEL,
			opts.values.openaiModel,
			opts.locks.openaiModel
		);

		const prospectiveServerUrl =
			!opts.locks.plexServerUrl && opts.values.plexServerUrl !== undefined
				? (submittedServerUrl ?? '')
				: (currentValues.get(AppSettingsKey.PLEX_SERVER_URL) ?? '');
		const prospectiveToken =
			!opts.locks.plexToken && opts.values.plexToken
				? opts.values.plexToken
				: (currentValues.get(AppSettingsKey.PLEX_TOKEN) ?? '');
		const plexEnv = getPlexEnvConfig();
		const effectivePlexAuthority = {
			serverUrl: isAuthoritativePlexServerUrl(plexEnv.serverUrl, plexEnv.token)
				? plexEnv.serverUrl
				: prospectiveServerUrl,
			token: isAuthoritativeEnvValue(plexEnv.token) ? plexEnv.token : prospectiveToken
		};
		const nextDiscriminator = getPlexConfigFingerprint(effectivePlexAuthority);
		const plexAuthorityWasSubmitted =
			(!opts.locks.plexServerUrl && opts.values.plexServerUrl !== undefined) ||
			(!opts.locks.plexToken && Boolean(opts.values.plexToken));
		const authorityChanged =
			plexAuthorityWasSubmitted &&
			currentValues.get(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR) !== nextDiscriminator;
		if (authorityChanged) {
			const nextEpoch = (
				parsePlexAuthorityEpoch(currentValues.get(AppSettingsKey.PLEX_AUTHORITY_EPOCH) ?? null) + 1n
			).toString();
			upsert(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR, nextDiscriminator);
			upsert(AppSettingsKey.PLEX_AUTHORITY_EPOCH, nextEpoch);
			tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.SERVER_MACHINE_ID)).run();
			tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF)).run();
		}
		// Bookkeeping: bump the API_CONFIG_VERSION marker on every successful
		// transaction so `max(updatedAt)` over API_CONFIG_KEYS strictly advances —
		// even if the only mutation above was a delete (which would otherwise
		// leave the version unchanged or regressed, defeating the OCC check).
		upsert(AppSettingsKey.API_CONFIG_VERSION, now.toISOString());

		return { status: 'ok', plexCredentialsChanged };
	});
}

/**
 * Clears a single API_CONFIG row and advances the `API_CONFIG_VERSION` marker in
 * the same transaction so `max(updatedAt)` over `API_CONFIG_KEYS` strictly
 * advances. Without the bump, a clear performed via the dedicated clear-* admin
 * actions would leave `max(updatedAt)` pinned to the last `setApiConfigAtomic`
 * write and let a stale tab resurrect the cleared value while still passing
 * OCC. Use this for admin "clear OpenAI key/model" style actions; the
 * cross-field write path (`setApiConfigAtomic`) already bumps the version
 * itself.
 */
export async function clearApiConfigKey(key: (typeof API_CONFIG_KEYS)[number]): Promise<void> {
	db.transaction((tx) => {
		// Read `max(updatedAt)` over ALL `API_CONFIG_KEYS` rows BEFORE the DELETE
		// so the row about to be cleared still contributes to `dbFloorMs`. If we
		// scanned after deleting, the deleted row's prior `updatedAt` would be
		// missing from the result set; under a clock regression (NTP step / VM
		// migration) plus a legacy state where the deleted row held the highest
		// `updatedAt`, `nextOccVersionDate` could then mint a version below
		// that prior timestamp, letting a stale tab pass the strict-less-than OCC
		// check in `setApiConfigAtomic` and resurrect the cleared value. Reading
		// inside the transaction keeps the floor consistent with concurrent
		// writers and mirrors the floor scan in `setApiConfigAtomic` so both
		// write paths share the same OCC window.
		const rows = tx
			.select({ updatedAt: appSettings.updatedAt })
			.from(appSettings)
			.where(inArray(appSettings.key, API_CONFIG_KEYS as unknown as string[]))
			.all();
		let dbFloorMs = 0;
		for (const row of rows) {
			const t = row.updatedAt.getTime();
			if (t > dbFloorMs) dbFloorMs = t;
		}
		const authorityRows = tx
			.select({ key: appSettings.key, value: appSettings.value })
			.from(appSettings)
			.where(
				inArray(appSettings.key, [
					AppSettingsKey.PLEX_SERVER_URL,
					AppSettingsKey.PLEX_TOKEN,
					AppSettingsKey.PLEX_AUTHORITY_EPOCH,
					AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR
				])
			)
			.all();
		const authorityValues = new Map(authorityRows.map((row) => [row.key, row.value]));
		const targetRow = authorityRows.find((row) => row.key === key);

		tx.delete(appSettings).where(eq(appSettings.key, key)).run();

		const now = nextOccVersionDate(dbFloorMs);
		tx.insert(appSettings)
			.values({
				key: AppSettingsKey.API_CONFIG_VERSION,
				value: now.toISOString(),
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: now.toISOString(), updatedAt: now }
			})
			.run();
		if (
			targetRow &&
			(key === AppSettingsKey.PLEX_SERVER_URL || key === AppSettingsKey.PLEX_TOKEN)
		) {
			const plexEnv = getPlexEnvConfig();
			const effectivePlexAuthority = {
				serverUrl: isAuthoritativePlexServerUrl(plexEnv.serverUrl, plexEnv.token)
					? plexEnv.serverUrl
					: key === AppSettingsKey.PLEX_SERVER_URL
						? ''
						: (authorityValues.get(AppSettingsKey.PLEX_SERVER_URL) ?? ''),
				token: isAuthoritativeEnvValue(plexEnv.token)
					? plexEnv.token
					: key === AppSettingsKey.PLEX_TOKEN
						? ''
						: (authorityValues.get(AppSettingsKey.PLEX_TOKEN) ?? '')
			};
			const nextDiscriminator = getPlexConfigFingerprint(effectivePlexAuthority);
			if (authorityValues.get(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR) !== nextDiscriminator) {
				const nextEpoch = (
					parsePlexAuthorityEpoch(
						authorityValues.get(AppSettingsKey.PLEX_AUTHORITY_EPOCH) ?? null
					) + 1n
				).toString();
				tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.SERVER_MACHINE_ID)).run();
				tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF)).run();
				for (const [authorityKey, value] of [
					[AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR, nextDiscriminator],
					[AppSettingsKey.PLEX_AUTHORITY_EPOCH, nextEpoch]
				] as const) {
					tx.insert(appSettings)
						.values({ key: authorityKey, value, updatedAt: now })
						.onConflictDoUpdate({
							target: appSettings.key,
							set: { value, updatedAt: now }
						})
						.run();
				}
			}
		}
	});
}

export async function getOrCreateAppSetting(
	key: AppSettingsKeyType,
	createValue: () => string
): Promise<string> {
	const existing = await getAppSetting(key);
	if (existing !== null && existing !== '') {
		return existing;
	}

	const generated = createValue();
	const now = new Date();
	await db
		.insert(appSettings)
		.values({ key, value: generated, updatedAt: now })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: generated, updatedAt: now },
			setWhere: eq(appSettings.value, '')
		});

	const persisted = await getAppSetting(key);
	return persisted === null || persisted === '' ? generated : persisted;
}

export async function deleteAppSetting(key: AppSettingsKeyType): Promise<void> {
	await db.delete(appSettings).where(eq(appSettings.key, key));
}

export async function getAllAppSettings(): Promise<Record<string, string>> {
	const result = await db.select().from(appSettings);

	const settings: Record<string, string> = {};
	for (const row of result) {
		settings[row.key] = row.value;
	}

	return settings;
}

export async function getUITheme(): Promise<ThemePresetType> {
	const theme = await getAppSetting(AppSettingsKey.UI_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}
	return ThemePresets.MODERN_MINIMAL;
}

export async function setUITheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.UI_THEME, theme);
}

export async function getWrappedTheme(): Promise<ThemePresetType> {
	const theme = await getAppSetting(AppSettingsKey.WRAPPED_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}

	// Existing installs may still have only the pre-rename key.
	const legacyTheme = await getAppSetting(AppSettingsKey.CURRENT_THEME);
	if (legacyTheme && Object.values(ThemePresets).includes(legacyTheme as ThemePresetType)) {
		return legacyTheme as ThemePresetType;
	}

	return ThemePresets.MODERN_MINIMAL;
}

export async function setWrappedTheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_THEME, theme);
}

/** @deprecated Use getWrappedTheme() instead */
export async function getCurrentTheme(): Promise<ThemePresetType> {
	return getWrappedTheme();
}

/** @deprecated Use setWrappedTheme() instead */
export async function setCurrentTheme(theme: ThemePresetType): Promise<void> {
	await setWrappedTheme(theme);
}

export async function getAnonymizationMode(): Promise<AnonymizationModeType> {
	const mode = await getAppSetting(AppSettingsKey.ANONYMIZATION_MODE);
	if (mode && Object.values(AnonymizationMode).includes(mode as AnonymizationModeType)) {
		return mode as AnonymizationModeType;
	}
	// DF-004 (privacy-by-default): a fresh install with no stored row and no ENV
	// override defaults to HYBRID, not REAL. Hybrid shows a viewer their own name
	// on the server-wide recap while anonymizing everyone else, so a new install
	// never exposes real names to anonymous visitors before an admin opts in.
	// This is a FRESH-INSTALL default only — an existing DB row (any of the three
	// modes) is returned by the branch above and wins, so existing installs are
	// untouched. See docs/decisions/0002-anonymized-by-default.md.
	return AnonymizationMode.HYBRID;
}

export async function setAnonymizationMode(mode: AnonymizationModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, mode);
}

export async function getDefaultYear(): Promise<number> {
	const year = await getAppSetting(AppSettingsKey.DEFAULT_YEAR);
	if (year) {
		const parsed = parseInt(year, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return new Date().getFullYear();
}

export async function setDefaultYear(year: number): Promise<void> {
	await setAppSetting(AppSettingsKey.DEFAULT_YEAR, year.toString());
}

export async function getWrappedLogoMode(): Promise<WrappedLogoModeType> {
	const mode = await getAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE);
	if (mode && Object.values(WrappedLogoMode).includes(mode as WrappedLogoModeType)) {
		return mode as WrappedLogoModeType;
	}
	return WrappedLogoMode.ALWAYS_SHOW;
}

export async function setWrappedLogoMode(mode: WrappedLogoModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, mode);
}

export async function getCachedServerName(): Promise<string | null> {
	return getAppSetting(AppSettingsKey.SERVER_NAME);
}

export async function setCachedServerName(name: string): Promise<void> {
	await setAppSetting(AppSettingsKey.SERVER_NAME, name);
}

export async function getCachedServerMachineId(): Promise<string | null> {
	return getAppSetting(AppSettingsKey.SERVER_MACHINE_ID);
}

function parsePlexAuthorityEpoch(value: string | null): bigint {
	if (!value || !/^[1-9]\d*$/.test(value)) return 0n;
	return BigInt(value);
}

export async function setCachedServerMachineId(machineId: string): Promise<void> {
	db.transaction((tx) => {
		const rows = tx
			.select({ key: appSettings.key, value: appSettings.value })
			.from(appSettings)
			.where(
				inArray(appSettings.key, [
					AppSettingsKey.SERVER_MACHINE_ID,
					AppSettingsKey.PLEX_AUTHORITY_EPOCH
				])
			)
			.all();
		const values = new Map(rows.map((row) => [row.key, row.value]));
		const currentMachine = values.get(AppSettingsKey.SERVER_MACHINE_ID) ?? null;
		const currentEpoch = parsePlexAuthorityEpoch(
			values.get(AppSettingsKey.PLEX_AUTHORITY_EPOCH) ?? null
		);
		if (currentMachine === machineId && currentEpoch > 0n) return;
		const now = new Date();
		const nextEpoch = (currentEpoch + 1n).toString();
		for (const [key, value] of [
			[AppSettingsKey.SERVER_MACHINE_ID, machineId],
			[AppSettingsKey.PLEX_AUTHORITY_EPOCH, nextEpoch]
		] as const) {
			tx.insert(appSettings)
				.values({ key, value, updatedAt: now })
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value, updatedAt: now }
				})
				.run();
		}
		tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF)).run();
	});
}

export async function clearCachedServerMachineId(): Promise<void> {
	db.transaction((tx) => {
		const rows = tx
			.select({ key: appSettings.key, value: appSettings.value })
			.from(appSettings)
			.where(
				inArray(appSettings.key, [
					AppSettingsKey.SERVER_MACHINE_ID,
					AppSettingsKey.PLEX_AUTHORITY_EPOCH
				])
			)
			.all();
		const values = new Map(rows.map((row) => [row.key, row.value]));
		const currentMachine = values.get(AppSettingsKey.SERVER_MACHINE_ID);
		if (currentMachine === undefined) return;
		const nextEpoch = (
			parsePlexAuthorityEpoch(values.get(AppSettingsKey.PLEX_AUTHORITY_EPOCH) ?? null) + 1n
		).toString();
		const now = new Date();
		tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.SERVER_MACHINE_ID)).run();
		tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF)).run();
		tx.insert(appSettings)
			.values({ key: AppSettingsKey.PLEX_AUTHORITY_EPOCH, value: nextEpoch, updatedAt: now })
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: nextEpoch, updatedAt: now }
			})
			.run();
	});
}

export async function setPlexConnectionAuthority(options: {
	serverUrl: string;
	token: string;
	machineId: string | null;
}): Promise<void> {
	db.transaction((tx) => {
		const rows = tx
			.select({ key: appSettings.key, value: appSettings.value })
			.from(appSettings)
			.where(
				inArray(appSettings.key, [
					AppSettingsKey.PLEX_SERVER_URL,
					AppSettingsKey.PLEX_TOKEN,
					AppSettingsKey.SERVER_MACHINE_ID,
					AppSettingsKey.PLEX_AUTHORITY_EPOCH,
					AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR
				])
			)
			.all();
		const values = new Map(rows.map((row) => [row.key, row.value]));
		const currentEpoch = parsePlexAuthorityEpoch(
			values.get(AppSettingsKey.PLEX_AUTHORITY_EPOCH) ?? null
		);
		const nextDiscriminator = getPlexConfigFingerprint({
			serverUrl: options.serverUrl,
			token: options.token
		});
		const changed =
			values.get(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR) !== nextDiscriminator ||
			(values.get(AppSettingsKey.SERVER_MACHINE_ID) ?? null) !== options.machineId;
		if (!changed && currentEpoch > 0n) return;

		const now = new Date();
		const nextEpoch = (currentEpoch + 1n).toString();
		for (const [key, value] of [
			[AppSettingsKey.PLEX_SERVER_URL, options.serverUrl],
			[AppSettingsKey.PLEX_TOKEN, options.token],
			[AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR, nextDiscriminator],
			[AppSettingsKey.PLEX_AUTHORITY_EPOCH, nextEpoch]
		] as const) {
			tx.insert(appSettings)
				.values({ key, value, updatedAt: now })
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value, updatedAt: now }
				})
				.run();
		}
		if (options.machineId) {
			tx.insert(appSettings)
				.values({
					key: AppSettingsKey.SERVER_MACHINE_ID,
					value: options.machineId,
					updatedAt: now
				})
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value: options.machineId, updatedAt: now }
				})
				.run();
		} else {
			tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.SERVER_MACHINE_ID)).run();
		}
		tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF)).run();
	});
}

export async function getFunFactFrequency(): Promise<FunFactFrequencyConfig> {
	const mode = await getAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY);
	const customCountStr = await getAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT);

	const validMode =
		mode && Object.values(FunFactFrequency).includes(mode as FunFactFrequencyType)
			? (mode as FunFactFrequencyType)
			: FunFactFrequency.NORMAL;

	let count: number;
	switch (validMode) {
		case FunFactFrequency.FEW:
			count = 2;
			break;
		case FunFactFrequency.NORMAL:
			count = 4;
			break;
		case FunFactFrequency.MANY:
			count = 8;
			break;
		case FunFactFrequency.CUSTOM:
			count = customCountStr ? parseInt(customCountStr, 10) : 4;
			if (Number.isNaN(count) || count < 1) count = 1;
			if (count > 15) count = 15;
			break;
		default:
			count = 4;
	}

	return { mode: validMode, count };
}

export async function setFunFactFrequency(
	mode: FunFactFrequencyType,
	customCount?: number
): Promise<void> {
	await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, mode);

	if (mode === FunFactFrequency.CUSTOM && customCount !== undefined) {
		const clampedCount = Math.max(1, Math.min(15, customCount));
		await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, clampedCount.toString());
	}
}

export async function countStatsCache(year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(cachedStats)
			.where(eq(cachedStats.year, year));
		return result[0]?.count ?? 0;
	} else {
		const result = await db.select({ count: sql<number>`count(*)` }).from(cachedStats);
		return result[0]?.count ?? 0;
	}
}

export async function clearStatsCache(year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db.delete(cachedStats).where(eq(cachedStats.year, year)).returning();
		return result.length;
	} else {
		const result = await db.delete(cachedStats).returning();
		return result.length;
	}
}

export async function clearUserStatsCache(userId: number, year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db
			.delete(cachedStats)
			.where(and(eq(cachedStats.userId, userId), eq(cachedStats.year, year)))
			.returning();
		return result.length;
	} else {
		const result = await db.delete(cachedStats).where(eq(cachedStats.userId, userId)).returning();
		return result.length;
	}
}

export async function countPlayHistory(year?: number): Promise<number> {
	if (year !== undefined) {
		const { startTimestamp, endTimestamp } = createYearFilter(year);
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(playHistory)
			.where(between(playHistory.viewedAt, startTimestamp, endTimestamp));
		return Number(result[0]?.count ?? 0);
	} else {
		const result = await db.select({ count: sql<number>`count(*)` }).from(playHistory);
		return Number(result[0]?.count ?? 0);
	}
}

export async function clearPlayHistory(year?: number): Promise<number> {
	if (year !== undefined) {
		const { startTimestamp, endTimestamp } = createYearFilter(year);
		const result = await db
			.delete(playHistory)
			.where(between(playHistory.viewedAt, startTimestamp, endTimestamp))
			.returning();

		await clearStatsCache(year);

		return result.length;
	} else {
		const result = await db.delete(playHistory).returning();

		await clearStatsCache();

		return result.length;
	}
}

export type ConfigSource = 'env' | 'db' | 'default';

export interface ConfigValue<T> {
	value: T;
	source: ConfigSource;
	isLocked: boolean;
}

/**
 * Shape exposed to the client for secret fields. Omits the raw value so it never
 * crosses the wire during SvelteKit hydration.
 */
export interface SafeConfigValue {
	source: ConfigSource;
	isLocked: boolean;
	hasValue: boolean;
}

export interface ApiConfigWithSources {
	plex: {
		serverUrl: ConfigValue<string>;
		token: ConfigValue<string>;
	};
	openai: {
		apiKey: ConfigValue<string>;
		baseUrl: ConfigValue<string>;
		model: ConfigValue<string>;
	};
}

export function toSafeConfigValue(config: ConfigValue<string>): SafeConfigValue {
	return {
		source: config.source,
		isLocked: config.isLocked,
		hasValue: Boolean(config.value)
	};
}

function getPlexEnvConfig() {
	return {
		serverUrl: env.PLEX_SERVER_URL ?? '',
		token: env.PLEX_TOKEN ?? ''
	};
}

function getOpenAIEnvConfig() {
	return {
		apiKey: env.OPENAI_API_KEY ?? '',
		baseUrl: env.OPENAI_API_URL ?? '',
		model: env.OPENAI_MODEL ?? ''
	};
}

/**
 * Some `.env.example` shipped values are obvious placeholders that new deployers
 * forget to clear when they copy the template into `.env` (ISSUE-004). Treating
 * them as authoritative makes the onboarding flow attempt to reach a non-existent
 * server and surfaces a misleading "transient" error. Detect them here and let
 * `resolveConfigValue` fall through to the DB / default branch.
 *
 * Matches:
 *   - exactly the shipped sentinel strings (e.g. `your-plex-token-here`)
 *   - generic placeholders following common conventions (`your-*-here`,
 *     `change-me`, `placeholder`)
 *   - the literal `http://localhost:32400` shipped as the example Plex URL.
 *     This is treated as a placeholder unconditionally so the `.env.example`
 *     default can never be mistaken for real config; a genuine localhost
 *     deployment must be configured via the DB / admin UI, which
 *     `resolveConfigValue` falls through to.
 */
export function isPlaceholderSentinel(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;

	const exact = new Set<string>([
		'your-plex-token-here',
		'http://localhost:32400',
		'http://plex-url-here:32400',
		'plex-url-here'
	]);
	if (exact.has(trimmed)) return true;

	const lowered = trimmed.toLowerCase();
	if (/^your-.*-here$/.test(lowered)) return true;
	if (/^change-?me$/.test(lowered)) return true;
	if (lowered === 'placeholder') return true;

	return false;
}

/**
 * An env value locks configuration (source: 'env') only when it is non-empty
 * AND not a shipped `.env.example` placeholder sentinel. This is the single
 * predicate behind every "is this env value authoritative?" check —
 * resolveConfigValue, hasPlexEnvConfig, and the machineId cache invalidation —
 * so the env-lock semantics can never drift between them.
 */
export function isAuthoritativeEnvValue(value: string): boolean {
	return Boolean(value) && !isPlaceholderSentinel(value);
}

/**
 * Plex-specific authority check for the SERVER URL (ISSUE-002).
 *
 * The shared `isPlaceholderSentinel` treats `http://localhost:32400`
 * unconditionally as a placeholder because it is the `.env.example` default —
 * correct when the token is ALSO a placeholder, so a bare template copy never
 * locks the connections UI (the onboarding-strands guard the L1043-1050 comment
 * protects). But a genuine localhost Plex deployment supplied via ENV pairs that
 * URL with a REAL token (`.env.example` ships localhost with the placeholder
 * token `your-plex-token-here`). So localhost is authoritative ONLY when the
 * paired `PLEX_TOKEN` is itself authoritative. Any non-localhost URL falls back
 * to the shared value-only check. This predicate is used solely by the Plex
 * branch of config resolution; `isPlaceholderSentinel`/`isAuthoritativeEnvValue`
 * stay value-only so OpenAI/CSRF semantics are unaffected.
 *
 * The localhost comparison is canonicalized (trim + strip trailing slashes) so a
 * near-bare template copy with a cosmetic variant of the `.env.example` default
 * (e.g. `http://localhost:32400/`) is still recognized as the localhost
 * sentinel rather than slipping past `isPlaceholderSentinel` and env-locking the
 * connections UI with a placeholder token.
 */
export function isAuthoritativePlexServerUrl(serverUrl: string, token: string): boolean {
	const canonicalUrl = serverUrl.trim().replace(/\/+$/, '');
	if (canonicalUrl === 'http://localhost:32400') {
		return isAuthoritativeEnvValue(token);
	}
	if (isAuthoritativeEnvValue(serverUrl)) return true;
	return false;
}

function resolveConfigValue(
	dbSettings: Record<string, string>,
	dbKey: string,
	envValue: string,
	defaultValue: string = ''
): ConfigValue<string> {
	if (isAuthoritativeEnvValue(envValue)) {
		return { value: envValue, source: 'env', isLocked: true };
	}
	const dbValue = dbSettings[dbKey];
	if (dbValue) {
		return { value: dbValue, source: 'db', isLocked: false };
	}
	return { value: defaultValue, source: 'default', isLocked: false };
}

/**
 * Plex SERVER URL resolution (ISSUE-002). Identical to `resolveConfigValue`
 * except it uses the token-aware `isAuthoritativePlexServerUrl` so a real
 * localhost deployment supplied via ENV (localhost URL + real token) locks
 * the field, while a bare `.env.example` copy (localhost URL + placeholder
 * token) still falls through to the onboarding-written DB row.
 */
function resolvePlexServerUrlValue(
	dbSettings: Record<string, string>,
	envUrl: string,
	envToken: string
): ConfigValue<string> {
	if (isAuthoritativePlexServerUrl(envUrl, envToken)) {
		return { value: envUrl, source: 'env', isLocked: true };
	}
	const dbValue = dbSettings[AppSettingsKey.PLEX_SERVER_URL];
	if (dbValue) {
		return { value: dbValue, source: 'db', isLocked: false };
	}
	return { value: '', source: 'default', isLocked: false };
}

export async function getApiConfigWithSources(): Promise<ApiConfigWithSources> {
	const dbSettings = await getAllAppSettings();
	const plexEnv = getPlexEnvConfig();
	const openaiEnv = getOpenAIEnvConfig();

	return {
		plex: {
			serverUrl: resolvePlexServerUrlValue(dbSettings, plexEnv.serverUrl, plexEnv.token),
			token: resolveConfigValue(dbSettings, AppSettingsKey.PLEX_TOKEN, plexEnv.token)
		},
		openai: {
			apiKey: resolveConfigValue(dbSettings, AppSettingsKey.OPENAI_API_KEY, openaiEnv.apiKey),
			baseUrl: resolveConfigValue(
				dbSettings,
				AppSettingsKey.OPENAI_BASE_URL,
				openaiEnv.baseUrl,
				'https://api.openai.com/v1'
			),
			model: resolveConfigValue(
				dbSettings,
				AppSettingsKey.OPENAI_MODEL,
				openaiEnv.model,
				'gpt-4o-mini'
			)
		}
	};
}

export function hasPlexEnvConfig(): boolean {
	// Uses isAuthoritativeEnvValue so a placeholder-only template copy is NOT
	// reported as env config: otherwise the onboarding Connect step flips into
	// the env-locked flow (ENV badge, no manual picker, forceManualSelection ->
	// 400) while getApiConfigWithSources resolves those placeholders to empty —
	// stranding the operator with no usable config and no UI escape (ISSUE-004).
	const { serverUrl, token } = getPlexEnvConfig();
	return isAuthoritativeEnvValue(serverUrl) || isAuthoritativeEnvValue(token);
}

export function hasOpenAIEnvConfig(): boolean {
	return Boolean(env.OPENAI_API_KEY || env.OPENAI_API_URL || env.OPENAI_MODEL);
}

export async function isPlexInsecureLocalHttpAllowed(): Promise<boolean> {
	if (envAllowsInsecureLocalPlexHttp()) return true;
	return (await getAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP)) === 'true';
}

export interface PlexConfig {
	serverUrl: string;
	token: string;
}

export function getPlexConfigFingerprint(config: PlexConfig): string {
	let serverUrl = config.serverUrl;
	if (serverUrl) {
		try {
			serverUrl = normalizePlexServerUrl(serverUrl, { allowInsecureLocalHttp: true });
		} catch {
			// Keep invalid values distinct. getPlexConfig() rejects them, so they can
			// never satisfy the current-authority proof check.
		}
	}
	return createHash('sha256')
		.update('obzorarr:plex-config-fingerprint-v1\0')
		.update(serverUrl)
		.update('\0')
		.update(config.token)
		.digest('hex');
}

/**
 * Centralizes env-over-DB precedence and URL normalization so Plex callers never
 * accidentally use a shadowed or unsafe server URL.
 */
export async function getPlexConfig(): Promise<PlexConfig> {
	const config = await getApiConfigWithSources();
	let serverUrl = '';
	if (config.plex.serverUrl.value) {
		try {
			serverUrl = normalizePlexServerUrl(config.plex.serverUrl.value, {
				allowInsecureLocalHttp: await isPlexInsecureLocalHttpAllowed()
			});
		} catch (err) {
			if (!(err instanceof CredentialedUrlError)) throw err;
		}
	}
	return {
		serverUrl,
		token: config.plex.token.value
	};
}

export async function isPlexConfigured(): Promise<boolean> {
	const config = await getPlexConfig();
	return Boolean(config.serverUrl && config.token);
}

export interface CsrfConfigWithSource {
	origin: ConfigValue<string>;
}

/**
 * ORIGIN from the environment in its canonical form (lowercase scheme and host, no default port,
 * no trailing `/`), because csrfHandle compares it with the browser's Origin header as a string.
 * scripts/serve.ts and the src/env.ts validator already hand the app the canonical value; this
 * keeps the comparison right on any other path. A value that does not parse (src/env.ts stops
 * the app before that can happen) is kept as written, so it never matches a browser origin.
 */
function envCsrfOrigin(): string {
	try {
		return canonicalOrigin(env.ORIGIN) ?? '';
	} catch {
		return env.ORIGIN?.trim() ?? '';
	}
}

export async function getCsrfConfigWithSource(): Promise<CsrfConfigWithSource> {
	const dbSettings = await getAllAppSettings();
	const envOrigin = envCsrfOrigin();

	return {
		origin: resolveConfigValue(dbSettings, AppSettingsKey.CSRF_ORIGIN, envOrigin)
	};
}

export async function getCsrfOrigin(): Promise<string | null> {
	const config = await getCsrfConfigWithSource();
	return config.origin.value || null;
}

export interface TrustProxyConfigWithSource {
	trustProxy: ConfigValue<string>;
}

export async function getTrustProxyConfigWithSource(): Promise<TrustProxyConfigWithSource> {
	const dbSettings = await getAllAppSettings();
	// resolveConfigValue treats any non-empty envValue as "env-locked" and returns
	// it verbatim. getTrustProxy() / proxyHandle then compare with === 'true', so a
	// raw env like 'TRUE' or ' true ' would lock the UI on while runtime stays off.
	// Normalize to the canonical 'true'/'false' the rest of the pipeline expects.
	// An empty string means "not set" (no lock). Mirrors the case-insensitive
	// 'true' convention used by isLiveSyncEnabled() in sync/live-sync.ts.
	const rawEnv = (env.TRUST_PROXY ?? '').trim();
	const envValue = rawEnv === '' ? '' : rawEnv.toLowerCase() === 'true' ? 'true' : 'false';

	return {
		trustProxy: resolveConfigValue(dbSettings, AppSettingsKey.TRUST_PROXY, envValue, 'false')
	};
}

export async function getTrustProxy(): Promise<boolean> {
	const config = await getTrustProxyConfigWithSource();
	return config.trustProxy.value === 'true';
}

export interface SchedulerTimezoneConfigWithSource {
	timezone: ConfigValue<string>;
}

/**
 * Env-over-DB resolution for the zone every scheduler runs in.
 *
 * `TZ` is the env authority because it is the container-wide timezone
 * convention (Docker images set it, and the runtime already uses it for local
 * time), so an operator who sets `TZ=Europe/Copenhagen` gets scheduled syncs in
 * that zone without a second, app-specific variable.
 *
 * Both sides are canonicalized through `normalizeTimezone` before they can win:
 * an unknown `TZ` degrades to "not set" instead of env-locking the admin field
 * to a zone croner cannot honour (mirrors how `getTrustProxyConfigWithSource`
 * normalizes its raw env value), and an unknown stored row falls back to the
 * default rather than throwing inside a scheduler constructor.
 */
export async function getSchedulerTimezoneConfigWithSource(): Promise<SchedulerTimezoneConfigWithSource> {
	const dbSettings = await getAllAppSettings();
	const envValue = normalizeTimezone(env.TZ ?? '') ?? '';
	const resolved = resolveConfigValue(
		dbSettings,
		AppSettingsKey.SCHEDULER_TIMEZONE,
		envValue,
		DEFAULT_TIMEZONE
	);
	const canonical = normalizeTimezone(resolved.value);
	if (!canonical) {
		return { timezone: { value: DEFAULT_TIMEZONE, source: 'default', isLocked: false } };
	}
	return { timezone: { ...resolved, value: canonical } };
}

export async function getSchedulerTimezone(): Promise<string> {
	return (await getSchedulerTimezoneConfigWithSource()).timezone.value;
}

/**
 * {@link setSchedulerTimezoneAtomic} result. Extends {@link OccWriteResult} with
 * the canonical zone the transaction stored, so the caller can echo the
 * normalized identifier (`europe/copenhagen` -> `Europe/Copenhagen`) without a
 * post-write re-read.
 */
export type SchedulerTimezoneWriteResult =
	| { status: 'ok'; version: Date; timezone: string }
	| { status: 'conflict' };

/**
 * Atomically validates that the scheduler timezone has not changed since
 * `submittedVersion` and, if so, writes its canonical form in a single SQLite
 * transaction. Returns `'conflict'` when the submitted version is stale.
 *
 * The `inlineOccCheck` in the action is only a pre-write guard: two admins
 * submitting different zones against the same `settingsVersion` can both clear
 * it before either write runs. Re-running the check inside this transaction is
 * what actually stops the later write from silently clobbering the earlier one.
 * `nextOccVersionDate` (via {@link occGateInTxSync}) additionally guarantees a
 * strictly advancing `updatedAt`, so two saves landing in the same wall-clock
 * millisecond cannot mint identical versions that let a stale tab slip past the
 * strict `<` comparison.
 *
 * The transaction callback is deliberately SYNCHRONOUS — see
 * {@link occGateInTxSync} for why an `async` callback would commit at its first
 * `await` and reopen the very window this closes.
 *
 * The zone is normalized before the transaction opens so an unknown identifier
 * fails without holding a write transaction. `validateTimezone` in the route
 * schema already rejects those with a 400; this throw is defense in depth for
 * any non-form caller.
 */
export async function setSchedulerTimezoneAtomic(opts: {
	timezone: string;
	submittedVersion: string;
}): Promise<SchedulerTimezoneWriteResult> {
	const canonical = normalizeTimezone(opts.timezone);
	if (!canonical) {
		throw new Error(TIMEZONE_UNKNOWN_MESSAGE);
	}
	return db.transaction((tx) => {
		const gate = occGateInTxSync(tx, SCHEDULER_TIMEZONE_SETTINGS_KEYS, opts.submittedVersion);
		if (gate.status === 'conflict') return gate;

		writeSchedulerTimezoneRowInTxSync(tx, canonical, gate.version);
		return { ...gate, timezone: canonical };
	});
}

/**
 * Removes DB values shadowed by authoritative ENV settings and atomically
 * reconciles the durable Plex authority discriminator at startup. A real
 * effective-config transition advances the epoch and invalidates machine/proof;
 * an unchanged normalized authority preserves all three.
 */
export async function clearConflictingDbSettings(): Promise<string[]> {
	const plexEnv = getPlexEnvConfig();
	const openaiEnv = getOpenAIEnvConfig();
	const csrfEnvOrigin = envCsrfOrigin();
	const trustProxyEnv = (env.TRUST_PROXY ?? '').trim();
	const schedulerTimezoneEnv = env.TZ ?? '';
	const effectivePlexConfig = await getPlexConfig();
	const effectivePlexFingerprint = getPlexConfigFingerprint(effectivePlexConfig);

	const envToDbMapping: Array<{
		dbKey: AppSettingsKeyType;
		label: string;
		authoritative: boolean;
	}> = [
		{
			dbKey: AppSettingsKey.PLEX_SERVER_URL,
			label: 'PLEX_SERVER_URL',
			authoritative: isAuthoritativePlexServerUrl(plexEnv.serverUrl, plexEnv.token)
		},
		{
			dbKey: AppSettingsKey.PLEX_TOKEN,
			label: 'PLEX_TOKEN',
			authoritative: isAuthoritativeEnvValue(plexEnv.token)
		},
		{
			dbKey: AppSettingsKey.OPENAI_API_KEY,
			label: 'OPENAI_API_KEY',
			authoritative: isAuthoritativeEnvValue(openaiEnv.apiKey)
		},
		{
			dbKey: AppSettingsKey.OPENAI_BASE_URL,
			label: 'OPENAI_BASE_URL',
			authoritative: isAuthoritativeEnvValue(openaiEnv.baseUrl)
		},
		{
			dbKey: AppSettingsKey.OPENAI_MODEL,
			label: 'OPENAI_MODEL',
			authoritative: isAuthoritativeEnvValue(openaiEnv.model)
		},
		{
			dbKey: AppSettingsKey.CSRF_ORIGIN,
			label: 'CSRF_ORIGIN',
			authoritative: isAuthoritativeEnvValue(csrfEnvOrigin)
		},
		{
			dbKey: AppSettingsKey.TRUST_PROXY,
			label: 'TRUST_PROXY',
			authoritative: isAuthoritativeEnvValue(trustProxyEnv)
		},
		{
			dbKey: AppSettingsKey.SCHEDULER_TIMEZONE,
			label: 'TZ',
			// Only a zone the runtime knows shadows the stored row — an unparseable
			// `TZ` must not delete a working timezone the admin picked in the UI.
			authoritative: normalizeTimezone(schedulerTimezoneEnv) !== null
		}
	];

	return db.transaction((tx) => {
		const rows = tx.select().from(appSettings).all();
		const values = new Map(rows.map((row) => [row.key, row.value]));
		const clearedSettings: string[] = [];

		for (const { dbKey, label, authoritative } of envToDbMapping) {
			if (authoritative && values.has(dbKey)) {
				tx.delete(appSettings).where(eq(appSettings.key, dbKey)).run();
				clearedSettings.push(label);
			}
		}

		const currentDiscriminator = values.get(AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR);
		const currentEpoch = parsePlexAuthorityEpoch(
			values.get(AppSettingsKey.PLEX_AUTHORITY_EPOCH) ?? null
		);
		const hasPriorAuthorityState =
			currentDiscriminator !== undefined ||
			currentEpoch > 0n ||
			values.has(AppSettingsKey.SERVER_MACHINE_ID) ||
			values.has(AppSettingsKey.PLEX_IDENTITY_PROOF);
		if (!hasPriorAuthorityState) {
			if (!effectivePlexConfig.serverUrl && !effectivePlexConfig.token) return clearedSettings;
			const now = new Date();
			for (const [key, value] of [
				[AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR, effectivePlexFingerprint],
				[AppSettingsKey.PLEX_AUTHORITY_EPOCH, '1']
			] as const) {
				tx.insert(appSettings)
					.values({ key, value, updatedAt: now })
					.onConflictDoUpdate({
						target: appSettings.key,
						set: { value, updatedAt: now }
					})
					.run();
			}
			return clearedSettings;
		}

		if (currentDiscriminator === effectivePlexFingerprint && currentEpoch > 0n)
			return clearedSettings;

		const nextEpoch = (currentEpoch + 1n).toString();
		const now = new Date();
		tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.SERVER_MACHINE_ID)).run();
		tx.delete(appSettings).where(eq(appSettings.key, AppSettingsKey.PLEX_IDENTITY_PROOF)).run();
		for (const [key, value] of [
			[AppSettingsKey.PLEX_AUTHORITY_DISCRIMINATOR, effectivePlexFingerprint],
			[AppSettingsKey.PLEX_AUTHORITY_EPOCH, nextEpoch]
		] as const) {
			tx.insert(appSettings)
				.values({ key, value, updatedAt: now })
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value, updatedAt: now }
				})
				.run();
		}
		clearedSettings.push('PLEX_AUTHORITY');
		return clearedSettings;
	});
}

/**
 * Whether the landing page should offer the public username-lookup form.
 * Defaults to `false` (login-only) when no row exists, so a brand-new install is
 * never accidentally public before the admin makes the choice in onboarding.
 * Mirrors the `getGlobalAllowUserControl` boolean-row pattern.
 */
export async function getPublicLandingLookupEnabled(): Promise<boolean> {
	return (await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)) === 'true';
}

export async function setPublicLandingLookupEnabled(enabled: boolean): Promise<void> {
	await setAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP, String(enabled));
}

/**
 * Atomically validates that the "Allow public Wrapped lookup" toggle has not
 * changed since `submittedVersion` and, if so, writes the value in a single
 * SQLite transaction. Returns `'conflict'` when the submitted version is stale.
 *
 * Mirrors `setServerWrappedSettingsAtomic`/`setUserDefaultsAtomic`: the inline
 * `inlineOccCheck` in the action is only a pre-write guard, so the same
 * second OCC check inside the transaction (plus `nextOccVersionDate` for
 * monotonic `updatedAt`) is required to close the TOCTOU window where two
 * concurrent admin submissions both pass the pre-check. The blind
 * `setPublicLandingLookupEnabled` upsert remains for the onboarding path,
 * which writes the value with no optimistic-concurrency version.
 */
export async function setPublicLandingLookupEnabledAtomic(opts: {
	enabled: boolean;
	submittedVersion: string;
}): Promise<OccWriteResult> {
	return db.transaction(async (tx) => {
		const gate = await occGateInTx(tx, PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS, opts.submittedVersion);
		if (gate.status === 'conflict') return gate;

		await writePublicLandingLookupRowInTx(tx, opts.enabled, gate.version);
		return gate;
	});
}

/**
 * The three OCC key groups a privacy preset spans, in the order they appear on
 * the admin Privacy route. Used as the conflict discriminator by
 * {@link setPrivacyPresetAtomic}.
 */
export const PRIVACY_PRESET_SECTIONS = {
	SERVER_WRAPPED: 'serverWrapped',
	USER_DEFAULTS: 'userDefaults',
	PUBLIC_LANDING_LOOKUP: 'publicLandingLookup'
} as const;

export type PrivacyPresetSection =
	(typeof PRIVACY_PRESET_SECTIONS)[keyof typeof PRIVACY_PRESET_SECTIONS];

/**
 * Result of {@link setPrivacyPresetAtomic}. On success it carries the single
 * `updatedAt` the transaction stamped on all three OCC groups, so the calling
 * action can hand every section a fresh `settingsVersion` without a post-write
 * re-read (see `OccWriteResult` for why that re-read is a TOCTOU hole). On
 * conflict it names every stale group, so the client can say which sections moved
 * underneath it — and, because the write is all-or-nothing, nothing was applied.
 */
export type PrivacyPresetWriteResult =
	| { status: 'ok'; version: Date }
	| { status: 'conflict'; staleSections: PrivacyPresetSection[] };

/**
 * Atomically applies a privacy preset across all THREE OCC groups the admin
 * Privacy route splits its controls into (server-wide wrapped, user sharing
 * defaults, public landing lookup) in a single SQLite transaction.
 *
 * Why this exists rather than three sequential `set*Atomic` calls: a preset is
 * one coherent privacy posture, and three separate transactions can leave a
 * half-applied configuration behind when the third group turns out to be stale —
 * e.g. names already anonymized while public lookup stayed on. Gating all three
 * groups against ONE transaction snapshot and writing only if every gate passes
 * makes a partial apply unreachable, so "partial conflict" collapses to "the
 * whole apply was refused, and here is every section that moved".
 *
 * The write reuses the same in-transaction OCC gate and row writers as the
 * single-group writers above, so there is exactly one implementation of each
 * rule — including the private-link share-token purge inside
 * `writeUserDefaultsRowsInTx`.
 *
 * `logoMode` is deliberately NOT written: it lives on the Appearance route and
 * its own OCC group, and the admin preset match covers only the five fields this
 * route owns.
 */
export async function setPrivacyPresetAtomic(opts: {
	anonymizationMode: AnonymizationModeType;
	serverWrappedShareMode: string;
	defaultShareMode: string;
	allowUserControl: boolean;
	publicLandingLookup: boolean;
	submittedVersions: Record<PrivacyPresetSection, string>;
}): Promise<PrivacyPresetWriteResult> {
	return db.transaction(async (tx) => {
		const gates = [
			{
				section: PRIVACY_PRESET_SECTIONS.SERVER_WRAPPED,
				gate: await occGateInTx(
					tx,
					SERVER_WRAPPED_SETTINGS_KEYS,
					opts.submittedVersions.serverWrapped
				)
			},
			{
				section: PRIVACY_PRESET_SECTIONS.USER_DEFAULTS,
				gate: await occGateInTx(
					tx,
					USER_DEFAULTS_SETTINGS_KEYS,
					opts.submittedVersions.userDefaults
				)
			},
			{
				section: PRIVACY_PRESET_SECTIONS.PUBLIC_LANDING_LOOKUP,
				gate: await occGateInTx(
					tx,
					PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS,
					opts.submittedVersions.publicLandingLookup
				)
			}
		];

		const staleSections = gates
			.filter(({ gate }) => gate.status === 'conflict')
			.map(({ section }) => section);
		if (staleSections.length > 0) {
			// All-or-nothing: return before ANY write, so a stale group can never
			// leave the other two applied.
			return { status: 'conflict', staleSections };
		}

		// One shared version across all three groups. Each gate's own
		// `nextOccVersionDate` value already clears that group's floor, so the
		// maximum of the three clears all of them — and one preset apply then reads
		// as one version rather than three near-identical ones. The `: 0` arm is
		// unreachable: the guard above returned on any conflicting gate.
		const version = new Date(
			Math.max(...gates.map(({ gate }) => (gate.status === 'ok' ? gate.version.getTime() : 0)))
		);

		await writeServerWrappedRowsInTx(tx, opts, version);
		await writeUserDefaultsRowsInTx(tx, opts, version);
		await writePublicLandingLookupRowInTx(tx, opts.publicLandingLookup, version);

		return { status: 'ok', version };
	});
}

/**
 * DB-idempotent backfill for `PUBLIC_LANDING_LOOKUP`. Servers that completed
 * onboarding before this setting existed receive the privacy-preserving `false`
 * value. Public lookup now changes current-year access semantics, so an upgrade
 * must not opt users into public reachability without an administrator's choice.
 *
 * Seeds only when `ONBOARDING_COMPLETED === 'true'` and no row exists. New
 * installs are left to onboarding, explicit values are never overwritten, and
 * `onConflictDoNothing` keeps concurrent first requests idempotent. This remains
 * a key/value backfill rather than a schema migration.
 */
export async function ensurePublicLandingLookupDefault(): Promise<void> {
	const onboardingCompleted = await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	if (onboardingCompleted !== 'true') return;

	const existing = await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP);
	if (existing !== null) return;

	const now = new Date();
	await db
		.insert(appSettings)
		.values({ key: AppSettingsKey.PUBLIC_LANDING_LOOKUP, value: 'false', updatedAt: now })
		.onConflictDoNothing({ target: appSettings.key });
}

export async function isCsrfWarningDismissed(): Promise<boolean> {
	const dismissed = await getAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED);
	return dismissed === 'true';
}

export async function dismissCsrfWarning(): Promise<void> {
	await setAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED, 'true');
}

export async function resetCsrfWarningDismissal(): Promise<void> {
	await deleteAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED);
}
