<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { StreakSlideProps } from './types';

interface Props extends StreakSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	watchStreak,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const possessive = $derived(getPossessive(messagingContext));
const hasData = $derived(watchStreak !== null && watchStreak.longestStreak > 0);

const streakEmoji = $derived.by(() => {
	if (!watchStreak) return '🔥';
	if (watchStreak.longestStreak >= 30) return '🔥🔥🔥';
	if (watchStreak.longestStreak >= 14) return '🔥🔥';
	return '🔥';
});

const streakMessage = $derived.by(() => {
	if (!watchStreak) return '';
	if (watchStreak.longestStreak >= 30) return 'A month or more!';
	if (watchStreak.longestStreak >= 14) return 'Two weeks strong!';
	if (watchStreak.longestStreak >= 7) return 'A full week!';
	if (watchStreak.longestStreak >= 3) return 'Building momentum!';
	return 'Getting started!';
});

function formatDateRange(start: string, end: string): string {
	const startDate = new Date(start);
	const endDate = new Date(end);
	const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return `${startStr} - ${endStr}`;
}

let container: HTMLElement | undefined = $state();
let flame: HTMLElement | undefined = $state();
let counter: HTMLElement | undefined = $state();
let details: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		if (flame) {
			flame.style.opacity = '1';
			flame.style.transform = 'none';
		}
		if (counter) {
			counter.style.opacity = '1';
			counter.style.transform = 'none';
		}
		if (details) {
			details.style.opacity = '1';
			details.style.transform = 'none';
		}
		onAnimationComplete?.();
		return;
	}

	const containerAnim = animate(
		container,
		{ opacity: [0, 1], transform: ['translateY(25px) scale(0.98)', 'translateY(0) scale(1)'] },
		{ type: 'spring', ...SPRING_PRESETS.snappy }
	);

	if (flame) {
		const flameAnim = animate(
			flame,
			{ opacity: [0, 1], transform: ['scale(0.5)', 'scale(1.1)', 'scale(1)'] },
			{
				type: 'spring',
				...SPRING_PRESETS.bouncy,
				delay: DELAY_PRESETS.short
			}
		);

		if (counter) {
			const counterAnim = animate(
				counter,
				{ opacity: [0, 1], transform: ['scale(0.8)', 'scale(1)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.snappy,
					delay: DELAY_PRESETS.medium
				}
			);

			if (details) {
				const detailsAnim = animate(
					details,
					{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
					{
						type: 'spring',
						...SPRING_PRESETS.gentle,
						delay: DELAY_PRESETS.long
					}
				);

				detailsAnim.finished.then(() => {
					onAnimationComplete?.();
				});

				return () => {
					containerAnim.stop();
					flameAnim.stop();
					counterAnim.stop();
					detailsAnim.stop();
				};
			}

			counterAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				flameAnim.stop();
				counterAnim.stop();
			};
		}

		return () => {
			containerAnim.stop();
			flameAnim.stop();
		};
	}

	return () => {
		containerAnim.stop();
	};
});
</script>

<BaseSlide {active} class="streak-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Watching Streak</h2>

		{#if hasData && watchStreak}
			<div class="streak-display">
				<span bind:this={flame} class="streak-flame">{streakEmoji}</span>
				<div bind:this={counter} class="streak-counter">
					<span class="streak-number">{watchStreak.longestStreak}</span>
					<span class="streak-label">consecutive days</span>
				</div>
			</div>

			<div bind:this={details} class="streak-details">
				<div class="date-range">
					<span class="range-label">Streak Period</span>
					<span class="range-value">
						{formatDateRange(watchStreak.startDate, watchStreak.endDate)}
					</span>
				</div>
				<div class="message">
					<span class="message-text">{streakMessage}</span>
				</div>
			</div>
		{:else}
			<div class="no-streak">
				<span class="no-streak-icon">📅</span>
				<p class="empty-message">No watching streaks found</p>
				<p class="empty-hint">Watch on consecutive days to build a streak!</p>
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
	gap: 2rem;
	z-index: 1;
	width: 100%;
	max-width: var(--content-max-md, 500px);
}

.title {
	font-size: 1.75rem;
	font-weight: 700;
	color: oklch(var(--primary));
	text-transform: uppercase;
	letter-spacing: 0.05em;
	text-shadow: 0 0 30px var(--slide-glow-color, oklch(var(--primary) / 0.3));
}

.streak-display {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
}

.streak-flame {
	font-size: 4rem;
	filter: drop-shadow(0 0 20px oklch(0.7139 0.1737 55.15 / 0.5));
}

.streak-counter {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
}

.streak-number {
	font-size: 4rem;
	font-weight: 800;
	color: oklch(var(--primary));
	line-height: 1;
	text-shadow: 0 0 30px oklch(var(--primary) / 0.4);
}

.streak-label {
	font-size: 1rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.streak-details {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
	width: 100%;
}

.date-range {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	padding: 0.75rem 1.5rem;
	background: var(--slide-glass-bg);
	border-radius: calc(var(--radius) * 1.5);
	border: 1px solid var(--slide-glass-border);
}

.range-label {
	font-size: 0.6875rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.range-value {
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--foreground));
}

.message {
	padding: 0.625rem 1.25rem;
	background: linear-gradient(
		135deg,
		oklch(0.6972 0.1606 57.57 / 0.15),
		oklch(0.6972 0.1606 57.57 / 0.05)
	);
	border: 1px solid oklch(0.6972 0.1606 57.57 / 0.2);
	border-radius: 2rem;
}

.message-text {
	font-size: 0.9375rem;
	font-weight: 600;
	color: oklch(0.7232 0.15 60.63);
}

.no-streak {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.no-streak-icon {
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
		gap: 1.5rem;
	}

	.title {
		font-size: 1.5rem;
	}

	.streak-flame {
		font-size: 3rem;
	}

	.streak-number {
		font-size: 3rem;
	}

	.streak-label {
		font-size: 0.875rem;
	}
}
</style>
