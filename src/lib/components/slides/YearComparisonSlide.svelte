<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getSubject } from './messaging-context';
import type { YearComparisonSlideProps } from './types';

interface Props extends YearComparisonSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	yearComparison,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const subject = $derived(getSubject(messagingContext));

const hasData = $derived(yearComparison !== null);
const isIncrease = $derived(yearComparison ? yearComparison.percentChange > 0 : false);
const isDecrease = $derived(yearComparison ? yearComparison.percentChange < 0 : false);

const message = $derived.by(() => {
	if (!yearComparison) return '';
	const change = Math.abs(yearComparison.percentChange);
	if (change < 5) return 'About the same as last year';
	if (isIncrease) {
		if (change > 50) return 'Watching way more!';
		if (change > 25) return 'Watching a lot more';
		return 'Watching more';
	}
	if (change > 50) return 'Taking it easy this year';
	if (change > 25) return 'Watching less';
	return 'Slightly less viewing';
});

function formatHours(minutes: number): string {
	const hours = Math.round(minutes / 60);
	return `${hours.toLocaleString()}h`;
}

const maxMinutes = $derived(
	yearComparison ? Math.max(yearComparison.thisYear, yearComparison.lastYear, 1) : 1
);
const thisYearWidth = $derived(yearComparison ? (yearComparison.thisYear / maxMinutes) * 100 : 0);
const lastYearWidth = $derived(yearComparison ? (yearComparison.lastYear / maxMinutes) * 100 : 0);

let container: HTMLElement | undefined = $state();
let bars: HTMLElement[] = $state([]);
let changeIndicator: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active || !hasData) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		bars.forEach((el) => {
			if (el) el.style.transform = 'scaleX(1)';
		});
		if (changeIndicator) {
			changeIndicator.style.opacity = '1';
			changeIndicator.style.transform = 'none';
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
	if (validBars.length > 0) {
		const barsAnim = animate(
			validBars,
			{ transform: ['scaleX(0)', 'scaleX(1)'] },
			{
				type: 'spring',
				...SPRING_PRESETS.dramatic,
				delay: DELAY_PRESETS.short
			}
		);

		if (changeIndicator) {
			const indicatorAnim = animate(
				changeIndicator,
				{ opacity: [0, 1], transform: ['scale(0.8)', 'scale(1)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.bouncy,
					delay: DELAY_PRESETS.medium
				}
			);

			indicatorAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				barsAnim.stop();
				indicatorAnim.stop();
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

<BaseSlide {active} class="year-comparison-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">Year Over Year</h2>

		{#if hasData && yearComparison}
			<div class="comparison-container">
				<div class="bar-row">
					<span class="year-label">This Year</span>
					<div class="bar-track">
						<div
							bind:this={bars[0]}
							class="bar this-year"
							style="width: {Math.max(thisYearWidth, 2)}%;"
						>
							<span class="bar-value">{formatHours(yearComparison.thisYear)}</span>
						</div>
					</div>
				</div>
				<div class="bar-row">
					<span class="year-label">Last Year</span>
					<div class="bar-track">
						<div
							bind:this={bars[1]}
							class="bar last-year"
							style="width: {Math.max(lastYearWidth, 2)}%;"
						>
							<span class="bar-value">{formatHours(yearComparison.lastYear)}</span>
						</div>
					</div>
				</div>
			</div>

			<div
				bind:this={changeIndicator}
				class="change-indicator"
				class:increase={isIncrease}
				class:decrease={isDecrease}
			>
				<span class="change-arrow">{isIncrease ? '↑' : isDecrease ? '↓' : '→'}</span>
				<span class="change-percent">
					{isIncrease ? '+' : ''}{Math.round(yearComparison.percentChange)}%
				</span>
				<span class="change-message">{message}</span>
			</div>
		{:else}
			<p class="empty-message">No previous year data available</p>
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

.comparison-container {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	padding: 1.5rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 2);
}

.bar-row {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.year-label {
	font-size: 0.875rem;
	font-weight: 600;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.bar-track {
	width: 100%;
	height: 40px;
	background: oklch(var(--muted) / 0.2);
	border-radius: var(--radius);
	overflow: hidden;
}

.bar {
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	padding-right: 1rem;
	border-radius: var(--radius);
	transform-origin: left center;
	min-width: 60px;
}

.bar.this-year {
	background: linear-gradient(90deg, oklch(var(--primary)), oklch(var(--primary) / 0.8));
	box-shadow: 0 0 15px oklch(var(--primary) / 0.3);
}

.bar.last-year {
	background: linear-gradient(
		90deg,
		oklch(var(--muted-foreground) / 0.5),
		oklch(var(--muted-foreground) / 0.3)
	);
}

.bar-value {
	font-size: 1rem;
	font-weight: 700;
	color: oklch(var(--foreground));
}

.change-indicator {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	padding: 1.25rem 2rem;
	border-radius: calc(var(--radius) * 2);
	background: var(--slide-glass-bg);
	border: 1px solid var(--slide-glass-border);
}

.change-indicator.increase {
	border-color: oklch(0.6568 0.1848 143.11 / 0.3);
	background: oklch(0.6568 0.1848 143.11 / 0.1);
}

.change-indicator.decrease {
	border-color: oklch(0.584 0.1257 262.99 / 0.3);
	background: oklch(0.584 0.1257 262.99 / 0.1);
}

.change-arrow {
	font-size: 2rem;
}

.change-indicator.increase .change-arrow {
	color: oklch(0.6568 0.1848 143.11);
}

.change-indicator.decrease .change-arrow {
	color: oklch(0.584 0.1257 262.99);
}

.change-percent {
	font-size: 1.75rem;
	font-weight: 700;
}

.change-indicator.increase .change-percent {
	color: oklch(0.6568 0.1848 143.11);
}

.change-indicator.decrease .change-percent {
	color: oklch(0.584 0.1257 262.99);
}

.change-message {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	text-align: center;
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
		gap: 1.5rem;
	}

	.title {
		font-size: 1.5rem;
	}

	.comparison-container {
		padding: 1rem;
		gap: 1rem;
	}

	.bar-track {
		height: 32px;
	}

	.bar-value {
		font-size: 0.875rem;
	}

	.change-indicator {
		padding: 1rem 1.5rem;
	}

	.change-arrow {
		font-size: 1.5rem;
	}

	.change-percent {
		font-size: 1.5rem;
	}
}
</style>
