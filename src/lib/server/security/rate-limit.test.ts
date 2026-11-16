import { describe, expect, it } from "vitest";
import { createRateLimiter, rateLimitHeaders } from "./rate-limit.ts";

/** A limiter on a clock the test moves. */
function limiter(limit: number, windowMs: number, maxEntries?: number) {
	let now = 1_000_000;
	const limits = createRateLimiter({ limit, windowMs, maxEntries, now: () => now });
	return {
		limits,
		advance: (ms: number) => {
			now += ms;
		},
		now: () => now,
	};
}

describe("createRateLimiter", () => {
	it("allows the limit within a window that starts at an address's first request", () => {
		const { limits, advance } = limiter(3, 60_000);
		advance(12_345);
		expect([1, 2, 3].map(() => limits.hit("a").allowed)).toEqual([true, true, true]);
		const refused = limits.hit("a");
		expect(refused).toMatchObject({
			allowed: false,
			limit: 3,
			remaining: 0,
			retryAfterSeconds: 60,
		});
		// Another address has a window of its own.
		expect(limits.hit("b").allowed).toBe(true);
	});

	it("opens a new window once the old one has passed, and not a millisecond before", () => {
		const { limits, advance } = limiter(1, 60_000);
		expect(limits.hit("a").allowed).toBe(true);
		advance(59_999);
		expect(limits.hit("a")).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
		advance(1);
		expect(limits.hit("a")).toMatchObject({ allowed: true, remaining: 0 });
	});

	it("counts down what remains, and says when the window resets", () => {
		const { limits, now } = limiter(2, 300_000);
		const first = limits.hit("a");
		expect(first).toMatchObject({ allowed: true, limit: 2, remaining: 1 });
		expect(first.resetAt).toBe(now() + 300_000);
	});

	it("sweeps expired windows once a minute, on the next request", () => {
		const { limits, advance } = limiter(5, 60_000);
		limits.hit("a");
		limits.hit("b");
		expect(limits.size()).toBe(2);
		advance(60_000);
		limits.hit("c");
		expect(limits.size()).toBe(1);
	});

	it("holds at most its cap of addresses, letting the oldest go first", () => {
		const { limits, advance } = limiter(1, 60_000, 2);
		limits.hit("a");
		advance(1);
		limits.hit("b");
		advance(1);
		limits.hit("c");
		expect(limits.size()).toBe(2);
		// "a" went first, so it starts a new window and is allowed again.
		expect(limits.hit("a").allowed).toBe(true);
		expect(limits.hit("c").allowed).toBe(false);
	});

	it("caps at 10,000 addresses by default", () => {
		const { limits } = limiter(1, 60_000);
		for (let i = 0; i < 10_050; i++) limits.hit(`10.0.${i >> 8}.${i & 255}`);
		expect(limits.size()).toBe(10_000);
	});
});

describe("rateLimitHeaders", () => {
	it("gives Retry-After and the limit, what remains and the reset as epoch seconds", () => {
		expect(
			rateLimitHeaders({
				allowed: false,
				limit: 60,
				remaining: 0,
				resetAt: 1_700_000_000_500,
				retryAfterSeconds: 42,
			}),
		).toEqual({
			"retry-after": "42",
			"x-ratelimit-limit": "60",
			"x-ratelimit-remaining": "0",
			"x-ratelimit-reset": "1700000001",
		});
	});
});
