<script lang="ts">
// The story shell (SPEC-recap-spike.md, "Story mode"): one step at a time between a top bar
// (heading, progress, Close) and a bottom bar (Previous, Next), moved by taps, swipes, keys and the
// buttons, throttled. It knows nothing of the steps' content; the last step is the summary.
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import X from "@lucide/svelte/icons/x";
import { type Snippet, tick } from "svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
import { token } from "#styled-system/tokens";
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

/** The `story` duration ("320ms") as a number, converted once: the throttle's window. */
const storyMs = Number.parseFloat(token("durations.story"));
const allowMove = createThrottle(storyMs);
const gestures = createPointerGestures();
const headingId = $props.id();

let current = $state(0);
const last = $derived(steps.length - 1);

let story: HTMLElement | undefined = $state();
let area: HTMLElement | undefined = $state();
let close: HTMLAnchorElement | undefined = $state();

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
	current = to;
	await tick();

	// The summary always takes focus, so a stray Enter doesn't press its buttons; otherwise focus
	// on a control in the bars stays there.
	if (to === last || focusInStep) {
		area?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
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
	const step = area?.querySelector<HTMLElement>("[role=group]");
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
	// Above the steps, whose transitions (task 4) make them stacking contexts.
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
					data-state={index < current ? "past" : index === current ? "current" : "remaining"}
					class={css({
						flex: "1",
						height: "[4px]",
						borderRadius: "full",
						bg: "border",
						"&[data-state=past], &[data-state=current]": { bg: "primary" },
					})}
				></span>
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
			display: "flex",
			flexDirection: "column",
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
					class={css({
						flex: "1",
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
