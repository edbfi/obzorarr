<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '$lib/utils.js';

interface Props {
	children: Snippet;
	class?: string;
	align?: 'end' | 'between';
}

let { children, class: className, align = 'end' }: Props = $props();
</script>

<div class={cn('settings-action-bar', align === 'between' && 'between', className)}>
	{@render children()}
</div>

<style>
.settings-action-bar {
	--settings-action-min-size: 2.5rem;
	--settings-action-padding-inline: 0.8rem;

	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: 0.5rem;
	padding-top: 0.25rem;
}

.settings-action-bar.between {
	justify-content: space-between;
}

:global(.settings-action-bar > form) {
	display: inline-flex;
	margin: 0;
}

:global(.settings-action-bar [data-slot="button"]),
:global(.settings-action-bar button) {
	min-height: var(--settings-action-min-size);
}

:global(.settings-action-bar [data-slot="button"].tap-target),
:global(.settings-action-bar button.tap-target) {
	min-width: var(--settings-action-min-size);
	min-height: var(--settings-action-min-size);
	padding-inline: var(--settings-action-padding-inline);
	font-size: 0.825rem;
}

@media (max-width: 520px) {
	.settings-action-bar {
		align-items: stretch;
	}

	:global(.settings-action-bar > form),
	:global(.settings-action-bar [data-slot="button"]),
	:global(.settings-action-bar button) {
		width: 100%;
	}
}
</style>
