<script lang="ts">
import { animate, stagger } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import type { ServerStats, UserStats } from '$lib/stats/types';
import { hasWatchHistory, isServerStats, isUserStats } from '$lib/stats/types';
import { DELAY_PRESETS, SPRING_PRESETS, STAGGER_PRESETS } from '$lib/utils/animation-presets';

interface Props {
	stats: UserStats | ServerStats;
	year: number;
	username?: string;
	onRestart: () => void;
	onHome: () => void;
	onShare: () => void;
	class?: string;
}

let { stats, year, username, onRestart, onHome, onShare, class: klass = '' }: Props = $props();

const hasHistory = $derived(hasWatchHistory(stats));
const hours = $derived(Math.floor(stats.totalWatchTimeMinutes / 60));
const topMovie = $derived(stats.topMovies[0]?.title ?? null);
const topShow = $derived(stats.topShows[0]?.title ?? null);
const topGenre = $derived(stats.topGenres[0]?.title ?? null);
const percentile = $derived(isUserStats(stats) ? stats.percentileRank : null);
const totalUsers = $derived(isServerStats(stats) ? stats.totalUsers : null);
const bingeHours = $derived(
	stats.longestBinge ? Math.round(stats.longestBinge.totalMinutes / 60) : null
);
const bingeEpisodes = $derived(stats.longestBinge?.plays ?? null);

let container: HTMLElement | undefined = $state();
let header: HTMLElement | undefined = $state();
let title: HTMLElement | undefined = $state();
let statsGrid: HTMLElement | undefined = $state();
let statCards: HTMLElement[] = $state([]);
let buttonsRow: HTMLElement | undefined = $state();

// Swallow leftover slideshow left/right-arrow keys so a user mashing
// them past the end of StoryMode cannot accidentally trigger slide
// navigation while focus is on a non-interactive element.
// ArrowUp/ArrowDown and Space are intentionally NOT trapped so the
// browser can still scroll the document with the keyboard (needed on
// small screens / accessibility zoom). A `closest()` guard is kept so
// any future additions to the trap list still exempt focused controls.
function handleSummaryKeyDown(event: KeyboardEvent) {
	const trapped = ['ArrowRight', 'ArrowLeft'];
	if (!trapped.includes(event.key)) return;
	if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
	if (!(event.target instanceof Element)) return;
	if (event.target.closest('a, button, input, select, textarea, [contenteditable]')) return;
	event.preventDefault();
}

function handleActionClick(event: MouseEvent, action: () => void): void {
	event.preventDefault();
	event.stopPropagation();
	// Swallowed exceptions inside the click path used to look like "the button
	// is a no-op" — ISSUE-013 saw all three endcard buttons fail silently with
	// no console error and no toast. Surface failures explicitly so the next
	// dogfood pass can attribute the regression to a specific handler.
	// `() => void` permits handlers that return a Promise, so guard both
	// synchronous throws and asynchronous rejections.
	try {
		const result = action() as unknown;
		// `Promise.resolve` normalises any thenable (or non-thenable) to a real
		// Promise, so `.catch` is guaranteed to exist even when `action()`
		// returns a Promises/A+ thenable that lacks `.catch`, or `undefined`.
		Promise.resolve(result).catch((error) => {
			console.error('Summary endcard action rejected', error);
		});
	} catch (error) {
		console.error('Summary endcard action threw', error);
	}
}

// Focus the heading first so stray Enter/Space presses cannot immediately
// activate a navigation button.
$effect(() => {
	if (title) {
		title.focus({ preventScroll: true });
	}
});

$effect(() => {
	if (!container || !header || !statsGrid || !buttonsRow) return;

	const shouldAnimate = !prefersReducedMotion.current;
	if (!shouldAnimate) {
		container.style.opacity = '1';
		header.style.opacity = '1';
		header.style.transform = 'none';
		statsGrid.style.opacity = '1';
		statCards.forEach((el) => {
			if (el) {
				el.style.opacity = '1';
				el.style.transform = 'none';
			}
		});
		buttonsRow.style.opacity = '1';
		buttonsRow.style.transform = 'none';
		return;
	}

	const animations: ReturnType<typeof animate>[] = [];

	const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4, delay: 0.1 });
	animations.push(containerAnim);

	const headerAnim = animate(
		header,
		{ opacity: [0, 1], transform: ['translateY(-20px)', 'translateY(0)'] },
		{ type: 'spring', ...SPRING_PRESETS.snappy, delay: DELAY_PRESETS.short }
	);
	animations.push(headerAnim);

	const gridAnim = animate(
		statsGrid,
		{ opacity: [0, 1] },
		{ duration: 0.3, delay: DELAY_PRESETS.medium }
	);
	animations.push(gridAnim);

	const validCards = statCards.filter(Boolean);
	if (validCards.length > 0) {
		const cardsAnim = animate(
			validCards,
			{
				opacity: [0, 1],
				transform: ['translateY(20px) scale(0.95)', 'translateY(0) scale(1)']
			},
			{
				type: 'spring',
				...SPRING_PRESETS.snappy,
				delay: stagger(STAGGER_PRESETS.normal, { startDelay: DELAY_PRESETS.medium })
			}
		);
		animations.push(cardsAnim);
	}

	const buttonsAnim = animate(
		buttonsRow,
		{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
		{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.long + 0.3 }
	);
	animations.push(buttonsAnim);

	return () => {
		animations.forEach((a) => a.stop());
	};
});
</script>

<svelte:window onkeydown={handleSummaryKeyDown} />

<section bind:this={container} class="summary-page {klass}" tabindex="-1">
	<div bind:this={header} class="header">
		<h1 bind:this={title} class="title" tabindex="-1">
			{#if username}
				{username}'s {year} Wrapped
			{:else}
				{year}
				Server Wrapped
			{/if}
		</h1>
		<p class="subtitle">
			{#if hasHistory}
				Your Year in Review
			{:else}
				No viewing history for this year yet
			{/if}
		</p>
	</div>

	{#if hasHistory}
		<div bind:this={statsGrid} class="stats-grid">
			<div bind:this={statCards[0]} class="stat-card highlight">
				<span class="stat-icon">&#128249;</span>
				<span class="stat-value">{hours.toLocaleString()}</span>
				<span class="stat-label">hours watched</span>
			</div>

			{#if topMovie}
				<div bind:this={statCards[1]} class="stat-card">
					<span class="stat-icon">&#127909;</span>
					<span class="stat-value truncate">{topMovie}</span>
					<span class="stat-label">#1 Movie</span>
				</div>
			{/if}

			{#if topShow}
				<div bind:this={statCards[2]} class="stat-card">
					<span class="stat-icon">&#128250;</span>
					<span class="stat-value truncate">{topShow}</span>
					<span class="stat-label">#1 Show</span>
				</div>
			{/if}

			{#if topGenre}
				<div bind:this={statCards[3]} class="stat-card">
					<span class="stat-icon">&#127916;</span>
					<span class="stat-value">{topGenre}</span>
					<span class="stat-label">Top Genre</span>
				</div>
			{/if}

			{#if percentile !== null}
				<div bind:this={statCards[4]} class="stat-card accent">
					<span class="stat-icon">&#127942;</span>
					<span class="stat-value">Top {Math.max(1, Math.round(100 - percentile))}%</span>
					<span class="stat-label">Server Ranking</span>
				</div>
			{/if}

			{#if totalUsers !== null}
				<div bind:this={statCards[4]} class="stat-card accent">
					<span class="stat-icon">&#128101;</span>
					<span class="stat-value">{totalUsers.toLocaleString()}</span>
					<span class="stat-label">Active Viewers</span>
				</div>
			{/if}

			{#if bingeHours}
				<div bind:this={statCards[5]} class="stat-card">
					<span class="stat-icon">&#128164;</span>
					<span class="stat-value">{bingeHours}h</span>
					<!-- biome-ignore format: Preserve spacing around the inline conditional text. -->
					<span class="stat-label">
					Longest Binge{#if bingeEpisodes}
						({bingeEpisodes} eps){/if}
				</span>
				</div>
			{/if}
		</div>
	{:else}
		<div bind:this={statsGrid} class="empty-summary">
			<p>No viewing history for this year yet.</p>
		</div>
	{/if}

	<div bind:this={buttonsRow} class="actions">
		<button
			type="button"
			class="btn btn-secondary tap-target"
			aria-label="Watch Again"
			onclick={(event) => handleActionClick(event, onRestart)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"
			>
				<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
				<path d="M3 3v5h5" />
			</svg>
			Watch Again
		</button>

		<button
			type="button"
			class="btn btn-primary tap-target"
			aria-label="Share"
			onclick={(event) => handleActionClick(event, onShare)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"
			>
				<circle cx="18" cy="5" r="3" />
				<circle cx="6" cy="12" r="3" />
				<circle cx="18" cy="19" r="3" />
				<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
				<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
			</svg>
			Share
		</button>

		<button
			type="button"
			class="btn btn-secondary tap-target"
			aria-label="Return Home"
			onclick={(event) => handleActionClick(event, onHome)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"
			>
				<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
				<polyline points="9 22 9 12 15 12 15 22" />
			</svg>
			Return Home
		</button>
	</div>
</section>

<style>
.summary-page {
	min-height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 2rem 2rem 4rem;
	background: var(
		--slide-bg-gradient,
		linear-gradient(180deg, oklch(var(--slide-bg-start)) 0%, oklch(var(--slide-bg-end)) 100%)
	);
	color: oklch(var(--foreground));
	position: relative;
	overflow-x: hidden;
	overflow-y: auto;
}

.summary-page::before {
	content: "";
	position: absolute;
	inset: 0;
	background: radial-gradient(ellipse at center, transparent 0%, oklch(0 0 0 / 0.5) 100%);
	pointer-events: none;
}

.summary-page::after {
	content: "";
	position: absolute;
	inset: 0;
	background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
	opacity: var(--slide-noise-opacity, 0.03);
	mix-blend-mode: overlay;
	pointer-events: none;
}

.header {
	text-align: center;
	margin-bottom: 2.5rem;
	z-index: 1;
}

/* Suppress focus ring on the section itself (programmatic focus only,
		   never reached via keyboard Tab) and on mouse-focus of the title. */
.summary-page:focus,
.title:focus:not(:focus-visible) {
	outline: none;
}

/* Restore a visible focus indicator for keyboard users on the title heading. */
.title:focus-visible {
	outline: 2px solid oklch(var(--primary));
	outline-offset: 4px;
	border-radius: 4px;
}

.title {
	font-size: clamp(1.75rem, 5vw, 3rem);
	font-weight: 800;
	margin: 0 0 0.75rem;
	background: linear-gradient(
		180deg,
		oklch(var(--primary)) 0%,
		oklch(var(--primary-accent-plus-20)) 100%
	);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
	filter: drop-shadow(0 0 25px oklch(var(--primary) / 0.4));
}

.subtitle {
	font-size: 1.125rem;
	color: oklch(var(--muted-foreground));
	margin: 0;
	text-transform: uppercase;
	letter-spacing: 0.15em;
}

.stats-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 1rem;
	max-width: 850px;
	width: 100%;
	margin-bottom: 2.5rem;
	z-index: 1;
}

.empty-summary {
	z-index: 1;
	margin-bottom: 2.5rem;
	padding: 1.5rem;
	color: oklch(var(--muted-foreground));
	text-align: center;
}

.empty-summary p {
	margin: 0;
}

.stat-card {
	background: var(--slide-glass-bg);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 2);
	padding: 1.5rem 1.25rem;
	text-align: center;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.625rem;
	box-shadow: var(--shadow-elevation-low, 0 2px 8px oklch(0 0 0 / 0.25));
	position: relative;
	transition:
		transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
		box-shadow 0.3s ease,
		border-color 0.3s ease;
}

.stat-card::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.3), transparent);
	border-radius: inherit;
	opacity: 0;
	transition: opacity 0.3s ease;
}

.stat-card:hover {
	transform: translateY(-4px) scale(1.02);
	box-shadow:
		var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.35)),
		0 0 25px oklch(var(--primary) / 0.1);
	border-color: oklch(var(--primary) / 0.3);
}

.stat-card:hover::before {
	opacity: 1;
}

.stat-card.highlight {
	border-color: oklch(var(--primary) / 0.4);
	background: linear-gradient(
		135deg,
		oklch(var(--primary) / 0.2) 0%,
		oklch(var(--primary) / 0.08) 100%
	);
	box-shadow:
		var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.3)),
		0 0 30px oklch(var(--primary) / 0.15);
}

.stat-card.highlight::before {
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.5), transparent);
	opacity: 1;
}

.stat-card.highlight .stat-value {
	background: linear-gradient(
		180deg,
		oklch(var(--primary)) 0%,
		oklch(var(--primary-accent-plus-20)) 100%
	);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
}

.stat-card.accent {
	border-color: oklch(0.8153 0.1652 85.67 / 0.4);
	background: linear-gradient(
		135deg,
		oklch(0.8153 0.1652 85.67 / 0.15) 0%,
		oklch(0.8153 0.1652 85.67 / 0.05) 100%
	);
	box-shadow:
		var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.3)),
		0 0 25px oklch(0.8153 0.1652 85.67 / 0.12);
}

.stat-card.accent::before {
	background: linear-gradient(90deg, transparent, oklch(0.8153 0.1652 85.67 / 0.5), transparent);
	opacity: 1;
}

.stat-card.accent .stat-value {
	background: linear-gradient(
		180deg,
		oklch(0.8309 0.1622 87.87) 0%,
		oklch(0.7358 0.1599 66.01) 100%
	);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
}

.stat-icon {
	font-size: 1.75rem;
	filter: drop-shadow(0 0 8px oklch(var(--primary) / 0.3));
}

.stat-value {
	font-size: clamp(1.25rem, 3vw, 1.75rem);
	font-weight: 700;
	color: oklch(var(--foreground));
	line-height: 1.2;
}

.stat-value.truncate {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.stat-label {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.actions {
	display: flex;
	gap: 1rem;
	flex-wrap: wrap;
	justify-content: center;
	/* `position: relative` activates the existing (previously inert) z-index,
			   and `isolation: isolate` puts the buttons' colored hover glow into its
			   own stacking context so it is no longer sampled by the stat-cards'
			   backdrop-filter or smeared by the page's blended ::before/::after
			   layers — fixing the stray color behind the cards on hover. The glow
			   itself is unchanged, so the buttons keep their hover affordance. */
	position: relative;
	isolation: isolate;
	z-index: 1;
}

.btn {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.875rem 1.5rem;
	border-radius: calc(var(--radius) * 1.5);
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
		background-color 0.2s ease,
		box-shadow 0.2s ease,
		border-color 0.2s ease;
	border: none;
}

.btn:hover {
	transform: translateY(-2px);
}

.btn:active {
	transform: translateY(0);
}

.btn-primary {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	box-shadow:
		0 4px 14px oklch(var(--primary) / 0.35),
		inset 0 1px 0 oklch(1 0 0 / 0.15);
}

.btn-primary:hover {
	background: oklch(var(--primary-grad-plus-15));
	box-shadow:
		0 6px 20px oklch(var(--primary) / 0.45),
		inset 0 1px 0 oklch(1 0 0 / 0.2);
}

.btn-secondary {
	background: var(--slide-glass-bg);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	color: oklch(var(--foreground));
	border: 1px solid oklch(var(--primary) / 0.2);
	box-shadow: var(--shadow-elevation-low, 0 2px 8px oklch(0 0 0 / 0.2));
}

.btn-secondary:hover {
	background: oklch(var(--primary) / 0.15);
	border-color: oklch(var(--primary) / 0.35);
	box-shadow:
		var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.25)),
		0 0 15px oklch(var(--primary) / 0.1);
}

@media (max-width: 479px) {
	.summary-page {
		padding: 1.5rem 1rem;
	}

	.header {
		margin-bottom: 2rem;
	}

	.stats-grid {
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.stat-card {
		padding: 1.125rem 0.875rem;
		gap: 0.5rem;
	}

	.stat-icon {
		font-size: 1.5rem;
	}

	.actions {
		flex-direction: column;
		width: 100%;
		max-width: 280px;
	}

	.btn {
		width: 100%;
		justify-content: center;
	}
}

@media (min-width: 480px) and (max-width: 767px) {
	.stats-grid {
		grid-template-columns: repeat(2, 1fr);
	}
}

@media (min-width: 768px) {
	.stats-grid {
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	.stat-card {
		padding: 1.75rem 1.5rem;
	}

	.stat-icon {
		font-size: 2rem;
	}

	.btn {
		padding: 1rem 2rem;
	}
}
</style>
