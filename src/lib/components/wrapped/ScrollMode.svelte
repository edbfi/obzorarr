<script lang="ts">
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { tick } from 'svelte';
import type { SlideMessagingContext } from '$lib/components/slides/messaging-context';
import { createPersonalContext } from '$lib/components/slides/messaging-context';
import type { SlideRenderConfig } from '$lib/components/slides/types';
import type { CustomSlide } from '$lib/slides/types';
import type { ServerStats, UserStats } from '$lib/stats/types';
import SlideRenderer from './SlideRenderer.svelte';

gsap.registerPlugin(ScrollTrigger);

interface Props {
	stats: UserStats | ServerStats;
	slides: SlideRenderConfig[];
	customSlides?: Map<number, CustomSlide>;
	initialSlideIndex?: number;
	onModeSwitch?: (currentSlideIndex: number) => void;
	onClose?: () => void;
	class?: string;
	messagingContext?: SlideMessagingContext;
}

let {
	stats,
	slides,
	customSlides,
	initialSlideIndex = 0,
	onModeSwitch,
	onClose,
	class: klass = '',
	messagingContext = createPersonalContext()
}: Props = $props();

let container: HTMLElement | undefined = $state();
let sectionRefs: (HTMLElement | undefined)[] = $state([]);
let visibleSectionIndex = $state(0);
let hasScrolledToInitial = $state(false);

const enabledSlides = $derived(slides.filter((s) => s.enabled));
const totalSlides = $derived(enabledSlides.length);

$effect(() => {
	if (hasScrolledToInitial || !container) return;
	if (sectionRefs.filter(Boolean).length < enabledSlides.length) return;

	const targetIndex = Math.max(0, Math.min(initialSlideIndex, enabledSlides.length - 1));

	if (targetIndex > 0) {
		tick().then(() => {
			const targetSection = sectionRefs[targetIndex];
			if (targetSection) {
				targetSection.scrollIntoView({
					behavior: 'instant',
					block: 'start'
				});
			}
			hasScrolledToInitial = true;
		});
	} else {
		hasScrolledToInitial = true;
	}
});

$effect(() => {
	if (!container) return;

	const validSections = sectionRefs.filter(Boolean);
	if (validSections.length === 0) return;

	const ctx = gsap.context(() => {
		const mm = gsap.matchMedia();

		mm.add('(prefers-reduced-motion: no-preference)', () => {
			sectionRefs.forEach((section, index) => {
				if (!section) return;

				const content = section.querySelector('.slide-content');
				if (!content) return;

				gsap.from(content, {
					scrollTrigger: {
						trigger: section,
						start: 'top 85%',
						end: 'top 15%',
						toggleActions: 'play none none reverse',
						onEnter: () => {
							visibleSectionIndex = index;
						},
						onEnterBack: () => {
							visibleSectionIndex = index;
						}
					},
					y: 60,
					opacity: 0,
					scale: 0.95,
					duration: 0.7,
					ease: 'power3.out'
				});
			});
		});

		mm.add('(prefers-reduced-motion: reduce)', () => {
			sectionRefs.forEach((section, index) => {
				if (!section) return;

				const content = section.querySelector('.slide-content');
				if (!content) return;

				gsap.set(content, { opacity: 1 });

				ScrollTrigger.create({
					trigger: section,
					start: 'top 80%',
					onEnter: () => {
						visibleSectionIndex = index;
					},
					onEnterBack: () => {
						visibleSectionIndex = index;
					}
				});
			});
		});
	}, container);

	return () => {
		ctx.revert();
	};
});

function handleModeSwitch(): void {
	onModeSwitch?.(visibleSectionIndex);
}

function handleKeyDown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		event.preventDefault();
		onClose?.();
	}
}
</script>

<svelte:window onkeydown={handleKeyDown} />

<main bind:this={container} class="scroll-mode {klass}" aria-label="Wrapped statistics">
	<div class="scroll-content">
		{#each enabledSlides as slide, index (`${slide.type}-${index}`)}
			<section
				bind:this={sectionRefs[index]}
				class="scroll-section"
				class:active={visibleSectionIndex === index}
				data-slide-index={index}
			>
				<div class="slide-content">
					<SlideRenderer {slide} {stats} {customSlides} active={true} {messagingContext} />
				</div>
			</section>
		{/each}
	</div>

	<div class="scroll-progress" aria-hidden="true">
		<span class="progress-text">{visibleSectionIndex + 1} / {totalSlides}</span>
	</div>

	{#if onClose}
		<button
			type="button"
			class="close-button"
			onclick={(e) => {
	e.stopPropagation();
	onClose?.();
}}
			aria-label="Close"
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		</button>
	{/if}
</main>

<style>
.scroll-mode {
	width: 100%;
	min-height: 100vh;
	background: var(
		--slide-bg-gradient,
		linear-gradient(135deg, oklch(var(--slide-bg-start)) 0%, oklch(var(--slide-bg-end)) 100%)
	);
	background-attachment: fixed;
	color: var(--foreground, white);
	position: relative;
}

.scroll-mode::before {
	content: "";
	position: fixed;
	inset: 0;
	background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
	opacity: var(--slide-noise-opacity, 0.03);
	pointer-events: none;
	mix-blend-mode: overlay;
	z-index: 0;
}

.scroll-mode::after {
	content: "";
	position: fixed;
	inset: 0;
	background: radial-gradient(
		ellipse 80% 80% at 50% 50%,
		transparent 0%,
		oklch(0 0 0 / var(--slide-vignette-opacity, 0.4)) 100%
	);
	pointer-events: none;
	z-index: 0;
}

.scroll-content {
	padding-bottom: 50vh;
	position: relative;
	z-index: 1;
}

.scroll-section {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 4rem 2rem;
	position: relative;
}

.scroll-section:nth-child(even) {
	background: rgba(255, 255, 255, 0.02);
}

.slide-content {
	width: 100%;
	max-width: 800px;
	margin: 0 auto;
}

.scroll-progress {
	position: fixed;
	bottom: 2rem;
	right: 2rem;
	padding: 0.5rem 1rem;
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(8px);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 0.5rem;
	z-index: 50;
}

.progress-text {
	font-size: 0.875rem;
	font-weight: 500;
	color: var(--muted-foreground, rgba(255, 255, 255, 0.6));
}

.close-button {
	position: fixed;
	top: 1rem;
	right: 1rem;
	z-index: 101;
	width: var(--min-tap-size);
	height: var(--min-tap-size);
	min-width: var(--min-tap-size);
	min-height: var(--min-tap-size);
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(8px);
	border: none;
	border-radius: 50%;
	color: var(--foreground, white);
	cursor: pointer;
	transition:
		background-color 0.2s,
		transform 0.2s;
}

.close-button:hover {
	background: rgba(0, 0, 0, 0.7);
	transform: scale(1.1);
}

.close-button:focus-visible {
	outline: 2px solid var(--primary, #dc2626);
	outline-offset: 2px;
}

.close-button svg {
	width: 1.25rem;
	height: 1.25rem;
}

@media (max-width: 767px) {
	.scroll-section {
		padding: 3rem 1rem;
	}

	.scroll-progress {
		bottom: 1.5rem;
		right: 1rem;
		padding: 0.375rem 0.75rem;
	}

	.progress-text {
		font-size: 0.75rem;
	}

	.close-button {
		top: 0.75rem;
		right: 0.75rem;
		/* Hold the tap-target floor on mobile — the previous 2rem
				   square (32px) failed WCAG 2.1 SC 2.5.5. */
		width: var(--min-tap-size);
		height: var(--min-tap-size);
	}

	.close-button svg {
		width: 1.25rem;
		height: 1.25rem;
	}
}

@media (min-width: 768px) {
	.scroll-section {
		padding: 4rem 3rem;
	}

	.slide-content {
		max-width: 850px;
	}
}

@media (min-width: 1024px) {
	.scroll-section {
		padding: 5rem 4rem;
	}

	.slide-content {
		max-width: var(--content-max-xl, 1100px);
	}

	.scroll-progress {
		padding: 0.5rem 1rem;
	}

	.progress-text {
		font-size: 0.875rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.slide-content {
		opacity: 1 !important;
		transform: none !important;
	}
}
</style>
