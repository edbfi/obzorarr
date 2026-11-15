import { defineEnvVars, type EnvVarConfig } from "@sveltejs/kit/env";
import type { DatabasePathEnv } from "#lib/server/config/database-path.ts";
import type { LogDebugEnv } from "#lib/server/config/log-debug.ts";
import type { OriginEnv } from "#lib/server/config/origin.ts";
import type { SecretKeyVariable } from "#lib/server/config/secret-key.ts";

// Optional and never throwing: SvelteKit's own validation would otherwise print its own message
// before startup checks each variable (SPEC-secrets.md, "Declaring the variables").
const optional = (value: string | undefined) => value;

/** Private and read when the app starts, never inlined into the build. */
export const variables = defineEnvVars({
	OBZORARR_SECRET_KEY: {
		schema: optional,
		description: "The master key: 32 bytes in canonical standard base64.",
	},
	OBZORARR_SECRET_KEY_FILE: {
		schema: optional,
		description: "The path of a file holding the master key, such as a Docker secret.",
	},
	OBZORARR_DATABASE_PATH: {
		schema: optional,
		description: "The database file's path; data/obzorarr.db in the working directory if unset.",
	},
	OBZORARR_LOG_DEBUG: {
		schema: optional,
		description: "Whether debug log entries are written: true or false; off if unset.",
	},
	ORIGIN: {
		schema: optional,
		description: "The address browsers use, such as https://obzorarr.example; optional.",
	},
} satisfies Record<
	SecretKeyVariable | keyof DatabasePathEnv | keyof LogDebugEnv | keyof OriginEnv,
	EnvVarConfig<string | undefined>
>);
