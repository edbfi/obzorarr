<script lang="ts">
interface Props {
	current: number;
	total: number;
	class?: string;
}

let { current, total, class: klass = '' }: Props = $props();
</script>

<div
	class="progress-bar {klass}"
	role="progressbar"
	aria-valuenow={current + 1}
	aria-valuemin={1}
	aria-valuemax={total}
>
	<div class="segments">
		{#each Array(total) as _, index}
			<div
				class="segment"
				class:completed={index < current}
				class:active={index === current}
				class:pending={index > current}
			></div>
		{/each}
	</div>
	<span class="sr-only">{current + 1} of {total} slides</span>
</div>

<style>
.progress-bar {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 100;
	padding: 0.5rem 1rem;
	background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), transparent);
}

.segments {
	display: flex;
	gap: 0.25rem;
	height: 3px;
}

.segment {
	flex: 1;
	border-radius: 1.5px;
	transition:
		background-color 0.3s ease,
		opacity 0.3s ease;
}

.segment.completed {
	background-color: oklch(var(--primary));
	opacity: 1;
}

.segment.active {
	background-color: oklch(var(--primary));
	opacity: 1;
	animation: pulse 2s ease-in-out infinite;
}

.segment.pending {
	background-color: oklch(var(--muted) / 0.3);
	opacity: 0.5;
}

@keyframes pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.7;
	}
}

@media (prefers-reduced-motion: reduce) {
	.segment {
		transition: none;
	}

	.segment.active {
		animation: none;
	}
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 768px) {
	.progress-bar {
		padding: 0.375rem 0.75rem;
	}

	.segments {
		height: 2px;
		gap: 0.125rem;
	}
}
</style>
