import { describe, expect, it } from "vitest";
import { createFailedSignIns } from "./failed-sign-ins.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A table on a clock the test moves, with the warnings it wrote. */
function table(maxEntries?: number) {
	let at = 1_800_000_000_000;
	const warnings: { message: string; metadata: Record<string, unknown> }[] = [];
	const failed = createFailedSignIns({
		now: () => at,
		maxEntries,
		warn: (message, metadata) => warnings.push({ message, metadata }),
	});
	return {
		failed,
		warnings,
		advance: (ms: number) => {
			at += ms;
		},
		now: () => at,
	};
}

/** `count` failures in a row from `address`. */
function fail(t: ReturnType<typeof table>, address: string, count: number) {
	for (let i = 0; i < count; i++) t.failed.failed(address);
}

describe("failed sign-ins", () => {
	it("makes an address wait 5 minutes after 10 failures in a row, and not before", () => {
		const t = table();
		fail(t, "198.51.100.1", 9);
		expect(t.failed.wait("198.51.100.1")).toBeUndefined();
		fail(t, "198.51.100.1", 1);
		expect(t.failed.wait("198.51.100.1")).toEqual({
			retryAfterSeconds: 300,
			resetAt: t.now() + 5 * MINUTE,
		});
		t.advance(5 * MINUTE - 1000);
		expect(t.failed.wait("198.51.100.1")?.retryAfterSeconds).toBe(1);
		t.advance(1000);
		expect(t.failed.wait("198.51.100.1")).toBeUndefined();
		// Other addresses never wait for it.
		expect(t.failed.wait("198.51.100.2")).toBeUndefined();
	});

	it("doubles the wait with each further 10, up to an hour", () => {
		const t = table();
		const waits: number[] = [];
		for (let round = 0; round < 6; round++) {
			fail(t, "198.51.100.1", 10);
			const wait = t.failed.wait("198.51.100.1");
			waits.push((wait?.retryAfterSeconds ?? 0) / 60);
			t.advance((wait?.retryAfterSeconds ?? 0) * 1000);
		}
		expect(waits).toEqual([5, 10, 20, 40, 60, 60]);
	});

	it("logs each wait at warn with the address and how long it lasts", () => {
		const t = table();
		fail(t, "198.51.100.1", 10);
		expect(t.warnings).toEqual([
			{
				message: "an address must wait after failed sign-ins",
				metadata: { clientAddress: "198.51.100.1", minutes: 5 },
			},
		]);
	});

	it("starts again after a success", () => {
		const t = table();
		fail(t, "198.51.100.1", 10);
		t.advance(5 * MINUTE);
		t.failed.succeeded("198.51.100.1");
		fail(t, "198.51.100.1", 9);
		expect(t.failed.wait("198.51.100.1")).toBeUndefined();
		fail(t, "198.51.100.1", 1);
		// The first wait again, not the second.
		expect(t.failed.wait("198.51.100.1")?.retryAfterSeconds).toBe(300);
	});

	it("starts again after 24 hours without a failure, and not a moment before", () => {
		const t = table();
		fail(t, "198.51.100.1", 9);
		t.advance(24 * HOUR - 1);
		fail(t, "198.51.100.1", 1);
		expect(t.failed.wait("198.51.100.1")).toBeDefined();

		const u = table();
		fail(u, "198.51.100.1", 9);
		u.advance(24 * HOUR);
		fail(u, "198.51.100.1", 1);
		expect(u.failed.wait("198.51.100.1")).toBeUndefined();
	});

	it("sweeps addresses quiet for 24 hours, and holds 10,000 at most, the oldest going first", () => {
		const t = table(2);
		fail(t, "198.51.100.1", 1);
		fail(t, "198.51.100.2", 1);
		fail(t, "198.51.100.3", 1);
		expect(t.failed.size()).toBe(2);
		// The oldest went: its count starts again.
		fail(t, "198.51.100.1", 9);
		expect(t.failed.wait("198.51.100.1")).toBeUndefined();

		const u = table();
		fail(u, "198.51.100.1", 1);
		u.advance(24 * HOUR);
		u.failed.wait("198.51.100.9");
		expect(u.failed.size()).toBe(0);
		expect(createFailedSignIns({ warn: () => {} }).maxEntries).toBe(10_000);
	});
});
