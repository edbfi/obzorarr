/**
 * Complete instance reset — delete every row Obzorarr owns and return the
 * install to its first-run state.
 *
 * Scope and non-goals:
 * - Rows only. The schema and `drizzle/` migration state are never touched;
 *   `db/client.ts` auto-migrates on import and a dropped/re-created schema would
 *   desynchronise the migration journal.
 * - Environment-configured settings are NOT application data. PLEX_*, OPENAI_*
 *   and ORIGIN live in the process environment, survive this wipe,
 *   and are re-applied by `clearConflictingDbSettings()` at the next startup —
 *   so an env-configured instance's post-reset onboarding is partly pre-filled.
 * - The in-memory bootstrap token is deliberately left alone. The reset flow
 *   shows the admin a fresh claim token BEFORE wiping, and destroying it here
 *   (as `clearOnboardingClaim()` would, via `clearBootstrapToken()`) would strand
 *   them on the claim screen with a token that no longer validates.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appSettings,
	cachedStats,
	customSlides,
	logs,
	metadataCache,
	pinTransactions,
	playHistory,
	plexAccounts,
	sessions,
	shareSettings,
	slideConfig,
	syncStatus,
	users
} from '$lib/server/db/schema';
import {
	getSyncProgress,
	isSyncRunning,
	releaseRunningSyncSlot,
	tryClaimRunningSyncSlot
} from '$lib/server/sync';

/** Exact phrase the admin must type before the destructive action will run. */
export const RESET_CONFIRMATION_PHRASE = 'RESET';

export const RESET_CONFIRMATION_MISMATCH_MESSAGE = `Type ${RESET_CONFIRMATION_PHRASE} exactly to confirm the reset.`;

export const RESET_SYNC_RUNNING_MESSAGE =
	'A sync is currently running. Wait for it to finish, or cancel it on the Sync page, then reset again.';

/**
 * Every table the reset deletes, in a foreign-key-safe order (children first).
 *
 * Enumerated explicitly rather than reflected off the schema module so adding a
 * table is a deliberate act: `tests/unit/admin/instance-reset.test.ts` asserts
 * this list agrees with `sharedTestDbTables` in `tests/helpers/db.ts`, which is
 * the other hand-maintained copy of the same set. A new table that escapes the
 * reset fails that test rather than silently surviving a "complete" wipe.
 */
export const INSTANCE_RESET_TABLES = {
	shareSettings,
	cachedStats,
	playHistory,
	syncStatus,
	metadataCache,
	sessions,
	pinTransactions,
	logs,
	plexAccounts,
	customSlides,
	slideConfig,
	appSettings,
	users
} as const;

export type InstanceResetTableName = keyof typeof INSTANCE_RESET_TABLES;

/** Deletion order: the object's own key order, children before `users`. */
const RESET_DELETE_ORDER: InstanceResetTableName[] = Object.keys(
	INSTANCE_RESET_TABLES
) as InstanceResetTableName[];

/**
 * Whether a reset must be refused right now because a sync is writing rows.
 *
 * Checks BOTH sync signals: the `sync_status` table (survives a restart) and the
 * in-memory progress snapshot (set by the live/background sync path). Wiping
 * mid-sync would leave the database half-populated by the writes that land after
 * the transaction commits.
 *
 * ADVISORY ONLY — a check, not a hold. Use it for the non-destructive stages
 * (the "can I offer this button" load, `prepareInstanceReset`). The destructive
 * stage must use {@link claimSyncSlotForReset} instead, because anything that
 * merely checks leaves a window before the delete.
 */
export async function isResetBlockedBySync(): Promise<boolean> {
	if (getSyncProgress()?.status === 'running') return true;
	return isSyncRunning();
}

/**
 * Take the reset's exclusive hold on syncing, or refuse.
 *
 * `isResetBlockedBySync()` answers "is a sync running *now*", which is not
 * enough for the wipe: the destructive action still has to `await` (the log
 * flush) before it deletes, and any starter already suspended on its own await
 * resumes in that gap. A Cron callback, a second admin tab hitting the Sync
 * page, or a live-sync trigger on any request could therefore claim the slot
 * AFTER the check and keep inserting `play_history` rows into the just-emptied
 * database — a "reset" instance that is silently repopulated.
 *
 * So the reset claims the single running-sync slot itself, through the very same
 * atomic `INSERT ... WHERE NOT EXISTS` every sync entry path funnels through
 * (`startSync` → {@link tryClaimRunningSyncSlot}). While the reset holds it, any
 * sync that tries to start is rejected *before* it writes anything, and the
 * refusal is therefore atomic with the wipe rather than racing it.
 *
 * The in-memory progress check stays in front because the snapshot and the row
 * are written at different moments: `startBackgroundSync` arms progress first,
 * and a finishing sync writes its terminal `sync_status` row before its progress
 * turns non-running. The check can only fail closed, and it is what keeps the
 * reset from wiping while the UI still shows a sync in flight.
 *
 * Returns the claimed sync id (pass it to {@link releaseResetSyncClaim} if the
 * wipe does not happen), or `null` when a sync already holds the slot.
 */
export async function claimSyncSlotForReset(): Promise<number | null> {
	if (getSyncProgress()?.status === 'running') return null;
	return tryClaimRunningSyncSlot();
}

/**
 * Give the slot back when the wipe did NOT run (an error before or during the
 * transaction). A successful wipe needs no release: `sync_status` is one of the
 * tables it deletes, so the claim disappears with it.
 *
 * Skipping this would leave a permanent `running` row that blocks every future
 * sync AND every future reset until the next restart reconciles it.
 */
export async function releaseResetSyncClaim(syncId: number): Promise<void> {
	await releaseRunningSyncSlot(syncId);
}

/**
 * Delete every application row in one transaction.
 *
 * Returns the total number of deleted rows for the audit record. Nothing here
 * touches cookies, the bootstrap token or the sync scheduler — the calling
 * action owns that sequencing.
 */
export function wipeInstanceData(): number {
	return db.transaction((tx) => {
		let deleted = 0;
		for (const name of RESET_DELETE_ORDER) {
			const table = INSTANCE_RESET_TABLES[name];
			// Counted before the delete rather than from a RunResult: drizzle's
			// bun-sqlite delete builder types `.run()` as void, and `.returning()`
			// would materialise every deleted row (play_history can hold hundreds of
			// thousands) just to read its length.
			const [row] = tx.select({ count: sql<number>`count(*)` }).from(table).all();
			deleted += row?.count ?? 0;
			tx.delete(table).run();
		}
		return deleted;
	});
}
