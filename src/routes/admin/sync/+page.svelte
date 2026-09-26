<script lang="ts">
import CheckIcon from '@lucide/svelte/icons/check';
import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
import ChevronsLeftIcon from '@lucide/svelte/icons/chevrons-left';
import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
import ClockIcon from '@lucide/svelte/icons/clock';
import PauseIcon from '@lucide/svelte/icons/pause';
import PlayIcon from '@lucide/svelte/icons/play';
import SquareIcon from '@lucide/svelte/icons/square';
import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import { Button } from '$lib/components/ui/button';
import { validateCronExpression } from '$lib/cron/validation';
import { handleFormToast } from '$lib/utils/form-toast';
import { formatDuration as formatDurationMs } from '$lib/utils/format';
import type { ActionData, PageData } from './$types';

interface SyncProgress {
	syncId: number;
	status: 'running' | 'completed' | 'failed' | 'cancelled';
	recordsProcessed: number;
	recordsInserted: number;
	recordsSkipped: number;
	currentPage: number;
	startedAt: string;
	error?: string;
	phase?: 'fetching' | 'enriching';
	enrichmentTotal?: number;
	enrichmentProcessed?: number;
}

let { data, form }: { data: PageData; form: ActionData } = $props();

function submittedCronExpression(actionData: ActionData | null | undefined): string | null {
	if (!actionData || !('cronExpression' in actionData)) return null;
	const value = actionData.cronExpression;
	return typeof value === 'string' ? value : null;
}

function submittedCronError(actionData: ActionData | null | undefined, expression: string): string {
	if (!actionData || !('cronError' in actionData)) return '';
	const error = actionData.cronError;
	return submittedCronExpression(actionData) === expression && typeof error === 'string'
		? error
		: '';
}

const DEFAULT_CRON_EXPRESSION = '0 0 * * *';

let selectedBackfillYear = $state<string>('');

// After ?/startSync returns, re-select the year we just submitted so the
// dropdown does not revert to "New Activity Only" — ISSUE-004 observed the
// sync continuing as incremental on the next manual run because the user
// thought the selection had stuck.
$effect(() => {
	const submitted = (form as { selectedYear?: number | null } | null | undefined)?.selectedYear;
	if (submitted === undefined) return;
	selectedBackfillYear = submitted === null ? '' : submitted.toString();
});
const serverCronExpression = $derived(
	data.schedulerStatus.cronExpression ?? DEFAULT_CRON_EXPRESSION
);
let localCronExpression = $state<string | null>(null);
const cronExpression = $derived(
	localCronExpression ?? submittedCronExpression(form) ?? serverCronExpression
);
const clientCronError = $derived(validateCronExpression(cronExpression));
const serverCronError = $derived(submittedCronError(form, cronExpression));
const cronError = $derived(clientCronError || serverCronError);
let isSyncing = $state(false);
let isCancelling = $state(false);
// Optimistic flag so Cancel is hit-testable during the brief gap between Start-click and the first SSE frame.
let pendingStart = $state(false);

$effect(() => {
	handleFormToast(form);
});

function updateCronExpression(value: string): void {
	localCronExpression = value === serverCronExpression ? null : value;
}

function handleCronExpressionInput(event: Event): void {
	updateCronExpression((event.currentTarget as HTMLInputElement).value);
}

let eventSource = $state<EventSource | null>(null);
let progress = $state<SyncProgress | null>(null);
let isConnected = $state(false);
let syncCompleted = $state(false);

const syncActive = $derived(
	(data.isRunning && !syncCompleted) ||
		(progress !== null && progress.status === 'running') ||
		pendingStart
);

const enrichmentPercent = $derived(() => {
	if (!progress?.enrichmentTotal || progress.enrichmentTotal === 0) return 0;
	return Math.round(((progress.enrichmentProcessed ?? 0) / progress.enrichmentTotal) * 100);
});

const statusText = $derived(() => {
	if (!progress) return 'Ready';
	switch (progress.status) {
		case 'running':
			if (progress.phase === 'enriching') {
				return `Enriching ${enrichmentPercent()}%`;
			}
			return 'Syncing';
		case 'completed':
			return 'Complete';
		case 'failed':
			return 'Failed';
		case 'cancelled':
			return 'Cancelled';
		default:
			return 'Ready';
	}
});

function connectSSE() {
	if (eventSource) eventSource.close();

	eventSource = new EventSource('/admin/sync/stream');

	eventSource.onopen = () => {
		isConnected = true;
	};

	eventSource.onmessage = (event) => {
		try {
			const eventData = JSON.parse(event.data);

			if (eventData.type === 'connected' || eventData.type === 'progress') {
				if (eventData.progress) progress = eventData.progress;
				if (progress?.status === 'running') pendingStart = false;
			} else if (['completed', 'failed', 'cancelled'].includes(eventData.type)) {
				if (eventData.progress) progress = eventData.progress;
				syncCompleted = true;
				pendingStart = false;
				setTimeout(() => {
					disconnectSSE();
					isSyncing = false;
					isCancelling = false;
					invalidateAll();
					setTimeout(() => {
						progress = null;
					}, 3000);
				}, 500);
			} else if (eventData.type === 'idle') {
				progress = null;
				isSyncing = false;
				pendingStart = false;
			}
		} catch (e) {
			console.error('Failed to parse SSE event:', e);
		}
	};

	eventSource.onerror = () => {
		isConnected = false;
		pendingStart = false;
		eventSource?.close();
		eventSource = null;
		setTimeout(() => {
			if (isSyncing && !eventSource) connectSSE();
		}, 2000);
	};
}

function disconnectSSE() {
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}
	isConnected = false;
}

$effect(() => {
	if (browser && data.isRunning && !eventSource && !syncCompleted) {
		isSyncing = true;
		connectSSE();
	}
});

$effect(() => {
	return () => disconnectSSE();
});

function formatDate(isoDate: string | null): string {
	if (!isoDate) return 'N/A';
	return new Date(isoDate).toLocaleString();
}

function formatRelativeTime(isoDate: string | null): string {
	if (!isoDate) return 'Never';
	const date = new Date(isoDate);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

function formatDuration(start: string, end: string | null, status?: string): string {
	if (status === 'running') return 'In progress';
	if (!end) return 'Unknown';
	return formatDurationMs(new Date(end).getTime() - new Date(start).getTime());
}

const cronPresets = [
	{ label: 'Hourly', value: '0 * * * *' },
	{ label: 'Every 6h', value: '0 */6 * * *' },
	{ label: 'Midnight', value: '0 0 * * *' },
	{ label: '3 AM', value: '0 3 * * *' },
	{ label: 'Weekly', value: '0 0 * * 0' }
];

let isNavigating = $state(false);

const canGoPrevious = $derived(data.pagination.page > 1);
const canGoNext = $derived(data.pagination.page < data.pagination.totalPages);

const visiblePages = $derived.by(() => {
	const { page, totalPages } = data.pagination;
	const pages: number[] = [];

	if (totalPages <= 5) {
		for (let i = 1; i <= totalPages; i++) pages.push(i);
	} else {
		let start = Math.max(1, page - 2);
		let end = Math.min(totalPages, page + 2);

		if (page <= 3) {
			end = 5;
		} else if (page >= totalPages - 2) {
			start = totalPages - 4;
		}

		for (let i = start; i <= end; i++) pages.push(i);
	}

	return pages;
});

const firstVisiblePage = $derived(visiblePages.at(0));
const lastVisiblePage = $derived(visiblePages.at(-1));

async function goToPage(page: number) {
	if (page < 1 || page > data.pagination.totalPages || isNavigating) return;

	isNavigating = true;
	const url = new URL(window.location.href);
	if (page === 1) {
		url.searchParams.delete('page');
	} else {
		url.searchParams.set('page', page.toString());
	}
	await goto(url.toString(), { keepFocus: true, noScroll: true });
	isNavigating = false;

	document.querySelector('.history-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<svelte:head>
	<title>Sync - Admin - Obzorarr</title>
</svelte:head>

<div class="sync-command-center">
	<header class="page-header">
		<div class="header-content">
			<div class="header-icon">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
					<path d="M21 3v5h-5" />
				</svg>
			</div>
			<div class="header-text">
				<h1>Plex Sync</h1>
				<p class="header-subtitle">Start a sync, manage the schedule, and review past runs</p>
			</div>
		</div>
		<div class="header-stats">
			<div class="header-stat">
				<span class="header-stat-value">{data.historyCount.toLocaleString()}</span>
				<span class="header-stat-label">Records</span>
			</div>
		</div>
	</header>

	<div class="content-grid">
		<section class="panel sync-panel" class:active={syncActive || progress}>
			<div class="panel-header">
				<h2>
					<span class="panel-icon">◉</span>
					Sync Engine
				</h2>
				<div
					class="connection-indicator"
					class:connected={isConnected}
					class:syncing={syncActive}
					title={isConnected ? 'Connected' : 'Disconnected'}
				>
					<span class="indicator-dot"></span>
					<span class="indicator-text">{isConnected ? 'Live' : 'Idle'}</span>
				</div>
			</div>

			{#if syncActive || progress}
				<div class="sync-active-display">
					{#if syncActive}
						<!-- ISSUE-009: persistent, AT-announced affordance that a sync is
						     already in progress, so an attempt to start another is not met
						     with silence (the start action only surfaced a transient toast). -->
						<div class="sync-running-banner" role="status" aria-live="polite">
							<svg viewBox="0 0 24 24" fill="currentColor" class="banner-icon" aria-hidden="true">
								<path
									d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
								/>
							</svg>
							<span
								>A sync is already running. Watch its progress below, or cancel it to start a new
								one.</span
							>
						</div>
					{/if}
					<div class="sync-status-ring" class:running={progress?.status === 'running'}>
						<div class="ring-outer">
							<div class="ring-inner">
								<div
									class="status-icon"
									class:running={progress?.status === 'running'}
									class:completed={progress?.status === 'completed'}
									class:failed={progress?.status === 'failed'}
									class:cancelled={progress?.status === 'cancelled'}
								>
									{#if progress?.status === 'running'}
										<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
											<path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z" class="spinner-path" />
										</svg>
									{:else if progress?.status === 'completed'}
										<svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
										>
											<path d="M20 6L9 17l-5-5" />
										</svg>
									{:else if progress?.status === 'failed'}
										<svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
										>
											<path d="M18 6L6 18M6 6l12 12" />
										</svg>
									{:else}
										<svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
										>
											<path d="M18 6L6 18M6 6l12 12" />
										</svg>
									{/if}
								</div>
							</div>
						</div>
						{#if progress?.phase === 'enriching'}
							<svg aria-hidden="true" class="progress-ring" viewBox="0 0 100 100">
								<circle class="progress-track" cx="50" cy="50" r="45" />
								<circle
									class="progress-fill"
									cx="50"
									cy="50"
									r="45"
									stroke-dasharray="283"
									stroke-dashoffset={283 - (283 * enrichmentPercent()) / 100}
								/>
							</svg>
						{/if}
					</div>

					<div class="sync-details">
						<div class="sync-status-text">{statusText()}</div>

						{#if progress}
							<div class="sync-metrics">
								<div class="metric">
									<span class="metric-value">{progress.recordsProcessed.toLocaleString()}</span>
									<span class="metric-label">Processed</span>
								</div>
								<div class="metric-divider"></div>
								<div class="metric">
									<span class="metric-value accent"
										>{progress.recordsInserted.toLocaleString()}</span
									>
									<span class="metric-label">New</span>
								</div>
								<div class="metric-divider"></div>
								<div class="metric">
									<span class="metric-value muted">{progress.recordsSkipped.toLocaleString()}</span>
									<span class="metric-label">Skipped</span>
								</div>
							</div>

							{#if progress.phase === 'enriching' && progress.enrichmentTotal}
								<div class="enrichment-bar">
									<div class="enrichment-progress" style:width="{enrichmentPercent()}%"></div>
									<span class="enrichment-text">
										Enriching metadata: {(progress.enrichmentProcessed ?? 0).toLocaleString()} /
										{progress.enrichmentTotal.toLocaleString()}
									</span>
								</div>
							{/if}

							{#if progress.error}
								<div class="sync-error">
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										fill="currentColor"
										class="error-icon"
									>
										<path
											d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
										/>
									</svg>
									<span>{progress.error}</span>
								</div>
							{/if}
						{/if}
					</div>

					{#if progress?.status === 'running' || pendingStart}
						<form
							method="POST"
							action="?/cancelSync"
							use:enhance={() => {
	isCancelling = true;
	return async ({ update }) => {
		try {
			await update();
		} finally {
			isCancelling = false;
		}
	};
}}
						>
							<SubmitButton class="cancel-btn tap-target" submitting={isCancelling}>
								{#snippet children()}
									<SquareIcon class="size-4" />
									<span>Cancel</span>
								{/snippet}
								{#snippet submittingLabel()}
									<span>Cancel</span>
								{/snippet}
							</SubmitButton>
						</form>
					{/if}
				</div>
			{:else}
				<form
					method="POST"
					action="?/startSync"
					use:enhance={() => {
	// Optimistically disable the Start button and mount the Cancel affordance
	// synchronously on click, so the button can't be double-submitted and Cancel
	// is hit-testable during the click -> first-SSE-frame window.
	isSyncing = true;
	pendingStart = true;
	syncCompleted = false;
	return async ({ update, result }) => {
		try {
			await update();
			// ISSUE-010: only keep the syncing UI and open the SSE stream once
			// the server confirms a sync actually started. On a 409 (a sync is
			// already running) the start form stays mounted so the reactive
			// handleFormToast(form) surfaces the conflict toast instead of the
			// UI flipping to a stuck "syncing" state with a dangling EventSource.
			if (result.type === 'success') {
				connectSSE();
			} else {
				isSyncing = false;
				pendingStart = false;
			}
		} catch {
			isSyncing = false;
			pendingStart = false;
		}
	};
}}
					class="sync-form"
				>
					<div class="form-group">
						<label for="backfillYear">Sync Mode</label>
						<div class="select-wrapper">
							<select id="backfillYear" name="backfillYear" bind:value={selectedBackfillYear}>
								<option value="">New Activity Only</option>
								{#each data.availableYears as year}
									<option value={year.toString()}>Full History from {year}</option>
								{/each}
							</select>
							<svg aria-hidden="true" class="select-arrow" viewBox="0 0 24 24" fill="currentColor">
								<path d="M7 10l5 5 5-5z" />
							</svg>
						</div>
					</div>

					<SubmitButton class="sync-btn tap-target" submitting={isSyncing}>
						{#snippet children()}
							<PlayIcon class="size-[18px]" strokeWidth={2.5} />
							<span>Start Sync</span>
						{/snippet}
						{#snippet submittingLabel()}
							<span>Initializing...</span>
						{/snippet}
					</SubmitButton>
				</form>

				{#if data.lastSync}
					<div class="last-sync-info">
						<span class="last-sync-time">{formatRelativeTime(data.lastSync.completedAt)}</span>
						<span class="last-sync-dot">•</span>
						<span class="last-sync-records"
							>{data.lastSync.recordsProcessed.toLocaleString()}
							records</span
						>
						<span
							class="last-sync-status"
							class:success={data.lastSync.status === 'completed'}
							class:error={data.lastSync.status === 'failed'}
						>
							{data.lastSync.status}
						</span>
					</div>
				{/if}
			{/if}
		</section>

		<section class="panel scheduler-panel">
			<div class="panel-header">
				<h2>
					<span class="panel-icon">⏱</span>
					Scheduler
				</h2>
				<div
					class="scheduler-status-badge"
					class:active={data.schedulerStatus.isRunning && !data.schedulerStatus.isPaused}
					class:paused={data.schedulerStatus.isPaused}
					class:inactive={!data.schedulerStatus.isRunning && !data.schedulerStatus.isPaused}
				>
					{#if data.schedulerStatus.isPaused}
						Paused
					{:else if data.schedulerStatus.isRunning}
						Active
					{:else}
						Inactive
					{/if}
				</div>
			</div>

			<div class="scheduler-content">
				{#if data.schedulerStatus.nextRun || data.schedulerStatus.previousRun}
					<div class="scheduler-times">
						{#if data.schedulerStatus.nextRun}
							<div class="time-row">
								<span class="time-label">Next sync</span>
								<span class="time-value"
									>{formatDate(data.schedulerStatus.nextRun)}
									{#if data.schedulerStatus.cronExpression}
										<span class="time-cron"
											>(cron {data.schedulerStatus.cronExpression}
											{data.schedulerStatus.timezone})</span
										>
									{/if}</span
								>
							</div>
						{/if}
						{#if data.schedulerStatus.previousRun}
							<div class="time-row">
								<span class="time-label">Previous</span>
								<span class="time-value"
									>{formatRelativeTime(data.schedulerStatus.previousRun)}</span
								>
							</div>
						{/if}
					</div>
				{/if}

				<div class="scheduler-controls">
					{#if data.schedulerStatus.isPaused}
						<form method="POST" action="?/resumeScheduler" use:enhance>
							<SubmitButton class="control-btn resume tap-target" data-testid="scheduler-resume">
								{#snippet children()}
									<PlayIcon class="size-4" fill="currentColor" />
									Resume
								{/snippet}
							</SubmitButton>
						</form>
					{:else if data.schedulerStatus.isRunning}
						<form method="POST" action="?/pauseScheduler" use:enhance>
							<SubmitButton class="control-btn pause tap-target" data-testid="scheduler-pause">
								{#snippet children()}
									<PauseIcon class="size-4" fill="currentColor" />
									Pause
								{/snippet}
							</SubmitButton>
						</form>
					{:else}
						<form method="POST" action="?/initScheduler" use:enhance>
							<input type="hidden" name="cronExpression" value={cronExpression}>
							<SubmitButton
								class="control-btn init tap-target"
								data-testid="scheduler-initialize"
								disabled={!!cronError}
								aria-describedby={cronError ? 'cronExpression-error' : undefined}
							>
								{#snippet children()}
									<ClockIcon class="size-4" />
									Initialize
								{/snippet}
							</SubmitButton>
						</form>
					{/if}
					{#if data.schedulerStatus.isRunning || data.schedulerStatus.isPaused}
						<form
							method="POST"
							action="?/stopScheduler"
							use:enhance={() => {
	// DF-013: preserve the current cron expression before stop
	// clears schedulerStatus.cronExpression on the server, which
	// would reset serverCronExpression to the default and blank
	// the input field.
	const preserved = cronExpression;
	return async ({ update }) => {
		await update();
		localCronExpression = preserved !== DEFAULT_CRON_EXPRESSION ? preserved : null;
	};
}}
						>
							<SubmitButton class="control-btn stop tap-target" data-testid="scheduler-stop">
								{#snippet children()}
									<SquareIcon class="size-4" fill="currentColor" />
									Stop
								{/snippet}
							</SubmitButton>
						</form>
					{/if}
				</div>

				<form
					method="POST"
					action="?/updateSchedule"
					use:enhance={() => {
	return async ({ result, update }) => {
		await update();
		if (result.type === 'success') {
			localCronExpression = null;
		}
	};
}}
					class="cron-config"
				>
					<label for="cronExpression" class="cron-label">Schedule (cron)</label>
					<div class="cron-input-group">
						<input
							type="text"
							id="cronExpression"
							name="cronExpression"
							value={cronExpression}
							oninput={handleCronExpressionInput}
							placeholder="0 0 * * *"
							class="cron-input"
							class:cron-input-error={cronError}
							aria-invalid={cronError ? 'true' : 'false'}
							aria-describedby={cronError ? 'cronExpression-error' : undefined}
						>
						<SubmitButton
							class="cron-update-btn tap-target"
							disabled={!!cronError}
							aria-label={cronError ? 'Fix cron expression before saving' : 'Update schedule'}
							aria-describedby={cronError ? 'cronExpression-error' : undefined}
						>
							{#snippet children()}
								<CheckIcon class="size-[18px]" aria-hidden="true" />
							{/snippet}
						</SubmitButton>
					</div>

					{#if cronError}
						<span id="cronExpression-error" class="cron-error" role="alert">
							Save disabled: {cronError}
						</span>
					{/if}

					<p class="cron-timezone">
						Times run in <strong>{data.schedulerStatus.timezone}</strong>
						{#if data.schedulerStatus.timezoneSource === 'env'}
							(set by the <code>TZ</code> environment variable).
						{:else}
							(<a href="/admin/settings/system">change in System settings</a>).
						{/if}
					</p>

					<div class="cron-presets">
						{#each cronPresets as preset}
							<button
								type="button"
								class="preset-chip"
								class:active={cronExpression === preset.value}
								onclick={() => updateCronExpression(preset.value)}
							>
								{preset.label}
							</button>
						{/each}
					</div>
				</form>
			</div>
		</section>
	</div>

	<section class="panel history-panel">
		<div class="panel-header">
			<h2>
				<span class="panel-icon">📋</span>
				Sync History
			</h2>
			<span class="history-count">{data.pagination.total.toLocaleString()} total syncs</span>
		</div>

		{#if data.history.length === 0 && data.pagination.page === 1}
			<div class="empty-state">
				<div class="empty-icon">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<p>No sync history yet</p>
				<span>Run your first sync to see results here</span>
			</div>
		{:else}
			<div class="history-list" class:loading={isNavigating}>
				{#each data.history as sync (sync.id)}
					<div
						class="history-item"
						class:completed={sync.status === 'completed'}
						class:failed={sync.status === 'failed'}
						class:running={sync.status === 'running'}
						class:cancelled={sync.status === 'cancelled'}
					>
						<div class="history-status-indicator">
							{#if sync.status === 'completed'}
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-.997-6l7.07-7.071-1.414-1.414-5.656 5.657-2.829-2.829-1.414 1.414L11.003 16z"
									/>
								</svg>
							{:else if sync.status === 'failed'}
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
									/>
								</svg>
							{:else if sync.status === 'cancelled'}
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"
									/>
								</svg>
							{:else}
								<svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									fill="currentColor"
									class="running-indicator"
								>
									<path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z" />
								</svg>
							{/if}
						</div>

						<div class="history-main">
							<div class="history-time">
								<span class="time-relative">{formatRelativeTime(sync.startedAt)}</span>
								<span class="time-absolute">{formatDate(sync.startedAt)}</span>
							</div>
						</div>

						<div class="history-stats">
							<span class="stat-duration"
								>{formatDuration(sync.startedAt, sync.completedAt, sync.status)}</span
							>
							<span class="stat-records"
								>{sync.status === 'running' && progress
	? progress.recordsProcessed.toLocaleString()
	: sync.recordsProcessed.toLocaleString()}
								<small>records</small></span
							>
						</div>

						{#if sync.error}
							<div class="history-error" title={sync.error}>
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
									/>
								</svg>
								<span>{sync.error.slice(0, 40)}{sync.error.length > 40 ? '...' : ''}</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if data.pagination.totalPages > 1}
				<div class="pagination" class:loading={isNavigating}>
					<div class="pagination-info">
						<span class="pagination-range">
							Showing
							{(data.pagination.page - 1) * data.pagination.pageSize + 1}–{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)}
							of {data.pagination.total.toLocaleString()}
						</span>
					</div>

					<div class="pagination-controls">
						<Button
							type="button"
							class="pagination-btn tap-target"
							disabled={!canGoPrevious || isNavigating}
							onclick={() => goToPage(1)}
							aria-label="Go to first page"
						>
							<ChevronsLeftIcon class="size-[18px]" />
						</Button>

						<Button
							type="button"
							class="pagination-btn tap-target"
							disabled={!canGoPrevious || isNavigating}
							onclick={() => goToPage(data.pagination.page - 1)}
							aria-label="Go to previous page"
						>
							<ChevronLeftIcon class="size-[18px]" />
						</Button>

						<div class="pagination-pages">
							{#if firstVisiblePage !== undefined && firstVisiblePage > 1}
								<button
									type="button"
									class="pagination-page"
									onclick={() => goToPage(1)}
									disabled={isNavigating}
								>
									1
								</button>
								{#if firstVisiblePage > 2}
									<span class="pagination-ellipsis">…</span>
								{/if}
							{/if}

							{#each visiblePages as pageNum (pageNum)}
								<button
									type="button"
									class="pagination-page"
									class:active={pageNum === data.pagination.page}
									onclick={() => goToPage(pageNum)}
									disabled={isNavigating}
									aria-current={pageNum === data.pagination.page ? 'page' : undefined}
								>
									{pageNum}
								</button>
							{/each}

							{#if lastVisiblePage !== undefined && lastVisiblePage < data.pagination.totalPages}
								{#if lastVisiblePage < data.pagination.totalPages - 1}
									<span class="pagination-ellipsis">…</span>
								{/if}
								<button
									type="button"
									class="pagination-page"
									onclick={() => goToPage(data.pagination.totalPages)}
									disabled={isNavigating}
								>
									{data.pagination.totalPages}
								</button>
							{/if}
						</div>

						<Button
							type="button"
							class="pagination-btn tap-target"
							disabled={!canGoNext || isNavigating}
							onclick={() => goToPage(data.pagination.page + 1)}
							aria-label="Go to next page"
						>
							<ChevronRightIcon class="size-[18px]" />
						</Button>

						<Button
							type="button"
							class="pagination-btn tap-target"
							disabled={!canGoNext || isNavigating}
							onclick={() => goToPage(data.pagination.totalPages)}
							aria-label="Go to last page"
						>
							<ChevronsRightIcon class="size-[18px]" />
						</Button>
					</div>
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
.sync-command-center {
	max-width: 1100px;
	margin: 0 auto;
	padding: 1.5rem 2rem 3rem;
}

.page-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 2rem;
	padding-bottom: 1.5rem;
	border-bottom: 1px solid oklch(var(--border));
}

.header-content {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.header-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 56px;
	height: 56px;
	background: linear-gradient(135deg, oklch(var(--primary) / 0.15), oklch(var(--primary) / 0.05));
	border: 1px solid oklch(var(--primary) / 0.3);
	border-radius: 16px;
	color: oklch(var(--primary));
}

.header-icon svg {
	width: 28px;
	height: 28px;
}

.header-text h1 {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--foreground));
	margin: 0;
	letter-spacing: -0.02em;
}

.header-subtitle {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	margin: 0.25rem 0 0;
}

.header-stats {
	display: flex;
	gap: 2rem;
}

.header-stat {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
}

.header-stat-value {
	font-size: 1.5rem;
	font-weight: 700;
	color: oklch(var(--foreground));
	font-variant-numeric: tabular-nums;
}

.header-stat-label {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.content-grid {
	display: grid;
	grid-template-columns: 1fr 380px;
	gap: 1.5rem;
	margin-bottom: 1.5rem;
}

.panel {
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: 16px;
	overflow: hidden;
}

.panel-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1rem 1.25rem;
	border-bottom: 1px solid oklch(var(--border));
	background: oklch(var(--muted) / 0.3);
}

.panel-header h2 {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.9375rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin: 0;
}

.panel-icon {
	font-size: 1rem;
}

.sync-panel {
	transition: border-color 0.3s ease;
}

.sync-panel.active {
	border-color: oklch(var(--primary) / 0.5);
	box-shadow: 0 0 30px oklch(var(--primary) / 0.1);
}

.connection-indicator {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.25rem 0.625rem;
	background: oklch(var(--muted));
	border-radius: 9999px;
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: oklch(var(--muted-foreground));
}

.indicator-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: oklch(var(--muted-foreground));
	transition: background 0.3s ease;
}

.connection-indicator.connected .indicator-dot {
	background: oklch(0.7776 0.199 151.21);
	box-shadow: 0 0 8px oklch(0.7776 0.199 151.21 / 0.5);
}

.connection-indicator.syncing .indicator-dot {
	animation: pulse-glow 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
	0%,
	100% {
		opacity: 1;
		box-shadow: 0 0 8px oklch(0.7776 0.199 151.21 / 0.5);
	}
	50% {
		opacity: 0.5;
		box-shadow: 0 0 16px oklch(0.7776 0.199 151.21 / 0.8);
	}
}

.sync-active-display {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 2rem 1.5rem;
	gap: 1.5rem;
}

.sync-status-ring {
	position: relative;
	width: 120px;
	height: 120px;
}

.ring-outer {
	position: absolute;
	inset: 0;
	border-radius: 50%;
	background: linear-gradient(135deg, oklch(var(--muted)), oklch(var(--background)));
	padding: 4px;
}

.ring-inner {
	width: 100%;
	height: 100%;
	border-radius: 50%;
	background: oklch(var(--card));
	display: flex;
	align-items: center;
	justify-content: center;
}

.status-icon {
	width: 48px;
	height: 48px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: oklch(var(--muted-foreground));
}

.status-icon.running {
	color: oklch(var(--primary));
}

.status-icon.completed {
	color: oklch(0.7776 0.199 151.21);
}

.status-icon.failed,
.status-icon.cancelled {
	color: oklch(var(--destructive));
}

.status-icon svg {
	width: 100%;
	height: 100%;
}

.spinner-path {
	transform-origin: center;
	animation: spin 1s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.progress-ring {
	position: absolute;
	inset: 0;
	transform: rotate(-90deg);
}

.progress-track {
	fill: none;
	stroke: oklch(var(--muted));
	stroke-width: 4;
}

.progress-fill {
	fill: none;
	stroke: oklch(var(--primary));
	stroke-width: 4;
	stroke-linecap: round;
	transition: stroke-dashoffset 0.5s ease;
}

.sync-details {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
	width: 100%;
}

.sync-status-text {
	font-size: 1.25rem;
	font-weight: 700;
	color: oklch(var(--foreground));
}

.sync-metrics {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 0.75rem 1.25rem;
	background: oklch(var(--muted) / 0.5);
	border-radius: 12px;
}

.metric {
	display: flex;
	flex-direction: column;
	align-items: center;
	min-width: 64px;
}

.metric-value {
	font-size: 1.25rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	color: oklch(var(--foreground));
}

.metric-value.accent {
	color: oklch(0.7776 0.199 151.21);
}

.metric-value.muted {
	color: oklch(var(--muted-foreground));
}

.metric-label {
	font-size: 0.6875rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.metric-divider {
	width: 1px;
	height: 28px;
	background: oklch(var(--border));
}

.enrichment-bar {
	position: relative;
	width: 100%;
	height: 32px;
	background: oklch(var(--muted));
	border-radius: 8px;
	overflow: hidden;
}

.enrichment-progress {
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, oklch(var(--primary) / 0.3), oklch(var(--primary) / 0.5));
	transition: width 0.5s ease;
}

.enrichment-text {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	font-size: 0.75rem;
	font-weight: 500;
	color: oklch(var(--foreground));
}

.sync-error {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--destructive) / 0.15);
	border: 1px solid oklch(var(--destructive) / 0.3);
	border-radius: 8px;
	font-size: 0.8125rem;
	color: oklch(var(--destructive));
	width: 100%;
}

.error-icon {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
}

.sync-running-banner {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--primary) / 0.12);
	border: 1px solid oklch(var(--primary) / 0.3);
	border-radius: 8px;
	font-size: 0.8125rem;
	color: oklch(var(--foreground));
	width: 100%;
}

.banner-icon {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
	color: oklch(var(--primary));
}

/* SubmitButton child-renders the real <button>, so the cancel palette
		   swap must be hoisted. */
:global(.cancel-btn) {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.625rem 1.25rem;
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	border-radius: 10px;
	color: oklch(var(--foreground));
	font-size: 0.8125rem;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s ease;
}

:global(.cancel-btn:hover:not(:disabled)) {
	background: oklch(var(--destructive) / 0.15);
	border-color: oklch(var(--destructive) / 0.5);
	color: oklch(var(--destructive));
}

:global(.cancel-btn:disabled) {
	opacity: 0.5;
	cursor: not-allowed;
}

.sync-form {
	padding: 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.form-group label {
	display: block;
	font-size: 0.8125rem;
	font-weight: 500;
	color: oklch(var(--muted-foreground));
	margin-bottom: 0.5rem;
}

.select-wrapper {
	position: relative;
}

.select-wrapper select {
	width: 100%;
	padding: 0.75rem 2.5rem 0.75rem 1rem;
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	border-radius: 10px;
	color: oklch(var(--foreground));
	font-size: 0.9375rem;
	appearance: none;
	cursor: pointer;
}

.select-wrapper select:focus {
	outline: none;
	border-color: oklch(var(--primary));
	box-shadow: 0 0 0 3px oklch(var(--primary) / 0.15);
}

.select-arrow {
	position: absolute;
	right: 1rem;
	top: 50%;
	transform: translateY(-50%);
	width: 20px;
	height: 20px;
	color: oklch(var(--muted-foreground));
	pointer-events: none;
}

/* SubmitButton child-renders the real <button>, so the primary gradient
		   and hover treatment must be hoisted. */
:global(.sync-btn) {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.625rem;
	padding: 0.875rem 1.5rem;
	background: linear-gradient(135deg, oklch(var(--primary)), oklch(var(--primary) / 0.85));
	border: none;
	border-radius: 12px;
	color: oklch(var(--primary-foreground));
	font-size: 0.9375rem;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s ease;
}

:global(.sync-btn:hover:not(:disabled)) {
	transform: translateY(-1px);
	box-shadow: 0 8px 24px oklch(var(--primary) / 0.3);
}

:global(.sync-btn:active:not(:disabled)) {
	transform: translateY(0);
}

:global(.sync-btn:disabled) {
	opacity: 0.6;
	cursor: not-allowed;
}

.last-sync-info {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.75rem;
	margin: 0 1.5rem 1.5rem;
	background: oklch(var(--muted) / 0.5);
	border-radius: 8px;
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
}

.last-sync-time {
	font-weight: 500;
}

.last-sync-dot {
	opacity: 0.5;
}

.last-sync-status {
	padding: 0.125rem 0.5rem;
	border-radius: 9999px;
	font-size: 0.625rem;
	font-weight: 600;
	text-transform: uppercase;
	background: oklch(var(--muted));
}

.last-sync-status.success {
	background: oklch(0.4208 0.0746 155.64);
	color: oklch(0.9147 0.0597 159.37);
}

.last-sync-status.error {
	background: oklch(var(--destructive) / 0.2);
	color: oklch(var(--destructive));
}

.scheduler-content {
	padding: 1.25rem;
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
}

.scheduler-status-badge {
	padding: 0.25rem 0.75rem;
	border-radius: 9999px;
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.scheduler-status-badge.active {
	background: oklch(0.4208 0.0746 155.64);
	color: oklch(0.9147 0.0597 159.37);
}

.scheduler-status-badge.paused {
	background: oklch(0.5107 0.0902 89.92);
	color: oklch(0.9544 0.0415 91.72);
}

.scheduler-status-badge.inactive {
	background: oklch(var(--muted));
	color: oklch(var(--muted-foreground));
}

.scheduler-times {
	display: flex;
	flex-direction: column;
	gap: 0.625rem;
	padding: 0.875rem 1rem;
	background: oklch(var(--muted) / 0.5);
	border-radius: 10px;
}

.time-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.time-label {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
}

.time-value {
	font-size: 0.8125rem;
	font-weight: 500;
	color: oklch(var(--foreground));
}

.time-cron {
	font-weight: 400;
	color: oklch(var(--muted-foreground));
	font-variant-numeric: tabular-nums;
}

.scheduler-controls {
	display: flex;
	gap: 0.5rem;
}

/* SubmitButton child-renders the real controls, so scheduler variants
		   need hoisted palettes. */
:global(.control-btn) {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	border-radius: 10px;
	font-size: 0.8125rem;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s ease;
}

:global(.control-btn.resume) {
	background: oklch(0.4863 0.0951 154.82);
	border: 1px solid oklch(0.5972 0.1198 154.58);
	color: oklch(0.9426 0.0399 159.98);
}

:global(.control-btn.resume:hover) {
	background: oklch(0.553 0.117 154.02);
}

:global(.control-btn.pause) {
	background: oklch(0.4944 0.0796 90.72);
	border: 1px solid oklch(0.607 0.0999 90.58);
	color: oklch(0.9504 0.0364 91.69);
}

:global(.control-btn.pause:hover) {
	background: oklch(0.5606 0.096 90.25);
}

:global(.control-btn.init) {
	background: oklch(var(--primary));
	border: 1px solid oklch(var(--primary));
	color: oklch(var(--primary-foreground));
}

:global(.control-btn.init:hover) {
	opacity: 0.9;
}

:global(.control-btn.stop) {
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	color: oklch(var(--foreground));
}

:global(.control-btn.stop:hover) {
	background: oklch(var(--muted) / 0.8);
}

.cron-config {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.cron-label {
	font-size: 0.75rem;
	font-weight: 500;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.cron-input-group {
	display: flex;
	gap: 0.5rem;
}

.cron-input {
	flex: 1;
	padding: 0.625rem 0.875rem;
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
	color: oklch(var(--foreground));
	font-size: 0.875rem;
	font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
}

.cron-input:focus {
	outline: none;
	border-color: oklch(var(--primary));
	box-shadow: 0 0 0 3px oklch(var(--primary) / 0.15);
}

.cron-input-error {
	border-color: oklch(var(--destructive));
}

.cron-input-error:focus {
	border-color: oklch(var(--destructive));
	box-shadow: 0 0 0 3px oklch(var(--destructive) / 0.15);
}

.cron-error {
	font-size: 0.75rem;
	color: oklch(var(--destructive));
}

.cron-timezone {
	margin: 0;
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.cron-timezone a {
	color: oklch(var(--primary));
	text-decoration: underline;
}

/* SubmitButton child-renders the real <button>, so the cron commit
		   hover palette must be hoisted. */
:global(.cron-update-btn) {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
	color: oklch(var(--muted-foreground));
	cursor: pointer;
	transition: all 0.15s ease;
}

:global(.cron-update-btn:hover) {
	background: oklch(var(--primary));
	border-color: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
}

.cron-presets {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
}

.preset-chip {
	padding: 0.375rem 0.75rem;
	background: oklch(var(--muted));
	border: 1px solid transparent;
	border-radius: 9999px;
	color: oklch(var(--muted-foreground));
	font-size: 0.75rem;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
}

.preset-chip:hover {
	background: oklch(var(--primary) / 0.1);
	color: oklch(var(--primary));
}

.preset-chip.active {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
}

.history-panel {
	margin-top: 0;
}

.history-count {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.history-list.loading {
	opacity: 0.5;
	pointer-events: none;
	transition: opacity 0.15s ease;
}

.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 3rem 2rem;
	text-align: center;
}

.empty-icon {
	width: 64px;
	height: 64px;
	color: oklch(var(--muted-foreground) / 0.5);
	margin-bottom: 1rem;
}

.empty-icon svg {
	width: 100%;
	height: 100%;
}

.empty-state p {
	font-size: 1rem;
	font-weight: 500;
	color: oklch(var(--foreground));
	margin: 0 0 0.25rem;
}

.empty-state span {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
}

.history-list {
	display: flex;
	flex-direction: column;
}

.history-item {
	display: grid;
	grid-template-columns: auto 1fr auto auto;
	align-items: center;
	gap: 1rem;
	padding: 1rem 1.25rem;
	border-bottom: 1px solid oklch(var(--border) / 0.5);
	transition: background 0.15s ease;
}

.history-item:last-child {
	border-bottom: none;
}

.history-item:hover {
	background: oklch(var(--muted) / 0.3);
}

.history-status-indicator {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.history-status-indicator svg {
	width: 20px;
	height: 20px;
}

.history-item.completed .history-status-indicator {
	color: oklch(0.7471 0.1783 152.43);
}

.history-item.failed .history-status-indicator {
	color: oklch(var(--destructive));
}

.history-item.running .history-status-indicator {
	color: oklch(var(--primary));
}

.history-item.cancelled .history-status-indicator {
	color: oklch(var(--muted-foreground));
}

.running-indicator {
	animation: spin 1s linear infinite;
}

.history-main {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	min-width: 0;
}

.history-time {
	display: flex;
	flex-direction: column;
}

.time-relative {
	font-size: 0.875rem;
	font-weight: 500;
	color: oklch(var(--foreground));
}

.time-absolute {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.history-stats {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 0.125rem;
}

.stat-duration {
	font-size: 0.8125rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: oklch(var(--foreground));
}

.stat-records {
	font-size: 0.75rem;
	font-variant-numeric: tabular-nums;
	color: oklch(var(--muted-foreground));
}

.stat-records small {
	font-size: 0.6875rem;
	opacity: 0.8;
}

.history-error {
	grid-column: 2 / -1;
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem 0.75rem;
	background: oklch(var(--destructive) / 0.1);
	border-radius: 6px;
	font-size: 0.75rem;
	color: oklch(var(--destructive));
}

.history-error svg {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}

.pagination {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
	padding: 1.25rem;
	border-top: 1px solid oklch(var(--border) / 0.5);
	background: oklch(var(--muted) / 0.2);
}

.pagination.loading {
	opacity: 0.6;
	pointer-events: none;
}

.pagination-info {
	text-align: center;
}

.pagination-range {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
	font-variant-numeric: tabular-nums;
}

.pagination-controls {
	display: flex;
	align-items: center;
	gap: 0.375rem;
}

/* shadcn Button child-renders the real pagination controls, so the
		   square shape and hover palette must be hoisted. */
:global(.pagination-btn) {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	background: oklch(var(--muted));
	border: 1px solid oklch(var(--border));
	border-radius: 8px;
	color: oklch(var(--foreground));
	cursor: pointer;
	transition: all 0.15s ease;
}

:global(.pagination-btn:hover:not(:disabled)) {
	background: oklch(var(--primary) / 0.15);
	border-color: oklch(var(--primary) / 0.5);
	color: oklch(var(--primary));
}

:global(.pagination-btn:disabled) {
	opacity: 0.4;
	cursor: not-allowed;
}

.pagination-pages {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	margin: 0 0.25rem;
}

.pagination-page {
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 36px;
	height: 36px;
	padding: 0 0.5rem;
	background: transparent;
	border: 1px solid transparent;
	border-radius: 8px;
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
	transition: all 0.15s ease;
}

.pagination-page:hover:not(:disabled):not(.active) {
	background: oklch(var(--muted));
	color: oklch(var(--foreground));
}

.pagination-page.active {
	background: oklch(var(--primary));
	border-color: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	font-weight: 600;
}

.pagination-page:disabled {
	cursor: not-allowed;
}

.pagination-ellipsis {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
}

@media (max-width: 900px) {
	.content-grid {
		grid-template-columns: 1fr;
	}

	.scheduler-panel {
		order: 2;
	}
}

@media (max-width: 640px) {
	.sync-command-center {
		padding: 1rem 1rem 2rem;
	}

	.page-header {
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}

	.header-stats {
		width: 100%;
		justify-content: flex-start;
	}

	.header-stat {
		align-items: flex-start;
	}

	.sync-metrics {
		flex-wrap: wrap;
		justify-content: center;
	}

	.history-item {
		grid-template-columns: auto 1fr;
		gap: 0.75rem;
	}

	.history-stats {
		grid-column: 2;
		flex-direction: row;
		gap: 1rem;
		align-items: center;
	}

	.history-error {
		grid-column: 1 / -1;
	}

	.pagination {
		padding: 1rem;
	}

	:global(.pagination-btn) {
		width: 32px;
		height: 32px;
	}

	.pagination-page {
		min-width: 32px;
		height: 32px;
		font-size: 0.8125rem;
	}

	.pagination-pages {
		gap: 0.125rem;
	}

	.pagination-range {
		font-size: 0.75rem;
	}
}
</style>
