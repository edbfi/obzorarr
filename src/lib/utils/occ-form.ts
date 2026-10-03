import type { ActionResult } from '$app/forms';
import { toast } from '$lib/services/toast';

/**
 * Sentinel matching the server's `OCC_CONFLICT_CODE`
 * (`$lib/server/admin/occ-helpers`). That constant is a SERVER-ONLY export, so
 * client code cannot import it — the literal is inlined here instead. Keep the
 * two in lockstep if the sentinel ever changes.
 */
const OCC_CONFLICT_CODE = '__OCC_CONFLICT__';

/**
 * Dual-shape optimistic-concurrency conflict predicate for superForm pages.
 *
 * Two conflict payload shapes exist in the codebase:
 *   - INLINE OCC (`system`, `privacy`): `fail(409, { conflict: true, error })`.
 *   - EXTERNAL OCC (`appearance`'s `z.enum` actions): `fail(409, { error,
 *     code: '__OCC_CONFLICT__' })` — no `conflict` field.
 *
 * The required fix (ISSUE-006) only needs the `conflict` branch, but accepting
 * the `code` branch too is cheap forward-insurance: if a raw-enhance page is
 * ever migrated to superForm and reuses an external-OCC action, this predicate
 * already covers it.
 */
export function isOccConflict(data: unknown): boolean {
	const d = data as { conflict?: boolean; code?: string } | undefined;
	return d?.conflict === true || d?.code === OCC_CONFLICT_CODE;
}

/**
 * Whether an action `failure` payload is a POST-VALIDATION failure, i.e. one the
 * action returned after `superValidate` already passed.
 *
 * Such a payload hands back a form that is still `valid`, so superForm's
 * `onUpdated` takes its SUCCESS branch — the trap behind ISSUE-006, where a
 * discarded stale write fired a "Saved" toast. Status codes do not discriminate
 * it: an action can `fail(400, { form, error })` semantically on a payload that
 * satisfied its schema (`applyPrivacyPreset`'s `!preset` guard does exactly that,
 * because `presetId` is `.optional()`), while a genuine schema failure carries
 * `form.valid === false` and must be left to `onUpdated`'s field-error branch.
 *
 * ORDERING CONTRACT: an OCC conflict returned after the pre-write check is ALSO a
 * post-validation failure, so a caller that runs {@link surfaceOccConflict} must
 * early-return on `isOccConflict(result.data)` before consulting this predicate.
 * `surfaceOccConflict` cancels but does not stop the caller, so skipping that
 * early return toasts every 409 twice.
 *
 * Kept next to {@link isOccConflict} because both inspect the same failure payload
 * and both are consumed at the `onUpdate` layer.
 */
export function isPostValidationFailure(data: unknown): boolean {
	const d = data as { form?: { valid?: boolean } } | undefined;
	return d?.form?.valid === true;
}

/**
 * superForm `onUpdate` guard for OCC stale-writes.
 *
 * An OCC stale-write returns `fail(409, { form, conflict, error })` AFTER
 * validation, so the returned `form` is still `valid` — `onUpdated` would
 * otherwise fire a false "Saved" success toast while the write was actually
 * discarded (ISSUE-006). Detect the conflict here, surface the server's reload
 * message, and `cancel()` so the success path never runs and the stale
 * settingsVersion stays put for the next reload.
 */
export function surfaceOccConflict(event: { result: ActionResult; cancel: () => void }): void {
	const { result } = event;
	if (result.type === 'failure' && isOccConflict(result.data)) {
		const message =
			(result.data as { error?: string } | undefined)?.error ??
			'Settings changed in another tab. Reload and try again.';
		toast.error(message, { action: { label: 'Reload', onClick: () => window.location.reload() } });
		event.cancel();
	}
}
