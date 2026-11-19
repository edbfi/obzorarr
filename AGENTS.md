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
  the reference and what differs in its first lines.
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
| Failed form submits: the "Error: " title and `components/forms/ErrorSummary.svelte`, focused only by the enhanced form, never `autofocus` (D29) | the same, on every form | obzorarr | all |
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
- Every screen is beautiful. The app's showcase surfaces, which its own section names, go all in on
  motion and effects; everywhere else motion is subtle: it makes the interface feel polished, modern
  and light, and never distracts from the work or decorates for its own sake.

### Docs

A fixed set of files. No length limits; bloat is removed by the cleanup procedures, never by cutting
real content. History lives in git and PR bodies, and each fact lives in one place.

```text
README.md  AGENTS.md  CLAUDE.md          humans; agent rules (CLAUDE.md is only @AGENTS.md)
PRODUCT.md  DESIGN.md                    Impeccable (needs the root)
docs/SPEC.md                             project spec + capability map
docs/SPEC-<id>.md                        one per module being built or changed
docs/decisions.md                        D<n> entries: decision + why
docs/research/<topic>.md                 temporary research input
docs/design/                             images
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
   `docs/SPEC.md` and `docs/decisions.md`; move a specced module's Module notes block into its
   `SPEC-<id>.md`; reduce each built `SPEC-<id>.md` to what code and tests can't say, or delete it;
   delete research whose outcome has landed; close resolved Impeccable critiques.
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
unit tests, one e2e smoke and the Bun web CI ([`docs/SPEC.md`](docs/SPEC.md)). Product modules come
next, in the order of the approved capability map in `docs/SPEC.md`, each through an owner-approved
`docs/SPEC-<id>.md`. Module 1, `secrets` ([`docs/SPEC-secrets.md`](docs/SPEC-secrets.md)), is built
and ready for consumers. Nothing stores a secret yet. Module 2, `i18n`
([`docs/SPEC-i18n.md`](docs/SPEC-i18n.md)), is built: pages are served in English or Danish, with a
language switcher, number and date formatters, and a check of the message files. Module 3,
`recap-spike` ([`docs/SPEC-recap-spike.md`](docs/SPEC-recap-spike.md)), ran and closed D19: the
spike's code is gone, its look is withdrawn, and `recap` adopts how D19 says the recap is built
through its own spec. Module 4, `setup`
([`docs/SPEC-setup.md`](docs/SPEC-setup.md)), is built: startup opens the database and applies its
migrations, the app writes redacted JSON logs, it shuts down cleanly, every page carries the
security headers and a nonce-based CSP, and a state-changing request from another site gets "Access
denied". Until it is claimed, an instance sends every page to `/setup` and prints its bootstrap
token to the console; it is claimed there, which creates the owner account. Module 5, `sign-in`
([`docs/SPEC-sign-in.md`](docs/SPEC-sign-in.md)), is built, so the owner can sign in: errors and
refusals show branded pages, each client address is limited to 60 requests a minute, with requests
that bypass a configured proxy refused, the claim to 5 tries per 5 minutes, and password hashing to
4 at once; the claim refuses a browser that didn't say which address it is on, signs the new owner
in with a session and lands on the admin's Settings; and the owner signs in at `/admin/sign-in`,
linked from `/`, 10 times per 5 minutes from one address, with a wait after 10 failures in a row.
Everything else under `/admin` needs the owner's session, inside the admin shell: a sidebar, a rail
or a drawer by width, with the owner, Sign out behind its confirmation, the language switcher and
the version. The Security tab changes the owner's password, signing every other browser out, and has
"Sign out everywhere else". With `OBZORARR_RECOVERY` on, startup prints a recovery token for the
owner and warns, the owner sets a new password with it at `/recovery`, and the Security tab says to
turn it off. Probe paths and known scanners are turned away before the rate limits. Module 6,
`two-factor`, comes next, through its own spec.

**Commands:** the table in [docs/SPEC.md](docs/SPEC.md#commands); for the master key that `dev`
and `preview` need, see the README's [Master key](README.md#master-key).

**Boundaries.**
- Never bring code over from `legacy-old/v1`; rebuild from the spec. Published releases up to 0.1.11
  and their tags stay as they are.
- **Showcase surfaces** ([Design](#design)): the Wrapped and the landing page.
- **The visual direction is open.** It is designed from PRODUCT.md's Product Purpose; until then
  [DESIGN.md](DESIGN.md) says what its tokens and the surface briefs still stand for.

**Read next.**
- Product: [PRODUCT.md](PRODUCT.md).
- Design: [DESIGN.md](DESIGN.md), the [surface briefs](.impeccable/surfaces/) (one per route),
  [design tokens](panda.config.ts), [demo fixtures](tests/fixtures/demo-fixtures.json).
- Decisions: [docs/decisions.md](docs/decisions.md).

## Structure

The tree as it stands; `later:` marks the folders that modules add. Its rules are in
[Code structure](#code-structure).

```text
src/
  app.html                       document shell; `class="dark"` sets the default colour mode,
                                 and `handle` writes the request's language into `<html lang>`
  app.css                        Panda layer order; the Vite plugin appends the generated CSS
  error.html                     SvelteKit's last resort when even the error page fails, in
                                 English and Danish
  app.d.ts                       SvelteKit ambient types, `App.Error` with its optional status,
                                 and `__OBZORARR_VERSION__`, which the build writes in
  env.ts                         declares the app's variables: private, read at runtime, optional
  hooks.server.ts                the `init` hook: runs startup, except while building;
                                 `handle`, in order: each request's language, through Paraglide's
                                 middleware, the security headers, the cross-origin check, the
                                 scanner filter, the client address (kept in
                                 `locals.clientAddress` for the actions' own limits) and the
                                 general rate limit, the session (the owner in `locals.owner`),
                                 the setup gate, then the owner check;
                                 `handleError`: an unexpected error as one redacted log entry, and
                                 every error's message in the viewer's language
  hooks.client.ts                the browser keeps the language the server chose for the page
  routes/
    +layout.svelte               loads app.css, the bundled fonts and the favicon; marks
                                 <html data-hydrated> once mounted
    (public)/+page.svelte        `/`: placeholder page, its text from the messages, the
                                 language switcher and the link to the owner's sign-in
    +error.svelte                the error page: "Page not found", "Access denied", "Too many
                                 requests" or "Something went wrong", with Go back and Home, by
                                 the error's own status where it has one, as an enhanced form's
                                 action error does
    healthz/+server.ts           `/healthz`: public one-word status
    setup/                       `/setup`: the claim. +page.svelte: the form (surface brief
                                 `route-setup.md`); +page.server.ts: its load and the claim
                                 action, "not found" once claimed
    recovery/                    `/recovery`: +page.svelte, the form (surface brief
                                 `route-recovery.md`); +page.server.ts: its load and the recovery
                                 action, "not found" unless a recovery token is waiting
    (admin)/admin/sign-in/       `/admin/sign-in`: +page.svelte, the form (surface brief
                                 `route-admin-sign-in.md`); +page.server.ts: the sign-in action,
                                 the cookie and the return path
    (admin)/admin/sign-out/      `/admin/sign-out`: the POST ends the session and clears the
                                 cookie; a GET only redirects to `/admin`
    (admin)/admin/(shell)/       the owner's admin panel: +layout.svelte (and its server load,
                                 the owner's username) is the admin shell (surface brief
                                 `route-admin-settings-security.md`); +page.server.ts sends `/admin`
                                 to the Security tab until the overview exists;
                                 settings/+layout.svelte: the heading and the tabs;
                                 settings/+page.server.ts sends `/admin/settings` to its first
                                 tab; settings/security/: the Security tab, its Password and
                                 Sessions sections (+page.svelte) and their load and actions
                                 (+page.server.ts)
    (app)/ api/                  later: member area and recaps, JSON endpoints
  lib/                           imported as `#lib/<path>.<ext>`, e.g.
                                 `#lib/server/services/health.ts`
    assets/obzorarr-icon.svg     the logo: the README shows it, the layout imports it as favicon
    paraglide/                   the compiled messages (generated, gitignored)
    server/                      server-only: services/health.ts; later providers/plex/ (and the
                                 optional AI text provider), services/<domain>/, jobs/, http/
                                 (SSRF-safe fetch)
      config/                    each variable read and checked once, at startup; a failure is a
                                 `ConfigError` (config-error.ts) that names the variable, never
                                 its value; error-code.ts: a system error's code, without its path
      config/secret-key.ts       the master key's text from `OBZORARR_SECRET_KEY` or the file
                                 `OBZORARR_SECRET_KEY_FILE` names; no key logic
      config/database-path.ts    the database file's path, its folder created and writable
      config/log-debug.ts        `OBZORARR_LOG_DEBUG`: whether debug entries are written
      config/origin.ts           `ORIGIN`, parsed and checked: a bare http or https origin
      config/address-header.ts   `ADDRESS_HEADER`: whether a proxy names the client's address
      config/recovery.ts         `OBZORARR_RECOVERY`: whether recovery is on
      db/                        client.ts: opens the database, its failed queries never carrying
                                 their values, and `queryFailure`, what a log keeps of one;
                                 migrate.ts: applies the bundled migrations; one file per
                                 aggregate with its tables (settings.ts, owner.ts,
                                 owner-session.ts) and, from their first caller, its named
                                 operations: reading, writing and deleting a setting, whether an
                                 owner exists, reading and creating the owner, replacing and
                                 writing its hash, storing, finding, renewing, counting and
                                 ending sessions; client.ts names the transaction and executor
                                 types
      logging/                   logger.ts: one JSON line per entry on standard output, and
                                 flushing it; redact.ts: the rules every entry passes before it
                                 is written; request-error.ts: what `handleError` logs
      services/setup/startup.ts  startup's steps in order: the key, the configuration, the
                                 database, then deleting ended sessions, first run and recovery;
                                 a failed step is logged, then thrown.
                                 Shutdown, in the built server only: `SIGHUP` as `SIGTERM`,
                                 stopping the timers, then closing and exiting, with a 5-second
                                 deadline
      services/setup/first-run.ts
                                 first run's state in memory (claimed, and the step pointer from
                                 `settings`), and the bootstrap token while the instance is
                                 unclaimed: printed to standard output, renewed every 15 minutes,
                                 held back while a claim is in progress, used up by a claim;
                                 and the gate's decision for a path
      services/setup/claim.ts    the claim: its limit of 5 per 5 minutes, the fields, a hash slot,
                                 then the token, then the hash, then one transaction for the
                                 owner, the step pointer and the owner's first session
      services/sign-in/sessions.ts
                                 owner sessions: 7 days unused or 30 days at most, the last use
                                 written at most hourly, started only for the current password,
                                 ended one by one at sign-out, and the other browsers' counted
                                 and ended
      services/sign-in/owner-check.ts
                                 which paths need the owner's session, and what a request without
                                 one gets: sign in and back, or "Your session ended"
      services/sign-in/sign-in.ts
                                 signing in: the limit and the waits, one answer for a wrong
                                 username or password, a dummy verification for a wrong
                                 username, a hash slot, then the session; the typed username is
                                 never logged
      services/sign-in/recovery.ts
                                 recovery: at startup, the token printed while `OBZORARR_RECOVERY`
                                 is on, the instance claimed and no token used since, the record
                                 of a used token cleared while it is off, and the warnings; then
                                 its limit of 5 per 5 minutes, the claim's order, and one
                                 transaction for the new hash, every session ended, this one's
                                 and the record
      services/sign-in/password-checks.ts
                                 what signing in and the password change share: the limit of 10
                                 per 5 minutes, the failed checks and their waits, and the busy
                                 answer
      services/sign-in/password-change.ts
                                 the password change: signing in's limit and waits, `setup`'s
                                 rules, a hash slot, then one transaction for the new hash, the
                                 other sessions ended and this one's new token
      security/console-token.ts  the tokens printed to the console, setup's and recovery's: drawn
                                 without bias, formatted, compared in constant time, valid for 15
                                 minutes
      security/password.ts       the owner's username and password rules, hashing and verifying
      security/common-passwords.txt
                                 the bundled list the password rule checks; its source and how it
                                 was built are in password.ts
      security/headers.ts        the security headers for a request, strict transport only over
                                 HTTPS
      security/cross-origin.ts   the cross-origin check: one pure module the other apps copy
      security/client-address.ts the rate limits' key: IPv4, IPv6 per /64, refused without the
                                 configured header, or unknown
      security/rate-limit.ts     fixed windows per address, swept and capped, and their headers
      security/scanner-filter.ts the probe paths and scanner agents turned away before the limits
      security/hash-slots.ts     at most 4 password hashes or verifications at once
      security/failed-sign-ins.ts
                                 failed sign-ins per address: the wait after 10 in a row,
                                 doubling to an hour, swept and capped
      security/return-path.ts    where sign-in returns to: a same-origin path, or nothing
      security/session-token.ts  a session's random token and the hash that is stored instead
      security/session-cookie.ts `obzorarr_session` and its options and deletions, `Secure` only
                                 over https
      security/browser-address.ts
                                 `ORIGIN`, or the validated `Origin` of a POST: the address a
                                 cookie's `Secure` flag follows
      security/refusal-page.ts   the pages `handle` builds itself, "Access denied" (also for a
                                 session that ended, with a link to sign in) and "Too many
                                 requests", with their own policy and Panda's token declarations
                                 inline, SvelteKit's action error for an enhanced form, or a JSON
                                 error
      security/secrets/          key-text.ts: a master key's text to its 32 bytes, refusing
                                 malformed and weak keys; keyring.ts: loads the key and derives
                                 the AES key and key ID; secret.ts: the `Secret` wrapper,
                                 `[redacted]` everywhere but `reveal()`; cipher.ts: encrypts a
                                 secret bound to its table, field and row, and decrypts it only
                                 there
    components/                  later: ui/ (Ark wrappers), <feature>/
      layout/LanguageSwitcher.svelte
                                 one native button per language, named in that language
      layout/PanelPage.svelte    a one-task page outside the admin shell, the claim's and
                                 sign-in's: a skip link to the main content, shown only while it
                                 has focus, then logo, wordmark and language switcher above one
                                 panel
      layout/AdminSidebar.svelte the shell's sidebar: logo, navigation and the owner's footer,
                                 collapsing to a rail from 1024px down
      layout/AdminDrawer.svelte  the shell below 768px: the menu button and the sidebar as a
                                 drawer
      layout/OwnerFooter.svelte  the owner's initial and username, Sign out, the language
                                 switcher and the version
      layout/SignOutDialog.svelte
                                 Sign out and its confirmation; without JavaScript, Sign out
                                 posts straight away
      layout/shell-modals.svelte.ts
                                 the shell's open confirmations, which make the rest inert
      layout/focus-fallback.ts   where focus goes back when the control that opened a dialog is
                                 hidden past the 768px breakpoint
      forms/ErrorSummary.svelte  a failed submit's problems, first in its form (D29): field problems
                                 link to their fields, page-level ones are text; focused by the
                                 page's enhance callback after each failure, never on mount
      credentials/PasswordField.svelte
                                 the owner's password field with its Show/Hide control, shared by
                                 the claim, sign-in, the password change and recovery
      credentials/password-messages.ts
                                 what each password rule says, shared by the claim, the password
                                 change and recovery
      credentials/TokenField.svelte
                                 a console token's field, the claim's and recovery's; with
                                 token-format.ts, the dashes as it is typed
      i18n/MessageWithCode.svelte
                                 a message with code where its placeholder was, such as a
                                 variable or a path
    shared/                      browser-safe shared code
      app-name.ts                `APP_NAME`: the name the messages take as `{{name}}`, and the
                                 password rule refuses
      credential-limits.ts       the username and password limits and a console token's minutes:
                                 the rules' and the messages' one source
      i18n/format.ts             `formatNumber` and `formatDateTime` in the current language;
                                 `formatDateTime` needs a time zone
      i18n/messages.test.ts      the message check: every problem in `messages/*.json`
tests/
  e2e/smoke.test.ts              Playwright smoke against the built server
  e2e/secret-key.test.ts         the built server refuses to start without a valid key
  e2e/i18n.test.ts               the built server serves each viewer's language, the browser
                                 keeps it, and the switcher changes it
  e2e/setup.test.ts              startup and first run on fresh built servers
  e2e/errors.test.ts             the error page and the pages `handle` builds, styled
  e2e/sign-in.test.ts            signing in on fresh built servers: the session cookie, the
                                 sign-in page, its limit, the hash slots, the owner check, the
                                 admin shell, signing out and the Security tab
  e2e/recovery.test.ts           recovery on restarted built servers: the token and warnings,
                                 and `/recovery`
  e2e/error-summary.test.ts      failed submits without and with JavaScript, and with a late script:
                                 the title, the summary, its links and where focus goes
  e2e/skip-link.test.ts          the one-task pages' skip link, with and without JavaScript and
                                 in Danish
  e2e/rate-limits.test.ts        the general limit, the refusal without the address header and
                                 the scanner filter
  e2e/fixture.ts                 Playwright's `test` with each test's own client address
  e2e/server.ts                  fresh built servers for the tests that need their own, and the
                                 claim through its form action
  e2e/global-setup.ts            claims the shared web server's instance before the other tests
  fixtures/demo-fixtures.json    design fixtures
messages/en.json  messages/da.json
                                 the messages, flat i18next JSON v4, at the root where Weblate
                                 reads them
project.inlang/                  settings.json: the locales and the i18next plugin;
                                 paraglide.config.ts: Paraglide's options, which the CLI and the
                                 Vite plugin both read
drizzle/                         the reviewed migrations Drizzle Kit generated (`db:generate`),
                                 one folder each; Vite bundles their SQL into the build
drizzle.config.ts                Drizzle Kit's options: the schema files it reads
panda.config.ts                  every design token; components use them through
                                 `#styled-system/<module>` (generated, gitignored); the refusal
                                 pages read the generated token CSS as
                                 `#styled-system/styles/tokens.css?raw`
vite.config.ts                   SvelteKit (all its configuration, exported as `kit`: the CSP,
                                 and SvelteKit's own form check off), Panda, Paraglide and Vitest,
                                 and the version the shell shows (`appVersion`, at build time)
vite.config.test.ts              SvelteKit's form check and remote functions stay off, and the
                                 version is `OBZORARR_VERSION` at build time or `dev`
playwright.config.ts  tsconfig.json  package.json  bun.lock
```

Vitest runs `src/**/*.test.ts` and `vite.config.test.ts`; Playwright runs `tests/e2e/`.
