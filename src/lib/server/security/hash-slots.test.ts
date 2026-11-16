import { describe, expect, it } from "vitest";
import { createHashSlots, hashSlots } from "./hash-slots.ts";

describe("createHashSlots", () => {
	it("hands out its slots and refuses one more at once, without waiting", () => {
		const slots = createHashSlots(2);
		const first = slots.take();
		const second = slots.take();
		expect(first).toBeTypeOf("function");
		expect(second).toBeTypeOf("function");
		expect(slots.take()).toBeUndefined();
		first?.();
		const third = slots.take();
		expect(third).toBeTypeOf("function");
		second?.();
		third?.();
	});

	it("frees a slot once, however often its release is called", () => {
		const slots = createHashSlots(1);
		const release = slots.take();
		release?.();
		release?.();
		const again = slots.take();
		expect(again).toBeTypeOf("function");
		expect(slots.take()).toBeUndefined();
		again?.();
	});
});

describe("hashSlots", () => {
	it("is the app's one set of 4", () => {
		const taken = [1, 2, 3, 4].map(() => hashSlots.take());
		expect(taken.every((release) => typeof release === "function")).toBe(true);
		expect(hashSlots.take()).toBeUndefined();
		for (const release of taken) release?.();
	});
});
