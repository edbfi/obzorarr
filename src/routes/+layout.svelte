<script lang="ts">
import icon from "#lib/assets/obzorarr-icon.svg";
import type { LayoutProps } from "./$types";

let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={icon} type="image/svg+xml" />
</svelte:head>

{@render children()}
