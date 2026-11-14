// The story's input rules (SPEC-recap-spike.md, "Story mode"): which key or pointer gesture moves
// it where, and the throttle. Pure, with no DOM: `Story.svelte` reads the events and passes their
// facts in.

/** A move of the story. Nothing loops: a move past either end changes nothing. */
export type Move = "previous" | "next" | "first" | "last" | "close";

/** The facts of a key press. */
export interface KeyPress {
	key: string;
	shiftKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	/** What holds focus: a button, a link, or anything else. */
	focus: "button" | "link" | "other";
}

const keyMoves: Record<string, Move> = {
	ArrowRight: "next",
	" ": "next",
	Enter: "next",
	ArrowLeft: "previous",
	Home: "first",
	End: "last",
	Escape: "close",
};

/**
 * The move a key press makes, or `undefined` to leave it to the browser: any key while a modifier
 * is held (so Alt+← and Shift+Space keep working), ↑ and ↓, Space and Enter on a focused button
 * (they press it) and Enter on a focused link (it follows it). Space on a link moves the story.
 */
export function keyToMove(press: KeyPress): Move | undefined {
	if (press.shiftKey || press.ctrlKey || press.altKey || press.metaKey) return undefined;
	if (press.focus === "button" && (press.key === " " || press.key === "Enter")) return undefined;
	if (press.focus === "link" && press.key === "Enter") return undefined;
	return Object.hasOwn(keyMoves, press.key) ? keyMoves[press.key] : undefined;
}

/** A pointer's position, in the same coordinates as the step's area. */
export interface PointerPoint {
	pointerId: number;
	x: number;
	y: number;
}

/** The facts of a press. */
export interface PointerPress extends PointerPoint {
	isPrimary: boolean;
	/** The button pressed: 0 is the primary one (a left click, a touch, a pen's tip). */
	button: number;
	/** Whether the press is on a control (a link or a button), which owns it. */
	onControl: boolean;
}

/** The step's area, horizontally: taps in its left 15% go back. */
export interface StepArea {
	left: number;
	width: number;
}

/** A press that moves less than this is a tap. */
const TAP_SLOP = 10;
/** A swipe moves further than this, horizontally. */
const SWIPE_DISTANCE = 50;
/** The share of the step, from its left edge, where a tap goes back. */
const BACK_ZONE = 0.15;

/**
 * Tracks one gesture at a time: the primary pointer's primary button, pressed outside a control.
 * `release` returns the move the gesture made, if any.
 */
export function createPointerGestures() {
	let pressed: PointerPress | undefined;

	return {
		press(event: PointerPress): void {
			if (!event.isPrimary || event.button !== 0 || event.onControl) return;
			pressed = event;
		},

		/** A cancelled gesture (the browser took it to scroll or zoom) moves nothing. */
		cancel(event: Pick<PointerPoint, "pointerId">): void {
			if (event.pointerId === pressed?.pointerId) pressed = undefined;
		},

		release(event: PointerPoint, area: StepArea): Move | undefined {
			if (!pressed || event.pointerId !== pressed.pointerId) return undefined;
			const start = pressed;
			pressed = undefined;

			const dx = event.x - start.x;
			const dy = event.y - start.y;
			if (Math.hypot(dx, dy) < TAP_SLOP) {
				return start.x - area.left < area.width * BACK_ZONE ? "previous" : "next";
			}
			if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
				return dx < 0 ? "next" : "previous";
			}
			return undefined;
		},
	};
}

/**
 * Returns a check that takes a move at time `now` (in ms) unless it comes within `ms` of the last
 * move it took, so a held key or a double tap can't skip a step.
 */
export function createThrottle(ms: number): (now: number) => boolean {
	let last = Number.NEGATIVE_INFINITY;
	return (now) => {
		if (now - last < ms) return false;
		last = now;
		return true;
	};
}
