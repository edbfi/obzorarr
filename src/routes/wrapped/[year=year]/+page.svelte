<script lang="ts">
import { browser } from '$app/environment';
import { afterNavigate, goto, replaceState } from '$app/navigation';
import Logo from '$lib/components/Logo.svelte';
import { createServerContext } from '$lib/components/slides/messaging-context';
import {
	ModeToggle,
	ScrollMode,
	ShareModal,
	StoryMode,
	SummaryPage,
	YearNavigation
} from '$lib/components/wrapped';
import { parseSlideHash } from '$lib/utils/slide-hash';
import type { PageProps } from './$types';

let { data }: PageProps = $props();

const messagingContext = $derived(createServerContext(data.hasData ? data.serverName : null));

type ViewMode = 'story' | 'scroll';
let viewMode = $state<ViewMode>('story');

// Read the initial slide index from the URL hash. During SSR `browser` is
// false, so this serializes 0; on the client this runs synchronously at $state
// init time (before any effect or afterNavigate), so StoryMode receives the
// deep-linked slide on its very first render. afterNavigate below re-applies the
// hash once as a belt-and-suspenders guard.
function readInitialSlideIndex(): number {
	if (!browser || !data.hasData) return 0;
	return parseSlideHash(window.location.hash, data.slides.length);
}

let currentSlideIndex = $state(readInitialSlideIndex());

let showSummary = $state(false);

let showShareModal = $state(false);

let storyKey = $state(0);

// SvelteKit's replaceState throws "replaceState() called before router was
// initialized" if invoked before the first afterNavigate tick. Gate the hash
// sync on this flag to avoid the error during hydration.
let routerReady = $state(false);
// One-shot guard for the deep-link seed. The synchronous readInitialSlideIndex()
// above is the primary seed; this re-applies the hash exactly once in
// afterNavigate (which fires after StoryMode mounts) to cover cases where the
// hash only becomes available post-navigation, then marks it seeded so the
// hash-sync effect below can arm without clobbering the deep link.
let hashSeeded = $state(false);
afterNavigate(() => {
	if (!hashSeeded) {
		currentSlideIndex = data.hasData ? parseSlideHash(window.location.hash, data.slides.length) : 0;
		hashSeeded = true;
	}
	routerReady = true;
});

// Use replaceState so slide navigation does not pollute the browser Back stack.
// Gated on hashSeeded so its first run sees currentSlideIndex already equal to
// the deep-linked slide (no transient replaceState back to #slide=0).
$effect(() => {
	if (!browser || !routerReady || !hashSeeded) return;
	const next = `#slide=${currentSlideIndex}`;
	if (window.location.hash !== next) {
		const url = new URL(window.location.href);
		url.hash = next;
		replaceState(url, {});
	}
});

function handleModeChange(newMode: ViewMode): void {
	viewMode = newMode;
}

function handleScrollModeSwitch(slideIndex: number): void {
	currentSlideIndex = slideIndex;
	viewMode = 'story';
}

function handleComplete(): void {
	showSummary = true;
}

function handleClose(): void {
	let sameOrigin = false;
	if (document.referrer) {
		try {
			sameOrigin = new URL(document.referrer).origin === window.location.origin;
		} catch {
			sameOrigin = false;
		}
	}
	if (sameOrigin && window.history.length > 1) {
		window.history.back();
	} else {
		goto('/');
	}
}

function handleRestart(): void {
	showSummary = false;
	viewMode = 'story';
	currentSlideIndex = 0;
	// Clear the hash before remount so StoryMode does not seed itself from the
	// stale summary slide index.
	if (browser && routerReady) {
		const url = new URL(window.location.href);
		url.hash = '#slide=0';
		replaceState(url, {});
	}
	storyKey++;
}

function handleHome(): void {
	if (data.isAdmin) {
		goto('/admin');
	} else if (data.isLoggedIn) {
		goto('/dashboard');
	} else {
		goto('/');
	}
}

function handleShare(): void {
	showShareModal = true;
}
</script>

<svelte:head>
	<title>Server Wrapped {data.year} - Obzorarr</title>
	<meta name="description" content="Year in Review statistics for {data.year}">
</svelte:head>

<div class="wrapped-page">
	{#if !data.hasData}
		<!-- ISSUE-003: an authorized viewer reached an in-range year with no synced
		recap yet. Friendly empty state (HTTP 200) instead of the old hard 404. -->
		{#if data.availableYears && data.availableYears.length > 0}
			<YearNavigation currentYear={data.year} availableYears={data.availableYears} />
		{/if}
		<div class="empty-state">
			<div class="empty-card">
				<h1>No {data.year} data yet</h1>
				<p>
					There's no Wrapped recap for {data.year} yet. It appears here once a sync has imported
					viewing history for that year.
				</p>
				<div class="empty-actions">
					<button type="button" class="btn secondary" onclick={handleClose}>Go back</button>
					<button type="button" class="btn primary" onclick={handleHome}>Home</button>
				</div>
			</div>
		</div>
	{:else}
		{#if data.showLogo}
			<div class="logo-watermark">
				<Logo size="sm" />
			</div>
		{/if}

		<div class="mode-toggle-container">
			<ModeToggle mode={viewMode} onModeChange={handleModeChange} />
		</div>

		{#if data.availableYears && data.availableYears.length > 1}
			<YearNavigation currentYear={data.year} availableYears={data.availableYears} />
		{/if}

		{#if showSummary}
			<SummaryPage
				stats={data.stats}
				year={data.year}
				onRestart={handleRestart}
				onHome={handleHome}
				onShare={handleShare}
			/>
		{:else if viewMode === 'story'}
			{#key storyKey}
				<StoryMode
					stats={data.stats}
					slides={data.slides}
					customSlides={data.customSlidesMap}
					initialSlideIndex={currentSlideIndex}
					onSlideChange={(index) => (currentSlideIndex = index)}
					onComplete={handleComplete}
					onClose={handleClose}
					{messagingContext}
				/>
			{/key}
		{:else}
			<ScrollMode
				stats={data.stats}
				slides={data.slides}
				customSlides={data.customSlidesMap}
				initialSlideIndex={currentSlideIndex}
				onModeSwitch={handleScrollModeSwitch}
				onClose={handleClose}
				{messagingContext}
			/>
		{/if}

		<ShareModal
			bind:open={showShareModal}
			onOpenChange={(v) => (showShareModal = v)}
			currentUrl={data.currentUrl}
			isOwner={false}
			isAdmin={data.isAdmin}
			isServerWrapped={true}
		/>
	{/if}
</div>

<style>
.wrapped-page {
	position: relative;
	width: 100%;
	min-height: 100vh;
	/* biome-ignore lint/suspicious/noDuplicateProperties: Keep the vh fallback for browsers without dynamic viewport units. */
	min-height: 100dvh;
	background: var(
		--slide-bg-gradient,
		linear-gradient(135deg, oklch(var(--slide-bg-start)) 0%, oklch(var(--slide-bg-end)) 100%)
	);
}

.logo-watermark {
	position: fixed;
	top: 1rem;
	left: 1rem;
	z-index: 99;
	opacity: 0.8;
	pointer-events: none;
}

.mode-toggle-container {
	position: fixed;
	top: 1rem;
	right: 1rem;
	z-index: 100;
}

.empty-state {
	position: relative;
	z-index: 1;
	min-height: 100vh;
	/* biome-ignore lint/suspicious/noDuplicateProperties: Keep the vh fallback for browsers without dynamic viewport units. */
	min-height: 100dvh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 2rem;
}

.empty-card {
	max-width: 480px;
	width: 100%;
	text-align: center;
	background: oklch(var(--card));
	border: 1px solid oklch(var(--border));
	border-radius: var(--radius);
	padding: 2.5rem 2rem;
}

.empty-card h1 {
	font-size: 1.5rem;
	font-weight: 600;
	margin: 0 0 0.75rem;
	color: oklch(var(--foreground));
}

.empty-card p {
	color: oklch(var(--muted-foreground));
	margin: 0 0 2rem;
	line-height: 1.5;
}

.empty-actions {
	display: flex;
	gap: 0.75rem;
	justify-content: center;
	flex-wrap: wrap;
}

.btn {
	padding: 0.625rem 1.25rem;
	border-radius: var(--radius);
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
	border: 1px solid oklch(var(--border));
	transition: opacity 0.15s ease;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	line-height: 1;
}

.btn:hover {
	opacity: 0.85;
}

.btn.primary {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	border-color: oklch(var(--primary));
}

.btn.secondary {
	background: oklch(var(--muted));
	color: oklch(var(--foreground));
}
</style>
