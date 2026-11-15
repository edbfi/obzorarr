# Tasks: `setup`

The spec is [docs/SPEC-setup.md](../docs/SPEC-setup.md), and the plan is [plan.md](plan.md). Each
task is one PR and writes its tests first. Each one updates AGENTS.md's status and structure, ticks
off its items in `tasks/`, names the sibling apps in its PR body, and runs `bun run --bun check`,
`test`, `lint`, `build`, `smoke` and `prek run --all-files --hook-stage manual` before every
commit. Paths under `src/lib/server/` are shortened to `server/`.

## Task 1: the database (D15)

**Description:** Add the Drizzle and Turso pair, open and migrate the database at startup, and run
D15's validation. Startup moves into `server/services/setup/startup.ts`: the key, the
configuration (`OBZORARR_DATABASE_PATH` for now), then the database, opened and migrated. Both
tables go into the first migration; no operations yet.

**Acceptance criteria:**
- [ ] `server/config/database-path.test.ts` first fails, then passes: the default against the
  working directory, an empty variable counting as unset, a folder that is created, and a folder
  that can't be created or written refused with one line naming the variable and never echoing the
  path ("can't be created" uses a parent that is a regular file, so the test holds as root).
- [ ] `server/db/migrate.test.ts` first fails, then passes, against a temporary file: the bundled
  migrations apply to a new database, both tables exist, and a second run applies nothing. It
  compares the rows with what Drizzle Kit's file migrator writes for the same migrations.
- [ ] `server/db/client.test.ts` holds D5's rollback-isolation check: a transaction that rolls
  back leaves a concurrent, unrelated write on the same connection in place.
- [ ] `@tursodatabase/database` 0.8.3, `drizzle-orm` and `drizzle-kit` 1.0.0-rc.5 are exact-pinned
  dev dependencies (D27; if a newer stable Turso or `rc` Drizzle exists, the spec's versions move
  with it); `db:generate` runs Drizzle Kit, then `bun --bun biome format --write drizzle`, so its
  JSON passes `lint`; the first migration in `drizzle/` is generated, reviewed and committed.
- [ ] `settings` (key, value, update time) and `owner` (a fixed id, username, password hash,
  creation time; one row at most) match the spec.
- [ ] `tests/e2e/setup.test.ts` first fails, then passes: the built server, on a new temporary
  file, starts, serves `/healthz`, and starts again on the same file; it refuses to start with an
  unwritable database folder, without echoing the path. `playwright.config.ts` gives each run a
  temporary database, created and removed only in the runner process (the config loads again in
  each worker, where `TEST_WORKER_INDEX` is set), after the server exits.
- [ ] D15's validation passes with its evidence in the PR body: migrations, `check`, `bun ./build`
  through the native binding on Linux arm64 (this machine) and x64 (CI's `smoke`), rollback
  isolation, and all of it with failing `node`, `npm` and `npx` on `PATH`.

**Verification:** the gates above; `bun --no-env-file ./build` from a folder without
`node_modules` opens and migrates a database.

**Dependencies:** none.

**Files:** `package.json`, `bun.lock`, `drizzle.config.ts`, `drizzle/`, `src/env.ts`,
`src/hooks.server.ts`, `server/config/database-path.ts` (+ test), `server/db/client.ts` (+ test),
`server/db/migrate.ts` (+ test), `server/db/settings.ts`, `server/db/owner.ts`,
`server/services/setup/startup.ts`, `tests/e2e/setup.test.ts`, `playwright.config.ts`, `README.md`
(`OBZORARR_DATABASE_PATH`), `docs/SPEC.md` (the status line, the tech-stack table, the
`db:generate` and `smoke` Commands rows, the testing section, and the "needs no `node_modules`" line
if a fallback applies), `docs/decisions.md` (D15 to Decided with the validated pair), `AGENTS.md`
(the status: a database now exists; the structure).

**Size:** L. One coherent unit: D15's validation needs the client, the migrator and startup
together in the built server.

## Task 2: logging with redaction

**Description:** The app's own logger: four levels, one JSON line per entry on standard output,
redacted before it is written, with debug behind `OBZORARR_LOG_DEBUG`. A failed startup step is
logged, then thrown.

**Acceptance criteria:**
- [ ] `server/logging/redact.test.ts` first fails, then passes: one case for each of the spec's
  rules (URL credentials, token-like query parameters, token, authorisation and cookie fields in
  payloads and headers, the key patterns at any depth, a `Secret`), and each nested.
- [ ] `server/logging/logger.test.ts`: the entry's shape (level, message, source, metadata,
  millisecond timestamp), one line per entry, and debug dropped unless enabled.
- [ ] `server/config/log-debug.test.ts`: `true`, `false`, empty as unset, and anything else
  refused with one line that doesn't echo the value. It is checked in step 2, before the database
  is opened.
- [ ] A startup failure is one log entry and the thrown error; the built server still exits
  non-zero before it listens (`setup.test.ts` and `secret-key.test.ts` pass, the latter matching
  the error inside its log entry if the format changes).
- [ ] No logging library (the spec's "Ask first").

**Verification:** the gates; the built server's startup with a bad `OBZORARR_LOG_DEBUG` prints one
JSON line.

**Dependencies:** task 1.

**Files:** `server/logging/logger.ts` (+ test), `server/logging/redact.ts` (+ test),
`server/config/log-debug.ts` (+ test), `src/env.ts`, `server/services/setup/startup.ts`,
`tests/e2e/secret-key.test.ts` if the error's format changes, `README.md`
(`OBZORARR_LOG_DEBUG`), `docs/decisions.md` (D14's logging half to Decided, the job half stays
open), `docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Task 3: shutdown

**Description:** On `SIGTERM`, `SIGINT` and `SIGHUP` (passed on to adapter-bun as `SIGTERM`), stop
the jobs and timers (none yet) while the adapter drains; on `sveltekit:shutdown`, close the
database, flush the logs and exit 0, or exit non-zero after a 5-second deadline. The handlers are
installed only in the built server (`dev` from `$app/env` is false): Vite's dev server never emits
`sveltekit:shutdown`, and a `SIGINT` listener would stop Ctrl+C from ending it.

**Acceptance criteria:**
- [ ] `server/services/setup/startup.test.ts` first fails, then passes: the cleanup's order, and
  the deadline with a cleanup that never finishes exits non-zero, and no handler is installed in
  `dev`.
- [ ] `setup.test.ts`: `SIGHUP` and `SIGTERM` each shut the built server down with exit code 0.
- [ ] The README lists adapter-bun's `SHUTDOWN_TIMEOUT`, `CONNECTION_IDLE_TIMEOUT` and
  `BODY_SIZE_LIMIT`, and says the container's stop timeout must exceed `SHUTDOWN_TIMEOUT` plus
  5 seconds.

**Verification:** the gates; Ctrl+C still stops `bun run --bun dev`.

**Dependencies:** task 2.

**Files:** `server/services/setup/startup.ts` (+ test), `src/hooks.server.ts`,
`tests/e2e/setup.test.ts`, `README.md`, `AGENTS.md`.

**Size:** M.

## Checkpoint: after task 3

- [ ] As in [plan.md](plan.md#checkpoint-after-task-3).

## Task 4: `ORIGIN`, the security headers and the CSP

**Description:** `config/origin.ts` reads and checks `ORIGIN` at startup. `handle` gains the
headers stage after the language; SvelteKit's `csp` option sets the nonce policy on every page.
Ground-floor choice 3 closes.

**Acceptance criteria:**
- [ ] `server/config/origin.test.ts` first fails, then passes: unset, and a bare origin with and
  without a trailing `/`, accepted; an empty value (adapter-bun refuses it first; `ORIGIN` is
  exempt from the empty-as-unset rule), a path, query, fragment or credentials refused without
  echoing the value. It is checked in step 2, so a bad `ORIGIN` stops startup before the database
  file is created (`startup.test.ts`).
- [ ] `server/security/headers.test.ts`: the spec's headers for HTTPS through `ORIGIN`, HTTPS
  through `Sec-Fetch-Site`, plain HTTP, `localhost`, `*.localhost` and loopback hosts (no HSTS),
  and never `includeSubDomains`.
- [ ] `setup.test.ts`: the headers on a page, `/healthz` and a 404, and no HSTS over plain HTTP;
  the page's scripts carry the nonce and the browser reports no CSP violation; the server refuses
  `ORIGIN=https://u:p@host` and `https://host/app` without echoing either.
- [ ] The policy is the spec's, directive for directive, and `style-src` keeps `'unsafe-inline'`
  without a nonce.

**Verification:** the gates; `preview`'s response headers checked by hand at `/` in both
languages.

**Dependencies:** task 3.

**Files:** `server/config/origin.ts` (+ test), `server/security/headers.ts` (+ test), `src/env.ts`,
`src/hooks.server.ts`, `server/services/setup/startup.ts`, `vite.config.ts`,
`tests/e2e/setup.test.ts`, `README.md` (`ORIGIN`), `docs/SPEC.md` (ground-floor choice 3 closes,
the testing section), `AGENTS.md`.

**Size:** M.

## Task 5: the cross-origin check

**Description:** `security/cross-origin.ts`, the first check after the language and the headers,
on every method but GET, HEAD and OPTIONS. SvelteKit's own form check goes off in the same PR. A
refusal is the "Access denied" page with its own fixed policy and `<html lang>`, or `{ message }`
for JSON callers, built by `security/access-denied.ts`, so `cross-origin.ts` stays the pure module
the sibling apps copy and the hooks stay thin.

**Acceptance criteria:**
- [ ] `server/security/cross-origin.test.ts` first fails, then passes: the spec's matrix of
  methods, content types and `Origin`, `Sec-Fetch-Site`, `Host` and `ORIGIN` values, with
  `null`, malformed and repeated `Origin`, default ports, subrequests, and requests with neither
  header (refused: obzorarr has no machine routes).
- [ ] A config test (`vite.config.test.ts`, added to Vitest's `include`) asserts that the options
  object `vite.config.ts` exports and passes to `sveltekit()` trusts every origin and leaves remote
  functions off.
- [ ] `server/security/access-denied.test.ts`: the page in each language with its policy, and the
  `{ message }` JSON error for a caller that accepts JSON.
- [ ] `setup.test.ts`: a cross-site form POST to `/` gets a 403 "Access denied" page with the
  headers, its own policy and the viewer's language; a same-origin POST with no `Sec-Fetch-*`
  headers passes the check (SvelteKit's 405), both on `localhost` and on `app.test` through
  Chromium's `--host-resolver-rules`.
- [ ] The page's text is `error_access_denied_…` messages in both languages. It sets only
  `color-scheme: dark` and holds no raw values (plan.md, "The handle-built refusal page is
  unstyled").

**Verification:** the gates.

**Dependencies:** task 4.

**Files:** `server/security/cross-origin.ts` (+ test), `server/security/access-denied.ts`
(+ test), `src/hooks.server.ts`, `vite.config.ts`, `vite.config.test.ts`, `messages/en.json`,
`messages/da.json`, `tests/e2e/setup.test.ts`, `README.md` (when `ORIGIN` or the proxy fix is
needed), `docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Checkpoint: after task 5

- [ ] As in [plan.md](plan.md#checkpoint-after-task-5).

## Task 6: the bootstrap token

**Description:** While no owner exists, startup prints a bootstrap token to standard output with
`/setup` (the full address when `ORIGIN` is set), outside the logs, and prints a new one every
15 minutes. Shutdown stops the timer. First run's state is loaded into memory at startup.

**Acceptance criteria:**
- [ ] `server/security/bootstrap-token.test.ts` first fails, then passes: 12 characters from the
  lowercase letters and digits, drawn without bias, shown as `xxxx-xxxx-xxxx`; accepted with or
  without dashes, in any case, trimmed; compared in constant time; expired after 15 minutes.
- [ ] `server/services/setup/first-run.test.ts`, against a temporary file: an unclaimed instance
  prints a token and a new one at expiry; the timer waits while a claim is in progress; shutdown
  stops it; a claimed instance prints none.
- [ ] `owner.ts` gains the operation that says whether an owner exists.
- [ ] `setup.test.ts`: the built server prints the token line; it appears in no log entry.

**Verification:** the gates.

**Dependencies:** task 5.

**Files:** `server/security/bootstrap-token.ts` (+ test), `server/services/setup/first-run.ts`
(+ test), `server/services/setup/startup.ts`, `server/db/owner.ts`, `tests/e2e/setup.test.ts`,
`AGENTS.md`.

**Size:** M.

## Task 7: the claim at `/setup`

**Description:** The claim form and its action, in the spec's order: the fields, then the token
(checked and used up with no `await` between), then the hash, then one transaction that creates
the owner and moves the step pointer. It completes first run and sends the browser to `/`; then
`/setup` and its action answer "not found". No gate yet: every other page is still served.

**Acceptance criteria:**
- [ ] `server/security/password.test.ts` first fails, then passes: the username and password rules
  at their limits, NFC and case included, the app's name and the username inside the password,
  the bundled list, and hashing with argon2id and verifying the NFC form (a round trip; `sign-in`
  reuses `verifyPassword`).
- [ ] `security/common-passwords.txt` holds the entries of 15 or more characters from one SecLists
  `Passwords/Common-Credentials/` file, whose path and commit `password.ts` and the PR body name,
  under prek's 500 KB limit.
- [ ] `server/services/setup/claim.test.ts`, against a temporary file: success; a field error
  leaving the token unused; a wrong and an expired token never reaching the hash; a second claim;
  two at once leaving one owner; a failed transaction printing a new token.
- [ ] Startup loads the step pointer from `settings` into first run's state: `first-run.test.ts`
  starts complete on a database an earlier process claimed.
- [ ] `setup.test.ts`: on a fresh built server, a wrong token is refused with the spec's message,
  the username kept and the token and password cleared; the right one claims and lands on `/`;
  `/setup` then answers 404, also after the server restarts on the same file; neither the token
  nor the password appears in a response or a log entry.
- [ ] The page follows `route-setup.md` through `/impeccable`, with the language switcher; every
  string is a `setup_…` message in both languages. Checked at 360, 390, 768 and 1440 px, 200%
  zoom, the keyboard and reduced motion, in every state the brief names (initial, field errors,
  token refused, submitting), in English and Danish, with screenshots in the PR body.

**Verification:** the gates; a claim by hand in `preview` over plain HTTP on a LAN address.

**Dependencies:** task 6.

**Files:** `server/security/password.ts` (+ test), `server/security/common-passwords.txt`,
`server/services/setup/claim.ts` (+ test), `server/services/setup/first-run.ts`,
`server/db/owner.ts`, `server/db/settings.ts`, `src/routes/setup/+page.svelte`,
`src/routes/setup/+page.server.ts`, `messages/en.json`, `messages/da.json`,
`tests/e2e/setup.test.ts`, `.impeccable/surfaces/route-setup.md` (its status, through
Impeccable), `AGENTS.md`.

**Size:** L. One coherent unit: the credential rules have no caller before the claim.

## Task 8: the setup gate

**Description:** The gate is the last stage in `handle`: until first run is complete, every request
except `/setup` and `/healthz` gets a 303 to `/setup`. Playwright's global setup claims the instance
through the form, so the smoke and language tests run on a claimed instance.

**Acceptance criteria:**
- [ ] `first-run.test.ts` gains the gate's decision for each path, before and after the claim.
- [ ] `setup.test.ts`: every page sends a fresh instance to `/setup` and `/healthz` answers `ok`;
  the gate's redirect carries the headers; after a restart on a claimed file, `/` is served without
  a redirect. The earlier tests that expect a 404 or a same-origin POST's 405 claim their own
  servers first; a same-origin POST on an unclaimed one passes the cross-origin check and gets the
  gate's 303.
- [ ] `playwright.config.ts`: the web server's `wait.stdout` pattern runs from the token line
  through "Listening on" and replaces the `url` check; `tests/e2e/global-setup.ts` claims through
  the form in a browser; `smoke.test.ts` and `i18n.test.ts` pass unchanged.
- [ ] The README's first run: the token in the console, `/setup`, and who can claim.

**Verification:** the gates; success criterion 2 by hand: a fresh built server prints a token,
sends every page to `/setup`, is claimed once over plain HTTP, and then serves `/` with the
headers and CSP.

**Dependencies:** task 7.

**Files:** `server/services/setup/first-run.ts` (+ test), `src/hooks.server.ts`,
`tests/e2e/global-setup.ts`, `tests/e2e/setup.test.ts`, `playwright.config.ts`, `README.md`,
`docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Checkpoint: complete

- [ ] As in [plan.md](plan.md#checkpoint-complete).

## Task 9: close the work stream

**Description:** Cleanup procedure 2: mark `setup` built in SPEC.md (the status line, row 4,
"Open decisions"), reduce SPEC-setup.md to what code and tests can't say, update AGENTS.md's
status, and delete `tasks/`. The PR body maps every removed requirement to a test or a remaining
doc (the preservation gate) and lists what the sibling apps port.

**Acceptance criteria:**
- [ ] Every item in "Docs this module changes when built" is done.
- [ ] Nothing in SPEC-setup.md is cut without a test or doc named for it in the PR body.

**Verification:** prek (the `docs-set` hook) and CI.

**Dependencies:** task 8.

**Files:** `docs/SPEC.md`, `docs/SPEC-setup.md`, `AGENTS.md`, `tasks/` (deleted).

**Size:** S.
