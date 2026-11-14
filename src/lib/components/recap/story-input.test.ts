import { describe, expect, it } from "vitest";
import {
	createPointerGestures,
	createThrottle,
	type KeyPress,
	keyToMove,
	type PointerPress,
} from "./story-input.ts";

// The story's input rules (SPEC-recap-spike.md, "Story mode"): keys, taps, swipes and the throttle.

const key = (key: string, rest: Partial<KeyPress> = {}): KeyPress => ({
	key,
	shiftKey: false,
	ctrlKey: false,
	altKey: false,
	metaKey: false,
	focus: "other",
	...rest,
});

describe("keyToMove", () => {
	it("maps each key to its move", () => {
		expect(keyToMove(key("ArrowRight"))).toBe("next");
		expect(keyToMove(key(" "))).toBe("next");
		expect(keyToMove(key("Enter"))).toBe("next");
		expect(keyToMove(key("ArrowLeft"))).toBe("previous");
		expect(keyToMove(key("Home"))).toBe("first");
		expect(keyToMove(key("End"))).toBe("last");
		expect(keyToMove(key("Escape"))).toBe("close");
	});

	it("leaves the other keys to the browser, ↑ and ↓ included", () => {
		for (const other of ["ArrowUp", "ArrowDown", "PageDown", "Tab", "a", "Backspace"]) {
			expect(keyToMove(key(other))).toBeUndefined();
		}
	});

	it("ignores every key while Shift, Ctrl, Alt or Meta is held", () => {
		for (const modifier of ["shiftKey", "ctrlKey", "altKey", "metaKey"] as const) {
			for (const name of ["ArrowRight", "ArrowLeft", " ", "Enter", "Home", "End", "Escape"]) {
				expect(keyToMove(key(name, { [modifier]: true }))).toBeUndefined();
			}
		}
	});

	it("leaves Space and Enter to a focused button, which presses it", () => {
		expect(keyToMove(key(" ", { focus: "button" }))).toBeUndefined();
		expect(keyToMove(key("Enter", { focus: "button" }))).toBeUndefined();
		// The other keys still move the story from a button.
		expect(keyToMove(key("ArrowRight", { focus: "button" }))).toBe("next");
		expect(keyToMove(key("Escape", { focus: "button" }))).toBe("close");
	});

	it("leaves Enter to a focused link, but Space on a link moves the story", () => {
		expect(keyToMove(key("Enter", { focus: "link" }))).toBeUndefined();
		expect(keyToMove(key(" ", { focus: "link" }))).toBe("next");
		expect(keyToMove(key("ArrowLeft", { focus: "link" }))).toBe("previous");
	});
});

/** The step's area: 400 px wide from x = 100, so its left 15% ends at x = 160. */
const area = { left: 100, width: 400 };

const press = (x: number, y: number, rest: Partial<PointerPress> = {}): PointerPress => ({
	pointerId: 1,
	isPrimary: true,
	button: 0,
	elsewhere: false,
	x,
	y,
	...rest,
});

/** A whole gesture: a press at `from`, a release at `to`. */
function gesture(from: [number, number], to: [number, number], rest: Partial<PointerPress> = {}) {
	const gestures = createPointerGestures();
	gestures.press(press(from[0], from[1], rest));
	return gestures.release({ pointerId: rest.pointerId ?? 1, x: to[0], y: to[1] }, area);
}

describe("createPointerGestures", () => {
	it("reads a tap in the left 15% as back and elsewhere as forward", () => {
		expect(gesture([120, 300], [120, 300])).toBe("previous");
		expect(gesture([159, 300], [159, 300])).toBe("previous");
		expect(gesture([160, 300], [160, 300])).toBe("next");
		expect(gesture([480, 300], [480, 300])).toBe("next");
	});

	it("counts a press that moves less than 10 px as a tap", () => {
		expect(gesture([300, 300], [306, 306])).toBe("next");
		expect(gesture([120, 300], [129, 300])).toBe("previous");
	});

	it("reads a swipe of more than 50 px either way", () => {
		expect(gesture([400, 300], [349, 300])).toBe("next");
		expect(gesture([300, 300], [351, 300])).toBe("previous");
		// The swipe's direction decides, not where it started.
		expect(gesture([120, 300], [40, 310])).toBe("next");
	});

	it("does nothing for a short or mostly vertical drag", () => {
		expect(gesture([400, 300], [360, 300])).toBeUndefined();
		expect(gesture([400, 300], [350, 300])).toBeUndefined();
		expect(gesture([400, 300], [330, 380])).toBeUndefined();
		expect(gesture([400, 300], [400, 200])).toBeUndefined();
	});

	it("does nothing for a cancelled gesture", () => {
		const gestures = createPointerGestures();
		gestures.press(press(400, 300));
		gestures.cancel({ pointerId: 1 });
		expect(gestures.release({ pointerId: 1, x: 300, y: 300 }, area)).toBeUndefined();
	});

	it("does nothing for another button, a secondary pointer or a press on a control", () => {
		expect(gesture([300, 300], [300, 300], { button: 2 })).toBeUndefined();
		expect(gesture([300, 300], [300, 300], { button: 1 })).toBeUndefined();
		expect(gesture([300, 300], [300, 300], { isPrimary: false })).toBeUndefined();
		expect(gesture([300, 300], [300, 300], { elsewhere: true })).toBeUndefined();
	});

	it("drops a press whose release went missing when the primary pointer presses again", () => {
		// The release of the first press never arrived (the window lost focus mid-drag, say).
		for (const next of [{ elsewhere: true }, { button: 2 }]) {
			const gestures = createPointerGestures();
			gestures.press(press(400, 300));
			gestures.press(press(100, 300, next));
			expect(gestures.release({ pointerId: 1, x: 100, y: 300 }, area)).toBeUndefined();
		}
	});

	it("ignores another pointer's release, and keeps the first pointer's gesture", () => {
		const gestures = createPointerGestures();
		gestures.press(press(400, 300));
		gestures.press(press(200, 300, { pointerId: 2, isPrimary: false }));
		expect(gestures.release({ pointerId: 2, x: 200, y: 300 }, area)).toBeUndefined();
		gestures.cancel({ pointerId: 2 });
		expect(gestures.release({ pointerId: 1, x: 300, y: 300 }, area)).toBe("next");
	});

	it("reads each gesture once", () => {
		const gestures = createPointerGestures();
		gestures.press(press(300, 300));
		expect(gestures.release({ pointerId: 1, x: 300, y: 300 }, area)).toBe("next");
		expect(gestures.release({ pointerId: 1, x: 300, y: 300 }, area)).toBeUndefined();
	});
});

describe("createThrottle", () => {
	it("ignores a move within the duration of the last one and takes one after it", () => {
		const allow = createThrottle(320);
		expect(allow(1000)).toBe(true);
		expect(allow(1001)).toBe(false);
		expect(allow(1319)).toBe(false);
		expect(allow(1320)).toBe(true);
		expect(allow(1500)).toBe(false);
		expect(allow(1640)).toBe(true);
	});

	it("takes the first move at any time", () => {
		expect(createThrottle(320)(0)).toBe(true);
	});
});
