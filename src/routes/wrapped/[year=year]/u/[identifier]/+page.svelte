<script lang="ts">
import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { afterNavigate, goto, replaceState } from '$app/navigation';
import Logo from '$lib/components/Logo.svelte';
import { createPersonalContext } from '$lib/components/slides/messaging-context';
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

const messagingContext = createPersonalContext();

let showLogoOverride = $state<boolean | null>(null);
let showLogo = $derived(showLogoOverride ?? data.showLogo);

type ViewMode = 'story' | 'scroll';
let viewMode = $state<ViewMode>('story');

// Read the initial slide index from the URL hash. During SSR `browser` is
// false, so this serializes 0; on the client this runs synchronously at $state
// init time (before any effect or afterNavigate), so StoryMode receives the
// deep-linked slide on its very first render. afterNavigate below re-applies the
// hash once as a belt-and-suspenders guard.
function readInitialSlideIndex(): number {
	return browser ? parseSlideHash(window.location.hash, data.slides.length) : 0;
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
		currentSlideIndex = parseSlideHash(window.location.hash, data.slides.length);
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

function handleLogoToggle(): void {
	showLogoOverride = !showLogo;
}
</script>

<svelte:head>
	<title>{data.username}'s Wrapped {data.year} - Obzorarr</title>
	<meta name="description" content="{data.username}'s Year in Review statistics for {data.year}">
</svelte:head>

<div class="wrapped-page">
	{#if showLogo}
		<div class="logo-watermark">
			<Logo size="sm" />
		</div>
	{/if}

	<div class="controls-container">
		{#if data.isOwner && data.canUserControlLogo}
			<!-- ISSUE-006: post to the opaque canonical href (data.currentUrl is the
			     owner's slug/token path) instead of the relative page URL, so the
			     toggleLogo request never carries the internal integer user id. The
			     form only renders for the owner (isOwner above), so currentUrl is
			     always the viewer's own canonical href — never another user's token. -->
			<form
				method="POST"
				action="{data.currentUrl}?/toggleLogo"
				use:enhance={() => {
	handleLogoToggle();
	return async ({ result, update }) => {
		let payload: { showLogo?: boolean } | undefined;
		if (result.type === 'success') {
			payload = result.data as { showLogo?: boolean } | undefined;
			if (typeof payload?.showLogo === 'boolean') {
				showLogoOverride = payload.showLogo;
			}
		} else {
			showLogoOverride = null;
		}
		await update();
		showLogoOverride = null;
	};
}}
			>
				<input type="hidden" name="showLogo" value={!showLogo}>
				<button type="submit" class="logo-toggle" title={showLogo ? 'Hide logo' : 'Show logo'}>
					{#if showLogo}
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					{:else}
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
							<path
								d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
							/>
							<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
							<line x1="2" x2="22" y1="2" y2="22" />
						</svg>
					{/if}
				</button>
			</form>
		{/if}
		{#if data.isOwner || data.isAdmin}
			<button type="button" class="share-toggle" onclick={handleShare}>Share</button>
		{/if}
		{#if data.hasWatchHistory}
			<ModeToggle mode={viewMode} onModeChange={handleModeChange} />
		{/if}
	</div>

	<div class="user-header" class:with-logo={showLogo}>
		<h1 class="user-title">{data.username}'s Year in Review</h1>
		{#if data.visibleToServerMembers}
			<!-- ISSUE-013: quiet owner-only affordance — under the server-members
			     (private-oauth) floor any signed-in member can open this page. -->
			<p class="visibility-note" title="Any signed-in member of this server can view this Wrapped">
				Visible to server members
			</p>
		{/if}
	</div>

	{#if data.availableYears && data.availableYears.length > 1}
		<YearNavigation
			currentYear={data.year}
			availableYears={data.availableYears}
			userIdentifier={data.isOwner || data.isAdmin ? data.userId : null}
			yearIdentifiers={data.yearIdentifiers}
		/>
	{/if}

	{#if showSummary}
		<SummaryPage
			stats={data.stats}
			year={data.year}
			username={data.username}
			onRestart={handleRestart}
			onHome={handleHome}
			onShare={handleShare}
		/>
	{:else if !data.hasWatchHistory}
		<section class="empty-wrapped-state">
			<div class="empty-content">
				<p class="empty-eyebrow">{data.year} Wrapped</p>
				<h2>No viewing history for {data.year} yet</h2>
				<p>Once {data.username} has Plex activity for the year, their Wrapped will appear here.</p>
				<div class="empty-actions">
					<button type="button" class="empty-btn secondary" onclick={handleHome}>Home</button>
					{#if data.isOwner || data.isAdmin}
						<button type="button" class="empty-btn primary" onclick={handleShare}>Share</button>
					{/if}
				</div>
			</div>
		</section>
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
		canonicalUrl={data.canonicalUrl}
		shareSettings={data.shareSettings}
		isOwner={data.isOwner}
		isAdmin={data.isAdmin}
		globalFloor={data.globalFloor}
	/>
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

.controls-container {
	position: fixed;
	top: 1rem;
	right: 1rem;
	z-index: 100;
	display: flex;
	gap: 0.5rem;
	align-items: center;
}

.logo-toggle,
.share-toggle {
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 2rem;
	height: 2rem;
	padding: 0 0.65rem;
	border: none;
	border-radius: 0.375rem;
	background: var(--card);
	color: var(--foreground);
	cursor: pointer;
	opacity: 0.8;
	transition:
		opacity 0.2s,
		background 0.2s;
}

.logo-toggle {
	width: 2rem;
	padding: 0;
}

.share-toggle {
	font-size: 0.8125rem;
	font-weight: 600;
}

.logo-toggle:hover,
.share-toggle:hover {
	opacity: 1;
	background: var(--muted);
}

.user-header {
	position: fixed;
	top: 1rem;
	left: 1rem;
	z-index: 100;
	pointer-events: none;
}

.user-header.with-logo {
	left: 3.5rem;
}

.user-title {
	font-size: 1rem;
	font-weight: 600;
	color: var(--foreground);
	opacity: 0.8;
	margin: 0;
}

.visibility-note {
	font-size: 0.6875rem;
	font-weight: 500;
	color: var(--foreground);
	opacity: 0.55;
	margin: 0.125rem 0 0;
	letter-spacing: 0.01em;
}

.empty-wrapped-state {
	min-height: 100vh;
	/* biome-ignore lint/suspicious/noDuplicateProperties: Keep the vh fallback for browsers without dynamic viewport units. */
	min-height: 100dvh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 6rem 1.5rem 3rem;
	color: var(--foreground);
}

.empty-content {
	width: min(100%, 36rem);
	text-align: center;
}

.empty-eyebrow {
	margin: 0 0 0.75rem;
	font-size: 0.8125rem;
	font-weight: 700;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--muted-foreground);
}

.empty-content h2 {
	margin: 0 0 1rem;
	font-size: clamp(2rem, 8vw, 3.5rem);
	line-height: 1;
}

.empty-content p {
	margin: 0 auto;
	max-width: 30rem;
	color: var(--muted-foreground);
	line-height: 1.6;
}

.empty-actions {
	display: flex;
	justify-content: center;
	gap: 0.75rem;
	margin-top: 1.75rem;
	flex-wrap: wrap;
}

.empty-btn {
	border: none;
	border-radius: 8px;
	padding: 0.75rem 1.1rem;
	font-weight: 700;
	cursor: pointer;
}

.empty-btn.primary {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
}

.empty-btn.secondary {
	background: var(--card);
	color: var(--foreground);
}

@media (prefers-reduced-motion: reduce) {
	.logo-toggle,
	.share-toggle {
		transition: none;
	}
}
</style>
