# Spec: obzorarr

**Status:** the ground floor (skeleton) is specified here and waits for the orchestrator's approval.
Product modules aren't specified yet (see the capability map).

## Objective

obzorarr is a private year in review for a Plex Media Server: it reads the server's play history and
gives each member a personal recap, plus a server-wide recap, as an animated story, with an admin
panel for the server's owner ([PRODUCT.md](../PRODUCT.md), [legacy spec](product/legacy-spec.md)).

**This spec covers only the ground floor:** an empty, production-shaped SvelteKit app that builds,
type-checks, tests, lints and serves on Bun, styled from the design tokens, with the edbfi Bun web
CI around it. It has no database, authentication, Plex, sync, recap or any other product feature. Its
job is to make the first module spec cheap to build: every later PR adds behaviour, not plumbing.

## Capability map

Placeholder. Product modules come later, each through an owner-approved `docs/SPEC-<id>.md`. The map
(module ids, dependencies, build order) is proposed with `spec-driven-development` Phase 0 after the
skeleton has merged, from the legacy spec and the [surface briefs](../.impeccable/surfaces/). No
module id exists yet.

**First after the ground floor:** the three-slide recap spike
([D19](decisions.md#d19-the-animated-recap)). The animated recap is the surface most likely to need
custom work beyond Panda CSS and Ark UI, so three slides are built before its design is committed.
The spike gets its own owner-approved spec; the rest of the map is proposed with it or after it.

## Tech stack

The stack decisions are in [decisions.md](decisions.md) (D1–D12). The skeleton starts from the
versions validated for the rewrite stack and locks what it resolves; after that, `package.json` and
`bun.lock` are the source.

| Part | Package | Starting version |
|---|---|---|
| Runtime and package manager | Bun (`packageManager: "bun@1.4.3"`) | 1.4.3 |
| Language | `typescript` | 6.0.3 |
| UI framework | `svelte` / `@sveltejs/kit` | 5.57.2 / 3.1.0 |
| Build | `vite` / `@sveltejs/vite-plugin-svelte` | 8.3.4 / 7.3.1 |
| Adapter | `@sveltejs/adapter-bun` | 1.0.0 |
| Styling | `@pandacss/dev` (with its Vite plugin) | 2.2.0 |
| Primitives | `@ark-ui/svelte` | 5.24.3 |
| Type check | `svelte-check` | latest compatible |
| Unit tests | `vitest` (`node` environment), `happy-dom` for later component tests | latest |
| e2e | `@playwright/test` (Chromium) | latest |
| Lint and format | `@biomejs/biome` | the current release |

Setup facts already proven for this stack:
- SvelteKit 3 is configured through the Vite plugin, and its library alias is `#lib` (a `package.json`
  `imports` entry), not `$lib`.
- `svelte-kit sync` runs before Panda's codegen.
- Package subpath imports need explicit file targets.
- Hook types come from `@sveltejs/kit/hooks`.
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync` and Panda codegen |
| `bun run --bun dev` | Vite dev server |
| `bun run --bun build` | production build through adapter-bun into `build/` |
| `bun run --bun preview` | runs the built server (`bun ./build`) |
| `bun run --bun check` | `svelte-kit sync`, then `svelte-check` with zero errors and warnings |
| `bun run --bun test` | Vitest unit tests, once (no watch) |
| `bun run --bun smoke` | Playwright e2e smoke against the built server |
| `bun run --bun lint` | `biome check` |
| `prek run --all-files --hook-stage manual` | everything CI's `checks` job runs |

## Project structure

The skeleton creates only folders that hold a real file. The full layout below is the target the
modules grow into; AGENTS.md gains it as its structure section when this work stream closes.

```text
src/
  app.html                       document shell
  app.d.ts                       SvelteKit ambient types
  routes/
    +layout.svelte               imports the Panda stylesheet; dark colour mode
    (public)/+page.svelte        `/`: placeholder page
    healthz/+server.ts           `/healthz`: public one-word status
    (app)/ (admin)/ api/         later: member area and recaps, owner admin panel, JSON endpoints
  lib/
    assets/obzorarr-icon.svg     the logo (exists; the README links it)
    server/                      later: db/, providers/plex/ (and the optional AI text provider),
                                 services/<domain>/, jobs/, http/ (SSRF-safe fetch), config/,
                                 security/, logging/
    components/                  later: ui/ (Ark wrappers), layout/, <feature>/
    shared/                      later: isomorphic types, schemas, utilities
tests/
  e2e/smoke.test.ts              Playwright smoke
  fixtures/demo-fixtures.json    design fixtures (exists)
drizzle/                         later: reviewed migrations
panda.config.ts  vite.config.ts  playwright.config.ts  tsconfig.json  package.json  bun.lock
```

- Routes stay thin and call services; they never reach the database or a provider directly.
- Unit tests sit next to their source as `*.test.ts`; e2e tests live in `tests/e2e/`.
- One purpose per file and one component per file.

## Code style

Biome's defaults with the shared `biome.json` (tabs, double quotes, 100 columns). TypeScript strict;
`#lib/…` imports; kebab-case file names; PascalCase `.svelte` component files.

```ts
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
	new Response("ok", {
		headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
	});
```

## Design tokens

- `panda.config.ts` takes every value in [`docs/design/tokens.json`](design/tokens.json): colours,
  type styles, spacing, radii, layout sizes and motion durations, under the names DESIGN.md uses.
- Colours are semantic tokens behind a colour-mode condition, dark by default; other themes can be
  added later without touching components (open question 1).
- Once the Panda config holds them, `docs/design/tokens.json` and `tokens.css` are deleted, and the
  links to them point at `panda.config.ts`.
- The placeholder page uses only Panda tokens: no raw colour, size or font values in components.
  It stays quiet: no projector-light imagery or recap motion, which belong to the landing and recap
  modules.

## Testing strategy

- **Unit (Vitest, `node` environment):** one test, for the `/healthz` handler: status 200, body
  `ok`, `cache-control: no-store`. Component tests use happy-dom when components exist; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** one smoke test against the built adapter-bun server.
  It checks that `/` returns 200, shows the placeholder heading, hydrates, applies the Panda
  background token and logs no console errors, and that `/healthz` returns `ok`.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds and runs the smoke test.

## CI and repo tooling

obzorarr moves from the Content tier to Bun web with this work
([edbfi-ci repos.md](https://github.com/edbfi/edbfi-ci/blob/main/design/repos.md) rule 12):
- `.pre-commit-config.yaml` from edbfi-ci's Bun web template: Biome, `biome-migrate`, `check-peers`,
  the `tests` hook, plus a `check` hook (`bun run --bun check`), keeping the vendored-skill
  exclusions and the `docs-set` hook.
- `.github/workflows/ci.yml` from the Bun web template: `checks`, `smoke` (with the Playwright browser
  install) and `audit`, all behind `ci-ok`, with the failing `node`/`npm`/`npx` shims on `PATH`.
- `.github/dependabot.yml` gains the `bun` block, and `.github/workflows/biome-migrate.yml` is added.
- edbfi-ci records the tier change in its STATE.md (outside this repo).

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
6. AGENTS.md has its structure section, and `tasks/` is deleted when the work stream closes.

## Ground-floor choices

Carried over from the ground floor the orchestrator approved for the first rewrite app; obzorarr's
design doesn't call for anything different.

1. **Fonts.** DESIGN.md wants Space Grotesk, Instrument Sans and IBM Plex Mono bundled locally. The
   skeleton defines the font tokens with system fallbacks; the first surface adds the font files (a
   dependency the owner approves then).
2. **Ark UI before its first use.** The skeleton installs `@ark-ui/svelte`, so the Panda and Ark
   pairing and `check-peers` are settled early; the first `ui/` wrapper comes with the first surface
   that needs one.
3. **Security headers and CSP.** The legacy app set a nonce-based CSP and security headers on every
   response (legacy spec, "Security"). They belong to the first module that serves real pages, not
   the skeleton.

## Open questions

1. **Themes.** The legacy app lets the owner pick the admin panel's theme and the recap's theme
   independently, from five presets. The design seeds both to After Hours and names no other preset.
   Proposal: the skeleton defines After Hours as the only theme, its colours as semantic tokens
   behind the dark colour-mode condition, and the module that brings back the two theme settings
   decides whether more presets return and how Panda switches them.
2. **CSP and the recap spike.** If the recap spike ships as a real route before sign-in exists, does
   it carry the security headers and CSP (choice 3), or does that wait for sign-in? Proposal: the
   spike's spec decides, since only it knows whether the spike is served to users.
