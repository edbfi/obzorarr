<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { DELAY_PRESETS, KEYFRAMES, SPRING_PRESETS } from '$lib/utils/animation-presets';
import BaseSlide from './BaseSlide.svelte';
import type { SlideMessagingContext } from './messaging-context';
import { createPersonalContext } from './messaging-context';
import type { FunFactSlideProps } from './types';

interface Props extends FunFactSlideProps {
	messagingContext?: SlideMessagingContext;
}

let {
	fact,
	comparison,
	icon = '🎬',
	active = true,
	onAnimationComplete,
	class: klass = '',
	children,
	messagingContext = createPersonalContext()
}: Props = $props();

let container: HTMLElement | undefined = $state();
let iconEl: HTMLElement | undefined = $state();
let factEl: HTMLElement | undefined = $state();
let comparisonEl: HTMLElement | undefined = $state();

$effect(() => {
	if (!container || !factEl || !active) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate) {
		container.style.opacity = '1';
		container.style.transform = 'none';
		if (iconEl) {
			iconEl.style.opacity = '1';
			iconEl.style.transform = 'none';
		}
		factEl.style.opacity = '1';
		factEl.style.transform = 'none';
		if (comparisonEl) {
			comparisonEl.style.opacity = '1';
			comparisonEl.style.transform = 'none';
		}
		onAnimationComplete?.();
		return;
	}

	const animations: ReturnType<typeof animate>[] = [];

	const containerAnim = animate(container, KEYFRAMES.playfulEntry, {
		type: 'spring',
		...SPRING_PRESETS.snappy
	});
	animations.push(containerAnim);

	if (iconEl) {
		const iconAnim = animate(
			iconEl,
			{
				transform: ['scale(0) rotate(-15deg)', 'scale(1) rotate(0deg)'],
				opacity: [0, 1]
			},
			{
				type: 'spring',
				...SPRING_PRESETS.bouncy,
				delay: DELAY_PRESETS.short
			}
		);
		animations.push(iconAnim);
	}

	const factAnim = animate(
		factEl,
		{ opacity: [0, 1], transform: ['translateY(25px)', 'translateY(0)'] },
		{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.medium }
	);
	animations.push(factAnim);

	if (comparisonEl && comparison) {
		const comparisonAnim = animate(
			comparisonEl,
			{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.long }
		);
		animations.push(comparisonAnim);

		comparisonAnim.finished.then(() => {
			onAnimationComplete?.();
		});
	} else {
		factAnim.finished.then(() => {
			onAnimationComplete?.();
		});
	}

	return () => {
		animations.forEach((a) => a.stop());
	};
});
</script>

<BaseSlide {active} class="fun-fact-slide {klass}" variant="highlight">
	<div bind:this={container} class="content">
		<span bind:this={iconEl} class="icon" aria-hidden="true">{icon}</span>

		<h2 class="title">Fun Fact</h2>

		<p bind:this={factEl} class="fact">
			{fact}
		</p>

		{#if comparison}
			<p bind:this={comparisonEl} class="comparison">
				{comparison}
			</p>
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
	max-width: 750px;
	text-align: center;
	padding: 2.5rem;
	background: var(--slide-glass-bg);
	backdrop-filter: blur(var(--slide-glass-blur, 20px));
	-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
	border: 1px solid var(--slide-glass-border);
	border-radius: calc(var(--radius) * 2.5);
	box-shadow:
		var(--shadow-elevation-high, 0 8px 24px oklch(0 0 0 / 0.4)),
		inset 0 1px 0 oklch(1 0 0 / 0.05);
	position: relative;
}

.content::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, oklch(var(--primary) / 0.5), transparent);
	border-radius: inherit;
}

.icon {
	font-size: 4.5rem;
	line-height: 1;
	margin-bottom: 0.5rem;
	filter: drop-shadow(0 0 25px var(--slide-glow-color, oklch(var(--primary) / 0.4)));
	animation: float 3s ease-in-out infinite;
}

@keyframes float {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-8px);
	}
}

@media (prefers-reduced-motion: reduce) {
	.icon {
		animation: none;
	}
}

.title {
	font-size: 1rem;
	font-weight: 600;
	color: oklch(var(--muted-foreground));
	text-transform: uppercase;
	letter-spacing: 0.15em;
}

.fact {
	font-size: clamp(1.5rem, 4vw, 2rem);
	font-weight: 700;
	color: oklch(var(--foreground));
	line-height: 1.35;
}

.comparison {
	font-size: 1.125rem;
	color: oklch(var(--primary));
	font-style: italic;
	margin-top: 0.5rem;
	padding: 0.5rem 1rem;
	background: oklch(var(--primary) / 0.1);
	border-radius: var(--radius);
	text-shadow: 0 0 15px oklch(var(--primary) / 0.3);
}

.extra {
	margin-top: 1.5rem;
}

@media (max-width: 767px) {
	.content {
		max-width: 100%;
		padding: 1.5rem 1rem;
		gap: 1rem;
	}

	.icon {
		font-size: 3.5rem;
	}

	.title {
		font-size: 0.875rem;
	}

	.comparison {
		font-size: 1rem;
	}
}

@media (min-width: 768px) and (max-width: 1023px) {
	.content {
		max-width: var(--content-max-md, 750px);
		padding: 2.5rem 2rem;
	}

	.icon {
		font-size: 5rem;
	}

	.title {
		font-size: 1.125rem;
	}

	.fact {
		font-size: clamp(1.75rem, 4.5vw, 2.25rem);
	}

	.comparison {
		font-size: 1.25rem;
	}
}

@media (min-width: 1024px) {
	.content {
		max-width: var(--content-max-lg, 850px);
		gap: 1.75rem;
		padding: 3.5rem;
	}

	.icon {
		font-size: 7rem;
		margin-bottom: 0.75rem;
		filter: drop-shadow(0 0 40px var(--slide-glow-color, oklch(var(--primary) / 0.5)));
	}

	.title {
		font-size: 1.25rem;
	}

	.fact {
		font-size: clamp(2rem, 5vw, 2.5rem);
	}

	.comparison {
		font-size: 1.375rem;
		margin-top: 1rem;
	}
}
</style>
