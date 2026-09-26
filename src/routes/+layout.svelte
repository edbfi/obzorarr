<script lang="ts">
import 'virtual:uno.css';
import '../app.css';
import { Toaster } from 'svelte-sonner';
import { page } from '$app/stores';
import obzorarrIcon from '$lib/assets/obzorarr-icon.svg';
import { loadThemeFonts } from '$lib/utils/theme-fonts';

let { children } = $props();

const isWrappedRoute = $derived($page.url?.pathname?.startsWith('/wrapped') ?? false);

const effectiveTheme = $derived.by(() => {
	const data = $page.data as { wrappedTheme?: string; uiTheme?: string };
	if (isWrappedRoute && data.wrappedTheme) {
		return data.wrappedTheme;
	}
	return data.uiTheme ?? 'modern-minimal';
});
const themeClass = $derived(`theme-${effectiveTheme}`);

$effect(() => {
	const themeClasses = [
		'theme-modern-minimal',
		'theme-supabase',
		'theme-doom-64',
		'theme-amber-minimal',
		'theme-soviet-red',
		'theme-obsidian-premium',
		'theme-aurora-premium',
		'theme-champagne-premium'
	];

	document.body.classList.remove(...themeClasses);

	document.body.classList.add(themeClass);

	// The pre-paint script prevents FOUC; live theme changes must update the same attribute.
	document.documentElement.setAttribute('data-theme', effectiveTheme);

	if (isWrappedRoute) {
		document.body.classList.add('wrapped-route');
	} else {
		document.body.classList.remove('wrapped-route');
	}

	loadThemeFonts(effectiveTheme);
});
</script>

<svelte:head>
	<link rel="icon" href={obzorarrIcon}>
	<title>Obzorarr - Year in Review</title>
</svelte:head>

{@render children()}

<Toaster position="top-right" richColors closeButton duration={4000} />
