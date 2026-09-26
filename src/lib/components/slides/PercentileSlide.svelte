<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, KEYFRAMES, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext, getPossessive } from './messaging-context';
import type { PercentileSlideProps } from './types';

interface Props extends PercentileSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	percentileRank,
	totalUsers,
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

const possessive = $derived(getPossessive(messagingContext));

const topPercentage = $derived(Math.max(1, Math.round(100 - percentileRank)));
const isTopPerformer = $derived(topPercentage <= 10);

const message = $derived.by(() => {
	if (topPercentage <= 1) return "You're the #1 viewer!";
	if (topPercentage <= 5) return "You're in the top 5%!";
	if (topPercentage <= 10) return "You're in the top 10%!";
	if (topPercentage <= 25) return "You're in the top quarter!";
	if (topPercentage <= 50) return 'You watch more than most!';
	return 'Keep watching!';
});

let container: HTMLElement | undefined = $state();
let numberEl: HTMLElement | undefined = $state();
let messageEl: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !numberEl || !messageEl || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		numberEl.style.opacity = '1';
		numberEl.style.transform = 'none';
		messageEl.style.opacity = '1';
		messageEl.style.transform = 'none';
		onAnimationComplete?.();
		return;
	}

	const animations: ReturnType<typeof animate>[] = [];

	const containerAnim = animate(
		container,
		{ opacity: [0, 1], transform: ['scale(0.9)', 'scale(1)'] },
		{ type: 'spring', ...SPRING_PRESETS.impactful }
	);
	animations.push(containerAnim);

	const numberAnim = animate(
		numberEl,
		{
			transform: ['scale(0)', 'scale(1)'],
			opacity: [0, 1]
		},
		{
			type: 'spring',
			...SPRING_PRESETS.bouncy,
			delay: DELAY_PRESETS.short
		}
	);
	animations.push(numberAnim);

	const messageAnim = animate(
		messageEl,
		{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
		{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.long }
	);
	animations.push(messageAnim);

	messageAnim.finished.then(() => {
		onAnimationComplete?.();
	});

	return () => {
		animations.forEach((a) => a.stop());
	};
});
</script>

<BaseSlide
	{active}
	class="percentile-slide {klass}"
	variant={isTopPerformer ? 'highlight' : 'default'}
>
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Ranking</h2>

		<div class="stat-wrapper" class:top-performer={isTopPerformer}>
			<div class="gradient-ring" class:animate-spin={active}></div>
			<div bind:this={numberEl} class="stat-container">
				<span class="prefix">Top</span>
				<span class="percentage">{topPercentage}%</span>
			</div>
		</div>

		<p bind:this={messageEl} class="message">
			{message}
		</p>

		{#if totalUsers && totalUsers > 1}
			<p class="total-users">Out of {totalUsers} viewers on this server</p>
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
	max-width: var(--content-max-sm, 600px);
}

.title {
	font-size: 1.5rem;
	font-weight: 600;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.stat-wrapper {
	position: relative;
	width: 240px;
	height: 240px;
	aspect-ratio: 1;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.gradient-ring {
	position: absolute;
	inset: 0;
	border-radius: 50%;
	background: conic-gradient(
		from 0deg,
		oklch(var(--primary)),
		oklch(var(--primary-wheel-plus-60)),
		oklch(var(--primary-wheel-plus-120)),
		oklch(var(--primary-wheel-plus-180)),
		oklch(var(--primary-wheel-plus-240)),
		oklch(var(--primary-wheel-plus-300)),
		oklch(var(--primary))
	);
	mask: radial-gradient(farthest-side, transparent calc(100% - 5px), black calc(100% - 4px));
	-webkit-mask: radial-gradient(
		farthest-side,
		transparent calc(100% - 5px),
		black calc(100% - 4px)
	);
	filter: blur(1px);
	opacity: 0.7;
}

.gradient-ring.animate-spin {
	animation: spin 8s linear infinite;
}

@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.gradient-ring.animate-spin {
		animation: none;
	}
}

.top-performer .gradient-ring {
	background: conic-gradient(
		from 0deg,
		oklch(0.8153 0.1652 85.67),
		oklch(0.7585 0.1524 69.32),
		oklch(0.9085 0.1755 103.97),
		oklch(0.8153 0.1652 85.67),
		oklch(0.7585 0.1524 69.32),
		oklch(0.9085 0.1755 103.97),
		oklch(0.8153 0.1652 85.67)
	);
	opacity: 0.9;
	filter: blur(0.5px);
}

.stat-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 2rem;
	border-radius: 50%;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	width: calc(100% - 10px);
	aspect-ratio: 1;
	justify-content: center;
	box-shadow:
		inset 0 2px 4px oklch(1 0 0 / 0.1),
		inset 0 -2px 4px oklch(0 0 0 / 0.2),
		var(--shadow-elevation-high, 0 8px 24px oklch(0 0 0 / 0.4));
	position: relative;
	z-index: 1;
}

.top-performer .stat-container {
	box-shadow:
		inset 0 2px 4px oklch(1 0 0 / 0.15),
		inset 0 -2px 4px oklch(0 0 0 / 0.2),
		var(--shadow-elevation-high, 0 8px 24px oklch(0 0 0 / 0.4)),
		0 0 50px oklch(0.8153 0.1652 85.67 / 0.25);
}

.prefix {
	font-size: 1.125rem;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.1em;
	font-weight: 500;
}

.percentage {
	font-size: clamp(3rem, 8vw, 4.5rem);
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
	filter: drop-shadow(0 0 15px oklch(var(--primary) / 0.4));
}

.top-performer .percentage {
	background: linear-gradient(
		180deg,
		oklch(0.8309 0.1622 87.87) 0%,
		oklch(0.7358 0.1599 66.01) 100%
	);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
	filter: drop-shadow(0 0 20px oklch(0.8153 0.1652 85.67 / 0.5));
}

.message {
	font-size: 1.5rem;
	font-weight: 600;
	color: oklch(var(--foreground));
	text-align: center;
	padding: 0.75rem 1.5rem;
	background: oklch(var(--primary) / 0.1);
	border-radius: calc(var(--radius) * 1.5);
	box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.05);
}

.top-performer ~ .message {
	background: oklch(0.8153 0.1652 85.67 / 0.12);
	color: oklch(0.8394 0.1254 91.1);
	box-shadow:
		inset 0 1px 0 oklch(0.8816 0.1283 91.19 / 0.1),
		0 0 20px oklch(0.8153 0.1652 85.67 / 0.15);
}

.total-users {
	font-size: 0.9375rem;
	color: oklch(var(--muted-foreground));
	padding: 0.375rem 0.875rem;
	background: oklch(var(--primary) / 0.06);
	border-radius: var(--radius);
}

.extra {
	margin-top: 1.5rem;
}

@media (max-width: 767px) {
	.content {
		gap: 1.5rem;
	}

	.title {
		font-size: 1.25rem;
	}

	.stat-wrapper {
		width: 190px;
		height: 190px;
	}

	.gradient-ring {
		mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px));
		-webkit-mask: radial-gradient(
			farthest-side,
			transparent calc(100% - 4px),
			black calc(100% - 3px)
		);
	}

	.stat-container {
		padding: 1.5rem;
		width: calc(100% - 8px);
	}

	.prefix {
		font-size: 0.9375rem;
	}

	.message {
		font-size: 1.25rem;
		padding: 0.5rem 1rem;
	}

	.total-users {
		font-size: 0.875rem;
	}
}

@media (min-width: 768px) and (max-width: 1023px) {
	.title {
		font-size: 1.75rem;
	}

	.stat-wrapper {
		width: 240px;
		height: 240px;
	}

	.stat-container {
		padding: 2.25rem;
	}

	.percentage {
		font-size: clamp(3.5rem, 9vw, 5rem);
	}

	.message {
		font-size: 1.625rem;
	}

	.total-users {
		font-size: 1rem;
	}
}

@media (min-width: 1024px) {
	.content {
		gap: 2.5rem;
	}

	.title {
		font-size: 2rem;
	}

	.stat-wrapper {
		width: 300px;
		height: 300px;
	}

	.gradient-ring {
		mask: radial-gradient(farthest-side, transparent calc(100% - 6px), black calc(100% - 5px));
		-webkit-mask: radial-gradient(
			farthest-side,
			transparent calc(100% - 6px),
			black calc(100% - 5px)
		);
	}

	.stat-container {
		padding: 2.75rem;
		width: calc(100% - 12px);
	}

	.prefix {
		font-size: 1.25rem;
	}

	.percentage {
		font-size: clamp(4rem, 10vw, 5.5rem);
	}

	.message {
		font-size: 1.75rem;
		padding: 0.875rem 1.75rem;
	}

	.total-users {
		font-size: 1.0625rem;
	}
}
</style>
