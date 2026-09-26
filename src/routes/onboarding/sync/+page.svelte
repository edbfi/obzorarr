<script lang="ts">
import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
import XIcon from '@lucide/svelte/icons/x';
import { animate, stagger } from 'motion';
import { untrack } from 'svelte';
import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
import { Button } from '$lib/components/ui/button';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();

type SyncStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

// SSE owns progress after mount; prop changes should not rewind the live state.
let syncStatus = $state<SyncStatus>(untrack(() => (data.syncRunning ? 'running' : 'idle')));
let recordsProcessed = $state(untrack(() => data.currentProgress?.recordsProcessed ?? 0));
let recordsInserted = $state(untrack(() => data.currentProgress?.recordsInserted ?? 0));
let phase = $state<'fetching' | 'enriching' | null>(
	untrack(() => data.currentProgress?.phase ?? null)
);
let enrichmentTotal = $state(untrack(() => data.currentProgress?.enrichmentTotal ?? 0));
let enrichmentProcessed = $state(untrack(() => data.currentProgress?.enrichmentProcessed ?? 0));
let isStarting = $state(false);
let isCancelling = $state(false);
let error = $state<string | null>(null);

let eventSource: EventSource | null = null;
// Pending auto-reconnect timer + a teardown flag. Without these, the 2s
// reconnect scheduled in `onerror` outlives component unmount (the user
// advancing to the next step), spawning an orphaned EventSource that keeps
// polling `/api/sync/status/stream` in the background.
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseDisconnected = false;

let contentRef: HTMLElement | undefined = $state();
let progressRef: HTMLElement | undefined = $state();

const enrichmentProgress = $derived(
	enrichmentTotal > 0 ? Math.round((enrichmentProcessed / enrichmentTotal) * 100) : 0
);

const hasStarted = $derived(syncStatus !== 'idle');
const isRunning = $derived(syncStatus === 'running');
const isComplete = $derived(syncStatus === 'completed');
const hasFailed = $derived(syncStatus === 'failed' || syncStatus === 'cancelled');

// Terminal states win over the last streamed phase so completion/failure copy cannot go stale.
const phaseText = $derived(() => {
	if (isComplete) return 'Sync complete!';
	if (hasFailed) return 'Sync failed';
	if (phase === 'fetching') return 'Fetching viewing history...';
	if (phase === 'enriching') return 'Enriching metadata...';
	return 'Ready to sync';
});

$effect(() => {
	if (!contentRef) return;
	const items = contentRef.querySelectorAll('.animate-item');
	if (items.length === 0) return;

	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads that TypeScript cannot infer correctly
	const animation = (animate as any)(
		items,
		{ opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] },
		{ duration: 0.5, delay: stagger(0.1), easing: [0.22, 1, 0.36, 1] }
	);
	return () => animation.stop?.();
});

$effect(() => {
	if (!progressRef || !isComplete) return;

	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads that TypeScript cannot infer correctly
	(animate as any)(
		progressRef,
		{ transform: ['scale(1)', 'scale(1.05)', 'scale(1)'] },
		{ duration: 0.4, easing: [0.22, 1, 0.36, 1] }
	);
});

function setupEventSource(es: EventSource) {
	es.onmessage = (event) => {
		try {
			const eventData = JSON.parse(event.data);

			switch (eventData.type) {
				case 'connected':
					if (eventData.inProgress && eventData.progress) {
						syncStatus = 'running';
						recordsProcessed = eventData.progress.recordsProcessed ?? 0;
						recordsInserted = eventData.progress.recordsInserted ?? 0;
						phase = eventData.progress.phase ?? null;
						enrichmentTotal = eventData.progress.enrichmentTotal ?? 0;
						enrichmentProcessed = eventData.progress.enrichmentProcessed ?? 0;
					}
					break;
				case 'update':
					syncStatus = 'running';
					if (eventData.progress) {
						recordsProcessed = eventData.progress.recordsProcessed ?? recordsProcessed;
						recordsInserted = eventData.progress.recordsInserted ?? recordsInserted;
						phase = eventData.progress.phase ?? phase;
						enrichmentTotal = eventData.progress.enrichmentTotal ?? enrichmentTotal;
						enrichmentProcessed = eventData.progress.enrichmentProcessed ?? enrichmentProcessed;
					}
					break;
				case 'completed':
					syncStatus = 'completed';
					break;
				case 'failed':
					syncStatus = 'failed';
					error = eventData.error ?? 'Sync failed';
					break;
				case 'cancelled':
					syncStatus = 'cancelled';
					break;
				case 'idle':
					if (syncStatus === 'running') {
						syncStatus = 'completed';
					}
					break;
			}
		} catch (e) {
			console.error('SSE parse error:', e);
		}
	};

	es.onerror = () => {
		// Bail if the component was torn down: a closed ES can still deliver a
		// pending `onerror`, which would otherwise schedule an orphaned timer.
		if (sseDisconnected) return;
		console.warn('SSE connection lost, attempting reconnect...');
		es.close();
		eventSource = null;

		// The delayed reconnect must be cancellable because onboarding can advance
		// before the timer fires.
		if (reconnectTimer) clearTimeout(reconnectTimer);
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			if (!sseDisconnected && browser && (syncStatus === 'running' || data.syncRunning)) {
				eventSource = new EventSource('/api/sync/status/stream');
				setupEventSource(eventSource);
			}
		}, 2000);
	};
}

$effect(() => {
	if (!browser) return;
	if (!isRunning && !data.syncRunning) return;

	// Onboarding sync streams before an admin session exists.
	sseDisconnected = false;
	eventSource = new EventSource('/api/sync/status/stream');
	setupEventSource(eventSource);

	return () => {
		sseDisconnected = true;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		eventSource?.close();
		eventSource = null;
	};
});

$effect(() => {
	if (form?.success) {
		syncStatus = 'running';
		isStarting = false;
	}
	if (form?.error) {
		error = form.error;
		isStarting = false;
	}
});

function handleStartSync() {
	isStarting = true;
	error = null;
}

function formatNumber(n: number): string {
	return n.toLocaleString();
}
</script>

<OnboardingCard
	title="Sync Your Viewing History"
	subtitle="Import your {data.currentYear} Plex viewing data to generate your personalized Wrapped"
>
	<div class="sync-content" bind:this={contentRef}>
		<div class="progress-wrapper animate-item" bind:this={progressRef}>
			<div
				class="progress-ring"
				class:running={isRunning}
				class:complete={isComplete}
				class:failed={hasFailed}
			>
				<svg aria-hidden="true" class="ring-bg" viewBox="0 0 120 120">
					<circle cx="60" cy="60" r="52" />
				</svg>

				<svg aria-hidden="true" class="ring-progress" viewBox="0 0 120 120">
					<circle
						cx="60"
						cy="60"
						r="52"
						style="--progress: {phase === 'enriching' ? enrichmentProgress : isComplete ? 100 : 0}"
					/>
				</svg>

				<div class="ring-center">
					{#if !hasStarted}
						<div class="ring-icon idle">
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								<path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</div>
					{:else if isRunning}
						<div class="ring-icon running">
							<div class="spinner-dots">
								<span></span><span></span><span></span>
							</div>
						</div>
					{:else if isComplete}
						<div class="ring-icon complete">
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
							>
								<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</div>
					{:else if hasFailed}
						<div class="ring-icon failed">
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="15" y1="9" x2="9" y2="15" />
								<line x1="9" y1="9" x2="15" y2="15" />
							</svg>
						</div>
					{/if}
				</div>

				<div class="ring-glow"></div>
			</div>
		</div>

		<div class="phase-section animate-item">
			<p
				class="phase-text"
				class:running={isRunning}
				class:complete={isComplete}
				class:failed={hasFailed}
			>
				{phaseText()}
			</p>

			{#if hasStarted && !hasFailed}
				<div class="stats-row">
					<div class="stat">
						<span class="stat-value">{formatNumber(recordsProcessed)}</span>
						<span class="stat-label">Records Processed</span>
					</div>
					<div class="stat-divider"></div>
					<div class="stat">
						<span class="stat-value">{formatNumber(recordsInserted)}</span>
						<span class="stat-label">New Records</span>
					</div>
				</div>
			{/if}

			{#if phase === 'enriching' && enrichmentTotal > 0}
				<div class="enrichment-progress">
					<div class="enrichment-bar">
						<div class="enrichment-fill" style="width: {enrichmentProgress}%"></div>
					</div>
					<span class="enrichment-text"
						>{enrichmentProcessed}
						/ {enrichmentTotal} items enriched</span
					>
				</div>
			{/if}
		</div>

		{#if !hasStarted}
			<form
				method="POST"
				action="?/startSync"
				use:enhance={() => {
	handleStartSync();
	return async ({ update }) => {
		await update();
	};
}}
			>
				<SubmitButton class="start-button animate-item tap-target" submitting={isStarting}>
					{#snippet children()}
						<RefreshCwIcon class="size-5" />
						<span>Start Sync</span>
					{/snippet}
					{#snippet submittingLabel()}
						<span>Starting sync...</span>
					{/snippet}
				</SubmitButton>
			</form>
			<p class="pre-sync-hint animate-item">
				Sync will continue in the background if you proceed to the next step.
			</p>
		{/if}

		{#if error}
			<div class="error-banner">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		{#if isRunning}
			<div class="warning-banner">
				<div class="warning-icon">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				<div class="warning-content">
					<p class="warning-title">Sync will continue</p>
					<p class="warning-text">Leave this page anytime. The sync keeps running on the server.</p>
				</div>
			</div>
		{/if}

		{#if isComplete}
			<div class="success-banner">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>Obzorarr finished syncing your viewing history.</span>
			</div>
		{/if}

		{#if hasStarted && !hasFailed}
			<p class="continue-hint">
				{#if isComplete}
					Continue to choose your privacy and appearance settings.
				{:else}
					You can continue while sync runs in the background.
				{/if}
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<div class="footer-actions">
			<form method="POST" action="?/goBack" use:enhance class="mr-auto">
				<Button type="submit" variant="outline" class="tap-target">
					<ArrowLeftIcon class="size-[18px]" />
					Previous
				</Button>
			</form>
			{#if isRunning}
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
					<SubmitButton class="cancel-button tap-target" submitting={isCancelling}>
						{#snippet children()}
							<XIcon class="size-[18px]" />
							<span>Cancel</span>
						{/snippet}
						{#snippet submittingLabel()}
							<span>Cancel</span>
						{/snippet}
					</SubmitButton>
				</form>
			{/if}
			<form method="POST" action="?/continue">
				<SubmitButton class="continue-button tap-target" disabled={!hasStarted}>
					{#snippet children()}
						<span>Continue</span>
						<ArrowRightIcon class="size-[18px]" strokeWidth={2.5} />
					{/snippet}
				</SubmitButton>
			</form>
		</div>
	{/snippet}
</OnboardingCard>

<style>
.sync-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.25rem;
}

.animate-item {
	opacity: 0;
}

.progress-wrapper {
	position: relative;
	width: 120px;
	height: 120px;
}

.progress-ring {
	position: relative;
	width: 100%;
	height: 100%;
}

.ring-bg,
.ring-progress {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.ring-bg circle {
	fill: none;
	stroke: rgba(255, 255, 255, 0.08);
	stroke-width: 8;
}

.ring-progress circle {
	fill: none;
	stroke: oklch(var(--primary));
	stroke-width: 8;
	stroke-linecap: round;
	stroke-dasharray: 326.7;
	stroke-dashoffset: calc(326.7 - (326.7 * var(--progress, 0) / 100));
	transform: rotate(-90deg);
	transform-origin: center;
	transition: stroke-dashoffset 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.progress-ring.running .ring-bg circle {
	animation: ring-pulse 2s ease-in-out infinite;
}

@keyframes ring-pulse {
	0%,
	100% {
		stroke: rgba(255, 255, 255, 0.08);
	}
	50% {
		stroke: oklch(var(--primary) / 0.15);
	}
}

.progress-ring.complete .ring-progress circle {
	stroke: oklch(0.7794 0.2087 149.41);
}

.progress-ring.failed .ring-progress circle {
	stroke: oklch(0.6356 0.2082 25.38);
}

.ring-center {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.ring-icon {
	width: 42px;
	height: 42px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.ring-icon svg {
	width: 100%;
	height: 100%;
}

.ring-icon.idle {
	color: rgba(255, 255, 255, 0.4);
}

.ring-icon.complete {
	color: oklch(0.7946 0.1951 150.81);
}

.ring-icon.failed {
	color: oklch(0.6356 0.2082 25.38);
}

.spinner-dots {
	display: flex;
	gap: 6px;
}

.spinner-dots span {
	width: 10px;
	height: 10px;
	background: oklch(var(--primary));
	border-radius: 50%;
	animation: dot-bounce 1.4s ease-in-out infinite;
}

.spinner-dots span:nth-child(1) {
	animation-delay: 0s;
}
.spinner-dots span:nth-child(2) {
	animation-delay: 0.16s;
}
.spinner-dots span:nth-child(3) {
	animation-delay: 0.32s;
}

@keyframes dot-bounce {
	0%,
	80%,
	100% {
		transform: scale(0.6);
		opacity: 0.4;
	}
	40% {
		transform: scale(1);
		opacity: 1;
	}
}

.ring-glow {
	position: absolute;
	inset: -10px;
	border-radius: 50%;
	background: radial-gradient(circle, oklch(var(--primary) / 0.2) 0%, transparent 70%);
	opacity: 0;
	transition: opacity 0.4s ease;
	pointer-events: none;
}

.progress-ring.running .ring-glow {
	opacity: 1;
	animation: glow-pulse 2s ease-in-out infinite;
}

.progress-ring.complete .ring-glow {
	opacity: 1;
	background: radial-gradient(circle, rgba(34, 197, 94, 0.25) 0%, transparent 70%);
}

@keyframes glow-pulse {
	0%,
	100% {
		opacity: 0.6;
		transform: scale(1);
	}
	50% {
		opacity: 1;
		transform: scale(1.05);
	}
}

.phase-section {
	text-align: center;
	width: 100%;
	min-height: 60px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-start;
	gap: 0.5rem;
}

.phase-text {
	margin: 0;
	font-size: 1rem;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.7);
	transition: color 0.3s ease;
}

.phase-text.running {
	color: oklch(var(--primary));
}

.phase-text.complete {
	color: oklch(0.7946 0.1951 150.81);
}

.phase-text.failed {
	color: oklch(0.6356 0.2082 25.38);
}

.stats-row {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 1.5rem;
	margin-top: 0.5rem;
	padding: 0.75rem 1.25rem;
	background: rgba(255, 255, 255, 0.03);
	border-radius: 12px;
	border: 1px solid rgba(255, 255, 255, 0.06);
	animation: fade-slide-in 0.3s ease-out;
}

@keyframes fade-slide-in {
	from {
		opacity: 0;
		transform: translateY(-8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
}

.stat-value {
	font-size: 1.5rem;
	font-weight: 700;
	color: rgba(255, 255, 255, 0.95);
	font-variant-numeric: tabular-nums;
	letter-spacing: -0.02em;
}

.stat-label {
	font-size: 0.7rem;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: rgba(255, 255, 255, 0.45);
}

.stat-divider {
	width: 1px;
	height: 32px;
	background: rgba(255, 255, 255, 0.1);
}

.enrichment-progress {
	margin-top: 1rem;
	width: 100%;
}

.enrichment-bar {
	height: 4px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 2px;
	overflow: hidden;
}

.enrichment-fill {
	height: 100%;
	background: linear-gradient(90deg, oklch(var(--primary)) 0%, oklch(var(--accent)) 100%);
	border-radius: 2px;
	transition: width 0.3s ease;
}

.enrichment-text {
	display: block;
	margin-top: 0.5rem;
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.5);
	text-align: center;
}

/* SubmitButton child-renders the actual <button>, so the selector must
		   be global for the primary palette, hover translate-y, and layered
		   shadows to reach it. The lucide icon stays sized inline to avoid
		   another descendant override across the scoped-style boundary. */
:global(.start-button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	padding: 1rem 2rem;
	min-width: 180px;
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--primary-foreground));
	background: oklch(var(--primary));
	border: none;
	border-radius: 12px;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	box-shadow:
		0 4px 16px oklch(var(--primary) / 0.35),
		0 2px 4px rgba(0, 0, 0, 0.2),
		inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

:global(.start-button:hover:not(:disabled)) {
	transform: translateY(-2px);
	box-shadow:
		0 6px 24px oklch(var(--primary) / 0.45),
		0 4px 8px rgba(0, 0, 0, 0.25),
		inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

:global(.start-button:disabled) {
	opacity: 0.8;
	cursor: not-allowed;
}

.warning-banner {
	display: flex;
	align-items: flex-start;
	gap: 0.875rem;
	padding: 1rem 1.25rem;
	background: rgba(250, 204, 21, 0.08);
	border: 1px solid rgba(250, 204, 21, 0.25);
	border-radius: 12px;
	width: 100%;
	animation: fade-slide-in 0.3s ease-out;
}

.warning-icon {
	flex-shrink: 0;
	width: 22px;
	height: 22px;
	color: oklch(0.8376 0.1649 87.55);
}

.warning-icon svg {
	width: 100%;
	height: 100%;
}

.warning-content {
	flex: 1;
}

.warning-title {
	margin: 0;
	font-size: 0.9rem;
	font-weight: 600;
	color: oklch(0.869 0.1467 90.38);
}

.warning-text {
	margin: 0.25rem 0 0;
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.55);
	line-height: 1.5;
}

.success-banner {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.875rem 1rem;
	background: rgba(34, 197, 94, 0.12);
	border: 1px solid rgba(34, 197, 94, 0.3);
	border-radius: 10px;
	width: 100%;
	font-size: 0.9rem;
	color: oklch(0.8116 0.1789 152.1);
	animation: fade-slide-in 0.3s ease-out;
}

.success-banner svg {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
}

.error-banner {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.875rem 1rem;
	background: rgba(239, 68, 68, 0.12);
	border: 1px solid rgba(239, 68, 68, 0.3);
	border-radius: 10px;
	width: 100%;
	font-size: 0.875rem;
	color: oklch(0.7052 0.1587 21.97);
	animation: fade-slide-in 0.3s ease-out;
}

.error-banner svg {
	flex-shrink: 0;
	width: 18px;
	height: 18px;
}

.pre-sync-hint {
	margin: 0.5rem 0 0;
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.4);
	text-align: center;
}

.continue-hint {
	margin: 0;
	font-size: 0.85rem;
	color: rgba(255, 255, 255, 0.5);
	text-align: center;
	animation: fade-slide-in 0.3s ease-out;
}

.footer-actions {
	display: flex;
	gap: 0.75rem;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
}

/* SubmitButton child-renders the actual <button>, so the destructive
		   palette and hover-darken treatment need a global selector. The lucide
		   icon stays sized inline to avoid another descendant override across
		   the scoped-style boundary. */
:global(.cancel-button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.75rem 1.5rem;
	font-size: 0.95rem;
	font-weight: 600;
	color: oklch(0.7052 0.1587 21.97);
	background: rgba(239, 68, 68, 0.08);
	border: 1px solid rgba(239, 68, 68, 0.3);
	border-radius: 10px;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

:global(.cancel-button:hover:not(:disabled)) {
	background: rgba(239, 68, 68, 0.15);
	border-color: rgba(239, 68, 68, 0.5);
}

:global(.cancel-button:disabled) {
	opacity: 0.6;
	cursor: not-allowed;
}

/* SubmitButton child-renders the actual <button>, so the primary
		   palette, hover translate-y, and dual shadow need a global selector.
		   The lucide icon stays sized inline to avoid another descendant
		   override across the scoped-style boundary. */
:global(.continue-button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.75rem 1.5rem;
	font-size: 0.95rem;
	font-weight: 600;
	color: oklch(var(--primary-foreground));
	background: oklch(var(--primary));
	border: none;
	border-radius: 10px;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	box-shadow:
		0 2px 12px oklch(var(--primary) / 0.3),
		inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

:global(.continue-button:hover:not(:disabled)) {
	transform: translateY(-1px);
	box-shadow:
		0 4px 16px oklch(var(--primary) / 0.4),
		inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

:global(.continue-button:disabled) {
	opacity: 0.4;
	cursor: not-allowed;
	transform: none;
	box-shadow: none;
}

@media (max-width: 480px) {
	.progress-wrapper {
		width: 100px;
		height: 100px;
	}

	.ring-icon {
		width: 36px;
		height: 36px;
	}

	.stats-row {
		gap: 1rem;
		padding: 0.625rem 1rem;
	}

	.stat-value {
		font-size: 1.25rem;
	}

	:global(.start-button) {
		width: 100%;
		min-width: unset;
	}
}
</style>
