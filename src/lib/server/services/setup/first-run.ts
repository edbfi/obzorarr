import type { Database } from "#lib/server/db/client.ts";
import { ownerExists } from "#lib/server/db/owner.ts";
import { readSetting } from "#lib/server/db/settings.ts";
import {
	type BootstrapToken,
	formatToken,
	issueToken,
	isTokenValid,
	TOKEN_LIFETIME_MS,
	tokenMatches,
} from "#lib/server/security/bootstrap-token.ts";

/**
 * The settings key of first run's step pointer. The claim is the only step until `two-factor`
 * adds the next, so the claim moves it straight to `complete` (SPEC-setup.md, "Before sign-in").
 */
export const FIRST_RUN_STEP_KEY = "setup.first-run.step";
export const FIRST_RUN_COMPLETE = "complete";

export type FirstRunOptions = {
	readonly db: Database;
	/** `ORIGIN`, parsed, so the printed line can give the full address. */
	readonly origin: string | undefined;
	/** Where the token line goes: standard output, never the logs. */
	readonly print?: (line: string) => void;
	readonly lifetimeMs?: number;
};

/** First run's state, in memory (one process, D17): startup loads it, the claim updates it. */
let claimed = false;
let complete = false;
let token: BootstrapToken | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let claimsInProgress = 0;
let renewalWaiting = false;
/** Set by shutdown: no token is printed after it, even by a claim that fails meanwhile. */
let stopped = false;
let settings: Required<Omit<FirstRunOptions, "db">> | undefined;

/** Console output for whoever runs the server; it still reaches the container's output. */
const toStandardOutput = (line: string) => process.stdout.write(`${line}\n`);

/**
 * Loads first run's state at startup: whether an owner exists, and the step pointer from
 * `settings`. While no owner exists, a bootstrap token is printed with the address to claim the
 * instance at, and a new one every time it expires; once the instance is claimed, none is printed
 * again (SPEC-setup.md, "The bootstrap token").
 */
export async function startFirstRun(options: FirstRunOptions): Promise<void> {
	stopFirstRun();
	stopped = false;
	settings = {
		origin: options.origin,
		print: options.print ?? toStandardOutput,
		lifetimeMs: options.lifetimeMs ?? TOKEN_LIFETIME_MS,
	};
	claimed = await ownerExists(options.db);
	complete = (await readSetting(options.db, FIRST_RUN_STEP_KEY)) === FIRST_RUN_COMPLETE;
	token = undefined;
	if (!claimed) renewToken();
}

/** Stops the token's timer, as shutdown does on its signal. */
export function stopFirstRun(): void {
	stopped = true;
	clearTimeout(timer);
	timer = undefined;
	renewalWaiting = false;
}

/** Whether the instance has been claimed. */
export function isClaimed(): boolean {
	return claimed;
}

/** Whether first run is complete, after which its steps answer "not found". */
export function isFirstRunComplete(): boolean {
	return complete;
}

/** The claim, first run's only step until `two-factor` adds the next. */
const CURRENT_STEP = "/setup";

/** Paths the gate lets through before first run is complete, besides the current step. */
const ALWAYS_OPEN = new Set(["/healthz"]);

/**
 * The setup gate's decision for a request's path: until first run is complete, every path but the
 * current step and `/healthz` is sent to that step; once it is complete, none is
 * (SPEC-setup.md, "First run").
 */
export function firstRunRedirect(path: string): string | undefined {
	if (complete || path === CURRENT_STEP || ALWAYS_OPEN.has(path)) return undefined;
	return CURRENT_STEP;
}

/**
 * Checks what someone typed against the current token and, if it matches and is still valid,
 * uses it up, with nothing awaited in between, so two claims can't both use one token.
 */
export function useToken(entry: string): boolean {
	if (token === undefined || !isTokenValid(token, Date.now())) return false;
	if (!tokenMatches(token.value, entry)) return false;
	token = undefined;
	return true;
}

/** Records a claim its transaction committed: the instance is claimed and first run complete. */
export function markClaimed(): void {
	claimed = true;
	complete = true;
	stopFirstRun();
}

/**
 * Runs a claim's work while holding back the token's renewal, so the token can't change under
 * it. Once the last claim in progress has finished, a new token is printed if one came due
 * meanwhile, or if a claim used the token up and the instance is still unclaimed.
 */
export async function withClaimInProgress<T>(work: () => Promise<T>): Promise<T> {
	claimsInProgress++;
	try {
		return await work();
	} finally {
		claimsInProgress--;
		if (claimsInProgress === 0 && (renewalWaiting || token === undefined)) {
			renewalWaiting = false;
			renewToken();
		}
	}
}

/** Issues and prints a new token, and schedules the next; never once the instance is claimed. */
function renewToken(): void {
	if (settings === undefined || claimed || stopped) return;
	clearTimeout(timer);
	token = issueToken(Date.now(), settings.lifetimeMs);
	const address = `${settings.origin ?? ""}/setup`;
	const minutes = Math.round(settings.lifetimeMs / 60_000);
	settings.print(
		`Setup token: ${formatToken(token.value)} (valid for ${minutes} minutes). Open ${address} to claim this Obzorarr.`,
	);
	timer = setTimeout(() => {
		if (claimsInProgress > 0) renewalWaiting = true;
		else renewToken();
	}, settings.lifetimeMs);
	timer.unref?.();
}
