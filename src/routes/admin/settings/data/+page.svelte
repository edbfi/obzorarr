<script lang="ts">
import CalculatorIcon from '@lucide/svelte/icons/calculator';
import CheckIcon from '@lucide/svelte/icons/check';
import CopyIcon from '@lucide/svelte/icons/copy';
import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
import { enhance } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { SettingsActionBar } from '$lib/components/settings/index.js';
import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert/index.js';
import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import * as Select from '$lib/components/ui/select/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// 'all' sentinel means "no year filter". Empty string would collide with
// Select.Item disabled state, so we map it explicitly when submitting.
let cacheYear = $state<string>('all');
let historyYear = $state<string>('all');

let cacheCountResult = $state<string | null>(null);
let historyCountResult = $state<string | null>(null);

let isCheckingCacheCount = $state(false);
let isClearingCache = $state(false);
let isCheckingHistoryCount = $state(false);
let isClearingHistory = $state(false);

let clearCacheDialogOpen = $state(false);
let clearHistoryDialogOpen = $state(false);

function formatRecordCount(n: number): string {
	return new Intl.NumberFormat(undefined).format(n);
}

const yearOptions = $derived([
	{ value: 'all', label: 'All years' },
	...data.availableYears.map((y) => ({ value: String(y), label: String(y) }))
]);

const cacheYearLabel = $derived(
	yearOptions.find((o) => o.value === cacheYear)?.label ?? 'All years'
);
const historyYearLabel = $derived(
	yearOptions.find((o) => o.value === historyYear)?.label ?? 'All years'
);

// --- Complete reset (Danger zone) -----------------------------------------
// Two-stage confirmation. Stage 1 explains the consequences and writes nothing.
// Stage 2 asks the server to mint the claim token needed AFTER the wipe, shows
// it, and only then offers the destructive button behind a type-to-confirm
// field. Closing either dialog is a pure client-side dismissal.
let resetExplainOpen = $state(false);
let resetConfirmOpen = $state(false);
let isPreparingReset = $state(false);
let isResetting = $state(false);
let resetToken = $state<string | null>(null);
// Populated from the mint response; falls back to the server-declared TTL.
let resetTokenExpiresInMinutes = $state<number | null>(null);
let resetConfirmation = $state('');
let tokenCopied = $state(false);

let resetConfirmationMatches = $derived(resetConfirmation === data.resetConfirmationPhrase);

function closeResetFlow() {
	resetExplainOpen = false;
	resetConfirmOpen = false;
	// Drop the token from client memory on dismissal; the instance is untouched.
	resetToken = null;
	resetConfirmation = '';
	tokenCopied = false;
}

async function copyResetToken() {
	if (!resetToken) return;
	try {
		await navigator.clipboard.writeText(resetToken);
		tokenCopied = true;
	} catch {
		tokenCopied = false;
		handleFormToast({
			error: 'Copy failed. Select the token and copy it yourself.'
		});
	}
}
</script>

<svelte:head>
	<title>Data - Settings - Obzorarr</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>Stats cache</CardTitle>
			<CardDescription>
				Counts and clears cached per-year Wrapped statistics. Clearing the cache forces a
				rebuild the next time someone opens a Wrapped page.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-2">
				<Label for="cache-year">Year</Label>
				<Select.Root type="single" name="year" bind:value={cacheYear}>
					<Select.Trigger id="cache-year" class="w-48">{cacheYearLabel}</Select.Trigger>
					<Select.Content>
						{#each yearOptions as opt (opt.value)}
							<Select.Item value={opt.value}>{opt.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if cacheCountResult}
				<div role="status" aria-live="polite" class="rounded-md bg-muted p-3 text-sm">
					{cacheCountResult}
				</div>
			{/if}

			<SettingsActionBar>
				<form
					method="POST"
					action="?/getCacheCount"
					use:enhance={({ formData }) => {
						isCheckingCacheCount = true;
						if (cacheYear !== 'all') formData.set('year', cacheYear);
						return async ({ result }) => {
							try {
								if (result.type === 'success') {
									const d = result.data as { count?: number; year?: number } | undefined;
									const count = d?.count ?? 0;
									cacheCountResult = `${formatRecordCount(count)} cache entries${
										d?.year ? ` for ${d.year}` : ' across all years'
									}`;
								} else if (result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
							} finally {
								isCheckingCacheCount = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isCheckingCacheCount}>
						<CalculatorIcon />
						{isCheckingCacheCount ? 'Counting…' : 'Count cache entries'}
					</Button>
				</form>

				<Button
					variant="destructive"
					class="tap-target"
					onclick={() => (clearCacheDialogOpen = true)}
					disabled={isClearingCache}
				>
					<Trash2Icon />
					Clear cache
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Play history</CardTitle>
			<CardDescription>
				Total stored play records: <strong>{formatRecordCount(data.playHistoryTotalCount)}</strong>.
				Counting or clearing is scoped by the selected year (or all years).
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-2">
				<Label for="history-year">Year</Label>
				<Select.Root type="single" name="year" bind:value={historyYear}>
					<Select.Trigger id="history-year" class="w-48">{historyYearLabel}</Select.Trigger>
					<Select.Content>
						{#each yearOptions as opt (opt.value)}
							<Select.Item value={opt.value}>{opt.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if historyCountResult}
				<div role="status" aria-live="polite" class="rounded-md bg-muted p-3 text-sm">
					{historyCountResult}
				</div>
			{/if}

			<SettingsActionBar>
				<form
					method="POST"
					action="?/getPlayHistoryCount"
					use:enhance={({ formData }) => {
						isCheckingHistoryCount = true;
						if (historyYear !== 'all') formData.set('year', historyYear);
						return async ({ result }) => {
							try {
								if (result.type === 'success') {
									const d = result.data as { count?: number; year?: number } | undefined;
									const count = d?.count ?? 0;
									historyCountResult = `${formatRecordCount(count)} play records${
										d?.year ? ` for ${d.year}` : ' across all years'
									}`;
								} else if (result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
							} finally {
								isCheckingHistoryCount = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isCheckingHistoryCount}>
						<CalculatorIcon />
						{isCheckingHistoryCount ? 'Counting…' : 'Count play records'}
					</Button>
				</form>

				<Button
					variant="destructive"
					class="tap-target"
					onclick={() => (clearHistoryDialogOpen = true)}
					disabled={isClearingHistory}
				>
					<Trash2Icon />
					Clear play history
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>

	<!-- The only irreversible action on this page. The severity badge carries the
	     alarm so the title is free to say plainly WHAT the action does, and the
	     three blocks below use the same three labels as the confirm dialog — an
	     admin must never read two vocabularies for the same three facts. -->
	<Card class="border-destructive/50">
		<CardHeader>
			<Badge variant="destructive" class="mb-1">
				<TriangleAlertIcon />
				Danger zone
			</Badge>
			<CardTitle class="text-destructive">Reset this Obzorarr instance</CardTitle>
			<CardDescription>
				Clears all {data.resetTableCount} database tables at once and returns this instance to the
				first-run setup screen. This is not one of the per-year actions above, and it cannot be
				undone.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Where your data ends up
				</p>
				<div class="space-y-1">
					<p class="font-medium">What comes back</p>
					<p class="text-muted-foreground">
						Your watch statistics. Obzorarr only needs your Plex login, and it re-syncs play history
						from the official Plex API, so a fresh sync after setup rebuilds play history and every
						Wrapped statistic built from it.
					</p>
				</div>
				<div class="space-y-1">
					<p class="font-medium">What does not</p>
					<p class="text-muted-foreground">
						Every setting: privacy and sharing configuration, themes, slide configuration and
						custom slides, log settings and fun-fact configuration. All per-user share
						settings and every existing share link, so
						<strong>any link you have already handed out to a user stops working</strong>, and
						a new one will not be the same link. Any custom year ranges or other curation you
						did by hand, plus the entire log history.
					</p>
				</div>
				<div class="space-y-1">
					<p class="font-medium">What is untouched</p>
					<p class="text-muted-foreground">
						Anything configured through the environment (Plex, OpenAI, ORIGIN) is not stored
						in the database, so it survives. On an env-configured server the new
						setup arrives with those steps already filled in and locked, so you do not start
						from a blank slate.
					</p>
				</div>
			</div>

			{#if data.syncRunning}
				<Alert>
					<TriangleAlertIcon />
					<AlertTitle>Reset is on hold while a sync runs</AlertTitle>
					<AlertDescription>
						Wiping mid-sync would leave the database half-written. Wait for the sync to finish, or
						cancel it on the <a href="/admin/sync">Sync</a> page.
					</AlertDescription>
				</Alert>
			{/if}

			<SettingsActionBar align="between">
				<p class="text-xs text-muted-foreground">
					Takes three steps: you read what is lost, copy a fresh setup token, then type
					{data.resetConfirmationPhrase} to confirm.
				</p>
				<Button
					variant="destructive"
					class="tap-target"
					onclick={() => (resetExplainOpen = true)}
					disabled={data.syncRunning || isPreparingReset || isResetting}
				>
					<RotateCcwIcon />
					Reset instance
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={clearCacheDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear stats cache?</AlertDialog.Title>
			<AlertDialog.Description>
				Removes cached Wrapped statistics for {cacheYearLabel.toLowerCase()}. Wrapped pages
				rebuild their stats from the play history on the next view.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<!-- `tap-target` on BOTH footer buttons: the 44px min-size utility on the
			     Action alone made it visibly taller than a bare 36px Cancel. Cancel and
			     the confirm button are equal-weight siblings, so they size identically. -->
			<AlertDialog.Cancel class="tap-target" disabled={isClearingCache}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearCache"
				use:enhance={({ formData }) => {
					isClearingCache = true;
					if (cacheYear !== 'all') formData.set('year', cacheYear);
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								cacheCountResult = null;
								await invalidateAll();
							}
						} finally {
							isClearingCache = false;
							clearCacheDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<!-- Destructive variant to match the trigger that opened this dialog: the
				     confirm button must not read as a friendlier action than the button
				     the admin just pressed. -->
				<AlertDialog.Action
					type="submit"
					variant="destructive"
					class="tap-target"
					disabled={isClearingCache}
				>
					{isClearingCache ? 'Clearing…' : 'Clear cache'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={clearHistoryDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear play history?</AlertDialog.Title>
			<AlertDialog.Description>
				Deletes the play history records for {historyYearLabel.toLowerCase()} for good. Wrapped
				pages built from those records stay empty until a resync refills them.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel class="tap-target" disabled={isClearingHistory}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearPlayHistory"
				use:enhance={({ formData }) => {
					isClearingHistory = true;
					if (historyYear !== 'all') formData.set('year', historyYear);
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								historyCountResult = null;
								await invalidateAll();
							}
						} finally {
							isClearingHistory = false;
							clearHistoryDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action
					type="submit"
					variant="destructive"
					class="tap-target"
					disabled={isClearingHistory}
				>
					{isClearingHistory ? 'Clearing…' : 'Clear play history'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Reset stage 1: explain, then mint the token. Nothing is written until the
     admin presses Continue, and even that only mints an in-memory token. -->
<AlertDialog.Root bind:open={resetExplainOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Reset this Obzorarr instance?</AlertDialog.Title>
			<AlertDialog.Description>
				This deletes every row Obzorarr has stored and sends you back to the first-run setup
				screen, signed out.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="space-y-3 text-sm">
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Where your data ends up
			</p>
			<div class="space-y-1">
				<p class="font-medium">What comes back</p>
				<p class="text-muted-foreground">
					Your watch statistics. Obzorarr re-syncs them from the official Plex API, so play
					history and everything the Wrapped pages calculate from it can be rebuilt with a
					fresh sync after you sign in to Plex again.
				</p>
			</div>
			<div class="space-y-1">
				<p class="font-medium">What does not</p>
				<p class="text-muted-foreground">
					All of your settings: privacy and sharing, themes, slides and custom slides, log
					settings, fun facts. Every per-user share setting and share link, so
					<strong>any link already shared with a user will stop working</strong>. Any custom
					year ranges or other hand-made curation. And the whole log history.
				</p>
			</div>
			<div class="space-y-1">
				<p class="font-medium">What is untouched</p>
				<p class="text-muted-foreground">
					Anything you configured with environment variables (Plex, OpenAI, ORIGIN) is not in
					the database and survives, so parts of the new setup will already be filled in for
					you.
				</p>
			</div>
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel
				class="tap-target"
				disabled={isPreparingReset}
				onclick={closeResetFlow}
			>
				Cancel
			</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/prepareInstanceReset"
				use:enhance={({ cancel }) => {
					if (isPreparingReset) {
						cancel();
						return;
					}
					isPreparingReset = true;
					return async ({ result }) => {
						try {
							if (result.type === 'success') {
								const payload = result.data as
									| { token?: string; expiresInMinutes?: number }
									| undefined;
								resetToken = payload?.token ?? null;
								resetTokenExpiresInMinutes = payload?.expiresInMinutes ?? null;
								resetConfirmation = '';
								tokenCopied = false;
								resetExplainOpen = false;
								resetConfirmOpen = true;
							} else if (result.type === 'failure' || result.type === 'error') {
								handleFormToast(
									result.type === 'failure'
										? (result.data as { error?: string })
										: { error: result.error.message }
								);
								closeResetFlow();
							}
						} finally {
							isPreparingReset = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" class="tap-target" disabled={isPreparingReset}>
					{isPreparingReset ? 'Preparing…' : 'Continue'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Reset stage 2: the token the admin needs on the very next screen, plus the
     type-to-confirm gate on the destructive submit. -->
<AlertDialog.Root bind:open={resetConfirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Copy your setup token, then wipe</AlertDialog.Title>
			<AlertDialog.Description>
				You need this token on the very next screen to claim the fresh setup. It expires in
				{resetTokenExpiresInMinutes ?? data.resetTokenTtlMinutes} minutes and Obzorarr stores it
				nowhere. If you lose it, look for it in the server console.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="space-y-4">
			<div class="flex items-center gap-2">
				<code
					class="flex-1 select-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-base tracking-widest"
					data-testid="reset-claim-token">{resetToken ?? ''}</code
				>
				<Button variant="outline" class="tap-target" onclick={copyResetToken}>
					{#if tokenCopied}
						<CheckIcon />
						Copied
					{:else}
						<CopyIcon />
						Copy
					{/if}
				</Button>
			</div>
			<div class="space-y-2">
				<Label for="reset-confirmation">
					Type {data.resetConfirmationPhrase} to confirm
				</Label>
				<Input
					id="reset-confirmation"
					autocomplete="off"
					placeholder={data.resetConfirmationPhrase}
					bind:value={resetConfirmation}
				/>
			</div>
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel class="tap-target" disabled={isResetting} onclick={closeResetFlow}>
				Cancel
			</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/resetInstance"
				use:enhance={({ formData, cancel }) => {
					if (isResetting || !resetConfirmationMatches) {
						cancel();
						return;
					}
					isResetting = true;
					formData.set('confirmation', resetConfirmation);
					return async ({ result }) => {
						if (result.type === 'redirect') {
							// The wipe succeeded: the session cookie is gone, so navigate to the
							// onboarding claim screen with a full invalidation. Release the flag
							// either way: if the navigation throws, this component is still
							// mounted and would otherwise stay stuck on a disabled "Wiping…"
							// with a dead Cancel button, trapping the admin on the dialog that
							// holds the token they still need. Re-enabling costs nothing — the
							// wipe already happened, so a second submit never reaches the action:
							// onboardingHandle 303s it because app_settings is empty, and the
							// deleted session cookie means the admin guard would refuse it anyway.
							try {
								await goto(result.location, { invalidateAll: true });
							} finally {
								isResetting = false;
							}
							return;
						}
						try {
							if (result.type === 'failure' || result.type === 'error') {
								handleFormToast(
									result.type === 'failure'
										? (result.data as { error?: string })
										: { error: result.error.message }
								);
							}
							await invalidateAll();
						} finally {
							isResetting = false;
						}
					};
				}}
				style="display: contents;"
			>
				<!-- The one irreversible submit on the page reads destructive. Stage 1's
				     Continue stays primary on purpose: it only mints a token. -->
				<AlertDialog.Action
					type="submit"
					variant="destructive"
					class="tap-target"
					disabled={isResetting || !resetConfirmationMatches}
				>
					{isResetting ? 'Wiping…' : 'Wipe now'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
