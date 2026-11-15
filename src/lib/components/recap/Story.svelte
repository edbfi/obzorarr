<script lang="ts">
// The story shell (SPEC-recap-spike.md, "Story mode"): one step at a time between a top bar
// (heading, progress, Close) and a bottom bar (Previous, Next), moved by taps, swipes, keys and the
// buttons, throttled. It knows nothing of the steps' content; the last step is the summary. A move
// slides the new step in from the side it comes from, instantly under reduced motion.
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import X from "@lucide/svelte/icons/x";
import { type Snippet, tick } from "svelte";
import { quintOut } from "svelte/easing";
import { prefersReducedMotion } from "svelte/motion";
import type { TransitionConfig } from "svelte/transition";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { token } from "#styled-system/tokens";
import { reelChange } from "./reel-change.ts";
import {
	createPointerGestures,
	createThrottle,
	type KeyPress,
	keyToMove,
	type Move,
} from "./story-input.ts";

interface Props {
	/** The page's heading, which also names the story. */
	title: string;
	/** The steps, in order; each renders its own `h2` with `tabindex="-1"`. */
	steps: Snippet[];
}

let { title, steps }: Props = $props();

/** The `story` duration ("320ms") as a number, converted once: the throttle's window and a move's. */
const storyMs = Number.parseFloat(token("durations.story"));
/** How far a step travels as it moves, in px. */
const shift = Number.parseFloat(token("spacing.section"));
const allowMove = createThrottle(storyMs);
const gestures = createPointerGestures();
const headingId = $props.id();

let current = $state(0);
/** 1 when the last move went forward, -1 when it went back: the side a step enters from. */
let direction = $state(1);
/** The leaving step's height before the move, in px: it keeps it while it goes. */
let leavingHeight = 0;
const last = $derived(steps.length - 1);

let story: HTMLElement | undefined = $state();
let area: HTMLElement | undefined = $state();
let close: HTMLAnchorElement | undefined = $state();

/**
 * The step in the page. While a move runs the leaving step stays too, `inert` (Svelte sets it as the
 * step's outro starts) until it has gone.
 */
function currentStep() {
	return area?.querySelector<HTMLElement>("[role=group]:not([inert])") ?? undefined;
}

/** How far `t` is between `from` and `to`, from 0 to 1. */
function between(t: number, from: number, to: number) {
	return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

/** A move takes the `story` duration, and no time under reduced motion, so it is instant. */
function moveDuration() {
	return prefersReducedMotion.current ? 0 : storyMs;
}

// A move dips like a projector changing reels (reel-change.ts): the leaving step fades out over
// the move's first part, and the entering one slides in from the side it comes from over the whole
// move, fading in from there, so the two steps never show at once.
function enter(step: HTMLElement): TransitionConfig {
	// A step that comes back before it has gone drops its pin (below).
	for (const property of ["align-self", "height", "margin-bottom"]) {
		step.style.removeProperty(property);
	}
	const x = direction * shift;
	return {
		duration: moveDuration(),
		css: (t) =>
			`transform: translateX(${(1 - quintOut(t)) * x}px); opacity: ${quintOut(between(t, reelChange, 1))}`,
	};
}

function leave(step: HTMLElement): TransitionConfig {
	// The steps share one grid cell. Pinned at the top at its own height, with a margin that takes
	// that height back, the leaving step stays where it was and leaves the cell's height to the
	// entering one, so neither moves up or down.
	step.style.alignSelf = "start";
	step.style.height = `${leavingHeight}px`;
	step.style.marginBottom = `-${leavingHeight}px`;
	// As a step leaves, `t` runs from 1 to 0.
	return { duration: moveDuration(), css: (t) => `opacity: ${between(t, 1 - reelChange, 1)}` };
}

/** The step a move goes to; the same step when it can't move. */
function target(move: Exclude<Move, "close">): number {
	switch (move) {
		case "next":
			return Math.min(current + 1, last);
		case "previous":
			return Math.max(current - 1, 0);
		case "first":
			return 0;
		case "last":
			return last;
	}
}

async function go(move: Move) {
	if (move === "close") {
		close?.click();
		return;
	}
	const to = target(move);
	if (to === current || !allowMove(performance.now())) return;

	// Focus inside the leaving step would fall to the page when it goes.
	const focusInStep = area?.contains(document.activeElement) ?? false;
	if (story) {
		const top = story.getBoundingClientRect().top + window.scrollY;
		window.scrollTo({ top, behavior: "instant" });
	}
	direction = to > current ? 1 : -1;
	leavingHeight = currentStep()?.offsetHeight ?? 0;
	current = to;
	await tick();

	// The summary always takes focus, so a stray Enter doesn't press its buttons; otherwise focus
	// on a control in the bars stays there.
	if (to === last || focusInStep) {
		currentStep()?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
	}
}

function focusKind(target: EventTarget | null): KeyPress["focus"] {
	if (!(target instanceof Element)) return "other";
	if (target.closest("a[href]")) return "link";
	if (target.closest("button")) return "button";
	return "other";
}

function onkeydown(event: KeyboardEvent) {
	if (event.defaultPrevented) return;
	const move = keyToMove({
		key: event.key,
		shiftKey: event.shiftKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		metaKey: event.metaKey,
		focus: focusKind(event.target),
	});
	if (!move) return;
	// Space would otherwise scroll the page, or press nothing on a link.
	event.preventDefault();
	void go(move);
}

// Gestures start on the steps' area, outside a control; the keys and the buttons do the same
// moves, so the area itself needs no role. Every press is passed on, so one elsewhere ends a
// gesture whose release went missing.
function onpointerdown(event: PointerEvent) {
	const inArea = event.target instanceof Node && (area?.contains(event.target) ?? false);
	gestures.press({
		pointerId: event.pointerId,
		isPrimary: event.isPrimary,
		button: event.button,
		elsewhere: !inArea || focusKind(event.target) !== "other",
		x: event.clientX,
		y: event.clientY,
	});
}

// A release counts anywhere on the page, so a drag that ends over a bar still moves. The back zone
// is the step's left 15%, measured on the step, inside the area's gutters.
function onpointerup(event: PointerEvent) {
	const step = currentStep();
	if (!step) return;
	const { left, width } = step.getBoundingClientRect();
	const move = gestures.release(
		{ pointerId: event.pointerId, x: event.clientX, y: event.clientY },
		{ left, width },
	);
	if (move) void go(move);
}

function onpointercancel(event: PointerEvent) {
	gestures.cancel({ pointerId: event.pointerId });
}

const gutters = { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" } as const;

const bar = css({
	position: "sticky",
	// Above the steps, whose transitions make them stacking contexts.
	zIndex: "[1]",
	bg: "background",
	paddingInline: gutters,
	paddingBlock: "md",
});

const roundButton = css({
	display: "grid",
	placeItems: "center",
	width: "controlHeight",
	height: "controlHeight",
	flexShrink: "0",
	borderRadius: "full",
	borderWidth: "1px",
	borderColor: "control-border",
	color: "text",
	cursor: "pointer",
	_hover: { bg: "raised" },
	"&[aria-disabled=true]": {
		borderColor: "border",
		color: "muted",
		cursor: "default",
		_hover: { bg: "transparent" },
	},
});
</script>

<svelte:window {onkeydown} {onpointerdown} {onpointerup} {onpointercancel} />

<section
	bind:this={story}
	aria-roledescription={m.recap_spike_carousel_role()}
	aria-labelledby={headingId}
	class={css({ display: "flex", flexDirection: "column", minHeight: "dvh" })}
>
	<header
		class={[
			bar,
			css({
				top: "[0]",
				display: "grid",
				gridTemplateColumns: "1fr auto",
				gridTemplateAreas: '"progress close" "title title"',
				alignItems: "center",
				columnGap: "lg",
				rowGap: "sm",
			}),
		]}
	>
		<h1 id={headingId} class={css({ gridArea: "title", textStyle: "label", color: "muted" })}>
			{title}
		</h1>
		<div aria-hidden="true" class={css({ gridArea: "progress", display: "flex", gap: "xs" })}>
			{#each steps as _, index (index)}
				<span
					class={css({
						flex: "1",
						display: "flex",
						height: "[4px]",
						borderRadius: "full",
						bg: "border",
						overflow: "hidden",
					})}
				>
					<span
						data-fill
						data-state={index < current ? "past" : index === current ? "current" : "remaining"}
						class={css({
							flex: "1",
							bg: "primary",
							transformOrigin: "left",
							transform: "scaleX(0)",
							"&[data-state=past], &[data-state=current]": { transform: "scaleX(1)" },
							_motionSafe: {
								transitionProperty: "transform",
								transitionDuration: "feedback",
								transitionTimingFunction: "ease-out",
							},
						})}
					></span>
				</span>
			{/each}
		</div>
		<a
			bind:this={close}
			href="/"
			class={css({
				gridArea: "close",
				display: "inline-flex",
				alignItems: "center",
				gap: "sm",
				minHeight: "controlHeight",
				paddingInline: "md",
				borderRadius: "control",
				borderWidth: "1px",
				borderColor: "control-border",
				textStyle: "label",
				color: "text",
				_hover: { bg: "raised" },
			})}
		>
			<X size={20} strokeWidth={2} aria-hidden="true" />
			{m.recap_spike_close()}
		</a>
	</header>

	<div
		bind:this={area}
		aria-live="polite"
		class={css({
			flex: "1",
			// Every step in one cell, so the leaving and the entering step overlap during a move.
			display: "grid",
			gridTemplateColumns: "minmax(0, 1fr)",
			// A step entering from the side never scrolls the page sideways, and a taller step leaving
			// never lengthens it; `clip` makes no scroll container, so the bars stay sticky.
			overflow: "clip",
			paddingInline: gutters,
			paddingBlock: "xl",
			// The browser keeps vertical scrolling and zoom; horizontal drags are the story's.
			touchAction: "pan-y pinch-zoom",
			userSelect: "none",
		})}
	>
		{#each steps as step, index (index)}
			{#if index === current}
				<!-- biome-ignore lint/a11y/useSemanticElements: the APG carousel's slide is a group; a fieldset groups form controls. -->
				<div
					role="group"
					aria-roledescription={m.recap_spike_slide_role()}
					aria-label={m.recap_spike_slide_position({ current: index + 1, total: steps.length })}
					in:enter
					out:leave
					class={css({
						gridArea: "1 / 1",
						display: "flex",
						flexDirection: "column",
						justifyContent: "center",
						width: "[100%]",
						maxWidth: "contentMax",
						marginInline: "auto",
					})}
				>
					{@render step()}
				</div>
			{/if}
		{/each}
	</div>

	<div
		class={[
			bar,
			css({
				bottom: "[0]",
				display: "grid",
				gridTemplateColumns: "auto 1fr auto",
				alignItems: "center",
				gap: "md",
			}),
		]}
	>
		<button
			type="button"
			aria-label={m.recap_spike_previous()}
			aria-disabled={current === 0 ? "true" : undefined}
			onclick={() => go("previous")}
			class={roundButton}
		>
			<ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
		</button>
		<!-- The middle cell stays, so Next keeps its column; the hint shows on the first step only. -->
		<div>
			{#if current === 0}
				<p class={css({ textAlign: "center", textStyle: "caption", color: "muted" })}>
					{m.recap_spike_tap_to_continue()}
				</p>
			{/if}
		</div>
		<button
			type="button"
			aria-label={m.recap_spike_next()}
			aria-disabled={current === last ? "true" : undefined}
			onclick={() => go("next")}
			class={roundButton}
		>
			<ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
		</button>
	</div>
</section>
