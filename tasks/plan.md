# Implementation plan: `setup`

## Overview

Build module 4 of the capability map as [docs/SPEC-setup.md](../docs/SPEC-setup.md) specifies:
startup checks, the database and its migrations, logging with redaction, the security headers and
CSP, the cross-origin check, and first run, which ends at the claim. Eight tasks, one PR each, each
test first, then a docs PR that ends the work stream. The tasks are in [todo.md](todo.md).

`setup` is shared (D20): obzorarr is the reference, so the code and tests these tasks write are what
comradarr, zondarr, otpravkarr and zimuarr port.

## Architecture decisions

- **The riskiest part lands first.** Task 1 is D15's validation: the Drizzle and Turso pair, the
  bundled migrations and Turso's native binding inside `bun ./build`. If the binding or the
  migrator can't be bundled, the spec's fallbacks (the platform package or `drizzle/` beside
  `build/`) are known before anything is built on them.
- **The startup service grows task by task.** Task 1 creates `services/setup/startup.ts` with
  the spec's steps 1–3: the key, the configuration and the database. `OBZORARR_LOG_DEBUG` (task 2)
  and `ORIGIN` (task 4) join step 2, so they are checked before the database is opened; shutdown
  (task 3) and first run's state and token (tasks 6 and 7, step 4) follow. `hooks.server.ts` only
  calls it, because hooks never touch `db/` (Code structure).
- **Startup failures are thrown first and logged later.** Until task 2 brings the logger, a failed
  step throws from `init` exactly as the key error does now; task 2 adds "logged, then thrown".
- **The request checks come before any form.** SvelteKit's own form check compares `Origin` with
  an `event.url` that adapter-bun builds as `https`, so it would refuse the claim over plain HTTP.
  Task 5 switches it off and puts the cross-origin check in its place in one PR, so `main` never
  has neither; its e2e posts to `/`, which passes the check and gets SvelteKit's 405.
- **The gate comes last.** Task 7 makes the claim work at `/setup` with every other page still
  served, so the smoke and language tests keep running unchanged. Task 8 adds the gate, together
  with the Playwright global setup that claims the instance for those tests, so no PR leaves the
  e2e suite on an unclaimable instance.
- **Named operations join with their first caller.** Task 1 writes both tables into the first
  migration (the spec's "each with `drizzle/`'s first migration"); each operation in `db/owner.ts`
  and `db/settings.ts` lands with the task that first calls it, so nothing merges unused.
- **The migrator** is Drizzle's record migrator for Turso (`drizzle-orm/tursodatabase/wasm-migrator`
  in rc.5), fed by `import.meta.glob("/drizzle/*/migration.sql", { query: "?raw" })` with the
  folder names as keys. It applies and skips migrations by name, as Drizzle Kit's file migrator
  does, but writes an empty `hash` where the file migrator writes a sha256; Drizzle reads the hash
  only when upgrading a v0 migrations table, which no obzorarr database has. Task 1 compares both
  migrators' rows on the same migrations and records the result in its PR body and in D15.
- **The handle-built refusal page is unstyled.** Its fixed policy allows no stylesheet or font,
  and Panda's colours are semantic tokens with no value outside its stylesheet, so the page sets
  only `color-scheme: dark` and holds no raw values (D10). The spec asks only for the title and
  its one-line description until `sign-in` builds the styled error pages.
- **Signal handlers only in the built server.** `init` runs in `dev` too, and a `SIGINT` listener
  there would stop Ctrl+C from ending it, so task 3 installs them only when `dev` is false.
- **Generated migrations are formatted.** Biome checks every JSON file, and Drizzle Kit writes
  `snapshot.json` with spaces, so `db:generate` runs `biome format --write drizzle` after it;
  the shared `biome.json` stays unchanged.
- **Facts change in the task that changes them.** Each task updates the README's variables, SPEC.md
  (the status line, the tech stack, Commands, the testing section), decisions.md and AGENTS.md's
  status and structure, and ticks off its items here. Task 9 reduces the spec and deletes `tasks/`.

## Task list

### Phase 1: the foundations

- [x] Task 1: the database (D15)
- [ ] Task 2: logging with redaction
- [ ] Task 3: shutdown

### Checkpoint: after task 3

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass.
- [ ] The built server migrates a new database, logs JSON lines, refuses a bad configuration with
  one line, and exits 0 on `SIGTERM` and `SIGHUP`.

### Phase 2: the request checks

- [ ] Task 4: `ORIGIN`, the security headers and the CSP
- [ ] Task 5: the cross-origin check

### Checkpoint: after task 5

- [ ] Every page and `/healthz` carry the headers; pages carry the nonce CSP with no violation.
- [ ] A cross-site POST gets the "Access denied" page, in the viewer's language.

### Phase 3: first run

- [ ] Task 6: the bootstrap token
- [ ] Task 7: the claim at `/setup`
- [ ] Task 8: the setup gate

### Checkpoint: complete

- [ ] Every success criterion in SPEC-setup.md is met.

### Phase 4: closing

- [ ] Task 9: close the work stream (cleanup procedure 2)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| adapter-bun can't bundle Turso's native binding, so `bun ./build` fails without `node_modules` | High | Task 1 runs the built server first; if needed, the platform package ships beside `build/`, as the spec's fallback says, and SPEC.md says so |
| The record migrator doesn't work with the native driver | High | Task 1's e2e starts the built server twice on one file; the spec's fallback ships `drizzle/` beside `build/` |
| The record migrator's empty `hash` differs from Drizzle Kit's own record | Low | Task 1 compares both migrators' rows and records the difference in D15; the app is the one migration owner (D5) |
| A rollback undoes an unrelated write on the shared connection (D5's rc.4 bug) | High | Task 1's rollback-isolation test, against a file, under Bun |
| SvelteKit adds a nonce to `style-src`, which turns off `'unsafe-inline'` | Medium | Task 4's e2e listens for CSP violations on a page with style attributes |
| The token or a password reaches a log entry or a response | High | Task 6 and 7's e2e search the server's output and every response; redaction tests (task 2) |
| Playwright's URL check wins the race against the token line | Medium | Task 8's `wait.stdout` pattern spans the token line through "Listening on" and replaces `url` (the spec) |
| Startup forgets a completed first run after a restart, so the gate sends every page to a `/setup` that answers 404 | High | Task 7 loads the step pointer at startup and restarts the built server on a claimed file |
| A shutdown cleanup hangs and the container is killed mid-write | Medium | Task 3's deadline test with a cleanup that never finishes; the README's `stop_grace_period` |
| A field error or a wrong token costs a hash, so guessing is cheap to try and costly to serve | Medium | Task 7's unit tests prove field errors leave the token unused and wrong tokens never reach the hash |
| No `node` sneaks into the validation | Low | Task 1 runs the gates with failing `node`, `npm` and `npx` shims on `PATH`, as CI does |

## Porting to the other apps

comradarr, zondarr, otpravkarr and zimuarr specify their `setup` from SPEC-setup.md and obzorarr's
code and tests once task 9 merges (AGENTS.md, Shared groundwork). Each task's PR body names them.

## Open questions

None. The owner approved the spec on 2026-11-12. As with `i18n` (#296) and `recap-spike` (#311),
this task list is approved by the orchestrating session after the council's review, and merged
once its review loop ends.
