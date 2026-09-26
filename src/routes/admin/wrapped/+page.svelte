<script lang="ts">
import ArrowRight from '@lucide/svelte/icons/arrow-right';
import Palette from '@lucide/svelte/icons/palette';
import Play from '@lucide/svelte/icons/play';
import Server from '@lucide/svelte/icons/server';
import Shield from '@lucide/svelte/icons/shield';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import Sparkles from '@lucide/svelte/icons/sparkles';
import Star from '@lucide/svelte/icons/star';
import { goto } from '$app/navigation';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

function shouldUseClientNavigation(event: MouseEvent): boolean {
	if (!(event.currentTarget instanceof HTMLAnchorElement)) return false;
	if (event.currentTarget.target && event.currentTarget.target !== '_self') return false;
	return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function handleConfigNavigation(event: MouseEvent): void {
	if (!shouldUseClientNavigation(event)) return;
	const href = (event.currentTarget as HTMLAnchorElement).getAttribute('href');
	if (!href) return;

	event.preventDefault();
	void goto(href);
}
</script>

<svelte:head>
	<title>Wrapped - Admin - Obzorarr</title>
</svelte:head>

<div class="wrapped-hub">
	<div class="ambient-glow amber"></div>
	<div class="ambient-glow cyan"></div>

	<header class="hero-header">
		<div class="hero-content">
			<div class="year-badge">
				<Sparkles class="sparkle-icon" />
				<span>Year in Review</span>
			</div>
			<h1 class="hero-title">
				<span class="year-display">{data.year}</span>
				<span class="title-text">Wrapped</span>
			</h1>
			<p class="hero-subtitle">Preview Wrapped pages and configure how they look</p>
			{#if data.availableYears.length > 0}
				<form method="GET" class="year-form">
					<select
						name="year"
						class="year-selector"
						aria-label="Select Wrapped year"
						disabled={data.availableYears.length === 1}
						title={data.availableYears.length === 1 ? 'Only one year of data available' : undefined}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						{#each data.availableYears as yr}
							<option value={yr} selected={yr === data.year}>{yr}</option>
						{/each}
					</select>
					{#if data.availableYears.length === 1}
						<p class="year-selector-hint">Only one year of data available</p>
					{/if}
					<noscript><button type="submit" class="year-submit">Go</button></noscript>
				</form>
			{/if}
		</div>
		<div class="hero-decoration">
			<div class="floating-ring ring-1"></div>
			<div class="floating-ring ring-2"></div>
			<div class="floating-ring ring-3"></div>
		</div>
	</header>

	<section class="wrapped-showcase">
		<div class="section-label">
			<Play class="section-icon" />
			<span>View Wrapped</span>
		</div>

		<div class="wrapped-cards">
			{#if data.wrappedHref}
				<a href={data.wrappedHref} class="showcase-card personal">
					<div class="card-glow"></div>
					<div class="card-shimmer"></div>
					<div class="card-content">
						<div class="card-icon-wrap">
							<Star class="card-icon" />
						</div>
						<div class="card-text">
							<h2 class="card-title">My Wrapped</h2>
							<p class="card-description">Your own viewing stats for {data.year}</p>
						</div>
						<div class="card-cta">
							<span class="cta-text">View your story</span>
							<ArrowRight class="cta-arrow" />
						</div>
					</div>
					<div class="card-accent"></div>
				</a>
			{/if}

			<a href="/wrapped/{data.year}" class="showcase-card server">
				<div class="card-glow"></div>
				<div class="card-shimmer"></div>
				<div class="card-content">
					<div class="card-icon-wrap">
						<Server class="card-icon" />
					</div>
					<div class="card-text">
						<h2 class="card-title">Server Wrapped</h2>
						<p class="card-description">Combined viewing stats for everyone on the server</p>
					</div>
					<div class="card-cta">
						<span class="cta-text">View the recap</span>
						<ArrowRight class="cta-arrow" />
					</div>
				</div>
				<div class="card-accent"></div>
			</a>
		</div>
	</section>

	<section class="config-section">
		<div class="section-label">
			<SlidersHorizontal class="section-icon" />
			<span>Configuration</span>
		</div>

		<div class="config-grid">
			<a href="/admin/slides" class="config-card" onclick={handleConfigNavigation}>
				<div class="config-icon-wrap">
					<SlidersHorizontal class="config-icon" />
				</div>
				<div class="config-content">
					<span class="config-title">Slide Configuration</span>
					<span class="config-desc">Reorder, enable/disable, and create custom slides</span>
				</div>
				<ArrowRight class="config-arrow" />
			</a>

			<a href="/admin/settings?tab=privacy" class="config-card" onclick={handleConfigNavigation}>
				<div class="config-icon-wrap">
					<Shield class="config-icon" />
				</div>
				<div class="config-content">
					<span class="config-title">Privacy & Sharing</span>
					<span class="config-desc">Configure sharing defaults and privacy settings</span>
				</div>
				<ArrowRight class="config-arrow" />
			</a>

			<a href="/admin/settings?tab=appearance" class="config-card" onclick={handleConfigNavigation}>
				<div class="config-icon-wrap">
					<Palette class="config-icon" />
				</div>
				<div class="config-content">
					<span class="config-title">Display Settings</span>
					<span class="config-desc">Theme and logo visibility</span>
				</div>
				<ArrowRight class="config-arrow" />
			</a>
		</div>
	</section>
</div>

<style>
.wrapped-hub {
	position: relative;
	max-width: 1000px;
	margin: 0 auto;
	padding: 1.5rem 2rem 3rem;
	overflow: hidden;
}

.year-form {
	display: contents;
}

.year-selector {
	padding: 0.5rem 0.75rem;
	background: oklch(var(--input));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	color: oklch(var(--foreground));
	font-size: 0.875rem;
	cursor: pointer;
	margin-top: 1rem;
}

.year-selector:focus {
	outline: none;
	border-color: oklch(var(--ring));
	box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
}

.year-selector:disabled {
	cursor: default;
	opacity: 0.75;
}

.year-selector-hint {
	margin: 0.375rem 0 0;
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
}

.ambient-glow {
	position: absolute;
	width: 500px;
	height: 500px;
	border-radius: 50%;
	filter: blur(120px);
	opacity: 0.12;
	pointer-events: none;
	animation: ambientPulse 8s ease-in-out infinite;
	/* Defensive: hold the 0% keyframe during the cyan blob's 4s delay so it
			   can't flash from its static default before the pulse begins. */
	animation-fill-mode: backwards;
}

.ambient-glow.amber {
	top: -200px;
	left: -150px;
	background: oklch(0.7697 0.1645 70.61);
	animation-delay: 0s;
}

.ambient-glow.cyan {
	bottom: -200px;
	right: -150px;
	background: oklch(0.7986 0.1344 185.85);
	animation-delay: 4s;
}

.hero-header {
	position: relative;
	text-align: center;
	padding: 2rem 0 3rem;
	margin-bottom: 2rem;
}

.hero-content {
	position: relative;
	z-index: 1;
}

.year-badge {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	background: oklch(var(--primary) / 0.1);
	border: 1px solid oklch(var(--primary) / 0.2);
	border-radius: 9999px;
	font-size: 0.8125rem;
	font-weight: 600;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.08em;
	margin-bottom: 1.25rem;
	animation: fadeSlideDown 0.6s ease backwards;
}

.year-badge :global(.sparkle-icon) {
	width: 1rem;
	height: 1rem;
	animation: sparkle 2s ease-in-out infinite;
}

.hero-title {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	margin: 0 0 1rem;
	animation: fadeSlideDown 0.6s ease 0.1s backwards;
}

.year-display {
	font-size: 4.5rem;
	font-weight: 900;
	letter-spacing: -0.04em;
	line-height: 1;
	background: linear-gradient(
		135deg,
		oklch(0.8092 0.1503 76.61) 0%,
		oklch(var(--primary)) 50%,
		oklch(0.813 0.1296 186.59) 100%
	);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
	filter: drop-shadow(0 4px 12px oklch(var(--primary) / 0.3));
}

.title-text {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--foreground));
	letter-spacing: -0.02em;
}

.hero-subtitle {
	font-size: 1rem;
	color: oklch(var(--muted-foreground));
	max-width: 400px;
	margin: 0 auto;
	animation: fadeSlideDown 0.6s ease 0.2s backwards;
}

.hero-decoration {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 300px;
	height: 300px;
	pointer-events: none;
}

.floating-ring {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	border-radius: 50%;
	border: 1px solid oklch(var(--primary) / 0.1);
	animation: ringExpand 4s ease-in-out infinite;
	/* Hold the 0% keyframe (scale 0.8, opacity 0) during each ring's
			   animation-delay window instead of the static visible default — kills
			   the "two big rings stuck, then breathe" flash on the staggered rings. */
	animation-fill-mode: backwards;
}

.ring-1 {
	width: 200px;
	height: 200px;
	animation-delay: 0s;
}

.ring-2 {
	width: 280px;
	height: 280px;
	animation-delay: 1.3s;
}

.ring-3 {
	width: 360px;
	height: 360px;
	animation-delay: 2.6s;
}

.section-label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.75rem;
	font-weight: 600;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
	margin-bottom: 1rem;
}

.section-label :global(.section-icon) {
	width: 1rem;
	height: 1rem;
	opacity: 0.7;
}

.wrapped-showcase {
	margin-bottom: 2.5rem;
	animation: fadeIn 0.6s ease 0.3s backwards;
}

.wrapped-cards {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 1.25rem;
}

.showcase-card {
	position: relative;
	display: flex;
	flex-direction: column;
	padding: 2rem;
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: 1rem;
	text-decoration: none;
	overflow: hidden;
	transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	min-height: 220px;
}

.showcase-card:hover {
	transform: translateY(-6px);
	box-shadow:
		0 20px 40px -12px oklch(var(--primary) / 0.2),
		0 0 0 1px oklch(var(--primary) / 0.15);
}

.card-glow {
	position: absolute;
	top: -100%;
	left: 50%;
	transform: translateX(-50%);
	width: 300px;
	height: 300px;
	border-radius: 50%;
	opacity: 0;
	transition: opacity 0.4s ease;
	pointer-events: none;
}

.showcase-card.personal .card-glow {
	background: radial-gradient(circle, oklch(0.7697 0.1645 70.61 / 0.25) 0%, transparent 70%);
}

.showcase-card.server .card-glow {
	background: radial-gradient(circle, oklch(0.7986 0.1344 185.85 / 0.25) 0%, transparent 70%);
}

.showcase-card:hover .card-glow {
	opacity: 1;
}

.card-shimmer {
	position: absolute;
	top: 0;
	left: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(
		90deg,
		transparent 0%,
		oklch(var(--foreground) / 0.03) 50%,
		transparent 100%
	);
	transition: left 0.6s ease;
	pointer-events: none;
}

.showcase-card:hover .card-shimmer {
	left: 100%;
}

.card-content {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	height: 100%;
}

.card-icon-wrap {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 3.5rem;
	height: 3.5rem;
	border-radius: 0.875rem;
	margin-bottom: 1.25rem;
	transition: all 0.3s ease;
}

.showcase-card.personal .card-icon-wrap {
	background: linear-gradient(
		135deg,
		oklch(0.7697 0.1645 70.61 / 0.2) 0%,
		oklch(0.6526 0.1387 71.11 / 0.1) 100%
	);
	box-shadow: 0 4px 16px -4px oklch(0.7697 0.1645 70.61 / 0.3);
}

.showcase-card.server .card-icon-wrap {
	background: linear-gradient(
		135deg,
		oklch(0.7986 0.1344 185.85 / 0.2) 0%,
		oklch(0.6765 0.1132 185.95 / 0.1) 100%
	);
	box-shadow: 0 4px 16px -4px oklch(0.7986 0.1344 185.85 / 0.3);
}

.showcase-card:hover .card-icon-wrap {
	transform: scale(1.1);
}

.showcase-card :global(.card-icon) {
	width: 1.75rem;
	height: 1.75rem;
}

.showcase-card.personal :global(.card-icon) {
	color: oklch(0.8092 0.1503 76.61);
}

.showcase-card.server :global(.card-icon) {
	color: oklch(0.813 0.1296 186.59);
}

.card-text {
	flex: 1;
}

.card-title {
	font-size: 1.375rem;
	font-weight: 700;
	color: oklch(var(--foreground));
	margin: 0 0 0.5rem;
	letter-spacing: -0.02em;
}

.card-description {
	font-size: 0.9375rem;
	color: oklch(var(--muted-foreground));
	margin: 0;
	line-height: 1.5;
}

.card-cta {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-top: 1.5rem;
	padding-top: 1rem;
	border-top: 1px solid oklch(var(--border) / 0.5);
}

.cta-text {
	font-size: 0.875rem;
	font-weight: 600;
	transition: color 0.2s ease;
}

.showcase-card.personal .cta-text {
	color: oklch(0.8092 0.1503 76.61);
}

.showcase-card.server .cta-text {
	color: oklch(0.813 0.1296 186.59);
}

.showcase-card :global(.cta-arrow) {
	width: 1rem;
	height: 1rem;
	transition: transform 0.2s ease;
}

.showcase-card.personal :global(.cta-arrow) {
	color: oklch(0.8092 0.1503 76.61);
}

.showcase-card.server :global(.cta-arrow) {
	color: oklch(0.813 0.1296 186.59);
}

.showcase-card:hover :global(.cta-arrow) {
	transform: translateX(4px);
}

.card-accent {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 3px;
	opacity: 0;
	transition: opacity 0.3s ease;
}

.showcase-card.personal .card-accent {
	background: linear-gradient(90deg, oklch(0.7697 0.1645 70.61), oklch(0.8092 0.1503 76.61));
}

.showcase-card.server .card-accent {
	background: linear-gradient(90deg, oklch(0.7382 0.124 185.9), oklch(0.813 0.1296 186.59));
}

.showcase-card:hover .card-accent {
	opacity: 1;
}

.config-section {
	animation: fadeIn 0.6s ease 0.4s backwards;
}

.config-grid {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.config-card {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1rem 1.25rem;
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: 0.75rem;
	text-decoration: none;
	transition: all 0.25s ease;
}

.config-card:hover {
	background: oklch(var(--primary) / 0.05);
	border-color: oklch(var(--primary) / 0.3);
	transform: translateX(4px);
}

.config-icon-wrap {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2.5rem;
	height: 2.5rem;
	background: oklch(var(--secondary));
	border-radius: 0.625rem;
	flex-shrink: 0;
	transition: all 0.25s ease;
}

.config-card:hover .config-icon-wrap {
	background: oklch(var(--primary) / 0.15);
}

.config-card :global(.config-icon) {
	width: 1.125rem;
	height: 1.125rem;
	color: oklch(var(--muted-foreground));
	transition: color 0.25s ease;
}

.config-card:hover :global(.config-icon) {
	color: oklch(var(--primary));
}

.config-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.config-title {
	font-size: 0.9375rem;
	font-weight: 600;
	color: oklch(var(--foreground));
}

.config-desc {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
}

.config-card :global(.config-arrow) {
	width: 1rem;
	height: 1rem;
	color: oklch(var(--muted-foreground) / 0.5);
	transition: all 0.25s ease;
}

.config-card:hover :global(.config-arrow) {
	color: oklch(var(--primary));
	transform: translateX(2px);
}

@keyframes ambientPulse {
	0%,
	100% {
		opacity: 0.12;
		transform: scale(1);
	}
	50% {
		opacity: 0.18;
		transform: scale(1.1);
	}
}

@keyframes fadeSlideDown {
	from {
		opacity: 0;
		transform: translateY(-16px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes fadeIn {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

@keyframes ringExpand {
	0%,
	100% {
		transform: translate(-50%, -50%) scale(0.8);
		opacity: 0;
	}
	50% {
		transform: translate(-50%, -50%) scale(1);
		opacity: 0.15;
	}
}

@keyframes sparkle {
	0%,
	100% {
		transform: scale(1) rotate(0deg);
	}
	50% {
		transform: scale(1.2) rotate(15deg);
	}
}

/* Reduced motion: this page's scoped animations are NOT covered by the global
		   block in app.css (which only targets .text-shimmer/.glow-pulse/.breathe/
		   .float), so they previously ran unconditionally. Disable them and pin each
		   element to a calm, visible end state — never leaving anything stuck at an
		   invisible 0%/backwards keyframe. */
@media (prefers-reduced-motion: reduce) {
	.floating-ring {
		animation: none;
		opacity: 0.12;
		transform: translate(-50%, -50%) scale(1);
	}

	.ambient-glow {
		animation: none;
	}

	.year-badge,
	.hero-title,
	.hero-subtitle,
	.wrapped-showcase,
	.config-section {
		animation: none;
		opacity: 1;
		transform: none;
	}

	.year-badge :global(.sparkle-icon) {
		animation: none;
	}
}

@media (max-width: 768px) {
	.wrapped-hub {
		padding: 1rem 1.25rem 2rem;
	}

	.hero-header {
		padding: 1.5rem 0 2rem;
	}

	.year-display {
		font-size: 3.5rem;
	}

	.title-text {
		font-size: 1.5rem;
	}

	.hero-decoration {
		display: none;
	}

	.wrapped-cards {
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	.showcase-card {
		min-height: auto;
		padding: 1.5rem;
	}

	.card-icon-wrap {
		width: 3rem;
		height: 3rem;
	}

	.showcase-card :global(.card-icon) {
		width: 1.5rem;
		height: 1.5rem;
	}

	.card-title {
		font-size: 1.25rem;
	}

	.card-description {
		font-size: 0.875rem;
	}

	.ambient-glow {
		width: 300px;
		height: 300px;
	}
}

@media (max-width: 480px) {
	.wrapped-hub {
		padding: 0.75rem 1rem 1.5rem;
	}

	.year-badge {
		padding: 0.375rem 0.75rem;
		font-size: 0.6875rem;
	}

	.year-display {
		font-size: 2.75rem;
	}

	.title-text {
		font-size: 1.25rem;
	}

	.hero-subtitle {
		font-size: 0.875rem;
	}

	.showcase-card {
		padding: 1.25rem;
	}

	.config-card {
		padding: 0.875rem 1rem;
	}

	.config-title {
		font-size: 0.875rem;
	}

	.config-desc {
		font-size: 0.75rem;
	}
}
</style>
