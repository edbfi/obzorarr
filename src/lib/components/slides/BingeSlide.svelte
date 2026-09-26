<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, KEYFRAMES, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext } from './messaging-context';
import type { BingeSlideProps } from './types';

interface Props extends BingeSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	longestBinge,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const hasBinge = $derived(longestBinge !== null);

function formatDuration(totalMinutes: number): string {
	let hours = Math.floor(totalMinutes / 60);
	let minutes = Math.round(totalMinutes % 60);
	if (minutes >= 60) {
		hours++;
		minutes -= 60;
	}
	if (hours === 0) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
	if (minutes === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
	return `${hours}h ${minutes}m`;
}

const sessionDuration = $derived.by(() => {
	if (!longestBinge) return '';
	const sessionMinutes = (longestBinge.endTime - longestBinge.startTime) / 60;
	return formatDuration(sessionMinutes);
});

const contentDuration = $derived.by(() => {
	if (!longestBinge) return '';
	return formatDuration(longestBinge.totalMinutes);
});

const bingeDate = $derived.by(() => {
	if (!longestBinge) return '';
	const date = new Date(longestBinge.startTime * 1000);
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric'
	});
});

let container: HTMLElement | undefined = $state();
let statEl: HTMLElement | undefined = $state();
let detailsEl: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		if (statEl) {
			statEl.style.opacity = '1';
			statEl.style.transform = 'none';
		}
		if (detailsEl) {
			detailsEl.style.opacity = '1';
			detailsEl.style.transform = 'none';
		}
		onAnimationComplete?.();
		return;
	}

	const containerAnim = animate(
		container,
		{ opacity: [0, 1], transform: ['scale(0.95) translateY(20px)', 'scale(1) translateY(0)'] },
		{ type: 'spring', ...SPRING_PRESETS.impactful }
	);

	const animations = [containerAnim];

	if (statEl) {
		const statAnim = animate(
			statEl,
			{
				transform: ['scale(0.7)', 'scale(1)'],
				opacity: [0, 1]
			},
			{ type: 'spring', ...SPRING_PRESETS.bouncy, delay: DELAY_PRESETS.short }
		);
		animations.push(statAnim);
	}

	if (detailsEl) {
		const detailsAnim = animate(
			detailsEl,
			{ opacity: [0, 1], transform: ['translateY(15px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.medium }
		);
		animations.push(detailsAnim);

		detailsAnim.finished.then(() => {
			onAnimationComplete?.();
		});
	} else {
		containerAnim.finished.then(() => {
			onAnimationComplete?.();
		});
	}

	return () => {
		animations.forEach((a) => a.stop());
	};
});
</script>

<BaseSlide {active} class="binge-slide {klass}" variant="dark">
	<div bind:this={container} class="content">
		<h2 class="title">Longest Binge Session</h2>

		{#if hasBinge && longestBinge}
			<div bind:this={statEl} class="stat-container">
				<span class="duration">{sessionDuration}</span>
				<span class="duration-label">session</span>
				<span class="content-duration">{contentDuration} of content</span>
				<span class="plays"
					>{longestBinge.plays} {longestBinge.plays === 1 ? 'episode' : 'episodes'}</span
				>
			</div>

			<div bind:this={detailsEl} class="details">
				<p class="date">On {bingeDate}</p>
				<p class="time-range">
					{new Date(longestBinge.startTime * 1000).toLocaleTimeString('en-US', {
	hour: 'numeric',
	minute: '2-digit'
})}
					-
					{new Date(longestBinge.endTime * 1000).toLocaleTimeString('en-US', {
	hour: 'numeric',
	minute: '2-digit'
})}
				</p>
			</div>
		{:else}
			<div class="no-binge">
				<p class="no-binge-message">No binge sessions detected</p>
				<p class="no-binge-hint">A binge is 2+ consecutive plays within 30 minutes</p>
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
	gap: 2.5rem;
	z-index: 1;
	max-width: var(--content-max-sm, 600px);
}

.title {
	font-size: 1.5rem;
	font-weight: 600;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.stat-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 2.75rem 4.5rem;
	max-width: 400px;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border-radius: calc(var(--radius) * 2);
	border: 2px solid oklch(var(--primary) / 0.4);
	box-shadow:
		var(--shadow-elevation-high, 0 8px 24px oklch(0 0 0 / 0.4)),
		0 0 40px var(--slide-glow-color, oklch(var(--primary) / 0.2)),
		inset 0 1px 0 oklch(1 0 0 / 0.1);
	position: relative;
}

.stat-container::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.6), transparent);
	border-radius: inherit;
}

.duration {
	font-size: clamp(2.5rem, 8vw, 4rem);
	font-weight: 800;
	letter-spacing: -0.02em;
	background: linear-gradient(
		180deg,
		oklch(var(--primary)) 0%,
		oklch(var(--primary-accent-plus-20)) 100%
	);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
	filter: drop-shadow(0 0 20px oklch(var(--primary) / 0.4));
}

.duration-label {
	font-size: 1rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.15em;
	margin-top: -0.25rem;
}

.content-duration {
	font-size: 1rem;
	color: oklch(var(--muted-foreground));
	margin-top: 0.5rem;
}

.plays {
	font-size: 1.25rem;
	color: oklch(var(--foreground));
	margin-top: 0.75rem;
	padding: 0.25rem 0.75rem;
	background: oklch(var(--primary) / 0.1);
	border-radius: var(--radius);
}

.details {
	text-align: center;
	padding: 1rem 1.75rem;
	background: oklch(var(--primary) / 0.08);
	border-radius: calc(var(--radius) * 1.5);
	box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.03);
}

.date {
	font-size: 1.125rem;
	color: oklch(var(--foreground));
	font-weight: 500;
}

.time-range {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	margin-top: 0.375rem;
}

.no-binge {
	text-align: center;
	padding: 2rem;
	background: var(--slide-glass-bg);
	border-radius: calc(var(--radius) * 1.5);
	border: 1px solid var(--slide-glass-border);
}

.no-binge-message {
	font-size: 1.25rem;
	color: oklch(var(--muted-foreground));
	font-style: italic;
}

.no-binge-hint {
	font-size: 0.875rem;
	color: oklch(var(--muted-foreground));
	opacity: 0.7;
	margin-top: 0.5rem;
}

.extra {
	margin-top: 1.5rem;
}

@media (max-width: 767px) {
	.content {
		gap: 2rem;
	}

	.title {
		font-size: 1.25rem;
	}

	.stat-container {
		padding: 2rem 3rem;
		max-width: 320px;
	}

	.duration-label {
		font-size: 0.875rem;
	}

	.content-duration {
		font-size: 0.875rem;
	}

	.plays {
		font-size: 1.0625rem;
	}

	.details {
		padding: 0.75rem 1.25rem;
	}

	.date {
		font-size: 1rem;
	}
}

@media (min-width: 768px) and (max-width: 1023px) {
	.title {
		font-size: 1.75rem;
	}

	.stat-container {
		padding: 2.5rem 4rem;
	}

	.duration {
		font-size: clamp(2.75rem, 9vw, 4.5rem);
	}

	.duration-label {
		font-size: 1.125rem;
	}

	.content-duration {
		font-size: 1.125rem;
	}

	.plays {
		font-size: 1.375rem;
	}

	.date {
		font-size: 1.25rem;
	}

	.time-range {
		font-size: 1rem;
	}
}

@media (min-width: 1024px) {
	.title {
		font-size: 2rem;
	}

	.stat-container {
		padding: 3.5rem 6rem;
		border-radius: calc(var(--radius) * 2.5);
		border-width: 2px;
	}

	.duration {
		font-size: clamp(3rem, 10vw, 5rem);
		filter: drop-shadow(0 0 30px oklch(var(--primary) / 0.5));
	}

	.duration-label {
		font-size: 1.25rem;
	}

	.content-duration {
		font-size: 1.25rem;
	}

	.plays {
		font-size: 1.5rem;
		margin-top: 1rem;
	}

	.date {
		font-size: 1.375rem;
	}

	.time-range {
		font-size: 1.125rem;
		margin-top: 0.5rem;
	}
}
</style>
