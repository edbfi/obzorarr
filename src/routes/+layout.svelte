<script lang="ts">
import "../app.css";
import { onMount } from "svelte";
import icon from "#lib/assets/obzorarr-icon.svg";
import type { LayoutProps } from "./$types";

let { children }: LayoutProps = $props();

// A client-side signal that the app has hydrated, for the e2e tests to wait on.
onMount(() => {
	document.documentElement.dataset.hydrated = "";
});
</script>

<svelte:head>
	<link rel="icon" href={icon} type="image/svg+xml">
</svelte:head>

{@render children()}
