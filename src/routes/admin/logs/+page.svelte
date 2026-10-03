<script lang="ts">
import { browser } from '$app/env';
import { enhance } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import { Button } from '$lib/components/ui/button';
import type { LogEntry, LogLevelType } from '$lib/server/logging';
import { toast } from '$lib/services/toast';
import { handleFormToast } from '$lib/utils/form-toast';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

let selectedLevels = $derived<LogLevelType[]>(data.filters?.levels ?? []);
let selectedSource = $derived(data.filters?.source ?? '');

// Debounced search needs a writable buffer; URL data remains the committed value.
let searchText = $state('');
$effect.pre(() => {
	searchText = data.filters?.search ?? '';
});
let normalizedSearchText = $derived(searchText.trim());
let normalizedSearchLower = $derived(normalizedSearchText.toLowerCase());

let fromDate = $state('');
let toDate = $state('');

function toLocalDateTimeInput(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
		`T${pad(d.getHours())}:${pad(d.getMinutes())}`
	);
}

$effect.pre(() => {
	fromDate = data.filters?.fromTimestamp ? toLocalDateTimeInput(data.filters.fromTimestamp) : '';
	toDate = data.filters?.toTimestamp ? toLocalDateTimeInput(data.filters.toTimestamp) : '';
});
let autoScroll = $state(true);

let clearLogsDialogOpen = $state(false);
let isClearingLogs = $state(false);

let runCleanupDialogOpen = $state(false);
let isRunningCleanup = $state(false);

let eventSource: EventSource | null = $state(null);
let streamedLogs = $state<LogEntry[]>([]);
let lastSeenStreamId = $state(0);
let isConnected = $state(false);

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const filteredStreamedLogs = $derived(
	streamedLogs.filter((log) => {
		if (selectedLevels.length > 0 && !selectedLevels.includes(log.level)) return false;
		if (selectedSource && log.source !== selectedSource) return false;
		if (normalizedSearchLower && !log.message.toLowerCase().includes(normalizedSearchLower))
			return false;
		if (data.filters?.fromTimestamp && log.timestamp < data.filters.fromTimestamp) return false;
		if (data.filters?.toTimestamp && log.timestamp > data.filters.toTimestamp) return false;
		return true;
	})
);

function matchesVisibleFilters(log: LogEntry): boolean {
	if (selectedLevels.length > 0 && !selectedLevels.includes(log.level)) return false;
	if (selectedSource && log.source !== selectedSource) return false;
	if (normalizedSearchLower && !log.message.toLowerCase().includes(normalizedSearchLower))
		return false;
	if (data.filters?.fromTimestamp && log.timestamp < data.filters.fromTimestamp) return false;
	if (data.filters?.toTimestamp && log.timestamp > data.filters.toTimestamp) return false;
	return true;
}

// SSE entries arrive ahead of the next server load; merge by id to avoid duplicates.
const allLogs = $derived.by(() => {
	const seen = new Set<number>();
	const merged: LogEntry[] = [];

	for (const log of [...filteredStreamedLogs, ...data.logs]) {
		if (seen.has(log.id)) continue;
		seen.add(log.id);
		merged.push(log);
	}

	return merged;
});
const visibleLogs = $derived(allLogs.filter(matchesVisibleFilters));

const visibleLevelCounts = $derived.by(() => {
	const counts: Record<LogLevelType, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
	for (const log of visibleLogs) {
		counts[log.level] += 1;
	}
	return counts;
});

const visibleSources = $derived.by(() => {
	const sources = new Set(data.sources);
	for (const log of filteredStreamedLogs) {
		if (log.source) sources.add(log.source);
	}
	return Array.from(sources).sort();
});

const visibleTotalCount = $derived(visibleLogs.length);

const logLevels: LogLevelType[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

function formatTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffSecs = Math.floor(diffMs / 1000);
	const diffMins = Math.floor(diffSecs / 60);
	const diffHours = Math.floor(diffMins / 60);

	if (diffSecs < 60) return `${diffSecs}s ago`;
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;

	return new Date(timestamp).toLocaleDateString();
}

function getLevelClass(level: LogLevelType): string {
	switch (level) {
		case 'ERROR':
			return 'level-error';
		case 'WARN':
			return 'level-warn';
		case 'INFO':
			return 'level-info';
		case 'DEBUG':
			return 'level-debug';
		default:
			return '';
	}
}

// Export must use the same filters the operator is currently viewing.
const exportAction = $derived.by(() => {
	const search = page.url.searchParams.toString();
	return search ? `?${search}&/exportLogs` : '?/exportLogs';
});

function applyFilters(overrides?: { levels?: LogLevelType[]; search?: string; source?: string }) {
	const params = new URLSearchParams();
	const levels = overrides?.levels ?? selectedLevels;
	const search = (overrides?.search ?? searchText).trim();
	const source = overrides?.source ?? selectedSource;

	if (levels.length > 0) {
		params.set('levels', levels.join(','));
	}
	if (search) {
		params.set('search', search);
	}
	if (source) {
		params.set('source', source);
	}
	if (fromDate) {
		const fromTs = new Date(fromDate).getTime();
		if (Number.isFinite(fromTs)) {
			params.set('from', String(fromTs));
		}
	}
	if (toDate) {
		const toTs = new Date(toDate).getTime();
		if (Number.isFinite(toTs)) {
			params.set('to', String(toTs));
		}
	}

	const queryString = params.toString();
	goto(`/admin/logs${queryString ? `?${queryString}` : ''}`, { replaceState: true });
}

function toggleLevel(level: LogLevelType) {
	const newLevels = selectedLevels.includes(level)
		? selectedLevels.filter((l) => l !== level)
		: [...selectedLevels, level];
	applyFilters({ levels: newLevels });
}

function handleSearchInput(event: Event) {
	const target = event.target as HTMLInputElement;
	searchText = target.value;

	if (searchDebounce) {
		clearTimeout(searchDebounce);
	}

	searchDebounce = setTimeout(() => {
		applyFilters({ search: searchText });
	}, 300);
}

function handleSourceChange(event: Event) {
	const target = event.target as HTMLSelectElement;
	applyFilters({ source: target.value });
}

function clearFilters() {
	// A pending debounced search would re-add the old query after the clear navigation.
	if (searchDebounce) {
		clearTimeout(searchDebounce);
		searchDebounce = null;
	}
	searchText = '';
	fromDate = '';
	toDate = '';
	// Drop the SSE buffer so previously-filtered events (e.g. captured while an
	// ERROR-only filter was active) don't leak into the unfiltered view.
	streamedLogs = [];
	lastSeenStreamId = 0;
	goto('/admin/logs', { replaceState: true, invalidateAll: true });
	if (autoScroll) {
		disconnectSSE();
		connectSSE();
	}
}

function connectSSE() {
	if (eventSource) {
		eventSource.close();
	}

	const latestId = lastSeenStreamId > 0 ? lastSeenStreamId : (data.latestLogId ?? 0);

	eventSource = new EventSource(`/admin/logs/stream?cursor=${latestId}`);

	eventSource.onopen = () => {
		isConnected = true;
	};

	eventSource.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);

			if (data.type === 'log') {
				streamedLogs = [data.log, ...streamedLogs];
				if (data.log.id > lastSeenStreamId) {
					lastSeenStreamId = data.log.id;
				}

				if (autoScroll) {
					const container = document.querySelector('.logs-table-wrapper');
					if (container) {
						container.scrollTop = 0;
					}
				}
			}
		} catch (e) {
			console.error('Failed to parse SSE event:', e);
		}
	};

	eventSource.onerror = () => {
		isConnected = false;
		setTimeout(() => {
			if (autoScroll) {
				connectSSE();
			}
		}, 5000);
	};
}

function disconnectSSE() {
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}
	isConnected = false;
}

function toggleAutoScroll() {
	autoScroll = !autoScroll;

	if (autoScroll) {
		streamedLogs = [];
		lastSeenStreamId = 0;
		connectSSE();
	} else {
		disconnectSSE();
	}
}

async function refreshAfterLogMutation(update: () => Promise<void>): Promise<void> {
	streamedLogs = [];
	lastSeenStreamId = 0;
	await update();
	await invalidateAll();
	if (autoScroll) {
		disconnectSSE();
		connectSSE();
	}
}

async function copyLog(log: LogEntry) {
	const text = `[${new Date(log.timestamp).toISOString()}] [${log.level}] [${log.source ?? 'App'}] ${log.message}`;
	try {
		await navigator.clipboard.writeText(text);
		toast.success('Copied to clipboard');
	} catch {
		toast.error('Could not access clipboard');
	}
}

function parseMetadata(metadata: string | null): Record<string, unknown> | null {
	if (!metadata) return null;
	try {
		return JSON.parse(metadata);
	} catch {
		return null;
	}
}

$effect(() => {
	return () => {
		disconnectSSE();
		if (searchDebounce) {
			clearTimeout(searchDebounce);
		}
	};
});

$effect(() => {
	if (browser && autoScroll && !eventSource) {
		connectSSE();
	}
});

$effect(() => {
	handleFormToast(form);
});
</script>

<svelte:head>
	<title>Logs - Admin - Obzorarr</title>
</svelte:head>

<div class="logs-page">
	<header class="page-header">
		<h1>Application Logs</h1>
		<p class="subtitle">View and filter application log entries</p>
	</header>

	<section class="stats-section">
		<div class="stat-card">
			<span class="stat-value">{visibleTotalCount.toLocaleString()}</span>
			<span class="stat-label">Visible Logs</span>
		</div>
		<div class="stat-card level-info">
			<span class="stat-value">{visibleLevelCounts.INFO.toLocaleString()}</span>
			<span class="stat-label">Visible Info</span>
		</div>
		<div class="stat-card level-warn">
			<span class="stat-value">{visibleLevelCounts.WARN.toLocaleString()}</span>
			<span class="stat-label">Visible Warnings</span>
		</div>
		<div class="stat-card level-error">
			<span class="stat-value">{visibleLevelCounts.ERROR.toLocaleString()}</span>
			<span class="stat-label">Visible Errors</span>
		</div>
	</section>

	<section class="section filters-section">
		<div class="filters-header">
			<h2>Filters</h2>
			<Button type="button" class="clear-filters-button tap-target" onclick={clearFilters}>
				Clear All
			</Button>
		</div>

		<div class="filters-grid">
			<div class="filter-group">
				<span class="filter-label">Log Level</span>
				<div class="level-checkboxes">
					{#each logLevels as level}
						{@const isActive = selectedLevels.includes(level)}
						<button
							type="button"
							class="level-toggle {getLevelClass(level)}"
							class:active={isActive}
							aria-pressed={isActive}
							onclick={() => toggleLevel(level)}
						>
							<span class="level-toggle-check" aria-hidden="true">{isActive ? '✓' : ''}</span>
							<span class="level-toggle-label">{level}</span>
							<span class="level-count">({visibleLevelCounts[level]})</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="filter-group">
				<label class="filter-label" for="search">Search</label>
				<input
					type="text"
					id="search"
					placeholder="Search in messages..."
					value={searchText}
					oninput={handleSearchInput}
				/>
			</div>

			<div class="filter-group">
				<label class="filter-label" for="source">Source</label>
				<select id="source" value={selectedSource} onchange={handleSourceChange}>
					<option value="">All sources</option>
					{#each visibleSources as source}
						<option value={source}>{source}</option>
					{/each}
				</select>
			</div>

			<div class="filter-group">
				<label class="filter-label" for="from-date">After</label>
				<input
					type="datetime-local"
					id="from-date"
					value={fromDate}
					oninput={(e) => {
						fromDate = e.currentTarget.value;
					}}
					onchange={(e) => {
						fromDate = e.currentTarget.value;
						applyFilters();
					}}
				/>
			</div>

			<div class="filter-group">
				<label class="filter-label" for="to-date">Before</label>
				<input
					type="datetime-local"
					id="to-date"
					value={toDate}
					oninput={(e) => {
						toDate = e.currentTarget.value;
					}}
					onchange={(e) => {
						toDate = e.currentTarget.value;
						applyFilters();
					}}
				/>
			</div>
		</div>
	</section>

	<section class="section controls-section">
		<div class="controls-left">
			<button
				type="button"
				class={`control-button tap-target ${autoScroll ? 'active' : ''}`}
				data-testid="toggle-live-view"
				onclick={toggleAutoScroll}
			>
				{#if autoScroll}
					<span class="pulse-dot"></span>
					Pause Live View
				{:else}
					Resume Live View
				{/if}
			</button>

			<form
				method="POST"
				action={exportAction}
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success' && typeof result.data?.exportData === 'string') {
							const blob = new Blob([result.data.exportData as string], { type: 'application/json' });
							const url = URL.createObjectURL(blob);
							const a = document.createElement('a');
							a.href = url;
							a.download = (result.data.exportFilename as string) || 'logs-export.json';
							document.body.append(a);
							a.click();
							a.remove();
							setTimeout(() => URL.revokeObjectURL(url), 1000);
							return;
						}

						if (result.type === 'failure') {
							const message =
								typeof result.data?.error === 'string'
									? result.data.error
									: 'Failed to export logs';
							toast.error(message);
							return;
						}

						toast.error('Failed to export logs');
					};
				}}
				class="inline-form"
			>
				<SubmitButton class="control-button secondary tap-target">
					{#snippet children()}
						Export JSON
					{/snippet}
				</SubmitButton>
			</form>
		</div>

		<div class="controls-right">
			<button
				type="button"
				class="control-button secondary tap-target"
				data-testid="open-cleanup-dialog"
				onclick={() => (runCleanupDialogOpen = true)}
			>
				Run Cleanup
			</button>

			<button
				type="button"
				class="control-button danger tap-target"
				data-testid="open-clear-logs-dialog"
				onclick={() => (clearLogsDialogOpen = true)}
			>
				Clear All Logs
			</button>
		</div>
	</section>

	<section class="section logs-section">
		<div class="logs-header">
			<h2>Log Entries</h2>
			<span class="logs-count">
				Showing {visibleTotalCount.toLocaleString()} visible log entries
			</span>
		</div>

		{#if visibleLogs.length === 0}
			<p class="empty-message">No logs found matching your filters.</p>
		{:else}
			<div class="logs-table-wrapper">
				<table class="logs-table">
					<thead>
						<tr>
							<th class="col-time">Time</th>
							<th class="col-level">Level</th>
							<th class="col-source">Source</th>
							<th class="col-message">Message</th>
							<th class="col-actions">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleLogs as log (log.id)}
							<tr class={getLevelClass(log.level)}>
								<td class="col-time">
									<span class="time-relative">{formatRelativeTime(log.timestamp)}</span>
									<span class="time-full">{formatTimestamp(log.timestamp)}</span>
								</td>
								<td class="col-level">
									<span class="level-badge {getLevelClass(log.level)}">{log.level}</span>
								</td>
								<td class="col-source">
									<span class="source-tag">{log.source ?? 'App'}</span>
								</td>
								<td class="col-message">
									<span class="message-text">{log.message}</span>
									{#if log.metadata}
										{@const meta = parseMetadata(log.metadata)}
										{#if meta}
											<details class="metadata-details">
												<summary>Metadata</summary>
												<pre class="metadata-json">{JSON.stringify(meta, null, 2)}</pre>
											</details>
										{/if}
									{/if}
								</td>
								<td class="col-actions">
									<Button
										type="button"
										class="copy-button tap-target"
										title="Copy to clipboard"
										onclick={() => copyLog(log)}
									>
										Copy
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

		{/if}

		{#if data.hasMore && data.logs.length > 0}
			{@const lastLog = data.logs[data.logs.length - 1]}
			{#if lastLog}
				<div class="load-more">
					<Button
						href="/admin/logs?cursor={lastLog.id}&{page.url.searchParams.toString()}"
						class="load-more-button tap-target"
					>
						Load More
					</Button>
				</div>
			{/if}
		{/if}
		</section>

	<section class="section settings-info">
		<h2>Retention Settings</h2>
		<div class="settings-grid">
			<div class="setting-item">
				<span class="setting-label">Retention Period:</span>
				<span class="setting-value">{data.settings.retentionDays} days</span>
			</div>
			<div class="setting-item">
				<span class="setting-label">Max Logs:</span>
				<span class="setting-value">{data.settings.maxCount.toLocaleString()}</span>
			</div>
			<div class="setting-item">
				<span class="setting-label">Debug Logs:</span>
				<span class="setting-value">{data.settings.debugEnabled ? 'Enabled' : 'Disabled'}</span>
			</div>
			{#if data.retentionScheduler.nextRun}
				<div class="setting-item">
					<span class="setting-label">Next Cleanup:</span>
					<span class="setting-value"
						>{new Date(data.retentionScheduler.nextRun).toLocaleString()}</span
					>
				</div>
			{/if}
		</div>
		<p class="settings-note">
			Configure these settings in <a href="/admin/settings">Admin Settings</a>.
		</p>
	</section>
</div>

<AlertDialog.Root bind:open={clearLogsDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear all logs?</AlertDialog.Title>
			<AlertDialog.Description>
				Deletes every log entry. You cannot undo this.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearingLogs}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearLogs"
				use:enhance={() => {
					isClearingLogs = true;
					return async ({ result, update }) => {
						try {
							await refreshAfterLogMutation(update);
							clearLogsDialogOpen = false;
							// The page-level $effect also calls handleFormToast(form), but
							// explicit feedback inside the enhance callback guarantees a toast
							// even on adapter quirks where the form prop never refreshes
							// (ISSUE-010 "no toast, no action" observation).
							if (result.type === 'success') {
								const payload = (result.data ?? {}) as { message?: string };
								handleFormToast({
									success: true,
									message: payload.message ?? 'Logs cleared'
								});
							} else if (result.type === 'failure') {
								const payload = (result.data ?? {}) as { error?: string };
								handleFormToast({ error: payload.error ?? 'Failed to clear logs.' });
							} else if (result.type === 'error') {
								handleFormToast({
									error: result.error?.message ?? 'Failed to clear logs.'
								});
							}
						} finally {
							isClearingLogs = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" disabled={isClearingLogs}>
					{isClearingLogs ? 'Clearing…' : 'Clear All'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={runCleanupDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Run cleanup now?</AlertDialog.Title>
			<AlertDialog.Description>
				Deletes logs older than {data.settings.retentionDays} days and keeps only the {data.settings.maxCount.toLocaleString()}
				newest. You cannot undo this.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isRunningCleanup}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/runCleanup"
				use:enhance={() => {
					isRunningCleanup = true;
					return async ({ result, update }) => {
						try {
							await refreshAfterLogMutation(update);
							runCleanupDialogOpen = false;
							if (result.type === 'success') {
								const payload = (result.data ?? {}) as { message?: string };
								handleFormToast({
									success: true,
									message: payload.message ?? 'Retention cleanup complete'
								});
							} else if (result.type === 'failure') {
								const payload = (result.data ?? {}) as { error?: string };
								handleFormToast({
									error: payload.error ?? 'Failed to run retention cleanup.'
								});
							} else if (result.type === 'error') {
								handleFormToast({
									error: result.error?.message ?? 'Failed to run retention cleanup.'
								});
							}
						} finally {
							isRunningCleanup = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" disabled={isRunningCleanup}>
					{isRunningCleanup ? 'Running…' : 'Run Cleanup'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.logs-page {
			max-width: 1200px;
			margin: 0 auto;
			padding: 2rem;
			min-width: 0;
		}

		.page-header {
			margin-bottom: 1.5rem;
		}

		.page-header h1 {
			font-size: 2rem;
			font-weight: 700;
			color: oklch(var(--primary));
			margin: 0 0 0.5rem;
		}

		.subtitle {
			color: oklch(var(--muted-foreground));
			margin: 0;
		}

		.stats-section {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			gap: 1rem;
			margin-bottom: 1.5rem;
		}

		.stat-card {
			background: oklch(var(--card));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			padding: 1rem;
			text-align: center;
		}

		.stat-card.level-info {
			border-left: 3px solid oklch(0.6475 0.1187 235.02);
		}

		.stat-card.level-warn {
			border-left: 3px solid oklch(0.7899 0.1569 87.11);
		}

		.stat-card.level-error {
			border-left: 3px solid oklch(var(--destructive));
		}

		.stat-value {
			display: block;
			font-size: 1.5rem;
			font-weight: 700;
			color: oklch(var(--foreground));
		}

		.stat-label {
			display: block;
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			margin-top: 0.25rem;
		}

		.section {
			background: oklch(var(--card));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			padding: 1.5rem;
			margin-bottom: 1.5rem;
		}

		.section h2 {
			font-size: 1.125rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			margin: 0;
		}

		.filters-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1rem;
		}

		/* shadcn Button child-renders the real <button>, so this transparent
		   treatment must be hoisted. */
		:global(.clear-filters-button) {
			padding: 0.25rem 0.5rem;
			font-size: 0.75rem;
			background: transparent;
			color: oklch(var(--muted-foreground));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			cursor: pointer;
		}

		:global(.clear-filters-button:hover) {
			color: oklch(var(--foreground));
			border-color: oklch(var(--foreground));
		}

		.filters-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
			gap: 1rem;
		}

		.filter-group {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			min-width: 0;
		}

		.filter-label {
			font-size: 0.875rem;
			font-weight: 500;
			color: oklch(var(--foreground));
		}

		.filter-group input,
		.filter-group select {
			padding: 0.5rem 0.75rem;
			background: oklch(var(--input));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			color: oklch(var(--foreground));
			font-size: 0.875rem;
			min-width: 0;
			width: 100%;
		}

		.level-checkboxes {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.level-toggle {
			display: inline-flex;
			align-items: center;
			gap: 0.375rem;
			padding: 0.375rem 0.75rem;
			font-size: 0.75rem;
			font-weight: 500;
			background: oklch(var(--muted) / 0.4);
			color: oklch(var(--muted-foreground));
			border: 1px dashed oklch(var(--border));
			border-radius: var(--radius);
			cursor: pointer;
			opacity: 0.7;
			transition: all 0.15s ease;
		}

		.level-toggle:hover {
			background: oklch(var(--muted) / 0.7);
			opacity: 1;
		}

		.level-toggle.active {
			opacity: 1;
			font-weight: 600;
			border-style: solid;
		}

		.level-toggle-check {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 0.875rem;
			height: 0.875rem;
			font-size: 0.75rem;
			font-weight: 700;
			line-height: 1;
		}

		.level-toggle:not(.active) .level-toggle-check {
			opacity: 0.25;
		}

		.level-toggle:not(.active) .level-toggle-check::before {
			content: '○';
		}

		.level-toggle.active.level-error {
			background: oklch(var(--destructive));
			color: oklch(var(--destructive-foreground));
			border-color: oklch(var(--destructive));
		}

		.level-toggle.active.level-warn {
			background: oklch(0.6697 0.1323 87.37);
			color: white;
			border-color: oklch(0.6697 0.1323 87.37);
		}

		.level-toggle.active.level-info {
			background: oklch(0.5996 0.1091 234.92);
			color: white;
			border-color: oklch(0.5996 0.1091 234.92);
		}

		.level-toggle.active.level-debug {
			background: oklch(var(--muted-foreground));
			color: oklch(var(--background));
			border-color: oklch(var(--muted-foreground));
		}

		.level-count {
			opacity: 0.7;
			margin-left: 0.25rem;
		}

		.controls-section {
			display: flex;
			justify-content: space-between;
			align-items: center;
			flex-wrap: wrap;
			gap: 1rem;
		}

		.controls-left,
		.controls-right {
			display: flex;
			gap: 0.5rem;
			flex-wrap: wrap;
		}

		.inline-form {
			display: inline;
		}

		/* These actions mix shadcn Button and SubmitButton consumers; hoist the
		   variant palettes so child-rendered controls inherit them. */
		:global(.control-button) {
			padding: 0.5rem 1rem;
			font-size: 0.875rem;
			font-weight: 500;
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border: none;
			border-radius: var(--radius);
			cursor: pointer;
			display: flex;
			align-items: center;
			gap: 0.5rem;
			transition: opacity 0.15s ease;
		}

		:global(.control-button:hover) {
			opacity: 0.9;
		}

		:global(.control-button.secondary) {
			background: oklch(var(--secondary));
			color: oklch(var(--secondary-foreground));
			border: 1px solid oklch(var(--border));
		}

		:global(.control-button.danger) {
			background: oklch(var(--destructive));
			color: oklch(var(--destructive-foreground));
		}

		:global(.control-button.active) {
			background: oklch(0.5266 0.1278 143.49);
		}

		.pulse-dot {
			width: 8px;
			height: 8px;
			background: white;
			border-radius: 50%;
			animation: pulse 1.5s infinite;
		}

		@keyframes pulse {
			0%,
			100% {
				opacity: 1;
			}
			50% {
				opacity: 0.5;
			}
		}

		.logs-section {
			padding: 1rem;
		}

		.logs-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1rem;
			padding: 0 0.5rem;
		}

		.logs-count {
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
		}

		.logs-table-wrapper {
			overflow-x: auto;
			max-height: 600px;
			overflow-y: auto;
		}

		.logs-table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.8125rem;
		}

		.logs-table th,
		.logs-table td {
			padding: 0.625rem 0.75rem;
			text-align: left;
			border-bottom: 1px solid oklch(var(--border));
			vertical-align: top;
		}

		.logs-table th {
			position: sticky;
			top: 0;
			background: oklch(var(--card));
			font-weight: 600;
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			text-transform: uppercase;
			z-index: 1;
		}

		.logs-table tbody tr:hover {
			background: oklch(var(--muted) / 0.3);
		}

		.col-time {
			width: 140px;
			white-space: nowrap;
		}

		.col-level {
			width: 70px;
		}

		.col-source {
			width: 100px;
		}

		.col-message {
			min-width: 300px;
		}

		.col-actions {
			width: 60px;
		}

		.time-relative {
			display: block;
			color: oklch(var(--foreground));
		}

		.time-full {
			display: block;
			font-size: 0.6875rem;
			color: oklch(var(--muted-foreground));
		}

		.level-badge {
			display: inline-block;
			padding: 0.125rem 0.5rem;
			border-radius: 9999px;
			font-size: 0.625rem;
			font-weight: 600;
			text-transform: uppercase;
		}

		.level-badge.level-error {
			background: oklch(var(--destructive));
			color: oklch(var(--destructive-foreground));
		}

		.level-badge.level-warn {
			background: oklch(0.6075 0.1196 87.55);
			color: oklch(0.9809 0.026 91.62);
		}

		.level-badge.level-info {
			background: oklch(0.5508 0.0994 234.79);
			color: oklch(0.9646 0.0213 229.05);
		}

		.level-badge.level-debug {
			background: oklch(var(--muted));
			color: oklch(var(--muted-foreground));
		}

		.source-tag {
			display: inline-block;
			padding: 0.125rem 0.375rem;
			background: oklch(var(--muted));
			border-radius: var(--radius);
			font-size: 0.75rem;
			color: oklch(var(--foreground));
		}

		.message-text {
			font-family: ui-monospace, 'SF Mono', 'Monaco', 'Consolas', monospace;
			font-size: 0.8125rem;
			word-break: break-word;
		}

		.metadata-details {
			margin-top: 0.5rem;
		}

		.metadata-details summary {
			cursor: pointer;
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
		}

		.metadata-json {
			margin: 0.5rem 0 0;
			padding: 0.5rem;
			background: oklch(var(--muted));
			border-radius: var(--radius);
			font-size: 0.75rem;
			overflow-x: auto;
		}

		/* shadcn Button child-renders the real <button>, so the hover palette
		   must be hoisted. */
		:global(.copy-button) {
			padding: 0.25rem 0.5rem;
			font-size: 0.6875rem;
			background: oklch(var(--muted));
			color: oklch(var(--muted-foreground));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			cursor: pointer;
		}

		:global(.copy-button:hover) {
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border-color: oklch(var(--primary));
		}

		.empty-message {
			color: oklch(var(--muted-foreground));
			text-align: center;
			padding: 2rem;
		}

		.load-more {
			text-align: center;
			padding: 1rem;
		}

		/* shadcn Button with `href` child-renders an <a>, so the pagination
		   treatment must be hoisted to reach the anchor. */
		:global(.load-more-button) {
			display: inline-block;
			padding: 0.5rem 1.5rem;
			background: oklch(var(--secondary));
			color: oklch(var(--foreground));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			text-decoration: none;
			font-size: 0.875rem;
		}

		:global(.load-more-button:hover) {
			background: oklch(var(--muted));
		}

		.settings-info h2 {
			margin-bottom: 1rem;
		}

		.settings-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 0.75rem;
		}

		.setting-item {
			display: flex;
			justify-content: space-between;
			padding: 0.5rem;
			background: oklch(var(--muted) / 0.5);
			border-radius: var(--radius);
		}

		.setting-label {
			font-size: 0.8125rem;
			color: oklch(var(--muted-foreground));
		}

		.setting-value {
			font-size: 0.8125rem;
			font-weight: 500;
			color: oklch(var(--foreground));
		}

		.settings-note {
			margin-top: 1rem;
			font-size: 0.8125rem;
			color: oklch(var(--muted-foreground));
		}

		.settings-note a {
			color: oklch(var(--primary));
		}

		@media (max-width: 768px) {
			.logs-page {
				padding: 1rem;
				min-width: 0;
			}

			.controls-section {
				flex-direction: column;
				align-items: stretch;
			}

			.controls-left,
			.controls-right {
				justify-content: center;
			}

			.stats-section {
				grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
				gap: 0.75rem;
			}

			.logs-table {
				font-size: 0.75rem;
			}

			.logs-table th,
			.logs-table td {
				padding: 0.5rem;
			}

			.col-time {
				width: 100px;
			}

			.col-source {
				display: none;
			}

			.col-actions {
				display: none;
			}

			.col-message {
				min-width: 0;
				word-break: break-word;
			}
		}

		@media (max-width: 480px) {
			.logs-page {
				padding: 0.75rem;
			}

			.controls-left,
			.controls-right {
				flex-direction: column;
				width: 100%;
			}

			:global(.control-button) {
				width: 100%;
				justify-content: center;
			}

			.inline-form {
				display: block;
				width: 100%;
			}

			.stats-section {
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.5rem;
				margin-bottom: 1rem;
			}

			.stat-card {
				padding: 0.75rem 0.5rem;
			}

			.logs-table {
				font-size: 0.7rem;
				table-layout: auto;
			}

			.col-time {
				width: 72px;
			}

			.col-level {
				width: 52px;
			}

			.col-message {
				min-width: 140px;
				word-break: break-word;
				white-space: normal;
			}
		}
</style>
