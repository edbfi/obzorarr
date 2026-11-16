import { ConfigError } from "./config-error.ts";

export type RecoveryEnv = { readonly OBZORARR_RECOVERY?: string | undefined };

/** Whether recovery is on (SPEC-sign-in.md, "Recovery"): `true` or `false`, off when unset or empty. */
export function readRecovery(env: RecoveryEnv): boolean {
	const value = env.OBZORARR_RECOVERY || undefined;
	if (value === undefined || value === "false") return false;
	if (value === "true") return true;
	throw new ConfigError("OBZORARR_RECOVERY", "OBZORARR_RECOVERY must be true or false");
}
