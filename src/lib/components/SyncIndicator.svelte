<script lang="ts">
import type { LiveSyncProgress } from '$lib/sync/types';

interface Props {
	inProgress: boolean;
	progress?: LiveSyncProgress | null;
}

let { inProgress, progress = null }: Props = $props();

const statusText = $derived.by(() => {
	if (!inProgress || !progress) return 'Updating data...';

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

	return 'Starting sync...';
});
</script>

{#if inProgress}
	<div class="sync-indicator" role="status" aria-live="polite">
		<span class="sync-spinner" aria-hidden="true"></span>
		<span class="sync-text">{statusText}</span>
	</div>
{/if}

<style>
.sync-indicator {
	position: fixed;
	bottom: 1rem;
	right: 1rem;
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: 0.5rem;
	box-shadow: 0 2px 8px oklch(0 0 0 / 0.2);
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	z-index: 50;
	animation: slideIn 0.3s ease-out;
}

.sync-spinner {
	width: 1rem;
	height: 1rem;
	border: 2px solid oklch(var(--primary) / 0.3);
	border-top-color: oklch(var(--primary));
	border-radius: 50%;
	animation: spin 1s linear infinite;
}

.sync-text {
	font-family: inherit;
	white-space: nowrap;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes slideIn {
	from {
		opacity: 0;
		transform: translateY(1rem);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.sync-spinner {
		animation: none;
		border-style: dotted;
	}

	.sync-indicator {
		animation: none;
	}
}
</style>
