# Tasks: obzorarr ground floor

Every check below runs with failing `node`, `npm` and `npx` shims on `PATH`. Plan and risks:
[plan.md](plan.md); scope: [docs/SPEC.md](../docs/SPEC.md).

## Phase 1: App

### T1: SvelteKit app on Bun serves `/`

**Description:** Add `package.json` (`packageManager: "bun@1.4.3"`, the `#lib` import alias, the
`dev`, `build`, `preview` and `check` scripts with `--bun`, a `prepare` that runs
`bun --bun svelte-kit sync`), `bun.lock`, the Vite config with the SvelteKit plugin and adapter-bun,
`tsconfig.json`, the document shell and a placeholder `(public)` page at `/`.

**Acceptance criteria:**
- [x] `bun ci`, `bun run --bun check` (zero errors and warnings) and `bun run --bun build` pass.
- [x] `bun run --bun preview` serves `/` with the placeholder heading.
- [x] SvelteKit's configuration lives in the Vite plugin; `#lib` resolves (the root layout imports
  the icon from `#lib/assets/obzorarr-icon.svg`).

**Verification:**
- [x] `bun ci && bun run --bun check && bun run --bun build`
- [x] `bun run --bun preview`, then `curl -fsS localhost:<port>/` shows the heading.

**Dependencies:** none

**Files likely touched:** `package.json`, `bun.lock`, `vite.config.ts`, `tsconfig.json`,
`src/app.html`, `src/app.d.ts`, `src/routes/(public)/+page.svelte`

**Estimated scope:** M (two of the files are generated)

### T2: `/healthz` with its unit test

**Description:** Write the failing Vitest test first, then the handler: `GET /healthz` returns 200,
`ok` as plain text, `cache-control: no-store`. Add Vitest (`node` environment) and the `test` script.

**Acceptance criteria:**
- [ ] The test fails before the handler exists and passes after.
- [ ] `bun run --bun test` runs once and exits (no watch mode).

**Verification:**
- [ ] `bun run --bun test`
- [ ] `bun run --bun check`

**Dependencies:** T1

**Files likely touched:** `src/routes/healthz/+server.ts`, `src/routes/healthz/server.test.ts`,
`vite.config.ts` (test block), `package.json`, `bun.lock`

**Estimated scope:** S

### Checkpoint A

- [ ] `check`, `test` and `build` pass from a clean clone.
- [ ] `/` and `/healthz` respond from the built server.

## Phase 2: Design system and smoke

### T3: Panda tokens from the design seed

**Description:** Add Panda CSS through its Vite plugin, run its codegen in `prepare` after
`svelte-kit sync` (`bun --bun panda codegen`), and put every value from `docs/design/tokens.json`
into `panda.config.ts`: colours as semantic tokens behind a dark-by-default colour-mode condition,
type styles, spacing, radii, layout sizes, motion durations, with After Hours as the only theme
(spec, ground-floor choice 4). The root layout loads the stylesheet; the placeholder page uses only
tokens. Font tokens use system fallbacks (spec, ground-floor choice 1).

**Acceptance criteria:**
- [ ] Every token in `tokens.json` exists in `panda.config.ts` under DESIGN.md's names.
- [ ] No raw colour, size or font value in `src/`.
- [ ] A clean clone builds (`styled-system/` is generated, never committed).

**Verification:**
- [ ] `rm -rf node_modules styled-system && bun ci && bun run --bun check && bun run --bun build`
- [ ] Manual: the built page's background is `#0B1828` and the heading uses the display style.

**Dependencies:** T1

**Files likely touched:** `panda.config.ts`, `vite.config.ts`, `package.json`, `bun.lock`,
`src/routes/+layout.svelte`, `src/routes/(public)/+page.svelte`

**Estimated scope:** M

### T4: Remove the seed token files

**Description:** Delete `docs/design/tokens.json` and `tokens.css` now that Panda holds the values,
and repoint every link to them (AGENTS.md, docs/SPEC.md) at `panda.config.ts`.

**Acceptance criteria:**
- [ ] No doc links to the deleted tokens (`rg 'tokens\.(json|css)' AGENTS.md DESIGN.md PRODUCT.md docs .impeccable` finds nothing).
- [ ] Nothing in `tokens.json` is missing from `panda.config.ts` (preservation gate in the PR body).

**Verification:**
- [ ] `rg -n 'tokens\.(json|css)' AGENTS.md DESIGN.md PRODUCT.md docs .impeccable`
- [ ] `prek run --all-files --hook-stage manual`

**Dependencies:** T3

**Files likely touched:** `docs/design/tokens.json`, `docs/design/tokens.css`, `AGENTS.md`,
`docs/SPEC.md`

**Estimated scope:** XS

### T5: Ark UI

**Description:** Add `@ark-ui/svelte`, now, before its first use (spec, ground-floor choice 2).

**Acceptance criteria:**
- [ ] It installs with no unmet peer dependency.
- [ ] `check` and `build` still pass.

**Verification:**
- [ ] `bun ci && bun run --bun check && bun run --bun build`

**Dependencies:** T1

**Files likely touched:** `package.json`, `bun.lock`

**Estimated scope:** XS

### T6: e2e smoke against the built server

**Description:** Add Playwright (Chromium) with a `webServer` that starts the built adapter-bun
server, the `smoke` script, and `tests/e2e/smoke.test.ts`. It checks that `/` returns 200, shows the
heading, hydrates (a client-side signal, not only the HTML), applies the Panda background token and
logs no console errors, and that `/healthz` returns `ok`.

**Acceptance criteria:**
- [ ] `bun run --bun build && bun run --bun smoke` passes after `bunx --bun playwright install chromium`.
- [ ] Breaking hydration or the stylesheet makes the smoke test fail.

**Verification:**
- [ ] `bun run --bun build && bun run --bun smoke`
- [ ] Manual: temporarily break the layout's stylesheet import and see the test fail.

**Dependencies:** T2, T3

**Files likely touched:** `playwright.config.ts`, `tests/e2e/smoke.test.ts`, `package.json`, `bun.lock`

**Estimated scope:** S

### Checkpoint B

- [ ] `check`, `test`, `build` and `smoke` pass from a clean clone.
- [ ] Review with the orchestrator before the tooling switches on.

## Phase 3: Tooling and CI

### T7: Biome

**Description:** Add `@biomejs/biome` as a dev dependency and the `lint` script. Format the app code.
The shared `biome.json` already skips the installed skills and the tool-written configs
(`.claude/`, `.codex/`, `.impeccable/`, `skills-lock.json`); it changes only for all five apps at once.

**Acceptance criteria:**
- [ ] `bun run --bun lint` passes.
- [ ] Biome skips the installed skills and the tool-written configs.

**Verification:**
- [ ] `bun run --bun lint`

**Dependencies:** T1 (scheduled after checkpoint B)

**Files likely touched:** `package.json`, `bun.lock`, formatted source files

**Estimated scope:** S

### T8: Bun web prek config

**Description:** Replace `.pre-commit-config.yaml` with edbfi-ci's Bun web template (frozen revs as
on main), keeping the vendored-skill exclusions and the `docs-set` hook, and add a `check` hook
(`bun run --bun check`, `pass_filenames: false`).

**Acceptance criteria:**
- [ ] `prek run --all-files --hook-stage manual` passes, including `biome`, `biome-migrate`,
  `check-peers`, `tests`, `check` and `docs-set`.
- [ ] A stray `NOTES.md` still fails `docs-set`.

**Verification:**
- [ ] `prek run --all-files --hook-stage manual`

**Dependencies:** T2, T6, T7

**Files likely touched:** `.pre-commit-config.yaml`

**Estimated scope:** XS

### T9: CI, Dependabot and biome-migrate

**Description:** Move `ci.yml` to edbfi-ci's Bun web template (`checks`, `smoke` with the Playwright
browser install, `audit`, `ci-ok`; keep cron `29 3 * * 0`), add the `bun` block to `dependabot.yml`,
and add `biome-migrate.yml`. Record the tier change for edbfi-ci in the PR body.

**Acceptance criteria:**
- [ ] actionlint, zizmor and `privileged-jobs` pass.
- [ ] The PR's `checks`, `smoke` and `ci-ok` are green; `audit` is skipped on PRs.

**Verification:**
- [ ] `prek run --all-files --hook-stage manual`
- [ ] The PR's CI run.

**Dependencies:** T8

**Files likely touched:** `.github/workflows/ci.yml`, `.github/dependabot.yml`,
`.github/workflows/biome-migrate.yml`

**Estimated scope:** S

### Checkpoint C

- [ ] All spec success criteria 1–5 hold.

## Phase 4: Close

### T10: End-of-stream cleanup

**Description:** Run the end-of-stream cleanup from AGENTS.md: add the structure section to AGENTS.md
and the real commands to its repo part, fold durable outcomes into docs/SPEC.md and
docs/decisions.md (close D15 or D16 parts that were validated), and delete `tasks/`.

**Acceptance criteria:**
- [ ] AGENTS.md describes the tree that exists; spec success criterion 6 holds.
- [ ] Nothing in `tasks/` is lost: each item is done, in the spec, or in decisions.

**Verification:**
- [ ] `prek run --all-files --hook-stage manual`
- [ ] PR body carries the preservation map.

**Dependencies:** T1–T9

**Files likely touched:** `AGENTS.md`, `docs/SPEC.md`, `docs/decisions.md`, `tasks/plan.md`,
`tasks/todo.md`

**Estimated scope:** S
