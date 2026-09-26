<script lang="ts">
import { animate, stagger } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, getAdaptiveStagger, SPRING_PRESETS } from '$lib/utils/animation-presets';
import { getThumbUrl } from '$lib/utils/plex-thumb';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { MarathonSlideProps } from './types';

interface Props extends MarathonSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	marathonDay,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const possessive = $derived(getPossessive(messagingContext));
const hasData = $derived(marathonDay !== null);

const formattedDate = $derived.by(() => {
	if (!marathonDay) return '';
	const date = new Date(marathonDay.date);
	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
});

function formatDuration(minutes: number): string {
	let hours = Math.floor(minutes / 60);
	let mins = Math.round(minutes % 60);
	if (mins >= 60) {
		hours++;
		mins -= 60;
	}
	if (hours === 0) return `${mins} min`;
	if (mins === 0) return `${hours} hr`;
	return `${hours} hr ${mins} min`;
}

let container: HTMLElement | undefined = $state();
let dateCard: HTMLElement | undefined = $state();
let items: HTMLElement[] = $state([]);

$effect(() => {
	if (!container || !active || !hasData) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		if (dateCard) {
			dateCard.style.opacity = '1';
			dateCard.style.transform = 'none';
		}
		items.forEach((el) => {
			if (el) {
				el.style.opacity = '1';
				el.style.transform = 'none';
			}
		});
		onAnimationComplete?.();
		return;
	}

	const containerAnim = animate(
		container,
		{ opacity: [0, 1], transform: ['translateY(25px) scale(0.98)', 'translateY(0) scale(1)'] },
		{ type: 'spring', ...SPRING_PRESETS.snappy }
	);

	if (dateCard) {
		const dateAnim = animate(
			dateCard,
			{ opacity: [0, 1], transform: ['scale(0.9)', 'scale(1)'] },
			{
				type: 'spring',
				...SPRING_PRESETS.bouncy,
				delay: DELAY_PRESETS.short
			}
		);

		const validItems = items.filter(Boolean);
		if (validItems.length > 0) {
			const adaptiveStagger = getAdaptiveStagger(validItems.length);
			const itemsAnim = animate(
				validItems,
				{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.gentle,
					delay: stagger(adaptiveStagger, { startDelay: DELAY_PRESETS.medium })
				}
			);

			itemsAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				dateAnim.stop();
				itemsAnim.stop();
			};
		}

		dateAnim.finished.then(() => {
			onAnimationComplete?.();
		});

		return () => {
			containerAnim.stop();
			dateAnim.stop();
		};
	}

	return () => {
		containerAnim.stop();
	};
});
</script>

<BaseSlide {active} class="marathon-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Marathon Day</h2>

		{#if hasData && marathonDay}
			<div bind:this={dateCard} class="date-card">
				<span class="date-icon">📅</span>
				<span class="date-text">{formattedDate}</span>
				<div class="stats-row">
					<div class="stat">
						<span class="stat-value">{formatDuration(marathonDay.minutes)}</span>
						<span class="stat-label">watched</span>
					</div>
					<div class="stat">
						<span class="stat-value">{marathonDay.plays}</span>
						<span class="stat-label">{marathonDay.plays === 1 ? 'item' : 'items'}</span>
					</div>
				</div>
			</div>

			{#if marathonDay.items.length > 0}
				<div class="items-list">
					<span class="list-label">What you watched</span>
					<div class="items-grid">
						{#each marathonDay.items.slice(0, 6) as item, i}
							<div bind:this={items[i]} class="item">
								{#if item.thumb}
									<img src={getThumbUrl(item.thumb) ?? ''} alt="" class="item-thumb" loading="lazy">
								{:else}
									<div class="item-placeholder"></div>
								{/if}
								<span class="item-title">{item.title}</span>
							</div>
						{/each}
					</div>
					{#if marathonDay.items.length > 6}
						<span class="more-items">+{marathonDay.items.length - 6} more</span>
					{/if}
				</div>
			{/if}
		{:else}
			<p class="empty-message">No marathon day data available</p>
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

.date-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.75rem;
	padding: 1.5rem 2rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border: 1px solid oklch(var(--primary) / 0.3);
	border-radius: calc(var(--radius) * 2);
	box-shadow: 0 0 30px oklch(var(--primary) / 0.2);
}

.date-icon {
	font-size: 2.5rem;
}

.date-text {
	font-size: 1.375rem;
	font-weight: 700;
	color: oklch(var(--primary));
}

.stats-row {
	display: flex;
	gap: 2rem;
}

.stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.125rem;
}

.stat-value {
	font-size: 1.25rem;
	font-weight: 700;
	color: oklch(var(--foreground));
}

.stat-label {
	font-size: 0.6875rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.items-list {
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.75rem;
}

.list-label {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.items-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.5rem;
	width: 100%;
	max-width: 400px;
}

.item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem;
	background: var(--slide-glass-bg);
	border-radius: var(--radius);
	transition: transform 0.2s ease;
}

.item:hover {
	transform: scale(1.02);
}

.item-thumb {
	width: 60px;
	height: 60px;
	object-fit: cover;
	border-radius: calc(var(--radius) * 0.5);
}

.item-placeholder {
	width: 60px;
	height: 60px;
	background: oklch(var(--muted) / 0.3);
	border-radius: calc(var(--radius) * 0.5);
}

.item-title {
	font-size: 0.6875rem;
	color: oklch(var(--foreground));
	text-align: center;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 100%;
}

.more-items {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
	font-style: italic;
}

.empty-message {
	color: oklch(var(--muted-foreground));
	font-style: italic;
	font-size: 1.125rem;
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

	.date-card {
		padding: 1rem 1.5rem;
	}

	.date-icon {
		font-size: 2rem;
	}

	.date-text {
		font-size: 1.125rem;
	}

	.items-grid {
		grid-template-columns: repeat(2, 1fr);
		max-width: 280px;
	}

	.item-thumb,
	.item-placeholder {
		width: 50px;
		height: 50px;
	}
}
</style>
