<script lang="ts">
import { animate, stagger } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, getAdaptiveStagger, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { WeekdayPatternsSlideProps } from './types';

interface Props extends WeekdayPatternsSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	watchTimeByWeekday,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const WEEKDAY_FULL_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];

// UI copy is Monday-first, while the stats array follows JavaScript's Sunday-first getDay().
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DISPLAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const possessive = $derived(getPossessive(messagingContext));

const maxMinutes = $derived(Math.max(...watchTimeByWeekday.minutes, 1));
const peakDay = $derived(
	watchTimeByWeekday.minutes.indexOf(Math.max(...watchTimeByWeekday.minutes))
);

const weekdayTotal = $derived(watchTimeByWeekday.minutes.slice(1, 6).reduce((a, b) => a + b, 0));
const weekendTotal = $derived(
	(watchTimeByWeekday.minutes[0] ?? 0) + (watchTimeByWeekday.minutes[6] ?? 0)
);
const totalMinutes = $derived(weekdayTotal + weekendTotal);

const weekendPercent = $derived(
	totalMinutes > 0 ? Math.round((weekendTotal / totalMinutes) * 100) : 0
);

function formatHours(minutes: number): string {
	let hours = Math.floor(minutes / 60);
	let mins = Math.round(minutes % 60);
	if (mins >= 60) {
		hours++;
		mins -= 60;
	}
	if (hours === 0) return `${mins}m`;
	if (mins === 0) return `${hours}h`;
	return `${hours}h ${mins}m`;
}

let container: HTMLElement | undefined = $state();
let bars: HTMLElement[] = $state([]);
let summary: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		bars.forEach((el) => {
			if (el) el.style.transform = 'scaleY(1)';
		});
		if (summary) {
			summary.style.opacity = '1';
			summary.style.transform = 'none';
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

		if (summary) {
			const summaryAnim = animate(
				summary,
				{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.gentle,
					delay: DELAY_PRESETS.long
				}
			);

			summaryAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				barsAnim.stop();
				summaryAnim.stop();
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

<BaseSlide {active} class="weekday-patterns-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Weekly Pattern</h2>

		<div class="chart-container">
			<div class="bars">
				{#each DISPLAY_ORDER as dataIdx, displayIdx}
					{@const minutes = watchTimeByWeekday.minutes[dataIdx] ?? 0}
					{@const height = maxMinutes > 0 ? (minutes / maxMinutes) * 100 : 0}
					{@const isPeak = dataIdx === peakDay && minutes > 0}
					{@const isWeekend = dataIdx === 0 || dataIdx === 6}
					<div class="bar-wrapper">
						<div class="bar-track">
							<div
								bind:this={bars[displayIdx]}
								class="bar"
								class:peak={isPeak}
								class:weekend={isWeekend}
								style="height: {Math.max(height, 2)}%;"
							>
								<span class="bar-value">{formatHours(minutes)}</span>
							</div>
						</div>
						<span class="bar-label" class:peak={isPeak}>{DISPLAY_NAMES[displayIdx]}</span>
					</div>
				{/each}
			</div>
		</div>

		<div bind:this={summary} class="summary">
			<div class="peak-day">
				<span class="peak-label">Peak Day</span>
				<span class="peak-value">{WEEKDAY_FULL_NAMES[peakDay]}</span>
			</div>
			<div class="weekend-split">
				<span class="split-label">Weekend Viewing</span>
				<span class="split-value">{weekendPercent}%</span>
			</div>
		</div>

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
	box-shadow: var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.3));
}

.bars {
	display: flex;
	justify-content: space-around;
	height: 180px;
	gap: 0.5rem;
}

.bar-wrapper {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	flex: 1;
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
	max-width: 50px;
	background: linear-gradient(180deg, oklch(var(--primary) / 0.6), oklch(var(--primary) / 0.3));
	border-radius: var(--radius) var(--radius) 0 0;
	transform-origin: bottom center;
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding-top: 0.5rem;
	transition: filter 0.3s ease;
	position: relative;
}

.bar:hover {
	filter: brightness(1.2);
}

.bar.peak {
	background: linear-gradient(180deg, oklch(var(--primary)), oklch(var(--primary) / 0.7));
	box-shadow: 0 0 20px oklch(var(--primary) / 0.4);
}

.bar.weekend {
	background: linear-gradient(
		180deg,
		oklch(0.5797 0.2102 312.33 / 0.7),
		oklch(0.5797 0.2102 312.33 / 0.4)
	);
}

.bar.weekend.peak {
	background: linear-gradient(
		180deg,
		oklch(0.5797 0.2102 312.33),
		oklch(0.5797 0.2102 312.33 / 0.7)
	);
	box-shadow: 0 0 20px oklch(0.5797 0.2102 312.33 / 0.4);
}

.bar-value {
	font-size: 0.625rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	white-space: nowrap;
}

.bar-label {
	font-size: 0.75rem;
	color: oklch(var(--muted-foreground));
	font-weight: 500;
}

.bar-label.peak {
	color: oklch(var(--primary));
	font-weight: 700;
}

.summary {
	display: flex;
	gap: 2rem;
	justify-content: center;
}

.peak-day,
.weekend-split {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	padding: 0.75rem 1.5rem;
	background: var(--slide-glass-bg);
	border-radius: calc(var(--radius) * 1.5);
	border: 1px solid var(--slide-glass-border);
}

.peak-label,
.split-label {
	font-size: 0.6875rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.peak-value,
.split-value {
	font-size: 1.125rem;
	font-weight: 700;
	color: oklch(var(--primary));
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

	.bars {
		height: 140px;
		gap: 0.25rem;
	}

	.bar {
		max-width: 35px;
	}

	.bar-value {
		font-size: 0.5rem;
	}

	.bar-label {
		font-size: 0.625rem;
	}

	.summary {
		flex-direction: column;
		gap: 0.75rem;
	}

	.peak-day,
	.weekend-split {
		padding: 0.5rem 1rem;
	}
}

@media (min-width: 1024px) {
	.bars {
		height: 200px;
	}

	.bar {
		max-width: 60px;
	}

	.bar-value {
		font-size: 0.75rem;
	}
}
</style>
