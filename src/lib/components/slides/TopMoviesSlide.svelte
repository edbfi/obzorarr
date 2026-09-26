<script lang="ts">
import { animate, stagger } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import {
	DELAY_PRESETS,
	getAdaptiveStagger,
	KEYFRAMES,
	SPRING_PRESETS
} from '$lib/utils/animation-presets';
import { getThumbUrl } from '$lib/utils/plex-thumb';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { TopMoviesSlideProps } from './types';

interface Props extends TopMoviesSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	topMovies,
	limit = 6,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const possessive = $derived(getPossessive(messagingContext));

const displayedMovies = $derived(topMovies.slice(0, limit));
const hasMovies = $derived(displayedMovies.length > 0);

let container: HTMLElement | undefined = $state();
let listItems: HTMLElement[] = $state([]);

$effect(() => {
	if (!container || !active || !hasMovies) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		listItems.forEach((el) => {
			if (el) {
				el.style.opacity = '1';
				el.style.transform = 'none';
			}
		});
		onAnimationComplete?.();
		return;
	}

	const containerAnim = animate(container, KEYFRAMES.slideFromLeft, {
		type: 'spring',
		...SPRING_PRESETS.snappy
	});

	const validItems = listItems.filter(Boolean);
	if (validItems.length > 0) {
		const adaptiveStagger = getAdaptiveStagger(validItems.length);

		const firstItemAnim =
			validItems[0] &&
			animate(
				validItems[0],
				{
					opacity: [0, 1],
					transform: ['translateX(-20px) scale(0.95)', 'translateX(0) scale(1)']
				},
				{
					type: 'spring',
					...SPRING_PRESETS.bouncy,
					delay: DELAY_PRESETS.short
				}
			);

		const remainingItems = validItems.slice(1);
		const itemsAnim =
			remainingItems.length > 0 &&
			animate(
				remainingItems,
				{
					opacity: [0, 1],
					transform: ['translateX(-20px) scale(0.95)', 'translateX(0) scale(1)']
				},
				{
					type: 'spring',
					...SPRING_PRESETS.listItem,
					delay: stagger(adaptiveStagger, { startDelay: DELAY_PRESETS.short + adaptiveStagger })
				}
			);

		const lastAnim = itemsAnim || firstItemAnim;
		if (lastAnim) {
			lastAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		}

		return () => {
			containerAnim.stop();
			firstItemAnim?.stop();
			itemsAnim && itemsAnim.stop();
		};
	}

	return () => {
		containerAnim.stop();
	};
});
</script>

<BaseSlide {active} class="top-movies-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Top Movies</h2>

		{#if hasMovies}
			<ol class="movie-list">
				{#each displayedMovies as movie, i}
					<li bind:this={listItems[i]} class="movie-item" class:first={i === 0}>
						<span class="rank">#{movie.rank}</span>
						{#if getThumbUrl(movie.thumb)}
							<img src={getThumbUrl(movie.thumb)} alt="" class="thumb" loading="lazy">
						{:else}
							<div class="thumb-placeholder"></div>
						{/if}
						<div class="movie-info">
							<span class="movie-title">{movie.title}</span>
							<span class="play-count">{movie.count} {movie.count === 1 ? 'play' : 'plays'}</span>
						</div>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="empty-message">No movies watched this year</p>
		{/if}

		{#if children}
			<div class="extra">
				{@render children()}
			</div>
		{/if}
	</div>
</BaseSlide>

<style>
.content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2rem;
	z-index: 1;
	width: 100%;
	max-width: var(--content-max-md, 800px);
}

.title {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.05em;
	text-shadow: 0 0 30px var(--slide-glow-color, oklch(var(--primary) / 0.3));
}

.movie-list {
	list-style: none;
	padding: 0;
	margin: 0;
	width: 100%;
	display: grid;
	grid-template-columns: 1fr;
	gap: 0.75rem;
}

.movie-item {
	display: flex;
	align-items: center;
	gap: 1.25rem;
	padding: 1rem 1.25rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 1.5);
	box-shadow: var(--shadow-elevation-low, 0 2px 4px oklch(0 0 0 / 0.2));
	position: relative;
	transition:
		transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
		box-shadow 0.3s ease,
		border-color 0.3s ease;
}

.movie-item::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.2), transparent);
	border-radius: inherit;
	opacity: 0;
	transition: opacity 0.3s ease;
}

.movie-item:hover::before {
	opacity: 1;
}

.movie-item:hover {
	transform: translateY(-2px) scale(1.01);
	box-shadow: var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.3));
	border-color: oklch(var(--primary) / 0.4);
}

.movie-item.first {
	border-color: oklch(var(--primary) / 0.3);
	background: linear-gradient(135deg, oklch(var(--primary) / 0.15) 0%, var(--slide-glass-bg) 100%);
}

.movie-item.first::before {
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.5), transparent);
	opacity: 1;
}

.rank {
	font-size: 1rem;
	font-weight: 800;
	color: oklch(var(--primary));
	min-width: 2.5rem;
	padding: 0.25rem 0.5rem;
	background: oklch(var(--primary) / 0.15);
	border-radius: var(--radius);
	text-align: center;
	text-shadow: 0 0 10px oklch(var(--primary) / 0.3);
}

.first .rank {
	background: linear-gradient(135deg, oklch(var(--primary) / 0.25), oklch(var(--accent) / 0.15));
	box-shadow: 0 0 15px oklch(var(--primary) / 0.2);
}

.thumb {
	width: 56px;
	height: 84px;
	object-fit: cover;
	border-radius: calc(var(--radius) * 0.75);
	background: oklch(var(--muted));
	box-shadow: var(--shadow-elevation-low, 0 2px 4px oklch(0 0 0 / 0.3));
	transition:
		transform 0.3s ease,
		box-shadow 0.3s ease;
}

.movie-item:hover .thumb {
	transform: scale(1.05);
	box-shadow:
		var(--shadow-elevation-medium, 0 4px 8px oklch(0 0 0 / 0.4)),
		0 0 20px var(--slide-glow-color, oklch(var(--primary) / 0.15));
}

.thumb-placeholder {
	width: 56px;
	height: 84px;
	background: linear-gradient(135deg, oklch(var(--muted)) 0%, oklch(var(--secondary)) 100%);
	border-radius: calc(var(--radius) * 0.75);
}

.movie-info {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	flex: 1;
	gap: 0.25rem;
}

.movie-title {
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	line-height: 1.3;
}

.play-count {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
}

.empty-message {
	color: oklch(var(--muted-foreground));
	font-style: italic;
}

.extra {
	margin-top: 1rem;
}

@media (max-width: 767px) {
	.content {
		gap: 1.5rem;
	}

	.title {
		font-size: 1.5rem;
	}

	.movie-list {
		gap: 0.625rem;
	}

	.movie-item {
		padding: 0.75rem 1rem;
		gap: 1rem;
	}

	.thumb,
	.thumb-placeholder {
		width: 48px;
		height: 72px;
	}

	.rank {
		font-size: 0.875rem;
		min-width: 2rem;
	}

	.movie-title {
		font-size: 0.9375rem;
	}
}

@media (min-width: 768px) and (max-width: 1023px) {
	.movie-item {
		padding: 1rem 1.25rem;
	}

	.thumb,
	.thumb-placeholder {
		width: 56px;
		height: 84px;
	}
}

@media (min-width: 1024px) {
	.content {
		max-width: var(--content-max-lg, 900px);
	}

	.title {
		font-size: 2rem;
	}

	.movie-list {
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.movie-item {
		padding: 1.125rem 1.5rem;
	}

	.thumb,
	.thumb-placeholder {
		width: 64px;
		height: 96px;
	}

	.movie-title {
		font-size: 1.0625rem;
	}
}
</style>
