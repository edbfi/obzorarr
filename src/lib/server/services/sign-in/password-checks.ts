import { createLogger } from "#lib/server/logging/logger.ts";
import { createFailedSignIns } from "#lib/server/security/failed-sign-ins.ts";
import { HASH_SLOT_RETRY_SECONDS } from "#lib/server/security/hash-slots.ts";
import { createRateLimiter, rateLimitHeaders } from "#lib/server/security/rate-limit.ts";

// What signing in and the password change share around a password check: one limit, one count
// of failures and its waits, and the answer when the server is busy.

/**
 * Refused for now, with when to try again and the headers saying so: the address used up the
 * limit, it must wait after failed sign-ins, or every hash slot was busy.
 */
export type TooMany = {
	status: "too-many";
	reason: "limit" | "wait" | "busy";
	retryAfterSeconds: number;
	headers: Record<string, string>;
};

const log = createLogger("sign-in");

/** Signing in: 10 per 5 minutes from one address (SPEC-sign-in.md, "Rate limits and failed sign-ins"). */
const SIGN_IN_LIMIT = 10;
const signInLimit = createRateLimiter({ limit: SIGN_IN_LIMIT, windowMs: 5 * 60_000 });

/** The failed sign-ins per address, and the waits they start (D28). */
const failedSignIns = createFailedSignIns({
	warn: (message, metadata) => log.warn(message, metadata),
});

/** The answer when every hash slot is busy. */
export const SLOTS_BUSY: TooMany = {
	status: "too-many",
	reason: "busy",
	retryAfterSeconds: HASH_SLOT_RETRY_SECONDS,
	headers: { "retry-after": String(HASH_SLOT_RETRY_SECONDS) },
};

/**
 * Counts a request towards the address's limit, which signing in and the password change share,
 * and refuses it when the address used the limit up or must wait after failed sign-ins (SPEC-
 * sign-in.md, "Rate limits"). Every request counts towards the limit, one a wait refuses too. When
 * both refuse, the answer is the one that ends later, so it never says to try again before the
 * address may.
 */
export function refuseOverLimit(address: string): TooMany | undefined {
	const decision = signInLimit.hit(address);
	const wait = failedSignIns.wait(address);
	if (wait !== undefined && (decision.allowed || wait.resetAt >= decision.resetAt)) {
		return {
			status: "too-many",
			reason: "wait",
			retryAfterSeconds: wait.retryAfterSeconds,
			// The headers every refusal carries, describing the wait rather than the window.
			headers: rateLimitHeaders({ allowed: false, limit: SIGN_IN_LIMIT, remaining: 0, ...wait }),
		};
	}
	if (!decision.allowed) {
		return {
			status: "too-many",
			reason: "limit",
			retryAfterSeconds: decision.retryAfterSeconds,
			headers: rateLimitHeaders(decision),
		};
	}
	return undefined;
}

/**
 * Records a checked password from an address: a failure (a wrong sign-in or a wrong current
 * password) counts towards its next wait, and a success starts its count again (D28).
 */
export function countPasswordCheck(address: string | undefined, succeeded: boolean): void {
	if (address === undefined) return;
	if (succeeded) failedSignIns.succeeded(address);
	else failedSignIns.failed(address);
}
