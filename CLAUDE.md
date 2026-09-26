# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Bun 1.4.2 (pinned in `package.json` `packageManager`). `bun install --frozen-lockfile` also runs `svelte-kit sync` (`prepare`) and `prek install` (`postinstall`).

| Task | Command |
| --- | --- |
| Dev server | `bun run dev`; `bun run dev:env` to apply `.env` (needed for `DEV_*` vars) |
| Lint + format check (read-only, CI) | `bun run check:biome` |
| Fix formatting/lint | `bunx biome check --write <paths>` (there is no `fix` script) |
| Typecheck (CI) | `bun run check` runs svelte-check twice, TS 6 and `--tsgo` (TS 7). Both must pass |
| All tests | `bun run test` (= `bun test --env-file=.env.test`) |
| One file | `bun test --env-file=.env.test tests/unit/sync/scheduler.test.ts` |
| One case | `bun test --env-file=.env.test tests/unit/sync/scheduler.test.ts -t "pause/resume"` |
| CI test-build job | `bash .github/scripts/check.sh` (tests, build, production smoke on a temp DB) |
| CI hygiene job | `SKIP=no-commit-to-branch,biome bunx --no-install prek run --all-files --hook-stage manual` |
| New migration | `bun run db:generate` (see workflow below) |

- `bunfig.toml` turns coverage on with an 80% line/function threshold for every `bun test` run. A single-file run can exit non-zero on coverage alone, so read the pass/fail counts.
- prek hooks block commits to `main`, enforce Conventional Commits in commit-msg, run `biome check --write` on commit, and run `bun run check` plus tests on pre-push.

## Stack reference and where this repo differs

- `.agents/rules/svelte5-sveltekit-app.md`: generic Svelte 5 runes / SvelteKit / UnoCSS / shadcn-svelte / Biome conventions. Read it before writing components or routes.
- Where it disagrees with this repo's config, follow the repo and don't migrate toward the rules file. This repo uses `bun:test`, not Vitest (`tests/unit/test-architecture.test.ts` fails on `vitest` or `@jest/globals` imports). It uses `svelte-adapter-bun`, not adapter-node. UnoCSS uses `presetWind4`. `svelte-check --tsgo` is required. Kit config (CSP, adapter, csrf) lives in `svelte.config.js`.
- The rules file is right about `$app/state`. The 8 remaining `$app/stores` imports are legacy, so don't copy them.

## Layout and boundaries

- `src/lib/server/<domain>/` holds the server-only services (auth, sharing, stats, sync, plex, security, logging, slides, admin). Route files stay thin and call these.
- Client-safe types and zod schemas shared with the server live in `src/lib/{stats,slides,sharing,sync}/types.ts`.
- Runtime configuration is the `app_settings` key/value table, accessed only through `src/lib/server/admin/settings.service.ts` (`AppSettingsKey`, getters and setters, `set*Atomic` writers).
- Read Plex/OpenAI config through `getPlexConfig()` / `getApiConfigWithSources()` in that service, never through `env.PLEX_*` / `env.OPENAI_*`. Env values override the DB and lock the UI field (the `ENV` badge).
- `src/hooks.server.ts` `handle` redirects every path to `/onboarding/<step>` until onboarding completes, except the `skipPaths` prefixes. A new endpoint that must work before onboarding needs a prefix there.
- `src/lib/components/ui/` holds shadcn-svelte primitives (`components.json`). Add new ones with the shadcn-svelte CLI rather than writing them by hand.

## Route and action rules

- A `+page.server.ts` may export only SvelteKit-reserved names (`load`, `actions`, `prerender`, …). Helpers exported for tests must be `_`-prefixed (e.g. `_deriveFunFactsSummary` in `src/routes/onboarding/complete/+page.server.ts`). `bun run check` misses violations; `tests/unit/routes/route-export-guard.test.ts` and `bun run build` catch them.
- Form actions don't run `load`, so a `load` redirect doesn't protect them. Wrap admin actions in `requireAdminActions({...})` and user actions in `requireUserActions({...})`. In `+server.ts` handlers call `requireAdmin(locals)`. All three come from `$lib/server/auth/guards`.
- Every anonymous "cannot view" outcome on a Wrapped or share route must be the same 404 with `WRAPPED_NOT_FOUND_MESSAGE` (`$lib/server/sharing/types`), so callers can't tell which case they hit. `tests/unit/sharing/anon-denial-uniformity.test.ts` enforces this.
- Server logging uses `logger.info|warn|error(message, 'Source', metadata?)` from `$lib/server/logging`, which persists to the admin log viewer. Code in `src/lib/client/**` must not call `console.log/debug/info` (test-enforced).

### Form actions: which pattern

| Question | Superforms (`superValidate` + `zod4`, client `superForm`) | Plain `request.formData()` + zod `safeParse`, returning `{ success, message }` / `fail(n, { error })` |
| --- | --- | --- |
| Writing a new settings form? | ✅ copy `admin/settings/system` or `privacy` | |
| Small edit to a route already using the plain shape? | | ✅ keep its shape |

Code comments call the plain shape legacy (`src/lib/utils/form-toast.ts`). `handleFormToast` handles both shapes on the client.

Settings forms use optimistic concurrency. Each form carries `settingsVersion` (from `settingsVersionISO(await getAppSettingsUpdatedAt(KEYS))`), and a stale version returns 409 with `OCC_CONFLICT_MESSAGE`, whose exact string tests assert. Prefer a `set*Atomic` writer and take the new version from its result. `externalOccCheck` has no callers, so don't reuse it. From `src/routes/admin/settings/system/+page.server.ts`:

```ts
const form = await superValidate(request, zod4(SchedulerTimezoneSchema), { id: 'schedulerTimezone' });
if (!form.valid) {
	if (form.errors.settingsVersion?.length) {
		return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
	}
	// …
}
const result = await setSchedulerTimezoneAtomic({ timezone: form.data.timezone, submittedVersion: form.data.settingsVersion });
if (result.status === 'conflict') {
	return fail(409, { form, conflict: true, error: OCC_CONFLICT_MESSAGE });
}
const { timezone } = result;
// …
form.data.settingsVersion = settingsVersionISO(result.version);
return { form, success: true, message: `Scheduler timezone set to ${timezone}` };
```

## Testing

- Put tests only under `tests/unit/<domain>/`, `tests/property/` (fast-check) or `tests/integration/`. `bunfig.toml` sets the test root to `./tests`, so tests placed in `src/` never run. `tests/unit/server/` is forbidden by the architecture test.
- `tests/helpers/README.md` defines the DB modes, helper tiers and `mock.module` ordering. Read it before writing a test that mocks modules or touches the DB.
- Route tests import the module by relative path (`../../../src/routes/admin/settings/appearance/+page.server`) and call `load` or `actions.x({ request, locals })` directly, with fake `locals.user`. Call `resetSharedTestDb()` from `tests/helpers/db.ts` in `beforeEach`.
- Tests never run migrations. `tests/setup.ts` builds the `:memory:` schema from hand-written DDL, and `tests/unit/core-contracts.test.ts` checks its columns against `schema.ts`.
- Many tests are source guards: they `readFile` a `.svelte` or `.ts` file and assert copy, `aria-*` attributes or markup (e.g. `tests/unit/admin/dogfood-ui-invariants.test.ts`). Before changing user-facing text or markup, run `grep -rn "<old text>" tests/`.
- There are no component-render or browser tests.

## Workflows

### DB schema change

1. Edit `src/lib/server/db/schema.ts`.
2. Run `bun run db:generate`. It writes `drizzle/NNNN_*.sql` plus `drizzle/meta/*`, which are generated and excluded from Biome, so don't hand-edit them. The app applies migrations on startup (`src/lib/server/db/client.ts`). `bun run db:migrate` runs them manually.
3. Mirror the change in the DDL in `tests/setup.ts`.
4. For a new table, also add it to `sharedTestDbTables` and to `resetSharedTestDb()` (keep FK-safe order) in `tests/helpers/db.ts`.

### New Wrapped slide type

1. Add the id to `SlideTypeSchema` in `src/lib/slides/types.ts`, and to `SlideType`, `DEFAULT_SLIDE_ORDER` (which seeds `slide_config`) and a props interface in `src/lib/components/slides/types.ts`.
2. Add a stats field to both `UserStatsSchema` and `ServerStatsSchema` in `src/lib/stats/types.ts`. Update the arbitraries in `tests/property/serialization.property.test.ts`.
3. Add a calculator in `src/lib/server/stats/calculators/`, export it from `calculators/index.ts`, and call it in both `calculateUserStats` and `calculateServerStats` in `src/lib/server/stats/engine.ts`.
4. Create `src/lib/components/slides/<Name>Slide.svelte` and export it from `index.ts`. Add a branch in `src/lib/components/wrapped/SlideRenderer.svelte`.
5. Add labels in `src/routes/admin/slides/+page.svelte` and `src/routes/onboarding/settings/+page.server.ts`.

## Other gotchas

- Theme ids are hard-coded in about ten places, including the inline `validThemes` script in `src/app.html`, `src/app.css`, `src/lib/utils/theme-fonts.ts`, `ThemePresets` and the appearance `ThemeEnum`. Run `grep -rn "soviet-red" src tests` to find every site before adding or renaming a theme.
- UnoCSS may miss classes that only appear in portalled bits-ui content, and they then silently render unstyled. Add them to `safelist` in `uno.config.ts`.
- `DEV_BYPASS_AUTH=true` (and `DEV_BYPASS_ONBOARDING=true`) only take effect in dev mode, via `bun run dev:env`. On a fresh DB, onboarding's claim token prints to the server console, never the browser.

## Biome configuration

Biome is pinned to 2.5.14. The configuration uses Git ignores, the recommended lint and assist presets, and experimental full Svelte support. Keep type checking separate from Biome. Project quote, comma and indentation conventions remain explicit in the configuration.

The exact-file formatter overrides protect components containing `{@const ...}`: Biome 2.5.14 inserts parentheses that Svelte rejects with `expected_pattern`. These files still receive lint and import checks. Recheck them with the Svelte compiler when upgrading Biome before removing the exceptions. Do not run a formatter with these overrides bypassed.

The narrow accessibility overrides retain the story player’s window-level keyboard handling and the custom slide dialog’s focus trap, Escape handler and styled-list semantics. Inline suppressions explain polymorphic component props, rendered control snippets, rich radio cards and CSS browser fallbacks. Generated Drizzle files are excluded from scanning.
