const MINUTE_MS = 60_000;
/** How many failures in a row start a wait, and each further wait. */
const FAILURES_PER_WAIT = 10;
const FIRST_WAIT_MS = 5 * MINUTE_MS;
const LONGEST_WAIT_MS = 60 * MINUTE_MS;
/** How long an address's count lasts without a failure. */
const QUIET_MS = 24 * 60 * MINUTE_MS;
const SWEEP_EVERY_MS = MINUTE_MS;

/** An address's wait: when it ends, and the seconds until then. */
export type FailedSignInsWait = { readonly resetAt: number; readonly retryAfterSeconds: number };

type Entry = { failures: number; lastFailureAt: number; waitUntil: number };

/**
 * The failed sign-ins per client address (D28; SPEC-sign-in.md, "Rate limits and failed
 * sign-ins"), kept in memory, so a restart clears them. After 10 failures in a row the address
 * waits 5 minutes, and each further 10 doubles the wait, up to an hour; a success, or 24 hours
 * without a failure, starts it again. There is no account lockout: only that address waits. Each
 * wait is logged at warn with the address, so an owner whose proxy hides every visitor behind one
 * address can see it. Addresses quiet for 24 hours are swept once a minute, on the next call, and
 * the table holds at most `maxEntries` (10,000 by default), the oldest going first.
 */
export function createFailedSignIns(options: {
	warn: (message: string, metadata: Record<string, unknown>) => void;
	now?: () => number;
	maxEntries?: number | undefined;
}) {
	const { warn, now = () => Date.now(), maxEntries = 10_000 } = options;
	/** Each address's count, the one that failed longest ago first. */
	const entries = new Map<string, Entry>();
	let sweptAt = now();

	/** The address's live entry at `at`, dropping it once it has been quiet for 24 hours. */
	function current(address: string, at: number): Entry | undefined {
		if (at - sweptAt >= SWEEP_EVERY_MS) {
			for (const [key, entry] of entries) {
				if (at - entry.lastFailureAt >= QUIET_MS) entries.delete(key);
			}
			sweptAt = at;
		}
		const entry = entries.get(address);
		if (entry !== undefined && at - entry.lastFailureAt >= QUIET_MS) {
			entries.delete(address);
			return undefined;
		}
		return entry;
	}

	return {
		maxEntries,
		/** The wait `address` is in, or undefined when it may try. */
		wait(address: string): FailedSignInsWait | undefined {
			const at = now();
			const entry = current(address, at);
			if (entry === undefined || entry.waitUntil <= at) return undefined;
			return {
				resetAt: entry.waitUntil,
				retryAfterSeconds: Math.max(1, Math.ceil((entry.waitUntil - at) / 1000)),
			};
		},
		/** Counts a failed sign-in from `address`, starting its wait on every 10th in a row. */
		failed(address: string): void {
			const at = now();
			const entry = current(address, at) ?? { failures: 0, lastFailureAt: at, waitUntil: 0 };
			entry.failures++;
			entry.lastFailureAt = at;
			// The most recent failure goes last, so the oldest goes first when the table is full.
			entries.delete(address);
			entries.set(address, entry);
			for (const oldest of entries.keys()) {
				if (entries.size <= maxEntries) break;
				entries.delete(oldest);
			}
			if (entry.failures % FAILURES_PER_WAIT !== 0) return;
			const doublings = entry.failures / FAILURES_PER_WAIT - 1;
			const waitMs = Math.min(FIRST_WAIT_MS * 2 ** doublings, LONGEST_WAIT_MS);
			entry.waitUntil = at + waitMs;
			warn("an address must wait after failed sign-ins", {
				clientAddress: address,
				minutes: waitMs / MINUTE_MS,
			});
		},
		/** A success from `address` starts its count again. */
		succeeded(address: string): void {
			entries.delete(address);
		},
		/** How many addresses the table holds. */
		size: () => entries.size,
	};
}
