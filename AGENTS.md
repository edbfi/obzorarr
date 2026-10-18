# Agent instructions

**Start:** read this file, then use the skills in this repo's `.agents/skills/` by name. Repo
specifics follow the house rules.

<!-- house-rules:start -->
## House rules

These rules are identical in every edbfi rewrite app. Project rules in `.agents/rules/*.md`, where
they exist, override them.

### Stack and tools

**Follow this repo's tech stack** (README, `package.json`) and run every JavaScript tool through Bun
with `--bun`: bun/bunx instead of npm/npx/node, installers included. The skills' examples use other
stacks and package managers; treat them as illustrations, never as instructions.

| Skill examples say | Do this |
|---|---|
| `npm install`, `npm ci` | `bun install`; frozen: `bun ci` or `bun install --frozen-lockfile` |
| `npm install <pkg>` | `bun add <pkg>` (`bun add -d <pkg>` for dev) |
| `npm run <script>`, `npm test` | `bun run --bun <script>`, `bun run --bun test` |
| `npx <bin>` | `bunx --bun <bin>` |
| `node <file>` | `bun <file>` |
| `node --check <file>` | `bunx --bun biome lint <file>` |
| `npm audit` | `bun audit` |
| a bin inside `prepare`/`postinstall` | `bun --bun <bin>` (`bun ci` doesn't apply `--bun` to lifecycle scripts) |
| Prettier, ESLint | Biome: `bunx --bun biome check --write` |

- **Python:** only through uv. Scripts use `uv run --script` with PEP 723 inline dependencies;
  tools run with `uvx`. No pip, no virtualenvs by hand.
- **Biome** formats and lints. Its config is shared by the rewrite apps and stays free of project
  paths; installed skills and tool-written configs are excluded.
- **prek** runs the checks: `prek run --all-files --hook-stage manual` is exactly what CI runs. Run
  it before every commit, or `prek install` once per clone. Never weaken a hook to get past it.
- **Installed skills are tool-owned.** `.agents/skills/`, `.claude/skills/`, `.claude/agents/`,
  `.opencode/` and `skills-lock.json` change only through their installers: never edit or reformat
  them by hand. To update, rerun the installer with the new version, then diff each Impeccable
  provider build against its upstream `skill-v<version>` tag:

  ```sh
  bunx --bun skills add 'addyosmani/agent-skills#<tag>' -a claude-code -a codex -a opencode -y -s <skills…>
  DO_NOT_TRACK=1 bunx --bun impeccable@<version> update --project -y
  ```

### Git

- **Commits:** Conventional Commits with a DCO sign-off (`git commit -s`). The PR title becomes the
  squash commit, so it follows the same format.
- **Worktrees:** work on a branch in a `git worktree` from `origin/main`. The main clone may hold the
  owner's uncommitted edits: never stash, reset or commit them.
- **Push guard:** where a clone sets `remote.origin.pushurl` to `no-push-allowed`, never unset it.
  Push deliberately with `git push git@github.com-edbfi:edbfi/<repo>.git <branch>`. Run `gh` from
  inside the workspace.
- **Never** write secret values (names are fine), change GitHub settings, or merge by hand.

### Workflow

**A feature starts with a spec.** No feature code without an approved spec, a plan and a task list.
Invoke each skill by name; its `SKILL.md` is in `.agents/skills/<skill>/`.

| Phase | Skill | Artifact |
|---|---|---|
| spec | `spec-driven-development` | `docs/SPEC.md` (project spec + capability map), `docs/SPEC-<id>.md` per module |
| plan | `planning-and-task-breakdown` | `tasks/plan.md` + `tasks/todo.md` |
| build | `incremental-implementation` + `test-driven-development` | code, tests, commits |
| review | `code-review-and-quality` | PR review, including the cleanup gate below |
| decisions | `documentation-and-adrs` | `docs/decisions.md`: one file of `D<n>` entries, not one ADR per decision |

Also installed, for when their description fits: `context-engineering`,
`source-driven-development`, `git-workflow-and-versioning`, `debugging-and-error-recovery`,
`security-and-hardening`, `api-and-interface-design`, `frontend-ui-engineering`, and `impeccable`
(design, below).

**Gates.**
1. The orchestrator approves ground-floor specs and task lists; the owner approves product-feature
   specs (`docs/SPEC-<id>.md`) and the capability map.
2. Every PR is shepherded until it merges: with the owner's `babysit-pr` skill where it's installed,
   and always by the review rules below. Where they differ, edbfi-ci's
   [auto-merge rules](https://github.com/edbfi/edbfi-ci/blob/main/design/auto-merge.md) 8–13 win.

**Spec boundaries.**
- **Always:** follow the approved spec and task list; write the test first; run prek and the repo's
  tests before each commit; keep each fact in one place; validate external input at runtime.
- **Ask first:** new dependencies; database schema changes; CI, prek, Biome or Dependabot changes;
  scope beyond the spec; deviating from DESIGN.md tokens or a surface brief.
- **Never:** commit secrets; edit installed skills; weaken a test or hook to get to green; delete a
  requirement because the code doesn't meet it yet.

**Review replies and merging** ([auto-merge.md](https://github.com/edbfi/edbfi-ci/blob/main/design/auto-merge.md) rules 8–13):
- After opening a PR and after every push, wait up to 30 minutes for Pullfrog's review of the current
  head. Without one, ask once with `@pullfrog review` and wait 30 more minutes; then end the loop on
  the checks and record `no bot review received`. Never use Pullfrog's Fix links.
- Check every finding against the source, then answer it once per revision of its comment:
  **APPROVED** (fixed as suggested), **REVISED** (fixed differently, saying how) or **REJECTED**
  (with the reason or the owner decision it conflicts with). Owner decisions win. Resolve each thread
  you answered; a thread a person reopens twice stays open for the owner.
- Push only heads whose gates ran; rewrite pushed history only when needed, with
  `--force-with-lease` on the expected remote head.
- Enable `gh pr merge --auto --squash` only once the review loop has ended on the current head and
  the `pr-policy` run of the last title or body edit has finished. A stacked PR gets it only after
  its parent merged and it targets `main`.
- The PR body records the review outcome (findings with verdicts) and the final head's checks.

### Design

Design work uses Impeccable: `/impeccable` in Claude Code and OpenCode, `$impeccable` in Codex.
- Agents call the repo-local launcher `.agents/skills/impeccable/scripts/impeccable <cmd>`, never
  `bunx impeccable`. Look up a route's brief with `… surface-brief read route:/<path>` (the `route:`
  prefix is required) or load everything with `… context --target route:/<path>`.
- Apply live manual edits inline, not through the `impeccable-manual-edit-applier` subagent (its
  prompt calls Node). Check syntax with `bunx --bun biome lint`.
- PRODUCT.md is authoritative. DESIGN.md is the visual source until code exists; then the Panda
  config is, and DESIGN.md is refreshed from it with `document` and reviewed.
- One surface brief at a time. Tokens only through Panda; Ark UI is the only primitive library.
- Check 360, 390, 768 and 1440 px, keyboard focus, 200% zoom, reduced motion and every state the
  brief names (loading, empty, failure, pending, saved, disabled).
- Expressive styling only on entry and recap surfaces; operational screens stay quiet.

### Docs

A fixed set of files. No length limits; bloat is removed by the cleanup procedures, never by cutting
real content. History lives in git and PR bodies, and each fact lives in one place.

```text
README.md  AGENTS.md  CLAUDE.md          humans; agent rules (CLAUDE.md is only @AGENTS.md)
PRODUCT.md  DESIGN.md                    Impeccable (needs the root)
docs/SPEC.md                             project spec + capability map
docs/SPEC-<id>.md                        one per module being built or changed
docs/decisions.md                        D<n> entries: decision + why
docs/product/legacy-spec.md              imported spec; drains to deletion
docs/research/<topic>.md                 temporary research input
docs/design/                             images (+ tokens until the first scaffold)
tasks/plan.md  tasks/todo.md             the active work stream only
.impeccable/surfaces/*.md  critique/     Impeccable-managed
```

The `docs-set` prek hook fails on any other `.md` file: fold the content into an existing doc or the
PR body.

**Cleanup procedures** (part of the definition of done):
1. **Every PR**, before it opens: update each changed fact in its one place; delete superseded text
   instead of marking it old; put outcomes, test evidence and reports in the PR body, never in files;
   tick off and remove finished items in `tasks/`. Review checks the doc diff for duplication and
   staleness.
2. **End of a work stream** (`tasks/plan.md` complete): delete `tasks/`; fold durable outcomes into
   `docs/SPEC.md` and `docs/decisions.md`; reduce each built `SPEC-<id>.md` to what code and tests
   can't say, or delete it; delete the `legacy-spec.md` sections a spec now covers; delete research
   whose outcome has landed; close resolved Impeccable critiques.
3. **Monthly prune** (a scheduled task): read every doc against the code and the spec, and open a PR
   that removes stale, duplicated and superseded content, finished work, merged research and closed
   critiques. Flag any doc that grew a lot since the last prune for a human look.
4. **Preservation gate**, for every removal above: the PR body maps each removed requirement to an
   approved spec, a test or an owner-approved scope removal. Nothing is cut only for length.
<!-- house-rules:end -->

## obzorarr

obzorarr is a private year in review for a Plex Media Server: it reads the server's play history and
gives each member a personal recap, plus a server-wide recap, as an animated story, with an admin
panel for the server's owner. It is being rewritten from scratch; the previous version is on the
`legacy-old/v1` branch, for reference only.

**Status:** the ground floor is built: an empty SvelteKit app on Bun with Panda tokens, `/healthz`,
one unit test, one e2e smoke and the Bun web CI ([`docs/SPEC.md`](docs/SPEC.md)). Product modules
come next, each through an owner-approved `docs/SPEC-<id>.md`; the first is the three-slide recap
spike.

**Commands** (what each does: [docs/SPEC.md](docs/SPEC.md#commands)): `bun ci`, then
`bun run --bun <dev|build|preview|check|test|smoke|lint>`; `prek run --all-files --hook-stage
manual` is CI's `checks` job. `smoke` runs against the built server, so run `build` first, and it
needs Chromium once per machine: `bunx --bun playwright install chromium`.

**Boundaries.**
- The animated recap starts with a three-slide spike ([D19](docs/decisions.md#d19-the-animated-recap)).
  Its design isn't committed, and no other recap slide is built, before the spike's spec is approved
  and the spike has run.
- The legacy spec describes behaviour to keep, not the technology: its header names the superseded
  sections.
- Never bring code over from `legacy-old/v1`; rebuild from the spec. Published releases up to 0.1.11
  and their tags stay as they are.

**Read next.**
- Product: [PRODUCT.md](PRODUCT.md), [legacy spec](docs/product/legacy-spec.md).
- Design: [DESIGN.md](DESIGN.md), the [surface briefs](.impeccable/surfaces/) (one per route),
  [screens and references](docs/design/), [design tokens](panda.config.ts),
  [demo fixtures](tests/fixtures/demo-fixtures.json).
- Decisions: [docs/decisions.md](docs/decisions.md).

## Structure

Folders exist only once they hold a real file; the later ones are the layout that modules grow
into. These are principles, not hard limits.

```text
src/
  app.html                       document shell; `class="dark"` sets the default colour mode
  app.css                        Panda layer order; the Vite plugin appends the generated CSS
  app.d.ts                       SvelteKit ambient types
  routes/
    +layout.svelte               loads app.css and the favicon; marks <html data-hydrated> once
                                 mounted
    (public)/+page.svelte        `/`: placeholder page
    healthz/+server.ts           `/healthz`: public one-word status
    (app)/ (admin)/ api/         later: member area and recaps, owner admin panel, JSON endpoints
  lib/                           imported as `#lib/<path>.<ext>`, e.g. `#lib/server/health.ts`
    assets/obzorarr-icon.svg     the logo: the README shows it, the layout imports it as favicon
    server/                      server-only: health.ts; later db/ (schema per aggregate),
                                 providers/plex/ (and the optional AI text provider),
                                 services/<domain>/, jobs/, http/ (SSRF-safe fetch), config/,
                                 security/, logging/
    components/                  later: ui/ (Ark wrappers), layout/, <feature>/
    shared/                      later: isomorphic types, schemas, utilities
tests/
  e2e/smoke.test.ts              Playwright smoke against the built server
  fixtures/demo-fixtures.json    design fixtures
drizzle/                         later: reviewed migrations
panda.config.ts                  every design token; components use them through
                                 `#styled-system/<module>` (generated, gitignored)
vite.config.ts                   SvelteKit (all its configuration), Panda and Vitest
playwright.config.ts  tsconfig.json  package.json  bun.lock
```

- Routes stay thin and call `#lib/server` code; they never reach the database or a provider
  directly.
- Unit tests sit next to their source as `*.test.ts` (Vitest takes `src/**/*.test.ts`); e2e tests
  live in `tests/e2e/`.
- One purpose per file and one component per file (naming: [docs/SPEC.md](docs/SPEC.md#code-style)).
  A file that keeps growing is a prompt to split it, raised in review.
