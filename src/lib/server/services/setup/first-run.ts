import type { Database } from "#lib/server/db/client.ts";
import { ownerExists } from "#lib/server/db/owner.ts";
import {
	type BootstrapToken,
	formatToken,
	issueToken,
	TOKEN_LIFETIME_MS,
} from "#lib/server/security/bootstrap-token.ts";

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
let token: BootstrapToken | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let claimsInProgress = 0;
let renewalWaiting = false;
let settings: Required<Omit<FirstRunOptions, "db">> | undefined;

/** Console output for whoever runs the server; it still reaches the container's output. */
const toStandardOutput = (line: string) => process.stdout.write(`${line}\n`);

/**
 * Loads first run's state at startup. While no owner exists, a bootstrap token is printed with
 * the address to claim the instance at, and a new one every time it expires; once the instance
 * is claimed, none is printed again (SPEC-setup.md, "The bootstrap token").
 */
export async function startFirstRun(options: FirstRunOptions): Promise<void> {
	stopFirstRun();
	settings = {
		origin: options.origin,
		print: options.print ?? toStandardOutput,
		lifetimeMs: options.lifetimeMs ?? TOKEN_LIFETIME_MS,
	};
	claimed = await ownerExists(options.db);
	token = undefined;
	if (!claimed) renewToken();
}

/** Stops the token's timer, as shutdown does on its signal. */
export function stopFirstRun(): void {
	clearTimeout(timer);
	timer = undefined;
	renewalWaiting = false;
}

/** Whether the instance has been claimed. */
export function isClaimed(): boolean {
	return claimed;
}

/**
 * Runs a claim's work while holding back the token's renewal, so the token can't change under
 * it; a renewal that came due meanwhile happens once the last claim in progress has finished.
 */
export async function withClaimInProgress<T>(work: () => Promise<T>): Promise<T> {
	claimsInProgress++;
	try {
		return await work();
	} finally {
		claimsInProgress--;
		if (claimsInProgress === 0 && renewalWaiting) {
			renewalWaiting = false;
			renewToken();
		}
	}
}

/** Issues and prints a new token, and schedules the next; never once the instance is claimed. */
function renewToken(): void {
	if (settings === undefined || claimed) return;
	clearTimeout(timer);
	token = issueToken(Date.now());
	const address = `${settings.origin ?? ""}/setup`;
	settings.print(
		`Setup token: ${formatToken(token.value)} (valid for ${TOKEN_LIFETIME_MS / 60_000} minutes). Open ${address} to claim this Obzorarr.`,
	);
	timer = setTimeout(() => {
		if (claimsInProgress > 0) renewalWaiting = true;
		else renewToken();
	}, settings.lifetimeMs);
	timer.unref?.();
}
