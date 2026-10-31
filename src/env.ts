import { defineEnvVars, type EnvVarConfig } from "@sveltejs/kit/env";
import type { SecretKeyVariable } from "#lib/server/config/secret-key.ts";

// Optional and never throwing: SvelteKit's own validation would otherwise print its own message
// before `secrets` checks the key (SPEC-secrets.md, "Declaring the variables").
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
} satisfies Record<SecretKeyVariable, EnvVarConfig<string | undefined>>);
