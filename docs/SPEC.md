# Spec: obzorarr

**Status:** the ground floor (skeleton) is specified here, approved by the orchestrator
(2026-10-18) and built. The capability map below is approved; `secrets` is specified in
[SPEC-secrets.md](SPEC-secrets.md).

## Objective

obzorarr is a private year in review for a Plex Media Server: it reads the server's play history and
gives each member a personal recap, plus a server-wide recap, as an animated story, with an admin
panel for the server's owner ([PRODUCT.md](../PRODUCT.md), [legacy spec](product/legacy-spec.md)).

**This spec covers only the ground floor:** an empty, production-shaped SvelteKit app that builds,
type-checks, tests, lints and serves on Bun, styled from the design tokens, with the edbfi Bun web
CI around it. It has no database, authentication, Plex, sync, recap or any other product feature. Its
job is to make the first module spec cheap to build: every later PR adds behaviour, not plumbing.

## Capability map

**Status:** approved by the owner (2026-10-24; shared rows aligned 2026-10-30). Module ids never
change. Each module gets its own `docs/SPEC-<id>.md`, which the owner approves just before it is
built.
Sources: [PRODUCT.md](../PRODUCT.md), [decisions.md](decisions.md), the
[legacy spec](product/legacy-spec.md) and the [surface briefs](../.impeccable/surfaces/).

**Every module keeps to [Code structure](../AGENTS.md#code-structure).** Its spec names the files it
adds in that layout, and review checks them. In short:
- The same role folders as every edbfi app. A folder exists only once it holds a real file.
- One purpose per file. No `utils`, `helpers`, `common` or `misc` files.
- Group by domain under the role folders. The folder says where; the file name says what.
- Imports only go downwards. Routes, hooks and jobs stay thin and call services.
- Tests sit next to their source.

**Every module writes its text in English and Danish** through `i18n` (D21): no user-facing text in
components or services, and dates and numbers formatted for the viewer's locale.

| # | Module id | Responsibility | Depends on | Surfaces |
|---|---|---|---|---|
| 1 | `secrets` | Encrypts stored secrets (the Plex server token, members' Plex tokens in their sessions, the AI key, the artwork signing key, two-factor secrets, the OIDC client secret) before they reach the database (D20, D26), and the secret wrapper that shows only a redaction marker and opens at one named call | — | — |
| 2 | `i18n` | The translation groundwork (D21) with Paraglide JS (D22): message files in English and Danish, choosing each request's language, the language switcher, formatting dates and numbers for the viewer's locale, and a check that every message exists in both languages | — | the language switcher in each shell |
| 3 | `recap-spike` | The three-slide spike (D19): three slides on the demo fixtures in story mode, with motion, reduced motion and translated text, to settle the recap's design before it is committed. No database or sign-in, and its code becomes product code only through `recap`'s spec | `i18n` | a spike route that its spec names (ground-floor choice 5) |
| 4 | `setup` | Startup checks, database and migrations, settings, structured logging with redaction (legacy "Logging"), security headers and CSP (ground-floor choice 3), the setup gate, the bootstrap token, printed to the console and never through the stored logs, and claiming the instance for its one owner, keeping the origin it was claimed from as the first allowed origin. obzorarr adds environment locks on settings and the per-group versions that catch a save from a stale tab (legacy "Settings concurrency") | `secrets`, `i18n` | first-run setup (no brief yet) |
| 5 | `sign-in` | Owner sign-in with username and password, signing the new owner in at the claim (D20), sessions, sign-out (POST only), rate limits, the origin check, cookies that work over plain HTTP at home and behind an HTTPS proxy, password change, error pages, recovery (D20), and the admin shell (legacy "Security"). obzorarr adds the scanner filter and the origin check's one exempt repair action | `setup` | owner sign-in (no brief yet); the admin shell; `/admin/settings`, which it builds first with the Security tab; later modules add their tabs; the password section of the owner's account settings |
| 6 | `two-factor` | Optional but strongly recommended (D20): authenticator codes, backup codes and the challenge after every way the owner signs in (except the optional OIDC skip, D20), with replay protection and a limit on failed attempts. Recovery turns it off. Adds the offer to first-run setup, right after the owner account is created and before any connection step, and the reminder in the admin shell while it is off | `sign-in` | the two-factor offer in first-run setup; the owner's account settings (no brief yet); the reminder in the admin shell |
| 7 | `public-address` | The public-address check (legacy "First-run onboarding" step 3): comparing the browser, app and forwarded origins, classifying the forwarded headers and the source address, the recommended fix and the header recipes for common reverse proxies. It never blocks | `sign-in` | its first-run step; a section of the Security tab |
| 8 | `plex-connection` | The Plex provider (D12, D18), SSRF-safe outbound HTTP (D8), and connecting the server: picking one of the owner's servers through a one-time Plex sign-in, or a URL and token; sorted connections; plain HTTP only for private hosts by opt-in; test and save; environment locks; accepted only when the token belongs to the server's owner (D20). Changing the URL or token advances the authority epoch | `sign-in` | its first-run step; `/admin/settings/connections` (the Plex form) |
| 9 | `identity` | Identity reconciliation (legacy "Identity reconciliation"): the all-or-nothing mapping from server-local accounts to Plex accounts, its proof record, the 24-hour freshness and the authority epoch | `plex-connection` | — |
| 10 | `sync` | History sync: the three modes, a watermark that survives empty runs (legacy weakness 7), enrichment with a retry window for failed lookups (weakness 9), the single running slot claimed atomically (weakness 10), cancel, the admin and member progress streams, live sync when a recap opens, and the schedule with pause, resume and the instance time zone (D24), with every start visible and cancellable (weakness 6). Adds the first-run sync and time zone steps | `identity` | its first-run steps; `/admin/sync` (no brief yet); the time zone in the System tab |
| 11 | `plex-sign-in` | Sign in with Plex. For members: PIN sign-in in a popup or by redirect, safe return paths, the membership check against a fresh mapping, revalidation with its grace window, member sessions and sign-out. For the owner: linking their Plex account in the account settings, after which Plex signs them in as the owner, through two-factor when it is on. Unlinked, the server owner's Plex account gets a member session (D20) | `two-factor`, `identity` | the sign-in flow and its popup page; the Plex section of the owner's account settings |
| 12 | `stats` | The statistics engine (legacy "Statistics engine"): every calculator with its tie-breaks and determinism, runtime totals (D23), years and buckets in the instance time zone (D24), top movies grouped by item rather than title (weakness 3), series completion marked unknown when the lookup fails (weakness 4), and the per account-year cache with its invalidation | `sync` | — |
| 13 | `sharing` | Share modes and the privacy floor, user control, slugs and per-year private-link tokens, identifier resolution with the uniform not-found, the names mode with hybrid comparing the same identity (weakness 5), and the member's sharing page | `plex-sign-in` | `/sharing` |
| 14 | `recap` | The Wrapped experience, built on the spike's outcome: the slide catalogue with its empty states, story and scroll modes sharing one position and both ending with the summary (weakness 12), year navigation, the voice rules, the logo mode, the artwork proxy with signed URLs, and the server recap with top viewers | `recap-spike`, `stats`, `sharing` | `/wrapped/[year]/[id]` (brief: `/wrapped/2025/me`); the server recap (no brief yet) |
| 15 | `member-dashboard` | The member overview: the personal and server recap cards, the year picker and the monthly chart | `recap` | `/dashboard` |
| 16 | `landing` | The landing page with Plex sign-in, and the optional public username lookup (off by default) with its rate limit and uniform not-found | `recap` | `/` |
| 17 | `privacy-settings` | The privacy presets, the saved and after-saving exposure previews in the same wording onboarding uses, the advanced cards and applying defaults to existing users. Adds its panel to first-run configuration | `sharing` | `/admin/settings/privacy` |
| 18 | `slides-admin` | Ordering and enabling built-in slides with keyboard controls, and custom slides with checked markup and an optional year (legacy "Slides and the Wrapped experience"). Adds its panel to first-run configuration | `recap` | `/admin/slides` |
| 19 | `fun-facts` | Template fun facts as translated, plural-aware messages, and the optional AI text provider (key, https base URL, model, persona, connection test), asked in the viewer's language with templates as the fallback; placement and frequency. Adds its panel to first-run configuration | `recap` | the fun-fact control on `/admin/slides`; the AI form on `/admin/settings/connections` |
| 20 | `appearance` | The interface and Wrapped theme settings and the logo mode. It decides whether more presets than After Hours return (ground-floor choice 4). Adds its panel to first-run configuration | `recap` | the appearance rail on `/admin/settings/connections` |
| 21 | `users-admin` | The per-year users table: watch time, effective share mode, the per-user control toggle and each recap's link. No delete, ban or roles | `sharing`, `stats` | `/admin/users` (no brief yet) |
| 22 | `logs` | Stored log entries, the logs page with filters that match on the server (weakness 17), the live view, export, the retention job and the log settings | `sign-in` | `/admin/logs` (no brief yet); the log settings in the System tab |
| 23 | `data-admin` | Clearing cached statistics and play history per year or wholesale, offering to reset the watermark (weakness 8), and the instance reset, which returns to the claim with a new token | `sync`, `stats` | the Data tab of `/admin/settings` (no brief yet) |
| 24 | `oidc-sign-in` | Connecting one OpenID Connect provider (Authentik, Authelia, Pocket ID, Tinyauth and others) by its issuer, client id and secret, and linking the owner's account to it, after which it signs them in as the owner, and offering to skip `two-factor` when the provider's `amr` claim reports its own second factor (D20) | `two-factor` | the owner's account settings; its button on owner sign-in |
| 25 | `overview` | The owner dashboard and the Wrapped hub: viewers, hours, plays and records for a year, the sync card, the yearly activity chart, the owner's own recap (only when it has plays) and the server recap, and quick links | `sync`, `stats`, `recap` | `/admin`; the Wrapped hub (no brief yet) |

Build order: `secrets` → `i18n` → `recap-spike` → `setup` → `sign-in` → `two-factor` →
`public-address`, `plex-connection` → `identity` → `sync` → `plex-sign-in`, `stats` → `sharing` →
`recap` → `member-dashboard`, `landing`, `privacy-settings`, `slides-admin`, `fun-facts`,
`appearance`, `users-admin`, `logs`, `data-admin`, `oidc-sign-in` → `overview`. A comma means
either order works. The shared opening (D20) runs in its usual order, with the recap spike right
after `i18n`, so the riskiest design is settled early and its text is translated from the start.
`recap` is the first time a member gets something they can use.

First-run setup grows step by step: `setup` claims the instance and creates the owner account,
`two-factor` offers itself, `public-address` checks the address, `plex-connection` connects Plex,
`sync` asks for the time zone and runs the first sync, and `privacy-settings`, `slides-admin`,
`fun-facts` and `appearance` each add their panel to the configuration step (legacy "First-run
onboarding").

### Where modules live

Paths are under `src/lib/server/`, except those starting with `routes/` (under `src/`) or `lib/`
(under `src/`), and `hooks.server.ts` (`src/hooks.server.ts`). They follow the
[Code structure](../AGENTS.md#code-structure) layout:

| Module | Main homes |
|---|---|
| `secrets` | `security/secrets/` (the cipher and the secret wrapper); loading the key in `config/` |
| `i18n` | `messages/en.json` and `messages/da.json`, `project.inlang/` (Paraglide's settings), `lib/shared/i18n/` (formatting); `paraglideMiddleware` in `hooks.server.ts` |
| `recap-spike` | `lib/components/recap/` (the slide shell and the three slides); its route |
| `setup` | `db/` (client, migrations, settings and owner schema), `config/`, `logging/` (with redaction), `services/setup/`, `security/bootstrap-token.ts`, `security/headers.ts`; `routes/setup/`, and the setup gate and the headers in `hooks.server.ts` |
| `sign-in` | `services/sign-in/` (sessions and their storage, recovery), `db/` session schema, `security/` (session-token and password hashing, the in-memory rate limiter, scanner filter, origin check); the sign-in at the claim in `routes/setup/`, `routes/(admin)/` layout and sign-in page, `routes/(admin)/admin/settings/`, `lib/components/layout/` |
| `two-factor` | `services/two-factor/`, the owner schema's two-factor fields in `db/`; the offer in `routes/setup/`, the challenge page beside the sign-in page, its section of the owner's account settings, and the reminder in `lib/components/layout/` |
| `public-address` | `services/public-address/`; its first-run step and its section of the Security tab |
| `plex-connection` | `providers/plex/`, `http/`, `services/connections/plex.ts`; `routes/(admin)/admin/settings/connections/` |
| `identity` | `services/identity/`, `db/` account-mapping schema |
| `sync` | `services/sync/`, `jobs/sync.ts`, `db/` history, metadata and sync-run schema; `routes/(admin)/admin/sync/`, the progress streams under `routes/api/` |
| `plex-sign-in` | `services/plex-sign-in/`, `db/` member-session and sign-in-attempt schema; the sign-in routes under `routes/(public)/` |
| `stats` | `services/stats/`, `db/` statistics-cache schema |
| `sharing` | `services/sharing/`, `db/` share-settings schema; `routes/(app)/sharing/` |
| `recap` | `services/recap/`, `services/artwork/`, `lib/components/recap/`; the recap routes and the artwork route |
| `member-dashboard` | `routes/(app)/dashboard/` (uses `recap` and `stats`) |
| `landing` | `services/lookup/`; `routes/(public)/` |
| `privacy-settings` | `routes/(admin)/admin/settings/privacy/` (uses `sharing`) |
| `slides-admin` | `services/slides/`, `db/` slide schema; `routes/(admin)/admin/slides/` |
| `fun-facts` | `services/fun-facts/`, `providers/ai/` |
| `appearance` | `services/appearance/` |
| `users-admin` | `routes/(admin)/admin/users/` (uses `sharing` and `stats`) |
| `logs` | `services/logs/` (stores entries through a sink that `logging/` exposes, because `logging/` can't import `db/`), `db/` log schema, `jobs/log-retention.ts`; `routes/(admin)/admin/logs/` |
| `data-admin` | `services/data/`; the Data tab under `routes/(admin)/admin/settings/` |
| `oidc-sign-in` | `services/sign-in/oidc.ts`, the provider settings and the owner's link in `db/`; its callback route beside the sign-in page |
| `overview` | `services/overview/`; `routes/(admin)/admin/` and the Wrapped hub |

### Open decisions each module closes

- `recap-spike`: D19.
- `i18n`: the validation that D22 lists (pinned versions, the adapter-bun build, a Weblate round
  trip).
- `setup`: D15 (Drizzle and Turso pair) and the logging library half of D14.
- The first module with a background job closes the job half of D14: `sign-in` if its session
  cleanup is a job, otherwise `sync`.
- `plex-connection`: D18, including the watched-time question (D23) and the history and mapping
  checks that `identity` and `sync` rely on.
- D13: the first JSON endpoint called from the browser (`sync`'s progress stream or
  `plex-sign-in`'s polling) decides whether it needs a generated client. D17 stays open as an
  accepted limit.

### Left out on purpose

- Any role beyond the one owner, and the Plex-proven administrator (legacy "Users, roles and
  permissions"; owner decision, D20).
- Signing in through a reverse proxy's headers (D20): `oidc-sign-in` covers the same identity
  providers.
- Connecting Weblate (D21): later work, outside this map. The message files are ready for it.
- Watched time instead of runtime, until the Plex audit shows the data exists (D23), and a time
  zone per member (D24).
- The development-only sign-in bypass (legacy "Sign-in and sessions"): development tooling, not
  product.
- Live now-playing, media playback and anything written to Plex (PRODUCT.md, principle 4).

### Surfaces with no brief yet

First-run setup and its steps, owner sign-in, the owner's account settings, the server recap, the
Wrapped hub, `/admin/sync`, `/admin/users`, `/admin/logs` and the Security, Data and System tabs of
`/admin/settings` are needed (all are in the legacy app or in PRODUCT.md's admin shell) but have no
brief. The landing brief's signed-out navigation has only Obzorarr and Help, so it needs a way to
owner sign-in. Each gets its brief before its module is specced.

## Tech stack

The stack decisions are in [decisions.md](decisions.md) (D1–D12). Versions are exact pins in
`package.json` (Bun from its `packageManager` field) and `bun.lock`; Dependabot moves them. Every
package is a dev dependency, so adapter-bun bundles it and `bun ./build` needs no `node_modules`.

| Part | Package |
|---|---|
| Runtime and package manager | Bun |
| Language | `typescript` (6.x) |
| UI framework | `svelte` / `@sveltejs/kit` |
| Build | `vite` / `@sveltejs/vite-plugin-svelte` |
| Adapter | `@sveltejs/adapter-bun` |
| Styling | `@pandacss/dev`, `@pandacss/vite` (its Vite plugin), `@pandacss/preset-base` |
| Primitives | `@ark-ui/svelte` |
| Type check | `svelte-check` |
| Unit tests | `vitest` (`node` environment); `happy-dom` joins with the first component test |
| e2e | `@playwright/test` (Chromium) |
| Lint and format | `@biomejs/biome` |

Setup facts for this stack:
- SvelteKit 3 is configured through its Vite plugin (`vite.config.ts`); there's no
  `svelte.config.js`. `tsconfig.json` extends `$app/tsconfig`, which `svelte-kit sync` generates.
- Package subpath imports replace `$lib` and need explicit file targets: `#lib/*` maps to
  `./src/lib/*` and imports name the file with its extension (`#lib/server/services/health.ts`);
  `#styled-system/*` maps to the generated `./styled-system/*/index.js`.
- Assets are imported through Vite from `src/lib/assets/`: the root layout takes the favicon from
  `#lib/assets/obzorarr-icon.svg`, so there's no `static/` folder.
- `svelte-kit sync` runs before Panda's codegen, in `prepare` and in `check`.
- The Panda Vite plugin appends the generated CSS to the stylesheet that declares the layer order
  (`src/app.css`), and `transform: true` turns static `css()` calls into class strings at build
  time.
- Hook types come from `@sveltejs/kit/hooks`.
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.
- Bun blocks `@parcel/watcher`'s install script (it builds with Node); Panda works without it.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync` and Panda codegen |
| `bun run --bun dev` | Vite dev server |
| `bun run --bun build` | production build through adapter-bun into `build/` |
| `bun run --bun preview` | runs the built server (`bun ./build`; `PORT`, default 3000, and `HOST`) |
| `bun run --bun check` | `svelte-kit sync`, Panda codegen, then `svelte-check` failing on any error or warning |
| `bun run --bun test` | Vitest unit tests, once (no watch) |
| `bun run --bun smoke` | Playwright e2e smoke; it starts the built server, so `build` comes first, and Chromium comes from `bunx --bun playwright install chromium` |
| `bun run --bun lint` | `biome check` |
| `prek run --all-files --hook-stage manual` | everything CI's `checks` job runs |

## Project structure

The folder tree is in [AGENTS.md](../AGENTS.md#structure) and its rules in
[Code structure](../AGENTS.md#code-structure).

## Code style

Biome's defaults with the shared `biome.json` (tabs, double quotes, 100 columns). TypeScript strict;
`#lib/…` imports. File names and layout follow
[Code structure](../AGENTS.md#code-structure).

```ts
import { healthResponse } from "#lib/server/services/health.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => healthResponse();
```

## Design tokens

- [`panda.config.ts`](../panda.config.ts) holds every design token: colours, type styles,
  spacing, radii, layout sizes, breakpoints and motion durations, under the names DESIGN.md uses.
  It replaced the seed token files that came with the design package.
- Colours are semantic tokens behind a colour-mode condition (`_dark`), dark by default
  (`class="dark"` on `<html>` in `src/app.html`); After Hours is the only theme, and other themes
  can be added later without touching components (ground-floor choice 4).
- Only `@pandacss/preset-base` is loaded (utilities and conditions), so no preset palette competes
  with the app's tokens, and `strictTokens` makes a raw value in `css()` a type error that `check`
  reports.
- The placeholder page uses only Panda tokens: no raw colour, size or font values in components.
  It stays quiet: no projector-light imagery or recap motion, which belong to the landing and recap
  modules.

## Testing strategy

- **Unit (Vitest, `node` environment):** one test, for the `/healthz` handler: status 200, body
  `ok`, `cache-control: no-store`. Component tests use happy-dom when components exist; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** one smoke test against the built adapter-bun server.
  It checks that `/` returns 200, shows the placeholder heading, hydrates (it waits for the
  `data-hydrated` attribute the root layout sets when mounted), applies the Panda background token
  and display text style and logs no console errors, and that `/healthz` returns `ok`.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds and runs the smoke test.

## CI and repo tooling

obzorarr is a Bun web repo with edbfi-ci's Bun web templates:
- `.pre-commit-config.yaml`: Biome, `biome-migrate`, `check-peers`, the `tests` hook, plus a
  `check` hook (`bun run --bun check`), keeping the vendored-skill exclusions and the `docs-set`
  hook.
- `.github/workflows/ci.yml`: `checks` (prek), `smoke` (Chromium install, build, smoke) and `audit`
  (outside PRs); `checks` and `smoke` sit behind `ci-ok`, every job that installs runs with failing
  `node`, `npm` and `npx` on `PATH`, and the weekly run is `29 3 * * 0`.
- `.github/dependabot.yml` covers `github-actions`, `pre-commit` and `bun`, and
  `.github/workflows/biome-migrate.yml` applies Biome migrations and formatter output to
  Dependabot's Biome PRs.

## Boundaries

- **Always:** Bun with `--bun` for every tool; tokens only through Panda; keep SvelteKit's
  configuration in the Vite plugin; prek green before each commit.
- **Ask first:** any dependency not in the tech stack table; any change to `biome.json` (it is
  shared by the five rewrite apps); any CI shape that differs from the edbfi-ci template.
- **Never:** a database, authentication, Plex, sync, a recap slide or any other product feature; a
  second styling tool or primitive library; Node, npm or npx anywhere, including CI.

## Success criteria

1. A fresh clone passes `bun ci`, `bun run --bun check` (zero errors and warnings), `bun run --bun
   test`, `bun run --bun build`, `bun run --bun smoke` and `prek run --all-files --hook-stage
   manual`, with no Node on `PATH`.
2. The built server (`bun ./build`) serves `/` with the placeholder page and `/healthz` with `ok`.
3. `panda.config.ts` holds every design token; the seed token files are gone, and nothing in `src/`
   uses a raw colour, size or font value.
4. Only folders with real files exist; `#lib` resolves in app code, tests and `svelte-check`.
5. CI on the PR runs `checks`, `smoke` and `ci-ok` green; `audit` runs outside PRs.

## Ground-floor choices

Choices 1–3 are carried over from the first rewrite app's skeleton, since obzorarr's design doesn't
call for anything different; choices 4 and 5 are obzorarr's own.

1. **Fonts.** DESIGN.md wants Space Grotesk, Instrument Sans and IBM Plex Mono bundled locally. The
   skeleton defines the font tokens with system fallbacks; the first surface adds the font files (a
   dependency the owner approves then).
2. **Ark UI before its first use.** The skeleton installs `@ark-ui/svelte`, so the Panda and Ark
   pairing and `check-peers` are settled early; the first `ui/` wrapper comes with the first surface
   that needs one.
3. **Security headers and CSP.** The legacy app set a nonce-based CSP and security headers on every
   response (legacy spec, "Security"). They belong to the first module that serves real pages
   (`setup`, whose claim page comes before `sign-in`), not the skeleton.
4. **Themes.** The legacy app lets the owner pick the admin panel's theme and the recap's theme
   independently, from five presets; the design seeds both to After Hours. The skeleton defines After
   Hours as the only theme, its colours as semantic tokens behind the dark colour-mode condition, and
   the module that brings back the two theme settings decides whether more presets return and how
   Panda switches them.
5. **CSP and the recap spike.** Whether the recap spike carries the security headers and CSP (choice
   3) is decided by the spike's own spec, since only it knows whether the spike is served to users.
