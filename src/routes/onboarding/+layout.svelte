<script lang="ts">
import { animate } from 'motion';
import type { Snippet } from 'svelte';
import Logo from '$lib/components/Logo.svelte';
import StepIndicator from '$lib/components/onboarding/StepIndicator.svelte';
import { loadThemeFonts } from '$lib/utils/theme-fonts';
import type { LayoutData } from './$types';

let { data, children }: { data: LayoutData; children: Snippet } = $props();

let logoRef: HTMLElement | undefined = $state();
let contentRef: HTMLElement | undefined = $state();

const themeClass = $derived(`theme-${data.uiTheme ?? 'modern-minimal'}`);

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

$effect(() => {
	document.body.classList.remove(...themeClasses);

	document.body.classList.add(themeClass);

	document.body.classList.add('onboarding-route');

	loadThemeFonts(data.uiTheme ?? 'modern-minimal');

	return () => {
		document.body.classList.remove('onboarding-route');
	};
});

$effect(() => {
	if (!logoRef) return;

	// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads
	(animate as any)(
		logoRef,
		{ opacity: [0, 1], transform: ['translateY(-20px)', 'translateY(0)'] },
		{ duration: 0.8, easing: [0.22, 1, 0.36, 1] }
	);
});
</script>

<svelte:head>
	<title>Setup - Obzorarr</title>
	<meta name="description" content="Set up Obzorarr for your Plex server">
</svelte:head>

<div class="onboarding-layout">
	<div class="bg-gradient"></div>
	<div class="bg-noise"></div>
	<div class="bg-vignette"></div>

	<div class="onboarding-container">
		<header bind:this={logoRef} class="onboarding-header">
			<div class="logo-wrapper">
				<Logo size="md" class="logo" />
				<span class="logo-text">Obzorarr</span>
			</div>
			<p class="setup-label">Initial Setup</p>
		</header>

		<div class="step-indicator-wrapper">
			<StepIndicator steps={data.steps} currentStep={data.currentStepIndex} />
		</div>

		<main bind:this={contentRef} class="onboarding-content">
			{@render children()}
		</main>

		<footer class="onboarding-footer">
			<p>Your Plex viewing history, wrapped for the year.</p>
		</footer>
	</div>
</div>

<style>
.onboarding-layout {
	min-height: 100vh;
	/* biome-ignore lint/suspicious/noDuplicateProperties: Keep the vh fallback for browsers without dynamic viewport units. */
	min-height: 100dvh;
	width: 100%;
	position: relative;
	overflow-x: clip;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	background: oklch(var(--background));
}

.bg-gradient {
	position: fixed;
	inset: 0;
	background:
		radial-gradient(ellipse 80% 50% at 50% 0%, oklch(var(--primary) / 0.08) 0%, transparent 50%),
		radial-gradient(ellipse 60% 40% at 20% 80%, oklch(var(--primary) / 0.05) 0%, transparent 40%),
		radial-gradient(ellipse 60% 40% at 80% 80%, oklch(var(--accent) / 0.03) 0%, transparent 40%),
		linear-gradient(180deg, oklch(var(--background)) 0%, oklch(var(--card)) 100%);
	z-index: 0;
	pointer-events: none;
}

.bg-noise {
	position: fixed;
	inset: 0;
	background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
	opacity: 0.025;
	z-index: 1;
	pointer-events: none;
}

.bg-vignette {
	position: fixed;
	inset: 0;
	background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.4) 100%);
	z-index: 2;
	pointer-events: none;
}

.onboarding-container {
	position: relative;
	z-index: 10;
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 2rem 1.5rem;
	max-width: 800px;
	margin: 0 auto;
	width: 100%;
}

.onboarding-header {
	text-align: center;
	margin-bottom: 2.5rem;
	opacity: 0;
}

.logo-wrapper {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	margin-bottom: 0.5rem;
}

.logo-text {
	font-size: 1.75rem;
	font-weight: 700;
	letter-spacing: -0.03em;
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.7) 100%);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
}

.setup-label {
	font-size: 0.75rem;
	font-weight: 500;
	letter-spacing: 0.15em;
	text-transform: uppercase;
	color: oklch(var(--primary) / 0.7);
	margin: 0;
}

.step-indicator-wrapper {
	width: 100%;
	max-width: 600px;
	margin-bottom: 2.5rem;
}

.onboarding-content {
	flex: 1;
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.onboarding-footer {
	margin-top: 3rem;
	padding-top: 2rem;
	text-align: center;
}

.onboarding-footer p {
	font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.3);
	margin: 0;
	letter-spacing: 0.02em;
}

@media (max-width: 640px) {
	.onboarding-container {
		padding: 1.5rem 1rem;
	}

	.onboarding-header {
		margin-bottom: 2rem;
	}

	.logo-text {
		font-size: 1.5rem;
	}

	.step-indicator-wrapper {
		margin-bottom: 2rem;
	}

	.onboarding-footer {
		margin-top: 2rem;
		padding-top: 1.5rem;
	}
}
</style>
