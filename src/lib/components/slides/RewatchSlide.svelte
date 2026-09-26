<script lang="ts">
import { animate, stagger } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, getAdaptiveStagger, SPRING_PRESETS } from '$lib/utils/animation-presets';
import { getThumbUrl } from '$lib/utils/plex-thumb';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { RewatchSlideProps } from './types';

interface Props extends RewatchSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	topRewatches,
	limit = 5,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const possessive = $derived(getPossessive(messagingContext));
const displayedRewatches = $derived(topRewatches.slice(0, limit));
const hasRewatches = $derived(displayedRewatches.length > 0);

const totalRewatches = $derived(topRewatches.reduce((sum, item) => sum + item.rewatchCount, 0));

const personality = $derived.by(() => {
	if (topRewatches.length === 0) return null;
	if (totalRewatches > 50) return 'Creature of Habit';
	if (totalRewatches > 20) return 'Comfort Seeker';
	if (totalRewatches > 10) return 'Has Favorites';
	return 'Explorer';
});

let container: HTMLElement | undefined = $state();
let cards: HTMLElement[] = $state([]);
let badge: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		cards.forEach((el) => {
			if (el) {
				el.style.opacity = '1';
				el.style.transform = 'none';
			}
		});
		if (badge) {
			badge.style.opacity = '1';
			badge.style.transform = 'none';
		}
		onAnimationComplete?.();
		return;
	}

	const containerAnim = animate(
		container,
		{ opacity: [0, 1], transform: ['translateY(25px) scale(0.98)', 'translateY(0) scale(1)'] },
		{ type: 'spring', ...SPRING_PRESETS.snappy }
	);

	const validCards = cards.filter(Boolean);
	const adaptiveStagger = getAdaptiveStagger(validCards.length);

	if (validCards.length > 0) {
		const cardsAnim = animate(
			validCards,
			{
				opacity: [0, 1],
				transform: ['translateX(-20px) rotate(-2deg)', 'translateX(0) rotate(0)']
			},
			{
				type: 'spring',
				...SPRING_PRESETS.bouncy,
				delay: stagger(adaptiveStagger, { startDelay: DELAY_PRESETS.short })
			}
		);

		if (badge) {
			const badgeAnim = animate(
				badge,
				{ opacity: [0, 1], transform: ['scale(0.8)', 'scale(1)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.bouncy,
					delay: DELAY_PRESETS.long
				}
			);

			badgeAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				cardsAnim.stop();
				badgeAnim.stop();
			};
		}

		cardsAnim.finished.then(() => {
			onAnimationComplete?.();
		});

		return () => {
			containerAnim.stop();
			cardsAnim.stop();
		};
	}

	return () => {
		containerAnim.stop();
	};
});
</script>

<BaseSlide {active} class="rewatch-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Comfort Content</h2>

		{#if hasRewatches}
			<div class="rewatch-list">
				{#each displayedRewatches as item, i}
					<div bind:this={cards[i]} class="rewatch-card">
						<div class="thumb-container">
							{#if item.thumb}
								<img src={getThumbUrl(item.thumb) ?? ''} alt="" class="thumb" loading="lazy">
							{:else}
								<div class="thumb-placeholder">
									{item.type === 'movie' ? '🎬' : item.type === 'episode' ? '📺' : '🎵'}
								</div>
							{/if}
						</div>
						<div class="card-info">
							<span class="title-text">{item.title}</span>
							<span class="type-badge">{item.type}</span>
						</div>
						<div class="rewatch-badge">
							<span class="rewatch-icon">♻️</span>
							<span class="rewatch-count">×{item.rewatchCount}</span>
						</div>
					</div>
				{/each}
			</div>

			{#if personality}
				<div bind:this={badge} class="personality-badge">
					<span class="badge-text">{personality}</span>
				</div>
			{/if}
		{:else}
			<p class="empty-message">No rewatches this year</p>
			<p class="empty-hint">Every play this year was something new.</p>
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
	gap: 1.5rem;
	z-index: 1;
	width: 100%;
	max-width: var(--content-max-md, 600px);
}

.title {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.05em;
	text-shadow: 0 0 30px var(--slide-glow-color, oklch(var(--primary) / 0.3));
}

.rewatch-list {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.rewatch-card {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 0.75rem 1rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 12px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 12px));
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 1.5);
	transition:
		transform 0.3s ease,
		border-color 0.3s ease;
}

.rewatch-card:hover {
	transform: translateX(4px);
	border-color: oklch(var(--primary) / 0.3);
}

.thumb-container {
	width: 50px;
	height: 50px;
	border-radius: var(--radius);
	overflow: hidden;
	flex-shrink: 0;
}

.thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.thumb-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: oklch(var(--muted) / 0.3);
	font-size: 1.5rem;
}

.card-info {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	min-width: 0;
}

.title-text {
	font-size: 0.9375rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.type-badge {
	font-size: 0.6875rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.rewatch-badge {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.375rem 0.625rem;
	background: oklch(var(--primary) / 0.15);
	border-radius: var(--radius);
}

.rewatch-icon {
	font-size: 0.875rem;
}

.rewatch-count {
	font-size: 0.875rem;
	font-weight: 700;
	color: oklch(var(--primary));
}

.personality-badge {
	padding: 0.75rem 1.5rem;
	background: linear-gradient(135deg, oklch(var(--primary) / 0.2), oklch(var(--primary) / 0.1));
	border: 1px solid oklch(var(--primary) / 0.3);
	border-radius: 2rem;
}

.badge-text {
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.empty-message {
	color: oklch(var(--muted-foreground));
	font-style: italic;
	font-size: 1.125rem;
}

.empty-hint {
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
	opacity: 0.7;
}

.extra {
	margin-top: 1rem;
}

@media (max-width: 767px) {
	.content {
		gap: 1rem;
	}

	.title {
		font-size: 1.5rem;
	}

	.rewatch-card {
		padding: 0.625rem 0.75rem;
		gap: 0.75rem;
	}

	.thumb-container {
		width: 40px;
		height: 40px;
	}

	.title-text {
		font-size: 0.875rem;
	}
}
</style>
