/** One limit: how many requests an address may make in each window. */
export type RateLimitOptions = {
	readonly limit: number;
	readonly windowMs: number;
	/** The most addresses held at once; when full, the oldest goes first. */
	readonly maxEntries?: number | undefined;
	readonly now?: () => number;
};

/** A request's place in its address's window. */
export type RateLimitDecision = {
	readonly allowed: boolean;
	readonly limit: number;
	readonly remaining: number;
	/** When the window ends, in milliseconds since the epoch. */
	readonly resetAt: number;
	readonly retryAfterSeconds: number;
};

const SWEEP_EVERY_MS = 60_000;

/**
 * A fixed-window limit kept in the process (one process, D17; SPEC-sign-in.md, "Rate limits and
 * failed sign-ins"). Each address's window starts at its first request. Expired windows are
 * swept once a minute, on the next request, so the table never outgrows the traffic, and it holds
 * at most `maxEntries` addresses (10,000 by default).
 */
export function createRateLimiter(options: RateLimitOptions) {
	const { limit, windowMs, maxEntries = 10_000, now = Date.now } = options;
	/** Each address's window, oldest first: a new window moves its address to the end. */
	const windows = new Map<string, { start: number; count: number }>();
	let sweptAt = now();

	function sweep(at: number) {
		for (const [key, window] of windows) {
			if (at - window.start >= windowMs) windows.delete(key);
		}
		sweptAt = at;
	}

	return {
		/** Counts a request from `key` and says whether it may go on. */
		hit(key: string): RateLimitDecision {
			const at = now();
			if (at - sweptAt >= SWEEP_EVERY_MS) sweep(at);
			let window = windows.get(key);
			if (window === undefined || at - window.start >= windowMs) {
				windows.delete(key);
				window = { start: at, count: 0 };
				windows.set(key, window);
				for (const oldest of windows.keys()) {
					if (windows.size <= maxEntries) break;
					windows.delete(oldest);
				}
			}
			window.count++;
			const resetAt = window.start + windowMs;
			return {
				allowed: window.count <= limit,
				limit,
				remaining: Math.max(0, limit - window.count),
				resetAt,
				retryAfterSeconds: Math.max(1, Math.ceil((resetAt - at) / 1000)),
			};
		},
		/** How many addresses the table holds. */
		size: () => windows.size,
	};
}

/** The headers a refused request gets: when to try again, and the limit it ran into. */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
	return {
		"retry-after": String(decision.retryAfterSeconds),
		"x-ratelimit-limit": String(decision.limit),
		"x-ratelimit-remaining": String(decision.remaining),
		"x-ratelimit-reset": String(Math.ceil(decision.resetAt / 1000)),
	};
}
