# Agent instructions

**Start:** read this file, then use the skills in this repo's `.agents/skills/` by name. Repo
specifics follow the house rules.

<!-- house-rules:start -->
## House rules

These rules are identical in every edbfi rewrite app.

### Working principles

Ambitious ideas, simple systems, software that feels obvious.

- **The smallest design that makes correct behaviour unsurprising.** Find the real constraint
  first, then fight for the simplest design that meets it. Don't keep complexity because it's
  already there, and don't add machinery because it looks architecturally impressive. Simplifying
  code outside the task is a note or a proposal, not a drive-by edit.
- **Measure twice, cut once; YAGNI.** Think a change through before writing it, then build what
  the approved spec and the task need now, nothing for a future that may not come. Fight scope
  creep both ways: no extras, and no silently dropped requirements; scope changes go through the
  spec. Honour the owner's intent in the smallest form that is still realistic, not a stub.
- **Defaults, not dogma.** The owner can override anything in this file. For agents, the explicit
  rules below (Always / Ask first / Never, Code structure, the cleanup procedures) hold; everything
  else is a good default for navigating and changing the codebase, and these principles guide the
  judgement calls. Precedence: the owner's explicit instruction, then `.agents/rules/*.md`, then
  this file, then the skills' defaults. The orchestrator approves ground-floor specs and task lists
  (Gates) but can't set a rule aside. When the owner overrides a rule, the PR body says which.

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
Invoke each skill by name; its `SKILL.md` is in `.agents/skills/<skill>/`. Every phase follows
[Code structure](#code-structure): specs and plans name files in its layout, builds keep to it
and review checks it.

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
   and always by the review rules below, which win where they differ.

**Spec boundaries.**
- **Always:** follow the approved spec, the task list and Code structure; write the test first;
  run prek and the repo's tests before each commit; keep each fact in one place; validate external
  input at runtime.
- **Ask first:** new dependencies; database schema changes; CI, prek, Biome or Dependabot changes;
  scope beyond the spec; deviating from DESIGN.md tokens or a surface brief.
- **Never:** commit secrets; edit installed skills; weaken a test or hook to get to green; delete a
  requirement because the code doesn't meet it yet.

**Review replies and merging:**
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

### Code structure

Hard principles, not size limits. No tool counts lines or files, because a cap forces arbitrary
splits that are worse than a long, coherent file. Review enforces these.

- **Same skeleton in every app.** Role folders are identical across the edbfi apps:
  `lib/server/{db,providers,services,jobs,http,config,security,logging}/`,
  `lib/components/{ui,layout,<feature>}/` and `lib/shared/`. A folder exists only once it holds a
  real file. A new role folder is a decision (`docs/decisions.md`) and goes into every app.
- **One purpose per file.** The test is reasons to change, not verbs: if two unrelated changes
  would both land in a file, split it. One component, service, job, or schema aggregate (its
  tables and relations) per file; a route file keeps all its handlers, `load` and `actions`.
  Private helpers that only that thing uses stay with it.
- **Share, but with a named home.** Keep each rule in one place, but extract only behaviour that
  is truly shared, never code that merely looks alike. Name files after what they hold
  (`format-duration.ts`, `plex/responses.ts`), never after their shape (`utils`, `helpers`,
  `common`, `misc`). Code used by one domain stays in it; code used by several moves to the lowest
  folder above them: server-only code under `lib/server/<what>/`, browser-safe code under
  `lib/shared/<what>/` (no secrets, env or server imports).
- **Folders group by domain.** Below the role folders, group by domain
  (`services/subscribers/provision/`). Add a subfolder when files form groups; a single file
  doesn't get a folder of its own. A component used by one route sits next to that route; one used
  by several moves to `lib/components/<feature>/`.
- **The folder says where; the name says what.** Kebab-case files that don't repeat the folder
  (`providers/plex/client.ts`, not `plex-client.ts`); a folder's one entry file may carry the
  folder's name. Components are PascalCase and may repeat it (`SubscriberCard.svelte`).
  `.svelte.ts` modules are kebab-case. No hand-written `index.ts` that only re-exports; a compound
  component may have one entry that names its parts.
- **Imports only go downwards.** `routes/`, `hooks.server.ts` and `jobs/` → `services/` →
  `providers/` and `db/` → `http/` and `security/` → `logging/` → `config/`. Routes, hooks and
  jobs stay thin and call services, never a provider or `db/` directly. Services may use other
  services; providers and `db/` never import each other or anything above them. `lib/shared/`
  imports nothing else from `lib/` and anything may import it; `lib/components/` is imported only
  by routes and other components. Browser code never imports server code.
- **The framework wins.** SvelteKit's files keep their names (`+page.svelte`, `+server.ts`,
  `+page.server.ts`, `hooks.server.ts`, `app.d.ts`, `./$types`), and generated code is exempt.
- **Tests sit next to their source** (`client.ts` + `client.test.ts`). In `routes/` drop the `+`,
  which SvelteKit reserves: `+server.ts` + `server.test.ts`. End-to-end tests go in `tests/e2e/`.
- **Size is a question, not a verdict.** A long file or crowded folder means "does this have more
  than one purpose?" If not, it stays. The review skill's size signal is this question, not a
  blocker.

### Shared groundwork

**Shared groundwork, distinct products.** The edbfi rewrite apps share one stack, one code skeleton
and, where two or more need the same thing, one way of building it, so the owner and agents move
between them without relearning the groundwork. This is a convention between repos, not a
dependency: each app keeps its own code and standalone documents, with no shared package and no
automated cross-app checks for sameness. Reuse a sibling's proven way when the need is genuinely the
same, without building ahead for the others; where needs differ, the app's purpose and spec win, and
the difference is deliberate, not drift to correct. Never make code or screens alike only for
symmetry.

- **A reference app per area.** The first app to build a shared area is its reference, normally
  obzorarr, which comes first by priority. The map below names it once it's known.
- **Port after the reference has built it.** Another app specifies a shared module only once the
  reference has built it, starting from the reference's spec and tests. Its `SPEC-<id>.md` names
  the reference and what differs in its first lines. Specs copied before this rule (`secrets`) are
  kept in step with the reference instead.
- **Say who else needs a change.** A PR that changes a shared area names, in its body, the sibling
  apps that need the same change. Correctness and security fixes reach them soon; wording can wait.
- **What may differ:** the environment prefix, the app name, the stored secrets, the database
  engine, routes, settings surfaces, shell names, design tokens, legacy contracts, and anything a
  product decision requires. The monthly prune compares the shared areas (cleanup procedure 3).

| Area | How it's shared | Reference | Apps |
|---|---|---|---|
| Stack, config, Biome, prek, CI, the code skeleton | identical | — | all |
| `secrets` | the same design; each app lists its own stored secrets | obzorarr | all |
| `i18n` | the same rules; each app adds its own context | obzorarr | all |
| `setup`, `sign-in`, `two-factor`, `oidc-sign-in` | a shared core; each capability map names its app's additions | obzorarr | all |
| Testing patterns: tests beside their source, the e2e smoke on the built server, environment isolation | the same | obzorarr | all |
| SSRF-safe outbound HTTP | a shared core; each app sets its address policy | obzorarr | all |
| Providers behind a contract, validated at the boundary | the same pattern | first to build | all |
| Background jobs' lifecycle | the same pattern | first to build | all |
| Plex sign-in | the same mechanics; who signs in differs | obzorarr | obzorarr, otpravkarr, zondarr |
| Live streams to the browser | the same mechanics; payloads and replay differ | first to build | all but otpravkarr |
| Audit trail | one write service; storage and privileges differ | otpravkarr | otpravkarr, comradarr, zimuarr |
| Environment locks on settings | the same | obzorarr | obzorarr, zondarr |
| API keys | the same | comradarr | comradarr, zimuarr |
| Logs pages, health checks beyond the basics, notifications, provider operations, domain models, settings surfaces, shells and routes, design tokens, Docker packaging | each app's own | — | — |

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

**Most code changes need no doc change.** Agents and people read the code, so internal docs don't
describe the implementation. They hold what code can't say: intent, constraints, decisions, the
spec, and this file's repo section (status, structure, commands). Update a doc when a change alters
one of those; the cleanup procedures below still apply to every PR.

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
   critiques. Flag any doc that grew a lot since the last prune for a human look. Compare this app's
   shared areas with their reference app's ([Shared groundwork](#shared-groundwork)) and list in the
   PR body what should be ported.
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
come next, in the order of the approved capability map in `docs/SPEC.md`, each through an
owner-approved `docs/SPEC-<id>.md`.

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

The tree as it stands; `later:` marks the folders that modules add. Its rules are in
[Code structure](#code-structure).

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
  lib/                           imported as `#lib/<path>.<ext>`, e.g.
                                 `#lib/server/services/health.ts`
    assets/obzorarr-icon.svg     the logo: the README shows it, the layout imports it as favicon
    server/                      server-only: services/health.ts; later db/ (schema per aggregate),
                                 providers/plex/ (and the optional AI text provider),
                                 services/<domain>/, jobs/, http/ (SSRF-safe fetch), config/,
                                 security/, logging/
    components/                  later: ui/ (Ark wrappers), layout/, <feature>/
    shared/                      later: browser-safe shared code
tests/
  e2e/smoke.test.ts              Playwright smoke against the built server
  fixtures/demo-fixtures.json    design fixtures
drizzle/                         later: reviewed migrations
panda.config.ts                  every design token; components use them through
                                 `#styled-system/<module>` (generated, gitignored)
vite.config.ts                   SvelteKit (all its configuration), Panda and Vitest
playwright.config.ts  tsconfig.json  package.json  bun.lock
```

Vitest runs `src/**/*.test.ts`; Playwright runs `tests/e2e/`.
