<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLAnchorAttributes } from 'svelte/elements';
import { cn, type WithElementRef } from '$lib/utils.js';

let {
	ref = $bindable(null),
	class: className,
	href = undefined,
	child,
	children,
	...restProps
}: WithElementRef<HTMLAnchorAttributes> & {
	child?: Snippet<[{ props: HTMLAnchorAttributes }]>;
} = $props();

const attrs = $derived({
	'data-slot': 'breadcrumb-link',
	class: cn('hover:text-foreground transition-colors', className),
	href,
	...restProps
});
</script>

{#if child}
	{@render child({ props: attrs })}
{:else}
	<!-- biome-ignore lint/a11y/useValidAnchor: The polymorphic component receives href through its merged props. -->
	<a bind:this={ref} {...attrs}> {@render children?.()} </a>
{/if}
