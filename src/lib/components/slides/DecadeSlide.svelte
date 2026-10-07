<script lang="ts">
import { animate, stagger } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, getAdaptiveStagger, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { DecadeSlideProps } from './types';

interface Props extends DecadeSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	decadeDistribution,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const possessive = $derived(getPossessive(messagingContext));
const hasData = $derived(decadeDistribution.length > 0);

const maxCount = $derived(hasData ? Math.max(...decadeDistribution.map((d) => d.count)) : 0);

const topDecade = $derived.by(() => {
	if (!hasData) return null;
	return decadeDistribution.reduce((max, d) => (d.count > max.count ? d : max));
});

const eraMessage = $derived.by(() => {
	if (!topDecade) return '';
	const decadeNum = parseInt(topDecade.decade, 10);
	if (decadeNum >= 2020) return 'Living in the now';
	if (decadeNum >= 2010) return 'Fresh content lover';
	if (decadeNum >= 2000) return 'Y2K vibes';
	if (decadeNum >= 1990) return "Child of the 90's";
	if (decadeNum >= 1980) return 'Retro enthusiast';
	return 'Classic cinema lover';
});

const decadeColors: Record<string, string> = {
	'1950s': 'oklch(0.6841 0.1237 89.62)',
	'1960s': 'oklch(0.6805 0.1199 72.14)',
	'1970s': 'oklch(0.6436 0.1358 52.91)',
	'1980s': 'oklch(0.6094 0.1849 353.12)',
	'1990s': 'oklch(0.5806 0.196 312.63)',
	'2000s': 'oklch(0.6475 0.1187 235.02)',
	'2010s': 'oklch(0.6902 0.1123 179.13)',
	'2020s': 'oklch(var(--primary))'
};

function getDecadeColor(decade: string): string {
	return decadeColors[decade] ?? 'oklch(var(--primary))';
}

let container: HTMLElement | undefined = $state();
let bars: HTMLElement[] = $state([]);
let badge: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active || !hasData) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		bars.forEach((el) => {
			if (el) el.style.transform = 'scaleY(1)';
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

	const validBars = bars.filter(Boolean);
	const adaptiveStagger = getAdaptiveStagger(validBars.length);

	if (validBars.length > 0) {
		const barsAnim = animate(
			validBars,
			{ transform: ['scaleY(0)', 'scaleY(1)'] },
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
				barsAnim.stop();
				badgeAnim.stop();
			};
		}

		barsAnim.finished.then(() => {
			onAnimationComplete?.();
		});

		return () => {
			containerAnim.stop();
			barsAnim.stop();
		};
	}

	return () => {
		containerAnim.stop();
	};
});
</script>

<BaseSlide {active} class="decade-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Content Era</h2>

		{#if hasData}
			<div class="chart-container">
				<div class="timeline">
					{#each decadeDistribution as decade, i}
						{@const height = maxCount > 0 ? (decade.count / maxCount) * 100 : 0}
						{@const isTop = topDecade && decade.decade === topDecade.decade}
						<div class="bar-wrapper">
							<div class="bar-track">
								<div
									bind:this={bars[i]}
									class="bar"
									class:top={isTop}
									style="height: {Math.max(height, 5)}%; --decade-color: {getDecadeColor(
										decade.decade
									)};"
								>
									<span class="bar-count">{decade.count}</span>
								</div>
							</div>
							<span class="bar-label" class:top={isTop}>{decade.decade}</span>
						</div>
					{/each}
				</div>
			</div>

			{#if topDecade}
				<div
					bind:this={badge}
					class="era-badge"
					style="--era-color: {getDecadeColor(topDecade.decade)};"
				>
					<span class="era-decade">{topDecade.decade}</span>
					<span class="era-message">{eraMessage}</span>
				</div>
			{/if}
		{:else}
			<div class="no-data">
				<span class="no-data-icon">📅</span>
				<p class="empty-message">No release year data available</p>
				<p class="empty-hint">Release years appear after the next sync</p>
			</div>
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
	max-width: var(--content-max-md, 700px);
}

.title {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.05em;
	text-shadow: 0 0 30px var(--slide-glow-color, oklch(var(--primary) / 0.3));
}

.chart-container {
	width: 100%;
	padding: 1.5rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 2);
}

.timeline {
	display: flex;
	justify-content: center;
	height: 160px;
	gap: 0.5rem;
}

.bar-wrapper {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	flex: 1;
	max-width: 60px;
	height: 100%;
}

.bar-track {
	flex: 1;
	width: 100%;
	display: flex;
	align-items: flex-end;
	justify-content: center;
}

.bar {
	width: 100%;
	background: linear-gradient(
		180deg,
		var(--decade-color),
		color-mix(in srgb, var(--decade-color) 60%, transparent)
	);
	border-radius: var(--radius) var(--radius) 0 0;
	transform-origin: bottom center;
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding-top: 0.5rem;
	transition: filter 0.3s ease;
	min-height: 10px;
}

.bar:hover {
	filter: brightness(1.2);
}

.bar.top {
	box-shadow: 0 0 20px color-mix(in srgb, var(--decade-color) 50%, transparent);
}

.bar-count {
	font-size: 0.6875rem;
	font-weight: 600;
	color: oklch(var(--foreground));
}

.bar-label {
	font-size: 0.6875rem;
	color: oklch(var(--muted-foreground));
	font-weight: 500;
}

.bar-label.top {
	color: oklch(var(--primary));
	font-weight: 700;
}

.era-badge {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	padding: 0.75rem 1.5rem;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--era-color) 20%, transparent),
		color-mix(in srgb, var(--era-color) 10%, transparent)
	);
	border: 1px solid color-mix(in srgb, var(--era-color) 30%, transparent);
	border-radius: 2rem;
}

.era-decade {
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--era-color);
}

.era-message {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
}

.no-data {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.no-data-icon {
	font-size: 3rem;
	opacity: 0.5;
}

.empty-message {
	color: oklch(var(--muted-foreground));
	font-style: italic;
	font-size: 1.125rem;
	margin: 0;
}

.empty-hint {
	color: oklch(var(--muted-foreground));
	font-size: 0.875rem;
	opacity: 0.7;
	margin: 0;
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

	.chart-container {
		padding: 1rem;
	}

	.timeline {
		height: 120px;
		gap: 0.375rem;
	}

	.bar-wrapper {
		max-width: 45px;
	}

	.bar-count {
		font-size: 0.5625rem;
	}

	.bar-label {
		font-size: 0.5625rem;
	}
}

@media (min-width: 1024px) {
	.timeline {
		height: 180px;
	}

	.bar-wrapper {
		max-width: 70px;
	}
}
</style>
