<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '$lib/utils.js';

interface Props {
	children: Snippet;
	tone?: 'neutral' | 'success' | 'warning' | 'danger';
	class?: string;
	id?: string;
}

let { children, tone = 'neutral', class: className, id }: Props = $props();
</script>

<span {id} class={cn('settings-status-pill', tone, className)}> {@render children()} </span>

<style>
.settings-status-pill {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 4.25rem;
	padding: 0.18rem 0.5rem;
	border-radius: 999px;
	border: 1px solid oklch(var(--border));
	background: oklch(var(--muted) / 0.45);
	color: oklch(var(--muted-foreground));
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	line-height: 1.2;
	text-transform: uppercase;
	white-space: nowrap;
}

.settings-status-pill.success {
	border-color: oklch(0.72 0.16 150 / 0.35);
	background: oklch(0.72 0.16 150 / 0.12);
	color: oklch(0.78 0.17 150);
}

.settings-status-pill.warning {
	border-color: oklch(0.78 0.15 78 / 0.35);
	background: oklch(0.78 0.15 78 / 0.12);
	color: oklch(0.82 0.16 78);
}

.settings-status-pill.danger {
	border-color: oklch(var(--destructive) / 0.35);
	background: oklch(var(--destructive) / 0.12);
	color: oklch(var(--destructive));
}
</style>
