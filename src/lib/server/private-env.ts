// The app's one import of SvelteKit's private runtime environment. Every reader
// goes through this module (and tests mock it). It keeps the `env.NAME` shape of
// $env/dynamic/private; only variables declared in src/env.ts exist.
import * as env from '$app/env/private';

export { env };
