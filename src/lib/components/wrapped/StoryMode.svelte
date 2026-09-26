<script lang="ts">
import { animate } from 'motion';
import { tick } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import type { SlideMessagingContext } from '$lib/components/slides/messaging-context';
import { createPersonalContext } from '$lib/components/slides/messaging-context';
import type { SlideRenderConfig } from '$lib/components/slides/types';
import type { CustomSlide } from '$lib/slides/types';
import type { ServerStats, UserStats } from '$lib/stats/types';
import { createSlideState } from '$lib/stores/slide-state.svelte';
import { EASING_PRESETS } from '$lib/utils/animation-presets';
import ProgressBar from './ProgressBar.svelte';
import SlideRenderer from './SlideRenderer.svelte';

interface Props {
	stats: UserStats | ServerStats;
	slides: SlideRenderConfig[];
	customSlides?: Map<number, CustomSlide>;
	initialSlideIndex?: number;
	onSlideChange?: (slideIndex: number) => void;
	onComplete?: () => void;
	onClose?: () => void;
	class?: string;
	messagingContext?: SlideMessagingContext;
}

let {
	stats,
	slides,
	customSlides,
	initialSlideIndex = 0,
	onSlideChange,
	onComplete,
	onClose,
	class: klass = '',
	messagingContext = createPersonalContext()
}: Props = $props();

const EDGE_ZONE_PERCENT = 0.15;
const SWIPE_THRESHOLD = 50;
const ANIMATION_DURATION = 450;
// Throttle keydown to ~10 events/sec. Held-down arrow keys repeat at the OS
// rate (often 30+/sec), which queues up against the in-flight motion-library
// animation calls and saturates the main thread. The `isTransitioning` gate
// only blocks during an animation; this gate also caps the rate between
// animations so the slideshow advances at a human-readable pace.
const KEYDOWN_THROTTLE_MS = 100;
type AnimationHandle = { stop: () => void; finished: Promise<void> };

const navigation = createSlideState();
let initialized = $state(false);
let initializedSlideCount = $state(0);

$effect(() => {
	// Read every reactive dependency upfront so Svelte 5's fine-grained tracking
	// registers them even when the guard short-circuits. Reading initialSlideIndex
	// only inside the branch would drop it as a dependency once initialized is
	// true, so a late seed (e.g. a deep-link hash applied in the parent's
	// afterNavigate) would be silently ignored.
	const seedIndex = initialSlideIndex;
	const slideCount = slides.length;
	// Track isAnimating so the effect re-runs when a transition completes (the only
	// reactive change at animation end). goToSlide's own isAnimating guard would
	// silently drop a late seed that arrives mid-transition, and without isAnimating
	// as a dependency the effect would never re-run to retry it.
	const animating = navigation.isAnimating;
	if (!initialized || initializedSlideCount !== slideCount) {
		navigation.initialize(slideCount, seedIndex);
		initialized = true;
		initializedSlideCount = slideCount;
		onSlideChange?.(navigation.currentSlide);
	} else if (!animating && seedIndex !== navigation.currentSlide) {
		// A late seed (e.g. a deep-link hash applied in the parent's afterNavigate
		// after first init) must still move the view. goToSlide is a no-op when the
		// index already matches currentSlide, so the normal user-navigation echo
		// (seedIndex === currentSlide) does not fight live navigation. We gate on
		// !animating here so a seed that lands mid-transition is retried the moment
		// the animation ends (the effect re-runs when isAnimating flips false), rather
		// than being lost to goToSlide's internal guard. Do NOT emit onSlideChange
		// here: the parent already holds this index, and echoing would arm a spurious
		// hash replaceState.
		navigation.goToSlide(seedIndex);
	}
});

let touchStartX = $state(0);
let touchStartY = $state(0);
let isTouching = $state(false);

let container: HTMLElement | undefined = $state();
let currentSlideEl: HTMLElement | undefined = $state();
let previousSlideEl: HTMLElement | undefined = $state();

let isTransitioning = $state(false);
let showPreviousSlide = $state(false);
let previousSlideIndex = $state(-1);

let mounted = $state(true);
let activeEnterAnim: AnimationHandle | null = $state(null);
let activeExitAnim: AnimationHandle | null = $state(null);
let transitionTimeout: ReturnType<typeof setTimeout> | null = $state(null);
let transitionToken = 0;
let lastKeyTime = 0;

$effect(() => {
	return () => {
		mounted = false;
		clearTransitionHandles();
	};
});

const currentSlide = $derived(slides[navigation.currentSlide]);
const previousSlide = $derived(previousSlideIndex >= 0 ? slides[previousSlideIndex] : null);

function emitSlideChange(): void {
	onSlideChange?.(navigation.currentSlide);
}

function clearTransitionHandles(): void {
	if (transitionTimeout) {
		clearTimeout(transitionTimeout);
		transitionTimeout = null;
	}
	if (activeEnterAnim) {
		activeEnterAnim.stop();
		activeEnterAnim = null;
	}
	if (activeExitAnim) {
		activeExitAnim.stop();
		activeExitAnim = null;
	}
}

function startNavigation(direction: 'forward' | 'backward', move: () => boolean): void {
	if (isTransitioning) return;

	const fromSlide = navigation.currentSlide;
	previousSlideIndex = fromSlide;
	showPreviousSlide = true;
	isTransitioning = true;

	if (!move()) {
		showPreviousSlide = false;
		previousSlideIndex = -1;
		isTransitioning = false;
		return;
	}

	const token = ++transitionToken;
	emitSlideChange();
	void animateTransition(direction, token);
}

function goToNext(): void {
	if (isTransitioning || !navigation.canGoNext) {
		if (navigation.isLast && !isTransitioning) {
			onComplete?.();
		}
		return;
	}

	startNavigation('forward', () => navigation.goToNext());
}

function goToPrevious(): void {
	if (isTransitioning || !navigation.canGoPrevious) return;

	startNavigation('backward', () => navigation.goToPrevious());
}

async function animateTransition(direction: 'forward' | 'backward', token: number): Promise<void> {
	navigation.startAnimation();
	await tick();

	if (!mounted || token !== transitionToken) return;

	const shouldAnimate = !prefersReducedMotion.current;

	if (!shouldAnimate || !currentSlideEl) {
		finishTransition(token);
		return;
	}

	const enterFrom =
		direction === 'forward' ? 'translateX(80%) scale(0.98)' : 'translateX(-80%) scale(0.98)';
	const exitTo =
		direction === 'forward' ? 'translateX(-100%) scale(0.95)' : 'translateX(100%) scale(0.95)';

	const slideEl = currentSlideEl;
	if (!slideEl) {
		finishTransition(token);
		return;
	}

	clearTransitionHandles();

	const enterKeyframes = {
		opacity: [0, 1],
		transform: [enterFrom, 'translateX(0) scale(1)']
	} as Record<string, unknown>;
	const enterAnim = (
		animate as (
			el: Element,
			kf: Record<string, unknown>,
			opts: Record<string, unknown>
		) => { finished: Promise<void>; stop: () => void }
	)(slideEl, enterKeyframes, {
		duration: ANIMATION_DURATION / 1000,
		easing: EASING_PRESETS.organic
	});

	activeEnterAnim = enterAnim;

	const prevEl = previousSlideEl;
	if (prevEl && showPreviousSlide) {
		const exitKeyframes = {
			opacity: [1, 0],
			transform: ['translateX(0) scale(1)', exitTo]
		} as Record<string, unknown>;
		activeExitAnim = (
			animate as (
				el: Element,
				kf: Record<string, unknown>,
				opts: Record<string, unknown>
			) => AnimationHandle
		)(prevEl, exitKeyframes, {
			duration: ANIMATION_DURATION / 1000,
			easing: EASING_PRESETS.organic
		});
	}

	transitionTimeout = setTimeout(() => {
		if (isTransitioning && token === transitionToken) {
			finishTransition(token);
		}
	}, ANIMATION_DURATION + 100);

	enterAnim.finished
		.then(() => {
			if (mounted && isTransitioning && token === transitionToken) {
				finishTransition(token);
			}
		})
		.catch(() => {
			if (mounted && isTransitioning && token === transitionToken) {
				finishTransition(token);
			}
		});
}

function finishTransition(token = transitionToken): void {
	if (!isTransitioning || token !== transitionToken) return;

	clearTransitionHandles();

	showPreviousSlide = false;
	previousSlideIndex = -1;
	isTransitioning = false;
	navigation.endAnimation();
}

function handleClick(event: MouseEvent): void {
	if (isTransitioning) return;

	const target = event.target as HTMLElement;

	if (target.closest('a, button, input, select, textarea')) {
		return;
	}

	const rect = container?.getBoundingClientRect();
	if (!rect) return;

	const clickX = event.clientX - rect.left;
	const relativeX = clickX / rect.width;

	if (relativeX <= EDGE_ZONE_PERCENT) {
		goToPrevious();
	} else {
		goToNext();
	}
}

function handleTouchStart(event: TouchEvent): void {
	if (event.touches.length !== 1) return;

	const touch = event.touches[0];
	if (!touch) return;

	touchStartX = touch.clientX;
	touchStartY = touch.clientY;
	isTouching = true;
}

function handleTouchEnd(event: TouchEvent): void {
	if (!isTouching) return;

	const touch = event.changedTouches[0];
	if (!touch) {
		isTouching = false;
		return;
	}

	const deltaX = touch.clientX - touchStartX;
	const deltaY = touch.clientY - touchStartY;

	if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
		if (deltaX < 0) {
			goToNext();
		} else {
			goToPrevious();
		}
	}

	isTouching = false;
}

function handleKeyDown(event: KeyboardEvent): void {
	if (isTransitioning) return;

	// Only the navigation keys below are owned by this handler. Tab, browser
	// shortcuts, and any other key must fall through untouched so they don't
	// have their default behaviour suppressed or poison the throttle window.
	switch (event.key) {
		case 'ArrowRight':
		case 'ArrowDown':
		case ' ':
		case 'Enter':
		case 'ArrowLeft':
		case 'ArrowUp':
		case 'Escape':
		case 'Home':
		case 'End':
			break;
		default:
			return;
	}

	const now = performance.now();
	if (now - lastKeyTime < KEYDOWN_THROTTLE_MS) {
		event.preventDefault();
		return;
	}
	lastKeyTime = now;

	switch (event.key) {
		case 'ArrowRight':
		case 'ArrowDown':
		case ' ':
		case 'Enter':
			event.preventDefault();
			goToNext();
			break;
		case 'ArrowLeft':
		case 'ArrowUp':
			event.preventDefault();
			goToPrevious();
			break;
		case 'Escape':
			event.preventDefault();
			onClose?.();
			break;
		case 'Home':
			event.preventDefault();
			if (navigation.currentSlide !== 0) {
				startNavigation('backward', () => navigation.goToFirst());
			}
			break;
		case 'End':
			event.preventDefault();
			if (!navigation.isLast) {
				startNavigation('forward', () => navigation.goToLast());
			}
			break;
	}
}

function handleSlideAnimationComplete(): void {}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- The application handles arrow keys through svelte:window and exposes explicit navigation buttons. -->
<div
	bind:this={container}
	class="story-mode {klass}"
	role="application"
	aria-label="Story presentation. Use the arrow keys to move between slides."
	onclick={handleClick}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	tabindex="0"
>
	<ProgressBar current={navigation.currentSlide} total={slides.length} />

	<div class="slides-container">
		{#if showPreviousSlide && previousSlide}
			<div bind:this={previousSlideEl} class="slide previous-slide">
				<SlideRenderer
					slide={previousSlide}
					{stats}
					{customSlides}
					active={false}
					{messagingContext}
				/>
			</div>
		{/if}

		{#if currentSlide}
			{#key navigation.currentSlide}
				<div bind:this={currentSlideEl} class="slide current-slide">
					<SlideRenderer
						slide={currentSlide}
						{stats}
						{customSlides}
						active={!isTransitioning}
						onAnimationComplete={handleSlideAnimationComplete}
						{messagingContext}
					/>
				</div>
			{/key}
		{/if}
	</div>

	{#if navigation.isFirst && !isTransitioning}
		<div class="navigation-hint">
			<span>Tap to continue</span>
		</div>
	{/if}

	<div class="nav-arrows">
		{#if !navigation.isFirst}
			<button
				type="button"
				class="nav-arrow nav-arrow-prev"
				onclick={(e) => {
	e.stopPropagation();
	goToPrevious();
}}
				aria-label="Previous slide"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</button>
		{/if}
		{#if !navigation.isLast}
			<button
				type="button"
				class="nav-arrow nav-arrow-next"
				onclick={(e) => {
	e.stopPropagation();
	goToNext();
}}
				aria-label="Next slide"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M9 18l6-6-6-6" />
				</svg>
			</button>
		{/if}
	</div>

	{#if onClose}
		<button
			type="button"
			class="close-button"
			onclick={(e) => {
	e.stopPropagation();
	onClose?.();
}}
			aria-label="Close presentation"
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

	<div class="focus-ring" aria-hidden="true"></div>
</div>

<style>
.story-mode {
	position: fixed;
	inset: 0;
	width: 100%;
	height: 100dvh;
	background: var(
		--slide-bg-gradient,
		linear-gradient(135deg, oklch(var(--slide-bg-start)) 0%, oklch(var(--slide-bg-end)) 100%)
	);
	overflow: hidden;
	outline: none;
	touch-action: pan-y pinch-zoom;
	user-select: none;
	-webkit-user-select: none;
}

.story-mode:focus-visible {
	outline: none;
}

.focus-ring {
	position: absolute;
	inset: 0;
	z-index: 100;
	pointer-events: none;
	opacity: 0;
	box-shadow:
		inset 0 0 0 3px #ffffff,
		inset 0 0 0 6px var(--primary, #dc2626),
		inset 0 0 0 9px rgba(0, 0, 0, 0.85);
}

.story-mode:focus-visible .focus-ring {
	opacity: 1;
}

.story-mode::before {
	content: "";
	position: absolute;
	inset: 0;
	background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
	opacity: var(--slide-noise-opacity, 0.03);
	pointer-events: none;
	mix-blend-mode: overlay;
	z-index: 1;
}

.story-mode::after {
	content: "";
	position: absolute;
	inset: 0;
	background: radial-gradient(
		ellipse 80% 80% at 50% 50%,
		transparent 0%,
		oklch(0 0 0 / var(--slide-vignette-opacity, 0.4)) 100%
	);
	pointer-events: none;
	z-index: 2;
}

.slides-container {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 3;
}

.slide {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 3rem 1.5rem;
	padding-top: 4rem;
	overflow-y: auto;
}

.previous-slide {
	z-index: 1;
}

.current-slide {
	z-index: 2;
}

.navigation-hint {
	position: absolute;
	bottom: 2rem;
	left: 50%;
	transform: translateX(-50%);
	z-index: 10;
	padding: 0.5rem 1rem;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 2rem;
	font-size: 0.875rem;
	color: var(--muted-foreground, rgba(255, 255, 255, 0.6));
	animation: fadeInOut 3s ease-in-out infinite;
	pointer-events: none;
}

@keyframes fadeInOut {
	0%,
	100% {
		opacity: 0.6;
	}
	50% {
		opacity: 1;
	}
}

.close-button {
	position: absolute;
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
	.slide {
		padding: 2rem 1rem;
		padding-top: 3rem;
	}

	.navigation-hint {
		bottom: 1.5rem;
		font-size: 0.75rem;
	}

	.close-button {
		top: 0.75rem;
		right: 0.75rem;
		/* Hold the tap-target floor on mobile too — the previous 2rem
				   square (32px) failed WCAG 2.1 SC 2.5.5. */
		width: var(--min-tap-size);
		height: var(--min-tap-size);
	}

	.close-button svg {
		width: 1.25rem;
		height: 1.25rem;
	}
}

.nav-arrows {
	display: none;
}

@media (max-width: 767px) {
	.nav-arrows {
		display: flex;
		justify-content: space-between;
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		z-index: 10;
		pointer-events: none;
	}

	.nav-arrow {
		pointer-events: auto;
		width: 3rem;
		height: 3rem;
		background: rgba(0, 0, 0, 0.5);
		border: none;
		border-radius: 50%;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0.7;
		transition:
			opacity 0.15s,
			transform 0.15s;
	}

	.nav-arrow:hover {
		opacity: 1;
		transform: scale(1.1);
	}

	.nav-arrow-prev {
		margin-left: 0.5rem;
	}

	.nav-arrow-next {
		margin-right: 0.5rem;
	}

	.nav-arrow svg {
		width: 1.5rem;
		height: 1.5rem;
	}
}
@media (min-width: 768px) {
	.slide {
		padding: 3rem 2rem;
		padding-top: 4rem;
	}
}

@media (min-width: 1024px) {
	.slide {
		padding: 4rem 3rem;
		padding-top: 4.5rem;
	}

	.close-button {
		width: var(--min-tap-size);
		height: var(--min-tap-size);
	}

	.close-button svg {
		width: 1.5rem;
		height: 1.5rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.navigation-hint {
		animation: none;
		opacity: 0.8;
	}

	.close-button {
		transition: none;
	}

	.close-button:hover {
		transform: none;
	}
}
</style>
