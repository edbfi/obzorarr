<script lang="ts">
import { animate, stagger } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import * as Tooltip from '$lib/components/ui/tooltip';
import {
	DELAY_PRESETS,
	getAdaptiveStagger,
	KEYFRAMES,
	SPRING_PRESETS,
	STAGGER_PRESETS
} from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import {
	createPersonalContext,
	getPossessive,
	getSubject,
	getWatchVerb
} from './messaging-context';
import type { DistributionSlideProps } from './types';

interface Props extends DistributionSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	watchTimeByMonth,
	watchTimeByHour,
	view = 'both',
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

let isDesktopViewport = $state(false);

$effect(() => {
	if (typeof window === 'undefined') return;

	const mediaQuery = window.matchMedia('(min-width: 768px)');
	isDesktopViewport = mediaQuery.matches;

	const handleChange = (e: MediaQueryListEvent) => {
		isDesktopViewport = e.matches;
	};

	mediaQuery.addEventListener('change', handleChange);
	return () => mediaQuery.removeEventListener('change', handleChange);
});

type MobileViewType = 'monthly' | 'hourly';
let mobileView: MobileViewType = $state<MobileViewType>('monthly');

const hasMonthlyData = $derived(watchTimeByMonth.minutes.some((m) => m > 0));
const hasHourlyData = $derived(watchTimeByHour.minutes.some((m) => m > 0));
const hasBothData = $derived(hasMonthlyData && hasHourlyData);

const showDualView = $derived(
	isDesktopViewport && hasBothData && view !== 'monthly' && view !== 'hourly'
);

const subject = $derived(getSubject(messagingContext));
const possessive = $derived(getPossessive(messagingContext));
const watchVerb = $derived(getWatchVerb(messagingContext));

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthsFull = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

const maxMonthly = $derived(Math.max(...watchTimeByMonth.minutes, 1));
const maxHourly = $derived(Math.max(...watchTimeByHour.minutes, 1));

const monthlyData = $derived(
	watchTimeByMonth.minutes.map((minutes, i) => ({
		label: months[i] ?? '',
		labelFull: monthsFull[i] ?? '',
		minutes,
		plays: watchTimeByMonth.plays[i] ?? 0,
		percentage: (minutes / maxMonthly) * 100
	}))
);

const hourlyData = $derived(
	watchTimeByHour.minutes.map((minutes, i) => ({
		label: `${i.toString().padStart(2, '0')}:00`,
		labelFull: `${i.toString().padStart(2, '0')}:00 - ${((i + 1) % 24).toString().padStart(2, '0')}:00`,
		minutes,
		plays: watchTimeByHour.plays[i] ?? 0,
		percentage: (minutes / maxHourly) * 100
	}))
);

const activeData = $derived(mobileView === 'hourly' ? hourlyData : monthlyData);
const mobileTitle = $derived(
	mobileView === 'hourly' ? `When ${subject} Watch` : `${possessive} Year in Months`
);

const monthlyPeakIndex = $derived(
	monthlyData.reduce((maxIdx, curr, idx, arr) => {
		const maxItem = arr[maxIdx];
		return maxItem && curr.minutes > maxItem.minutes ? idx : maxIdx;
	}, 0)
);

const hourlyPeakIndex = $derived(
	hourlyData.reduce((maxIdx, curr, idx, arr) => {
		const maxItem = arr[maxIdx];
		return maxItem && curr.minutes > maxItem.minutes ? idx : maxIdx;
	}, 0)
);

const activePeakIndex = $derived(mobileView === 'hourly' ? hourlyPeakIndex : monthlyPeakIndex);

let container: HTMLElement | undefined = $state();
let monthlyBars: HTMLElement[] = $state([]);
let hourlyBars: HTMLElement[] = $state([]);
let singleViewBars: HTMLElement[] = $state([]);

$effect(() => {
	if (!container || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;
	const animations: { stop: () => void; finished: Promise<void> }[] = [];

	const setVisible = (bars: HTMLElement[]) => {
		bars.forEach((el) => {
			if (el) el.style.transform = 'scaleY(1)';
		});
	};

	if (!shouldAnimate) {
		container.style.opacity = '1';
		if (showDualView) {
			setVisible(monthlyBars);
			setVisible(hourlyBars);
		} else {
			setVisible(singleViewBars);
		}
		onAnimationComplete?.();
		return;
	}

	const containerAnim = animate(
		container,
		{ opacity: [0, 1] },
		{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.micro }
	);
	animations.push(containerAnim);

	if (showDualView) {
		const validMonthlyBars = monthlyBars.filter(Boolean);
		const validHourlyBars = hourlyBars.filter(Boolean);
		const monthlyStagger = getAdaptiveStagger(validMonthlyBars.length);
		const hourlyStagger = getAdaptiveStagger(validHourlyBars.length);

		if (validMonthlyBars.length > 0) {
			const monthlyAnim = animate(
				validMonthlyBars,
				{ transform: ['scaleY(0)', 'scaleY(1)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.dramatic,
					delay: stagger(monthlyStagger, { startDelay: DELAY_PRESETS.short })
				}
			);
			animations.push(monthlyAnim);
		}

		if (validHourlyBars.length > 0) {
			const hourlyAnim = animate(
				validHourlyBars,
				{ transform: ['scaleY(0)', 'scaleY(1)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.dramatic,
					delay: stagger(hourlyStagger, { startDelay: DELAY_PRESETS.short + 0.1 })
				}
			);
			animations.push(hourlyAnim);

			hourlyAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		} else if (validMonthlyBars.length > 0) {
			const monthlyAnimRef = animations[1];
			if (monthlyAnimRef) {
				monthlyAnimRef.finished.then(() => {
					onAnimationComplete?.();
				});
			}
		}
	} else {
		const validBars = singleViewBars.filter(Boolean);
		const adaptiveStagger = getAdaptiveStagger(validBars.length);

		if (validBars.length > 0) {
			const barsAnim = animate(
				validBars,
				{ transform: ['scaleY(0)', 'scaleY(1)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.dramatic,
					delay: stagger(adaptiveStagger, { startDelay: DELAY_PRESETS.short })
				}
			);
			animations.push(barsAnim);

			barsAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		}
	}

	return () => {
		animations.forEach((a) => a.stop());
	};
});

function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h`;
}

function formatMinutesDetailed(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	let hours = Math.floor(minutes / 60);
	let mins = Math.round(minutes % 60);
	if (mins >= 60) {
		hours++;
		mins -= 60;
	}
	if (mins === 0) return `${hours}h`;
	return `${hours}h ${mins}m`;
}

function formatPlays(plays: number): string {
	return `${plays} ${plays === 1 ? 'play' : 'plays'}`;
}
</script>

<BaseSlide {active} class="distribution-slide {klass}">
	<div bind:this={container} class="content" class:dual-view={showDualView}>
		{#if showDualView}
			<h2 class="title">{possessive} Viewing Patterns</h2>

			<Tooltip.Provider>
				<div class="charts-grid">
					<div class="chart-section">
						<h3 class="section-title">Year in Months</h3>
						<div class="chart-container monthly">
							{#each monthlyData as item, i}
								<div class="bar-wrapper" class:peak={i === monthlyPeakIndex}>
									<span class="data-label" class:visible={item.minutes > 0}>
										{item.minutes > 0 ? formatMinutes(item.minutes) : ''}
									</span>
									<Tooltip.Root>
										<Tooltip.Trigger>
											<div
												bind:this={monthlyBars[i]}
												class="bar"
												style="height: {item.percentage}%"
												role="img"
												aria-label="{item.labelFull}: {formatMinutesDetailed(item.minutes)}, {formatPlays(item.plays)}"
											>
												<div class="bar-highlight"></div>
											</div>
										</Tooltip.Trigger>
										<Tooltip.Content side="top" class="tooltip-content">
											<div class="tooltip-inner">
												<strong class="tooltip-title">{item.labelFull}</strong>
												<p class="tooltip-stat">{formatMinutesDetailed(item.minutes)}</p>
												<p class="tooltip-stat">{formatPlays(item.plays)}</p>
											</div>
										</Tooltip.Content>
									</Tooltip.Root>
									<span class="label">{item.label}</span>
								</div>
							{/each}
						</div>
						{#if monthlyData[monthlyPeakIndex]}
							<p class="peak-info">
								Peak: <strong>{monthlyData[monthlyPeakIndex].labelFull}</strong>
							</p>
						{/if}
					</div>

					<div class="chart-section">
						<h3 class="section-title">When {subject} {watchVerb}</h3>
						<div class="chart-container hourly">
							{#each hourlyData as item, i}
								<div class="bar-wrapper" class:peak={i === hourlyPeakIndex}>
									<span class="data-label" class:visible={item.minutes > 0}>
										{item.minutes > 0 ? formatMinutes(item.minutes) : ''}
									</span>
									<Tooltip.Root>
										<Tooltip.Trigger>
											<div
												bind:this={hourlyBars[i]}
												class="bar"
												style="height: {item.percentage}%"
												role="img"
												aria-label="{item.labelFull}: {formatMinutesDetailed(item.minutes)}, {formatPlays(item.plays)}"
											>
												<div class="bar-highlight"></div>
											</div>
										</Tooltip.Trigger>
										<Tooltip.Content side="top" class="tooltip-content">
											<div class="tooltip-inner">
												<strong class="tooltip-title">{item.labelFull}</strong>
												<p class="tooltip-stat">{formatMinutesDetailed(item.minutes)}</p>
												<p class="tooltip-stat">{formatPlays(item.plays)}</p>
											</div>
										</Tooltip.Content>
									</Tooltip.Root>
									<span class="label">{i}</span>
								</div>
							{/each}
						</div>
						{#if hourlyData[hourlyPeakIndex]}
							<p class="peak-info">
								Peak: <strong>{hourlyData[hourlyPeakIndex].labelFull}</strong>
							</p>
						{/if}
					</div>
				</div>
			</Tooltip.Provider>
		{:else}
			<div class="mobile-header">
				<h2 class="title">{mobileTitle}</h2>
				{#if hasBothData}
					<div class="view-toggle" role="tablist" aria-label="Chart view selection">
						<button
							type="button"
							role="tab"
							aria-selected={mobileView === 'monthly'}
							class:active={mobileView === 'monthly'}
							onclick={() => {
	mobileView = 'monthly';
}}
						>
							Months
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={mobileView === 'hourly'}
							class:active={mobileView === 'hourly'}
							onclick={() => {
	mobileView = 'hourly';
}}
						>
							Hours
						</button>
					</div>
				{/if}
			</div>

			<Tooltip.Provider>
				<div class="chart-container" class:hourly={mobileView === 'hourly'}>
					{#each activeData as item, i}
						<div class="bar-wrapper" class:peak={i === activePeakIndex}>
							<span class="data-label" class:visible={item.minutes > 0}>
								{item.minutes > 0 ? formatMinutes(item.minutes) : ''}
							</span>
							<Tooltip.Root>
								<Tooltip.Trigger>
									<div
										bind:this={singleViewBars[i]}
										class="bar"
										style="height: {item.percentage}%"
										role="img"
										aria-label="{item.labelFull}: {formatMinutesDetailed(item.minutes)}, {formatPlays(item.plays)}"
									>
										<div class="bar-highlight"></div>
									</div>
								</Tooltip.Trigger>
								<Tooltip.Content side="top" class="tooltip-content">
									<div class="tooltip-inner">
										<strong class="tooltip-title">{item.labelFull}</strong>
										<p class="tooltip-stat">{formatMinutesDetailed(item.minutes)}</p>
										<p class="tooltip-stat">{formatPlays(item.plays)}</p>
									</div>
								</Tooltip.Content>
							</Tooltip.Root>
							<span class="label">{mobileView === 'hourly' ? i : item.label}</span>
						</div>
					{/each}
				</div>
			</Tooltip.Provider>

			{#if activeData[activePeakIndex]}
				<p class="peak-info">
					Peak: <strong>{activeData[activePeakIndex].labelFull}</strong>
					({formatMinutesDetailed(activeData[activePeakIndex].minutes)})
				</p>
			{/if}
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
	text-shadow: 0 0 30px oklch(var(--primary) / 0.3);
}

.chart-container {
	display: flex;
	align-items: flex-end;
	justify-content: center;
	gap: 0.25rem;
	height: 220px;
	width: 100%;
	padding: 1.5rem 1.25rem 1rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 2);
	box-shadow:
		var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.3)),
		inset 0 1px 0 oklch(1 0 0 / 0.05);
	position: relative;
}

.chart-container::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.4), transparent);
	border-radius: inherit;
}

.chart-container.hourly {
	gap: 0.125rem;
}

.bar-wrapper {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-end;
	flex: 1;
	max-width: 45px;
	height: 100%;
	position: relative;
}

.bar-wrapper :global(button[data-slot="tooltip-trigger"]) {
	display: flex;
	align-items: flex-end;
	flex: 1;
	width: 100%;
	background: transparent;
	border: none;
	padding: 0;
	margin: 0;
	outline: none;
	-webkit-appearance: none;
	appearance: none;
}

.bar-wrapper :global(button[data-slot="tooltip-trigger"]:focus-visible) {
	outline: 2px solid oklch(var(--primary) / 0.5);
	outline-offset: 2px;
}

.hourly .bar-wrapper {
	max-width: 20px;
}

.data-label {
	font-size: 0.5625rem;
	color: oklch(var(--muted-foreground));
	margin-bottom: 0.125rem;
	opacity: 0;
	transition: opacity 0.2s ease;
	white-space: nowrap;
	min-height: 0.75rem;
}

.data-label.visible {
	opacity: 0.8;
}

.peak .data-label.visible {
	opacity: 1;
	color: oklch(var(--accent));
	font-weight: 600;
	text-shadow: 0 0 8px oklch(var(--accent) / 0.4);
}

.bar {
	width: 100%;
	background: var(
		--slide-bar-gradient,
		linear-gradient(180deg, oklch(var(--primary)) 0%, oklch(var(--primary) / 0.6) 100%)
	);
	border-radius: 3px 3px 0 0;
	transform-origin: bottom center;
	min-height: 4px;
	position: relative;
	overflow: hidden;
	cursor: pointer;
	box-shadow:
		0 0 8px oklch(var(--primary) / 0.3),
		inset 0 1px 0 oklch(1 0 0 / 0.15);
	transition:
		transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
		filter 0.3s ease,
		box-shadow 0.3s ease;
}

.bar-highlight {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 40%;
	background: linear-gradient(180deg, oklch(1 0 0 / 0.2) 0%, oklch(1 0 0 / 0) 100%);
	border-radius: 3px 3px 0 0;
	pointer-events: none;
}

.bar:hover {
	transform: scaleX(1.2) !important;
	filter: brightness(1.15);
	box-shadow:
		0 0 20px oklch(var(--primary) / 0.5),
		0 0 40px oklch(var(--primary) / 0.3),
		inset 0 1px 0 oklch(1 0 0 / 0.25);
}

.peak .bar {
	background: var(
		--slide-peak-gradient,
		linear-gradient(180deg, oklch(var(--accent)) 0%, oklch(var(--accent) / 0.6) 100%)
	);
	box-shadow:
		0 0 12px oklch(var(--accent) / 0.4),
		inset 0 1px 0 oklch(1 0 0 / 0.2);
}

.peak .bar:hover {
	box-shadow:
		0 0 25px oklch(var(--accent) / 0.6),
		0 0 50px oklch(var(--accent) / 0.3),
		inset 0 1px 0 oklch(1 0 0 / 0.3);
}

.label {
	font-size: 0.625rem;
	color: oklch(var(--muted-foreground));
	margin-top: 0.375rem;
	white-space: nowrap;
}

.hourly .label {
	font-size: 0.5rem;
}

.peak-info {
	font-size: 1rem;
	color: oklch(var(--muted-foreground));
	padding: 0.5rem 1rem;
	background: oklch(var(--primary) / 0.08);
	border-radius: var(--radius);
}

.peak-info strong {
	color: oklch(var(--primary));
	text-shadow: 0 0 10px oklch(var(--primary) / 0.3);
}

.extra {
	margin-top: 1rem;
}

:global(.tooltip-content) {
	background: var(--slide-glass-bg) !important;
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	color: oklch(var(--foreground)) !important;
	border: 1px solid var(--slide-glass-border) !important;
	padding: 0.75rem 1rem !important;
	border-radius: var(--radius) !important;
	box-shadow: var(--shadow-elevation-medium, 0 4px 12px oklch(0 0 0 / 0.3)) !important;
}

.tooltip-inner {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	text-align: center;
}

.tooltip-title {
	color: oklch(var(--primary));
	font-size: 0.9375rem;
	font-weight: 600;
	margin-bottom: 0.25rem;
}

.tooltip-stat {
	font-size: 0.8125rem;
	color: oklch(var(--muted-foreground));
	margin: 0;
}

.content.dual-view {
	max-width: var(--content-max-xl, 1100px);
}

.charts-grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 2rem;
	width: 100%;
}

.chart-section {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
}

.section-title {
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.dual-view .chart-container {
	height: 180px;
}

.dual-view .monthly {
	gap: 0.2rem;
}

.dual-view .monthly .bar-wrapper {
	max-width: 35px;
}

.dual-view .hourly {
	gap: 0.1rem;
}

.dual-view .hourly .bar-wrapper {
	max-width: 16px;
}

.dual-view .hourly .data-label {
	display: none;
}

.dual-view .peak-info {
	font-size: 0.875rem;
}

.mobile-header {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
}

.view-toggle {
	display: flex;
	gap: 0.25rem;
	padding: 0.25rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 1.5);
}

.view-toggle button {
	padding: 0.5rem 1rem;
	border: none;
	background: transparent;
	color: oklch(var(--muted-foreground));
	font-size: 0.8125rem;
	font-weight: 500;
	border-radius: var(--radius);
	cursor: pointer;
	transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.view-toggle button:hover {
	color: oklch(var(--foreground));
	background: oklch(var(--primary) / 0.1);
}

.view-toggle button.active {
	background: oklch(var(--primary));
	color: oklch(var(--primary-foreground));
	box-shadow:
		0 0 12px oklch(var(--primary) / 0.4),
		inset 0 1px 0 oklch(1 0 0 / 0.15);
}

.view-toggle button:focus-visible {
	outline: 2px solid oklch(var(--primary) / 0.5);
	outline-offset: 2px;
}

@media (max-width: 767px) {
	.content {
		gap: 1.5rem;
	}

	.title {
		font-size: 1.5rem;
	}

	.chart-container {
		height: 180px;
		padding: 1rem 0.875rem 0.75rem;
	}

	.bar-wrapper {
		max-width: 35px;
	}

	.data-label {
		font-size: 0.5rem;
	}

	.label {
		font-size: 0.5rem;
	}

	.hourly .label {
		display: none;
	}

	.hourly .bar-wrapper:nth-child(even) .label {
		display: block;
	}

	.hourly .data-label {
		display: none;
	}

	.peak-info {
		font-size: 0.875rem;
	}
}

@media (min-width: 768px) {
	.content {
		max-width: var(--content-max-md, 800px);
	}

	.title {
		font-size: 2rem;
	}

	.charts-grid {
		grid-template-columns: 1fr;
		gap: 2.5rem;
	}

	.dual-view .chart-container {
		height: 220px;
		max-width: 700px;
	}

	.dual-view .monthly .bar-wrapper {
		max-width: 45px;
	}

	.dual-view .hourly .bar-wrapper {
		max-width: 22px;
	}

	.section-title {
		font-size: 1.0625rem;
	}
}

@media (min-width: 1024px) {
	.content {
		max-width: var(--content-max-lg, 900px);
	}

	.chart-container {
		height: 240px;
	}

	.charts-grid {
		grid-template-columns: repeat(2, 1fr);
		gap: 2.5rem;
	}

	.dual-view .chart-container {
		height: 240px;
		max-width: none;
	}

	.dual-view .monthly .bar-wrapper {
		max-width: 38px;
	}

	.dual-view .hourly .bar-wrapper {
		max-width: 18px;
	}

	.section-title {
		font-size: 1.125rem;
	}

	.bar {
		border-radius: 4px 4px 0 0;
	}

	.bar-highlight {
		border-radius: 4px 4px 0 0;
	}

	.data-label {
		font-size: 0.625rem;
	}
}
</style>
