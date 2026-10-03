import { defineEnvVars } from '@sveltejs/kit/env';

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
	OPENAI_API_KEY: optional,
	OPENAI_API_URL: optional,
	OPENAI_MODEL: optional,
	ORIGIN: optional,
	PLEX_ALLOW_INSECURE_LOCAL_HTTP: optional,
	PLEX_SERVER_URL: optional,
	PLEX_TOKEN: optional,
	TRUST_PROXY: optional,
	TZ: optional
});
