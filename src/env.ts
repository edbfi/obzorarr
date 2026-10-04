import { defineEnvVars } from '@sveltejs/kit/env';
// Relative, not $lib: SvelteKit loads this file with its own resolver, without the app's alias.
import { canonicalOrigin } from './lib/server/security/origin';

// SvelteKit 3 exposes only the private variables declared here, through
// $app/env/private (read via $lib/server/private-env). Unset values stay
// undefined so each reader keeps its own default and validation.
// tests/unit/env-declarations.test.ts checks this list against the readers.
// DATABASE_PATH and NODE_ENV are read through process.env and need no entry.
const optional = { schema: (value: string | undefined) => value };

export const variables = defineEnvVars({
	COMMIT_TAG: optional,
	DEV_BYPASS_AUTH: optional,
	DEV_BYPASS_ONBOARDING: optional,
	DEV_BYPASS_USER: optional,
	DEV_PLEX_TOKEN: optional,
	ENABLE_LIVE_SYNC: optional,
	METADATA_CONCURRENCY: optional,
	// Set by scripts/serve.ts when it fronts the adapter with ORIGIN; not an operator setting.
	OBZORARR_FRONT_ORIGIN: optional,
	OPENAI_API_KEY: optional,
	OPENAI_API_URL: optional,
	OPENAI_MODEL: optional,
	// The public origin, parsed as scripts/serve.ts parses it: canonical (lowercase, no default
	// port, no trailing slash), blank means unset, and anything that is not a bare http(s) origin
	// stops the app at startup on every entry path (the front, build/index.js, vite preview).
	ORIGIN: { schema: canonicalOrigin },
	PLEX_ALLOW_INSECURE_LOCAL_HTTP: optional,
	PLEX_SERVER_URL: optional,
	PLEX_TOKEN: optional,
	TRUST_PROXY: optional,
	TZ: optional
});
