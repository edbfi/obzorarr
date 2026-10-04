import { getAppSettingsUpdatedAt } from './settings.service';

/**
 * Shared 409 error message for inline-OCC conflict paths. Test files
 * (settings-actions, csrf-action, system/appearance/privacy/data/connections/
 * security-actions, server-wrapped-route) all assert this exact string;
 * changing it requires updating those tests in lockstep.
 *
 * The external-OCC path uses a different shape — see `OCC_CONFLICT_CODE`.
 */
export const OCC_CONFLICT_MESSAGE = 'Settings changed in another tab. Reload and try again.';

/**
 * Sentinel `code` discriminator for the external-OCC conflict shape.
 * Action handlers for the top-level `z.enum` schemas (UI / wrapped theme,
 * wrapped logo mode) return:
 *   `fail(409, { error: OCC_CONFLICT_MESSAGE, code: OCC_CONFLICT_CODE, settingsVersion: current })`
 * The human-readable `error` is what `handleFormToast` surfaces to the user
 * (clients cannot import this server-only constant), while `code` lets any
 * future client logic distinguish OCC conflicts from regular validation
 * failures and refresh its local version before retrying.
 *
 * The appearance/+page.server.ts handlers depend on this exact string; tests
 * in occ-helpers.test.ts + appearance-actions.test.ts also assert against the
 * literal. Lockstep rules apply if the sentinel ever needs to change.
 */
export const OCC_CONFLICT_CODE = '__OCC_CONFLICT__';

/**
 * Render a settings-version field for page loads. Returns the row's
 * `updatedAt` ISO string, or the epoch when the row doesn't exist yet
 * (fresh-install / all-cleared) — the atomic service helpers accept the
 * epoch as "older than anything" for OCC purposes, so the very first
 * save can land without an irrecoverable 409. Zod `.min(1)` on the
 * `settingsVersion` field rejects empty strings, which is why the epoch
 * (a real non-empty ISO) is the right sentinel.
 */
export function settingsVersionISO(updatedAt: Date | null | undefined): string {
	return updatedAt?.toISOString() ?? new Date(0).toISOString();
}

/**
 * External OCC check used by the top-level `z.enum` actions
 * (`updateUITheme`, `updateWrappedTheme`, `updateWrappedLogoMode`) where
 * wrapping the schema in `z.object({...})` to carry an inline
 * `settingsVersion` would change the payload shape. Per v3 plan §A5
 * Table D2.
 *
 * Returns `{ status: 'ok' }` to proceed, or
 * `{ status: 'conflict', current: <ISO> }` to short-circuit the action
 * with `fail(409, { error: '__OCC_CONFLICT__', settingsVersion: current })`.
 *
 * Treats blank/missing `submittedVersion` and unparseable timestamps as
 * stale — defends against the fresh-install loophole where the row-count
 * gate would otherwise silently skip OCC.
 */
export async function externalOccCheck(
	submittedVersion: string,
	keys: readonly string[]
): Promise<{ status: 'ok' } | { status: 'conflict'; current: string }> {
	const currentUpdatedAt = await getAppSettingsUpdatedAt(keys);
	if (!submittedVersion) {
		// Blank/missing version is always stale, but report the row's real
		// `updatedAt` (epoch only when no rows exist) so a client trusting the
		// 409 payload's `settingsVersion` can refresh to the true current
		// version rather than an artificially stale epoch and re-conflict.
		return {
			status: 'conflict',
			current: currentUpdatedAt?.toISOString() ?? new Date(0).toISOString()
		};
	}
	const currentMs = currentUpdatedAt?.getTime() ?? 0;
	const submittedMs = Date.parse(submittedVersion);
	if (Number.isNaN(submittedMs) || submittedMs < currentMs) {
		return {
			status: 'conflict',
			current: currentUpdatedAt?.toISOString() ?? new Date(0).toISOString()
		};
	}
	return { status: 'ok' };
}

/**
 * Inline OCC check shared by `updateLogSettings` and `updateCsrfOrigin`. The
 * conflict response shape for these actions is `{ conflict: true, error:
 * 'Settings changed in another tab. Please reload.' }` so the helper just returns a status discriminator — the
 * caller writes the `fail(409, ...)` itself to keep the existing wording
 * and the test-asserted payload shape intact.
 *
 * For schemas where `settingsVersion` is a required Zod field, the schema
 * already rejects blank submissions; calling this helper after a
 * successful `safeParse` only exercises the stale branch. The CsrfOrigin
 * call site invokes it BEFORE schema parsing (the clear branch bypasses
 * the schema entirely), so the blank-handling here is exercised there.
 */
export async function inlineOccCheck(
	submittedVersion: string,
	keys: readonly string[]
): Promise<{ status: 'ok' } | { status: 'conflict' }> {
	if (!submittedVersion) {
		return { status: 'conflict' };
	}
	const currentUpdatedAt = await getAppSettingsUpdatedAt(keys);
	const currentMs = currentUpdatedAt?.getTime() ?? 0;
	const submittedMs = Date.parse(submittedVersion);
	if (Number.isNaN(submittedMs) || submittedMs < currentMs) {
		return { status: 'conflict' };
	}
	return { status: 'ok' };
}
