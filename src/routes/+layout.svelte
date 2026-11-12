<script lang="ts">
import "../app.css";
// The bundled fonts (DESIGN.md: no remote font requests). Each variable package's default CSS holds
// every subset behind `unicode-range`; Plex Mono is static, so only its two weights.
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
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
