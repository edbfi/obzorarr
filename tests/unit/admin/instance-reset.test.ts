import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';
import {
	claimSyncSlotForReset,
	INSTANCE_RESET_TABLES,
	isResetBlockedBySync,
	RESET_CONFIRMATION_PHRASE,
	RESET_SYNC_RUNNING_MESSAGE,
	releaseResetSyncClaim
} from '$lib/server/admin/reset.service';
import { AppSettingsKey, getAppSetting, setAppSetting } from '$lib/server/admin/settings.service';
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
import { logger } from '$lib/server/logging';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken,
	getBootstrapTokenExpiresAt,
	getOnboardingStep,
	ONBOARDING_CLAIM_COOKIE,
	OnboardingSteps,
	RESET_BOOTSTRAP_TOKEN_TTL_MINUTES,
	RESET_BOOTSTRAP_TOKEN_TTL_MS,
	validateBootstrapToken
} from '$lib/server/onboarding';
import {
	clearSyncProgress,
	isSyncRunning,
	SyncError,
	startBackgroundSync,
	startSync,
	startSyncProgress,
	tryClaimRunningSyncSlot
} from '$lib/server/sync';
import { reconcileInterruptedSyncs } from '$lib/server/sync/reconcile';
import { actions } from '../../../src/routes/admin/settings/data/+page.server';
import { sharedTestDbTables } from '../../helpers/db';
import {
	createOnboardingCookies,
	expectRedirect,
	type OnboardingTestCookies,
	onboardingAdminLocals,
	resetOnboardingTestState,
	setOnboardingSessionCookie
} from '../../helpers/onboarding';
import { TEST_REQUEST_URL } from '../../helpers/requests';

type PrepareAction = NonNullable<typeof actions.prepareInstanceReset>;
type ResetAction = NonNullable<typeof actions.resetInstance>;

const adminLocals = onboardingAdminLocals as unknown as App.Locals;
const nonAdminLocals = {
	user: { id: 7, plexId: 700, username: 'viewer', isAdmin: false }
} as unknown as App.Locals;
const anonymousLocals = {} as App.Locals;

let cookies: OnboardingTestCookies;
let consoleInfoSpy: ReturnType<typeof spyOn>;
let consoleWarnSpy: ReturnType<typeof spyOn>;

function resetRequest(confirmation: string): Request {
	const formData = new FormData();
	formData.set('confirmation', confirmation);
	return new Request('http://localhost/admin/settings/data?/resetInstance', {
		method: 'POST',
		body: formData
	});
}

async function runPrepare(locals: App.Locals = adminLocals) {
	const handler = actions.prepareInstanceReset as PrepareAction;
	return handler({ locals } as unknown as Parameters<PrepareAction>[0]);
}

async function runReset(
	confirmation = RESET_CONFIRMATION_PHRASE,
	locals: App.Locals = adminLocals
) {
	const handler = actions.resetInstance as ResetAction;
	const request = resetRequest(confirmation);
	return handler({
		request,
		url: new URL(request.url),
		cookies,
		locals
	} as unknown as Parameters<ResetAction>[0]);
}

/** One row in every table the reset is expected to clear. */
async function seedEveryTable(): Promise<void> {
	await db.insert(users).values({ id: 1, plexId: 100, username: 'admin', isAdmin: true });
	await db.insert(playHistory).values({
		historyKey: '/status/sessions/history/1',
		ratingKey: '1',
		title: 'Movie',
		type: 'movie',
		viewedAt: 1_700_000_000,
		accountId: 1,
		librarySectionId: 1
	});
	await db.insert(syncStatus).values({ startedAt: new Date(), status: 'completed' });
	await db
		.insert(cachedStats)
		.values({ userId: 1, year: 2024, statsType: 'user', statsJson: '{}' });
	await db.insert(shareSettings).values({ userId: 1, year: 2024, mode: 'public' });
	await db.insert(customSlides).values({ title: 'Hi', content: 'There', sortOrder: 1 });
	await db.insert(slideConfig).values({ slideType: 'intro', sortOrder: 1 });
	await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
	await db.insert(sessions).values({
		id: 'session-under-test',
		userId: 1,
		plexToken: 'plex-token',
		isAdmin: true,
		expiresAt: new Date(Date.now() + 60_000)
	});
	await db
		.insert(pinTransactions)
		.values({ state: 'pin-state', pinId: 5, expiresAt: new Date(Date.now() + 60_000) });
	await db
		.insert(logs)
		.values({ level: 'INFO', message: 'before reset', source: 'Test', timestamp: 1 });
	await db.insert(plexAccounts).values({ accountId: 1, plexId: 100, username: 'admin' });
	await db.insert(metadataCache).values({ ratingKey: '1', fetchedAt: 1 });
}

async function countRows(
	table: (typeof INSTANCE_RESET_TABLES)[keyof typeof INSTANCE_RESET_TABLES]
) {
	const [row] = await db.select({ count: sql<number>`count(*)` }).from(table);
	return row?.count ?? 0;
}

beforeEach(async () => {
	await resetOnboardingTestState();
	clearSyncProgress();
	cookies = setOnboardingSessionCookie(createOnboardingCookies(), 'session-under-test');
	consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
	// The claim guard warns on every refusal; silence it so the suite output stays
	// readable.
	consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
	consoleInfoSpy.mockRestore();
	consoleWarnSpy.mockRestore();
	clearBootstrapToken();
	clearSyncProgress();
	// Drain the buffered guard warning instead of leaving its 100ms timer to fire
	// during a later test file's `logs` assertions.
	await logger.forceFlush();
});

describe('instance reset — authorization', () => {
	it.each([
		['anonymous', anonymousLocals],
		['authenticated non-admin', nonAdminLocals]
	] as const)('rejects a %s POST to resetInstance with 403', async (_name, locals) => {
		await seedEveryTable();

		// Form actions bypass the route load, so the guard has to be explicit.
		expect(await runReset(RESET_CONFIRMATION_PHRASE, locals)).toMatchObject({
			status: 403,
			data: { error: 'Admin access required' }
		});
		expect(await countRows(users)).toBe(1);
	});

	it.each([
		['anonymous', anonymousLocals],
		['authenticated non-admin', nonAdminLocals]
	] as const)('rejects a %s POST to prepareInstanceReset with 403', async (_name, locals) => {
		expect(await runPrepare(locals)).toMatchObject({
			status: 403,
			data: { error: 'Admin access required' }
		});
		// No token may be minted on a denied request.
		expect(getBootstrapTokenExpiresAt()).toBeNull();
	});
});

describe('instance reset — table coverage', () => {
	it('resets exactly the tables the shared test-db helper maintains', () => {
		// Two hand-maintained copies of the same set: a table added to the schema and
		// to tests/helpers/db.ts but forgotten here would silently survive a
		// "complete" reset.
		expect(Object.keys(INSTANCE_RESET_TABLES).sort()).toEqual(
			Object.keys(sharedTestDbTables).sort()
		);
		expect(Object.keys(INSTANCE_RESET_TABLES)).toHaveLength(13);
	});

	it('leaves every table empty after the wipe', async () => {
		await seedEveryTable();
		for (const table of Object.values(INSTANCE_RESET_TABLES)) {
			expect(await countRows(table)).toBeGreaterThan(0);
		}

		await expectRedirect(() => runReset(), '/onboarding/claim');

		for (const [name, table] of Object.entries(INSTANCE_RESET_TABLES)) {
			// The audit record is written after the wipe, so `logs` legitimately holds it.
			if (name === 'logs') continue;
			expect(await countRows(table)).toBe(0);
		}
	});

	it('writes the audit record after the wipe, so it survives it', async () => {
		await seedEveryTable();

		await expectRedirect(() => runReset(), '/onboarding/claim');

		const entries = await db.select().from(logs);
		expect(entries.map((entry) => entry.message)).not.toContain('before reset');
		expect(entries.some((entry) => entry.message.startsWith('Instance reset completed'))).toBe(
			true
		);
		// Also emitted to the console, which no wipe can delete.
		const consoleMessages = (consoleInfoSpy.mock.calls as Array<[unknown]>).map(([message]) =>
			String(message)
		);
		expect(consoleMessages.some((message) => message.includes('Instance reset completed'))).toBe(
			true
		);
	});
});

describe('instance reset — claim token survival', () => {
	it('keeps the token shown to the admin valid after the wipe completes', async () => {
		await seedEveryTable();

		const prepared = (await runPrepare()) as { token: string; expiresInMinutes: number };
		expect(validateBootstrapToken(prepared.token)).toBe(true);

		// Before the wipe the very same token buys nothing: claimOnboardingInstance()
		// refuses outright while ONBOARDING_COMPLETED is set (seedEveryTable() sets
		// it), which is what makes dismissing this dialog genuinely side-effect-free.
		// Asserted here so refuse-before and claim-after are pinned by one token —
		// this fails loudly if anyone makes the guard burn the token instead.
		expect(
			await claimOnboardingInstance(createOnboardingCookies(), prepared.token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('invalid-token');

		await expectRedirect(() => runReset(), '/onboarding/claim');

		// The whole point of the locked sequencing: a naive clearOnboardingClaim()
		// during the wipe would have destroyed this token.
		expect(validateBootstrapToken(prepared.token)).toBe(true);

		// And the real user path works end to end: pasting that token on the fresh
		// claim screen claims the reset instance.
		const freshCookies = createOnboardingCookies();
		expect(
			await claimOnboardingInstance(freshCookies, prepared.token, { requestUrl: TEST_REQUEST_URL })
		).toBe('claimed');
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CLAIM);
	});

	it('leaves the token unusable when the admin dismisses the prepare dialog instead of resetting', async () => {
		await seedEveryTable();

		const prepared = (await runPrepare()) as { token: string; expiresInMinutes: number };

		// Dismissal posts nothing, so the token really is still live in module memory
		// for its full 60 minutes — that is the documented behaviour, not the bug.
		expect(validateBootstrapToken(prepared.token)).toBe(true);

		// The bug was that this token could then be spent against the running
		// instance: /onboarding is in onboardingHandle's skipPaths and a form action
		// bypasses the layout load, so nothing upstream refuses the POST.
		expect(
			await claimOnboardingInstance(createOnboardingCookies(), prepared.token, {
				requestUrl: TEST_REQUEST_URL
			})
		).toBe('invalid-token');

		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT)).toBeNull();
		// The raw row, not getOnboardingStep(): that helper defaults to CLAIM when the
		// row is missing and so cannot tell "never written" from "written then wiped".
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP)).toBeNull();
		// And the live instance is untouched.
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED)).toBe('true');
		expect(await countRows(users)).toBe(1);
	});

	it('mints a 60-minute token on the reset path and leaves first boot at 15 minutes', async () => {
		const before = Date.now();
		const prepared = (await runPrepare()) as { expiresInMinutes: number };
		const resetExpiry = getBootstrapTokenExpiresAt() ?? 0;

		expect(prepared.expiresInMinutes).toBe(60);
		expect(RESET_BOOTSTRAP_TOKEN_TTL_MINUTES).toBe(60);
		expect(resetExpiry - before).toBeGreaterThanOrEqual(RESET_BOOTSTRAP_TOKEN_TTL_MS - 1000);
		expect(resetExpiry - before).toBeLessThanOrEqual(RESET_BOOTSTRAP_TOKEN_TTL_MS + 5000);

		// The ordinary first-boot path is untouched: the default TTL is still 15 min.
		const firstBootStart = Date.now();
		createBootstrapToken();
		const firstBootExpiry = getBootstrapTokenExpiresAt() ?? 0;
		expect(firstBootExpiry - firstBootStart).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
		expect(firstBootExpiry - firstBootStart).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
	});

	it('does not mint anything when preparation is refused because a sync is running', async () => {
		startSyncProgress(1);

		expect(await runPrepare()).toMatchObject({
			status: 409,
			data: { error: RESET_SYNC_RUNNING_MESSAGE }
		});
		expect(getBootstrapTokenExpiresAt()).toBeNull();
	});
});

describe('instance reset — refusal paths', () => {
	it('refuses while an in-memory sync is running and deletes nothing', async () => {
		await seedEveryTable();
		startSyncProgress(1);

		expect(await isResetBlockedBySync()).toBe(true);
		expect(await runReset()).toMatchObject({
			status: 409,
			data: { error: RESET_SYNC_RUNNING_MESSAGE }
		});
		expect(await countRows(users)).toBe(1);
		expect(await countRows(playHistory)).toBe(1);
	});

	it('refuses while a running sync_status row exists and deletes nothing', async () => {
		await seedEveryTable();
		await db.insert(syncStatus).values({ startedAt: new Date(), status: 'running' });

		expect(await isResetBlockedBySync()).toBe(true);
		expect(await runReset()).toMatchObject({
			status: 409,
			data: { error: RESET_SYNC_RUNNING_MESSAGE }
		});
		expect(await countRows(users)).toBe(1);
	});

	it.each(['', 'reset', 'RESET ', 'DELETE'])(
		'rejects the mismatched confirmation %p and deletes nothing',
		async (confirmation) => {
			await seedEveryTable();

			const result = (await runReset(confirmation)) as { status: number; data: { error: string } };
			expect(result.status).toBe(400);
			expect(result.data.error).toContain(RESET_CONFIRMATION_PHRASE);
			expect(await countRows(users)).toBe(1);
			expect(await countRows(appSettings)).toBeGreaterThan(0);
		}
	);
});

describe('instance reset — sync exclusion is a hold, not a check', () => {
	it('holds the running-sync slot so no sync can start between the check and the wipe', async () => {
		await seedEveryTable();

		// This is the exact window the bare isResetBlockedBySync() check left open:
		// resetInstance still has to `await logger.forceFlush()` before it deletes,
		// and every await yields the loop. Standing in for the Cron tick / second
		// admin tab / live-sync trigger that could fire there, assert that while the
		// reset's claim is held EVERY sync entry path is refused before it writes.
		const claimId = await claimSyncSlotForReset();
		expect(claimId).not.toBeNull();

		expect(await tryClaimRunningSyncSlot()).toBeNull();
		// No plex-client mock is needed: the claim rejects at startSync's first
		// statement, before syncPlexAccounts or any network call.
		await expect(startSync()).rejects.toThrow(SyncError);
		expect(await startBackgroundSync()).toEqual({
			started: false,
			error: 'A sync is already in progress'
		});
		expect(await isSyncRunning()).toBe(true);

		// Nothing the refused starters did touched application data.
		expect(await countRows(playHistory)).toBe(1);

		await releaseResetSyncClaim(claimId as number);
		expect(await isSyncRunning()).toBe(false);
	});

	it('refuses a second reset while the first still holds the slot', async () => {
		await seedEveryTable();

		const claimId = await claimSyncSlotForReset();
		expect(claimId).not.toBeNull();

		expect(await claimSyncSlotForReset()).toBeNull();
		expect(await runReset()).toMatchObject({
			status: 409,
			data: { error: RESET_SYNC_RUNNING_MESSAGE }
		});
		expect(await countRows(users)).toBe(1);

		await releaseResetSyncClaim(claimId as number);
	});

	it('releases the slot when the wipe path throws, instead of blocking sync forever', async () => {
		await seedEveryTable();

		// Any failure inside the destructive try — here the pre-wipe log flush —
		// must hand the slot back. A leaked claim is a permanent `running` row: no
		// sync and no further reset could ever start again until a restart
		// reconciled it.
		const flushSpy = spyOn(logger, 'forceFlush').mockImplementation(() => {
			throw new Error('flush failed');
		});
		try {
			expect(await runReset()).toMatchObject({ status: 500 });
		} finally {
			flushSpy.mockRestore();
		}

		expect(await isSyncRunning()).toBe(false);
		expect(await countRows(syncStatus)).toBe(1);
		expect(await claimSyncSlotForReset()).not.toBeNull();
		expect(await countRows(users)).toBe(1);
	});

	it('releases the slot when the wipe transaction itself rolls back', async () => {
		await seedEveryTable();

		// The claim is committed before the transaction opens, so a rollback leaves
		// the claim row standing while every deletion is undone — the one failure
		// shape where "the wipe released it for us" is false.
		const txSpy = spyOn(db, 'transaction').mockImplementation(() => {
			throw new Error('rolled back');
		});
		try {
			expect(await runReset()).toMatchObject({ status: 500 });
		} finally {
			txSpy.mockRestore();
		}

		expect(await isSyncRunning()).toBe(false);
		expect(await countRows(users)).toBe(1);
		expect(await countRows(playHistory)).toBe(1);
	});

	it('sweeps a claim orphaned by a crash mid-reset on the next startup', async () => {
		const claimId = await claimSyncSlotForReset();
		expect(claimId).not.toBeNull();

		// Standing in for the process dying while the hold is up: the row would
		// otherwise block every future sync AND every future reset forever.
		expect(await reconcileInterruptedSyncs()).toBe(1);
		expect(await isSyncRunning()).toBe(false);
		expect(await claimSyncSlotForReset()).not.toBeNull();
	});

	it('leaves no phantom sync row behind after a successful reset', async () => {
		await seedEveryTable();

		await expectRedirect(() => runReset(), '/onboarding/claim');

		// The claim row is deleted by the wipe itself (sync_status is one of the
		// reset tables), so the fresh instance starts with an empty sync history.
		expect(await countRows(syncStatus)).toBe(0);
		expect(await isSyncRunning()).toBe(false);
	});
});

describe('instance reset — post-reset state', () => {
	it('returns onboarding to the first step and clears session + claim cookies', async () => {
		await seedEveryTable();
		await setAppSetting(AppSettingsKey.ONBOARDING_CURRENT_STEP, OnboardingSteps.COMPLETE);
		await setAppSetting(AppSettingsKey.ONBOARDING_CLAIMED, 'true');
		await setAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH, 'a'.repeat(64));
		await setAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT, String(Date.now()));

		await expectRedirect(() => runReset(), '/onboarding/claim');

		expect(await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH)).toBeNull();
		expect(await getOnboardingStep()).toBe(OnboardingSteps.CLAIM);

		const deleted = cookies.deletes.map((entry) => entry.name);
		expect(deleted).toContain('session');
		expect(deleted).toContain(ONBOARDING_CLAIM_COOKIE);
		expect(await countRows(sessions)).toBe(0);
	});
});

describe('instance reset — Danger zone UI wiring (no DOM harness in this suite)', () => {
	const PAGE = 'src/routes/admin/settings/data/+page.svelte';
	const read = async () => Bun.file(PAGE).text();
	/** Prose is line-wrapped in the template, so collapse whitespace before matching. */
	const readProse = async () => (await Bun.file(PAGE).text()).replace(/\s+/g, ' ');

	it('places the reset in a Danger zone card after the per-year clear actions', async () => {
		const src = await read();
		const dangerIdx = src.indexOf('<Card class="border-destructive/50">');
		expect(dangerIdx).toBeGreaterThan(src.indexOf('Clear play history'));
		const cardBlock = src.slice(dangerIdx, src.indexOf('</Card>', dangerIdx));
		expect(cardBlock).toContain('Danger zone');
		expect(cardBlock).toContain('variant="destructive"');
		expect(cardBlock).toContain('Reset instance');
	});

	it('disables and annotates the reset button while a sync is running', async () => {
		const src = await read();
		expect(src).toContain('disabled={data.syncRunning || isPreparingReset || isResetting}');
		expect(src).toContain('{#if data.syncRunning}');
	});

	it('never strands the dialog in a disabled "Wiping…" state', async () => {
		const src = await read();
		// Both stages are gated on their own in-flight flag, and the Cancel button
		// is disabled with them — so a flag that is never cleared traps the admin on
		// a dialog whose claim token they still need. Every branch must release it,
		// including the redirect one where `goto` can throw after a successful wipe.
		const enhanceBlock = src.slice(
			src.indexOf('action="?/resetInstance"'),
			src.indexOf('style="display: contents;"', src.indexOf('action="?/resetInstance"'))
		);
		const gotoIdx = enhanceBlock.indexOf('await goto(result.location');
		expect(gotoIdx).toBeGreaterThan(-1);
		// The navigation is wrapped, not bare: a `finally` must exist and must come
		// before the early `return`. Asserted as presence THEN order, because a
		// missing `finally` yields indexOf === -1, which would satisfy the ordering
		// comparison on its own.
		const afterGoto = enhanceBlock.slice(gotoIdx);
		const finallyIdx = afterGoto.indexOf('} finally {');
		expect(finallyIdx).toBeGreaterThan(-1);
		expect(finallyIdx).toBeLessThan(afterGoto.indexOf('return;'));
		// ...and the other branch releases it too. Asserted as "each branch has its
		// own release" rather than a total count, so hoisting both into one outer
		// try/finally would still pass.
		expect(afterGoto.slice(finallyIdx)).toMatch(/^\} finally \{\n\t+isResetting = false;/);
		const otherBranch = enhanceBlock.slice(enhanceBlock.indexOf("result.type === 'failure'"));
		expect(otherBranch).toMatch(/\} finally \{\n\t+isResetting = false;/);
		// Stage 1 releases its own flag the same way.
		expect(src).toContain('isPreparingReset = false;');
	});

	it('states honestly what is lost, including share-link breakage and manual curation', async () => {
		const prose = await readProse();
		expect(prose).toContain('re-syncs play history from the official Plex API');
		expect(prose).toContain('any link you have already handed out to a user stops working');
		expect(prose).toContain('other curation you did by hand');
		// Env-configured settings survive; the copy must not promise a blank slate.
		expect(prose).toContain('TRUST_PROXY');
		expect(prose).toContain('you do not start');
	});

	it('keeps both dialogs dismissible with no side effects', async () => {
		const src = await read();
		// Each dialog's Cancel only resets client state — no action is posted.
		const cancels = [...src.matchAll(/<AlertDialog\.Cancel[^>]*onclick=\{closeResetFlow\}/g)];
		expect(cancels).toHaveLength(2);
		const closeFn = src.slice(src.indexOf('function closeResetFlow('));
		const body = closeFn.slice(0, closeFn.indexOf('\n}'));
		expect(body).not.toContain('fetch');
		expect(body).not.toContain('?/');
	});

	it('mints the token in stage 1 and only wipes from the stage 2 form', async () => {
		const src = await read();
		expect(src).toContain('action="?/prepareInstanceReset"');
		expect(src).toContain('action="?/resetInstance"');
		// The destructive action is posted exactly once in the template.
		expect(src.match(/action="\?\/resetInstance"/g)).toHaveLength(1);
	});

	it('gates the confirm button on an exact type-to-confirm match', async () => {
		const src = await read();
		expect(src).toContain(
			'let resetConfirmationMatches = $derived(resetConfirmation === data.resetConfirmationPhrase);'
		);
		expect(src).toContain('disabled={isResetting || !resetConfirmationMatches}');
		// Even a bypassed button cannot submit: enhance cancels a non-matching POST,
		// and the server re-checks the phrase.
		expect(src).toContain('if (isResetting || !resetConfirmationMatches) {');
	});

	it('shows the token with a copy control and the expiry note', async () => {
		const src = await read();
		expect(src).toContain('data-testid="reset-claim-token"');
		expect(src).toContain('onclick={copyResetToken}');
		expect(src).toContain('navigator.clipboard.writeText(resetToken)');
		expect(src).toContain(
			'{resetTokenExpiresInMinutes ?? data.resetTokenTtlMinutes} minutes and Obzorarr stores it'
		);
	});

	it('never routes the claim token through the logger', async () => {
		const serverSrc = await Bun.file('src/routes/admin/settings/data/+page.server.ts').text();
		const resetBlock = serverSrc.slice(serverSrc.indexOf('prepareInstanceReset:'));
		const loggerCalls = [...resetBlock.matchAll(/logger\.\w+\([^)]*\)/g)].map((m) => m[0]);
		for (const call of loggerCalls) {
			expect(call).not.toContain('token');
		}
	});

	it('titles the card with what the action does and keeps severity as a badge eyebrow', async () => {
		// "Danger zone" alone signals severity but never says what the button does.
		// The retitle must not trade the severity signal away to gain the "what".
		const src = await read();
		const dangerIdx = src.indexOf('<Card class="border-destructive/50">');
		const cardBlock = src.slice(dangerIdx, src.indexOf('</Card>', dangerIdx));
		expect(cardBlock).toContain(
			'<CardTitle class="text-destructive">Reset this Obzorarr instance</CardTitle>'
		);
		const badgeIdx = cardBlock.indexOf('<Badge');
		const badge = cardBlock.slice(badgeIdx, cardBlock.indexOf('</Badge>'));
		expect(badge).toContain('variant="destructive"');
		expect(badge).toContain('Danger zone');
		expect(badge).toContain('<TriangleAlertIcon />');
		// Eyebrow, so it reads above the title rather than replacing it.
		expect(badgeIdx).toBeLessThan(cardBlock.indexOf('<CardTitle'));
	});

	it('frames the three-way data classification with a lead-in', async () => {
		// The box used to open on a bare "Comes back on its own" — meaningless read
		// cold, because nothing above it said what the three blocks classify.
		const prose = await readProse();
		expect(prose).toContain('Where your data ends up');
		expect(prose).not.toContain('Comes back on its own');
		expect(prose).not.toContain('Gone for good');
		expect(prose).not.toContain('Set by environment variables');
	});

	it('uses one vocabulary for the three facts in the card and the confirm dialog', async () => {
		// The card and the stage-1 dialog state the same three facts. They must not
		// label them differently, or an admin reads two vocabularies for one truth.
		const src = await read();
		const labels = ['What comes back', 'What does not', 'What is untouched'];
		const cardIdx = src.indexOf('<Card class="border-destructive/50">');
		const cardBlock = src.slice(cardIdx, src.indexOf('</Card>', cardIdx));
		const prepareIdx = src.indexOf('action="?/prepareInstanceReset"');
		const dialogBlock = src.slice(src.lastIndexOf('<AlertDialog.Root', prepareIdx), prepareIdx);
		for (const surface of [cardBlock, dialogBlock]) {
			expect(surface).toContain('Where your data ends up');
			let cursor = -1;
			for (const label of labels) {
				const at = surface.indexOf(`<p class="font-medium">${label}</p>`);
				expect(at).toBeGreaterThan(cursor);
				cursor = at;
			}
		}
	});

	it('sizes Cancel and the confirm button identically in every dialog on the page', async () => {
		// `.tap-target` is the 44px WCAG min-size utility. It used to sit on the
		// Action only — which lives inside a <form>, so the omission on the bare
		// 36px Cancel was easy to miss — and the pair rendered visibly mismatched.
		const src = await read();
		const footers = src.split('<AlertDialog.Footer>').slice(1);
		expect(footers).toHaveLength(4);
		for (const raw of footers) {
			const footer = raw.slice(0, raw.indexOf('</AlertDialog.Footer>'));
			for (const tag of ['<AlertDialog.Cancel', '<AlertDialog.Action']) {
				const start = footer.indexOf(tag);
				expect(start).toBeGreaterThan(-1);
				expect(footer.slice(start, footer.indexOf('>', start))).toContain('tap-target');
			}
		}
	});

	it('names the sync-blocked state and where to clear it', async () => {
		const src = await read();
		const start = src.indexOf('{#if data.syncRunning}');
		const block = src.slice(start, src.indexOf('{/if}', start));
		expect(block).toContain('<AlertTitle>');
		// The copy tells the admin where to go, not just that they cannot proceed.
		expect(block).toContain('href="/admin/sync"');
	});
});
