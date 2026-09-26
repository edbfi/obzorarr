<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, KEYFRAMES, SPRING_PRESETS } from '$lib/utils/animation-presets';
import { getThumbUrl } from '$lib/utils/plex-thumb';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { FirstLastSlideProps } from './types';

interface Props extends FirstLastSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	firstWatch,
	lastWatch,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const possessive = $derived(getPossessive(messagingContext));

const hasFirst = $derived(firstWatch !== null);
const hasLast = $derived(lastWatch !== null);
const hasAny = $derived(hasFirst || hasLast);

const firstDate = $derived.by(() => {
	if (!firstWatch) return '';
	return new Date(firstWatch.viewedAt * 1000).toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric'
	});
});

const lastDate = $derived.by(() => {
	if (!lastWatch) return '';
	return new Date(lastWatch.viewedAt * 1000).toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric'
	});
});

const firstTypeLabel = $derived.by(() => {
	if (!firstWatch) return '';
	switch (firstWatch.type) {
		case 'movie':
			return 'Movie';
		case 'episode':
			return 'Episode';
		case 'track':
			return 'Track';
		default:
			return '';
	}
});

const lastTypeLabel = $derived.by(() => {
	if (!lastWatch) return '';
	switch (lastWatch.type) {
		case 'movie':
			return 'Movie';
		case 'episode':
			return 'Episode';
		case 'track':
			return 'Track';
		default:
			return '';
	}
});

let container: HTMLElement | undefined = $state();
let firstCard: HTMLElement | undefined = $state();
let lastCard: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		if (firstCard) {
			firstCard.style.opacity = '1';
			firstCard.style.transform = 'none';
		}
		if (lastCard) {
			lastCard.style.opacity = '1';
			lastCard.style.transform = 'none';
		}
		onAnimationComplete?.();
		return;
	}

	const animations: ReturnType<typeof animate>[] = [];

	const containerAnim = animate(
		container,
		{ opacity: [0, 1] },
		{ type: 'spring', ...SPRING_PRESETS.gentle }
	);
	animations.push(containerAnim);

	if (firstCard) {
		const firstAnim = animate(firstCard, KEYFRAMES.cardFromLeft, {
			type: 'spring',
			...SPRING_PRESETS.snappy,
			delay: DELAY_PRESETS.short
		});
		animations.push(firstAnim);
	}

	if (lastCard) {
		const lastAnim = animate(lastCard, KEYFRAMES.cardFromRight, {
			type: 'spring',
			...SPRING_PRESETS.snappy,
			delay: DELAY_PRESETS.medium
		});
		animations.push(lastAnim);

		lastAnim.finished.then(() => {
			onAnimationComplete?.();
		});
	} else if (animations.length > 0) {
		animations[animations.length - 1]?.finished.then(() => {
			onAnimationComplete?.();
		});
	}

	return () => {
		animations.forEach((a) => a.stop());
	};
});
</script>

<BaseSlide {active} class="first-last-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Year in Review</h2>

		{#if hasAny}
			<div class="cards">
				{#if hasFirst && firstWatch}
					<div bind:this={firstCard} class="card first">
						<span class="card-label">First Watch</span>
						{#if getThumbUrl(firstWatch.thumb)}
							<img src={getThumbUrl(firstWatch.thumb)} alt="" class="thumb" loading="lazy">
						{:else}
							<div class="thumb-placeholder"></div>
						{/if}
						<div class="card-info">
							<span class="card-title">{firstWatch.title}</span>
							<span class="card-meta">{firstTypeLabel} · {firstDate}</span>
						</div>
					</div>
				{/if}

				{#if hasLast && lastWatch}
					<div bind:this={lastCard} class="card last">
						<span class="card-label">Last Watch</span>
						{#if getThumbUrl(lastWatch.thumb)}
							<img src={getThumbUrl(lastWatch.thumb)} alt="" class="thumb" loading="lazy">
						{:else}
							<div class="thumb-placeholder"></div>
						{/if}
						<div class="card-info">
							<span class="card-title">{lastWatch.title}</span>
							<span class="card-meta">{lastTypeLabel} · {lastDate}</span>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<p class="no-data">No watch history for this year</p>
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
	max-width: 700px;
}

.title {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.05em;
	text-shadow: 0 0 30px oklch(var(--primary) / 0.3);
}

.cards {
	display: flex;
	gap: 2.5rem;
	width: 100%;
	justify-content: center;
	flex-wrap: wrap;
}

.card {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 2rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 2);
	min-width: 240px;
	max-width: 320px;
	flex: 1;
	box-shadow:
		var(--shadow-elevation-high, 0 8px 24px oklch(0 0 0 / 0.4)),
		inset 0 1px 0 oklch(1 0 0 / 0.05);
	position: relative;
	transition:
		transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
		box-shadow 0.3s ease,
		border-color 0.3s ease;
}

.card::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.4), transparent);
	border-radius: inherit;
}

.card:hover {
	transform: translateY(-6px) scale(1.02);
	box-shadow:
		var(--shadow-elevation-high, 0 8px 24px oklch(0 0 0 / 0.5)),
		0 0 40px var(--slide-accent-glow, oklch(var(--primary) / 0.2));
	border-color: oklch(var(--primary) / 0.4);
}

.card-label {
	font-size: 0.8125rem;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	color: oklch(var(--primary));
	margin-bottom: 1.25rem;
	font-weight: 600;
	padding: 0.375rem 0.875rem;
	background: oklch(var(--primary) / 0.12);
	border-radius: var(--radius);
	text-shadow: 0 0 10px oklch(var(--primary) / 0.3);
}

.thumb {
	width: 140px;
	height: 210px;
	object-fit: cover;
	border-radius: calc(var(--radius) * 1.25);
	margin-bottom: 1.25rem;
	box-shadow:
		var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.4)),
		0 0 20px oklch(var(--primary) / 0.1);
	transition:
		transform 0.3s ease,
		box-shadow 0.3s ease;
}

.card:hover .thumb {
	transform: scale(1.05);
	box-shadow:
		var(--shadow-elevation-high, 0 8px 24px oklch(0 0 0 / 0.5)),
		0 0 35px var(--slide-glow-color, oklch(var(--primary) / 0.2));
}

.thumb-placeholder {
	width: 140px;
	height: 210px;
	background: linear-gradient(135deg, oklch(var(--muted)) 0%, oklch(var(--secondary)) 100%);
	border-radius: calc(var(--radius) * 1.25);
	margin-bottom: 1.25rem;
}

.card-info {
	text-align: center;
}

.card-title {
	display: block;
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	margin-bottom: 0.375rem;
	overflow: hidden;
	text-overflow: ellipsis;
	/* biome-ignore lint/suspicious/noDuplicateProperties: Preserve block layout when the legacy line-clamp display value is unsupported. */
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	line-height: 1.3;
}

.card-meta {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
}

.no-data {
	color: oklch(var(--muted-foreground));
	font-style: italic;
	padding: 2rem;
	background: var(--slide-glass-bg);
	border-radius: calc(var(--radius) * 1.5);
	border: 1px solid var(--slide-glass-border);
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

	.cards {
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
	}

	.card {
		width: 100%;
		max-width: 260px;
		padding: 1.25rem;
	}

	.thumb,
	.thumb-placeholder {
		width: 100px;
		height: 150px;
	}

	.card-title {
		font-size: 0.9375rem;
	}
}

@media (min-width: 768px) and (max-width: 1023px) {
	.content {
		max-width: var(--content-max-md, 750px);
	}

	.title {
		font-size: 2rem;
	}

	.card {
		max-width: 320px;
		padding: 1.75rem;
	}

	.card-label {
		font-size: 0.8125rem;
	}

	.thumb,
	.thumb-placeholder {
		width: 140px;
		height: 210px;
	}

	.card-title {
		font-size: 1.0625rem;
	}

	.card-meta {
		font-size: 0.8125rem;
	}
}

@media (min-width: 1024px) {
	.content {
		max-width: var(--content-max-lg, 900px);
	}

	.title {
		font-size: 2rem;
	}

	.cards {
		gap: 3rem;
	}

	.card {
		max-width: 400px;
		padding: 2.5rem;
	}

	.card-label {
		font-size: 0.9375rem;
		margin-bottom: 1.5rem;
	}

	.thumb,
	.thumb-placeholder {
		width: 180px;
		height: 270px;
		margin-bottom: 1.5rem;
	}

	.card-title {
		font-size: 1.125rem;
	}

	.card-meta {
		font-size: 0.9375rem;
	}
}
</style>
