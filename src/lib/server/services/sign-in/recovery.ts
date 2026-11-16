import type { Database } from "#lib/server/db/client.ts";
import { deleteSetting, readSetting } from "#lib/server/db/settings.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import {
	type ConsoleToken,
	formatToken,
	issueToken,
	TOKEN_LIFETIME_MS,
} from "#lib/server/security/console-token.ts";

/** The settings key that records that recovery's token was used, until the setting is off. */
export const RECOVERY_USED_KEY = "sign-in.recovery.used";

export type RecoveryOptions = {
	readonly db: Database;
	/** `OBZORARR_RECOVERY`, read at startup. */
	readonly enabled: boolean;
	/** Whether the instance has an owner: recovery is ignored until it has. */
	readonly claimed: boolean;
	/** `ORIGIN`, parsed, so the printed line can give the full address. */
	readonly origin: string | undefined;
	/** Where the token line goes: standard output, never the logs. */
	readonly print?: (line: string) => void;
};

const log = createLogger("sign-in");

/** Recovery's state, in memory (one process, D17): startup sets it; `/recovery` checks the token. */
let enabled = false;
let token: ConsoleToken | undefined;

/** Console output for whoever runs the server; it still reaches the container's output. */
const toStandardOutput = (line: string) => process.stdout.write(`${line}\n`);

/**
 * Recovery's startup work (SPEC-sign-in.md, "Recovery"). While the setting is on and the instance
 * claimed, a recovery token is printed, once per start, unless one was used since the setting was
 * turned on; startup warns whenever the setting is on, and ignores it on an unclaimed instance.
 * While the setting is off, the record that a token was used is cleared, so turning it on again
 * prints a new one.
 */
export async function startRecovery(options: RecoveryOptions): Promise<void> {
	enabled = options.enabled;
	token = undefined;
	if (!options.enabled) {
		await deleteSetting(options.db, RECOVERY_USED_KEY);
		return;
	}
	if (!options.claimed) {
		log.warn("recovery is ignored until the instance is claimed; remove OBZORARR_RECOVERY");
		return;
	}
	if ((await readSetting(options.db, RECOVERY_USED_KEY)) !== undefined) {
		log.warn("recovery is on, but its token was used; remove OBZORARR_RECOVERY and restart");
		return;
	}
	token = issueToken(Date.now(), TOKEN_LIFETIME_MS);
	const address = `${options.origin ?? ""}/recovery`;
	const minutes = Math.round(TOKEN_LIFETIME_MS / 60_000);
	(options.print ?? toStandardOutput)(
		`Recovery token: ${formatToken(token.value)} (valid for ${minutes} minutes). Open ${address} to set a new owner password.`,
	);
	log.warn(
		"recovery is on: a recovery token is printed to standard output; remove OBZORARR_RECOVERY and restart once it is used",
	);
}

/** Whether `OBZORARR_RECOVERY` is on, for the Security tab's warning. */
export function isRecoveryOn(): boolean {
	return enabled;
}
