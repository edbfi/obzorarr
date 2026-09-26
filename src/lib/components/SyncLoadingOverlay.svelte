<script lang="ts">
import { prefersReducedMotion } from 'svelte/motion';
import { fade } from 'svelte/transition';
import type { LiveSyncProgress } from '$lib/sync/types';

interface Props {
	visible: boolean;
	progress?: LiveSyncProgress | null;
	syncInProgress?: boolean;
}

let { visible, progress = null, syncInProgress = false }: Props = $props();

const transitionDuration = $derived(prefersReducedMotion.current ? 0 : 300);

const statusText = $derived.by(() => {
	if (!syncInProgress || !progress) {
		return 'Loading your wrapped...';
	}

	if (progress.phase === 'enriching') {
		const percent =
			progress.enrichmentTotal && progress.enrichmentTotal > 0
				? Math.round(((progress.enrichmentProcessed ?? 0) / progress.enrichmentTotal) * 100)
				: 0;
		return `Enriching metadata... ${percent}%`;
	}

	if (progress.recordsProcessed > 0) {
		return `Syncing... ${progress.recordsProcessed} records`;
	}

	return 'Syncing your viewing history...';
});

const secondaryText = $derived.by(() => {
	if (!syncInProgress) {
		return 'Preparing your year in review';
	}
	return 'This may take a moment';
});
</script>

{#if visible}
	<div
		class="sync-loading-overlay"
		role="status"
		aria-live="polite"
		aria-busy="true"
		transition:fade={{ duration: transitionDuration }}
	>
		<div class="loading-content">
			<div class="spinner-container">
				<span class="spinner" aria-hidden="true"></span>
			</div>
			<p class="status-text">{statusText}</p>
			<p class="secondary-text">{secondaryText}</p>
		</div>
	</div>
{/if}

<style>
.sync-loading-overlay {
	position: fixed;
	inset: 0;
	z-index: 200;
	display: flex;
	align-items: center;
	justify-content: center;
	background: oklch(var(--background));
}

.loading-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.5rem;
	text-align: center;
	padding: 2rem;
}

.spinner-container {
	display: flex;
	align-items: center;
	justify-content: center;
}

.spinner {
	width: 3rem;
	height: 3rem;
	border: 3px solid oklch(var(--primary) / 0.2);
	border-top-color: oklch(var(--primary));
	border-radius: 50%;
	animation: spin 1s linear infinite;
}

.status-text {
	font-size: 1.25rem;
	font-weight: 500;
	color: oklch(var(--foreground));
	margin: 0;
}

.secondary-text {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	margin: 0;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.spinner {
		animation: none;
		border-style: dotted;
		border-width: 4px;
	}
}
</style>
