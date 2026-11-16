# Tasks: `sign-in`

The spec is [docs/SPEC-sign-in.md](../docs/SPEC-sign-in.md), and the plan is [plan.md](plan.md).
Each task is one PR and writes its tests first. Each one updates AGENTS.md's status and structure,
the README and SPEC.md's testing section (and its `smoke` row when it adds an e2e file) where they
change, ticks off its items in `tasks/`, names what the sibling apps take in its PR body, gets a
council review, and runs `bun run --bun check`, `test`, `lint`, `build`, `smoke` and `prek run
--all-files --hook-stage manual` before every commit. From task 2 on, every e2e test on the shared
server sends its own address through the fixture. A fresh server (`tests/e2e/server.ts`, from task
4) belongs to one test, so its limits are that test's alone: its requests count under the
connection's address, and a test that needs addresses of its own starts it with
`ADDRESS_HEADER=x-forwarded-for`. Tests that change the owner's password or sessions, or need an
unclaimed or restarted server, use fresh servers. The in-memory tables sweep themselves once a
minute on the next request (`security/rate-limit.ts`), so no sweep timer needs stopping at shutdown.
Paths under `src/lib/server/` are shortened to `server/`, and the spec's sections are named in
quotes.

## Task 1: the error pages

**Description:** The pages users see when something is refused or fails ("Errors and error
pages"). `security/access-denied.ts` becomes `security/refusal-page.ts`, styled with Panda's token
declarations inline, with plain Home and (where it applies) Sign in links; `routes/+error.svelte`
titles each status, with Go back, Home, the logo and wordmark and the language switcher;
`handleError` (#344) also returns the translated "Something went wrong. Try again."; and
`src/error.html` says it in English and Danish. The token declarations come from a source that
exists for the build, `check` and Vitest alike: `styled-system/` holds only JavaScript, and the
Vite plugin adds Panda's CSS inside its transform, so this task generates it, either with a
`panda cssgen` step for the tokens in `prepare` and `check` beside `panda codegen` (a
`package.json` scripts change) or with a small Vite module on Panda's API, and the PR says which
and why.

**Acceptance criteria:**
- [x] `server/security/refusal-page.test.ts` first fails, then passes: "Access denied" and "Too
  many requests" in both languages, their JSON forms, their fixed policy, `class="dark"`, the
  inline token declarations and the links; no script and no Go back.
- [x] `src/hooks.server.test.ts` gains the returned message, in both languages (logging holds no
  user-facing text, so the message is the hook's).
- [x] `tests/e2e/errors.test.ts` first fails, then passes: an unknown page shows "Page not found"
  without its number; a cross-site POST's "Access denied" page shows the tokens' computed colours;
  no page logs a console error or a CSP violation.
- [x] The error page follows DESIGN.md (no brief: it is a state of every route) at 360, 390, 768
  and 1440px and 200% zoom, in English and Danish.

**Verification:** the gates; the error page checked in a browser at each width.

**Dependencies:** none.

**Files:** `server/security/refusal-page.ts` (+ test, renamed from `access-denied.ts`),
`src/hooks.server.ts`, `server/logging/request-error.ts` (+ test), `src/routes/+error.svelte`,
`src/error.html`, the token source (`package.json` or `vite.config.ts`), `messages/`,
`tests/e2e/errors.test.ts`.

**Size:** M.

## Task 2: the client address and the general limit

**Description:** `security/client-address.ts` and `security/rate-limit.ts` ("Configuration",
"Rate limits and failed sign-ins"): the address per IPv4, per IPv6 `/64` and IPv4-mapped; with
`ADDRESS_HEADER` set, a request missing it or carrying a bad one refused (`/healthz` excepted);
the warnings; the fixed windows, each starting at an address's first request, swept every minute
and capped; and the rate-limit stage in `handle` with the general limit of 60 a minute, answered
with the "Too many requests" page or JSON and its headers. `ADDRESS_HEADER` is declared in
`src/env.ts` and read once at startup by `config/address-header.ts`, since SvelteKit exposes only
declared variables and the app needs to know whether it is set (adapter-bun still reads it
itself).
The shared e2e server moves to `ADDRESS_HEADER=x-forwarded-for`, and every test file on it to a
fixture that gives each test its own address.

**Acceptance criteria:**
- [x] `server/security/client-address.test.ts` first fails, then passes, on a copied `Request` as
  `handle` sees it: each address kind, the refusal and its one warning, the `X-Forwarded-For`
  warning without `ADDRESS_HEADER`, no address as unknown with one warning.
- [x] `server/security/rate-limit.test.ts`: a window at its edges, the headers, sweeping, the cap
  of 10,000 with the oldest out first; `server/config/address-header.test.ts`: set, unset, empty.
- [x] The fixture in `tests/e2e/` gives each test its own `X-Forwarded-For`; `global-setup.ts`,
  `smoke.test.ts`, `i18n.test.ts` and `errors.test.ts` use it, and `playwright.config.ts` starts
  the shared server with `ADDRESS_HEADER=x-forwarded-for`.
- [x] `tests/e2e/rate-limits.test.ts`: the 61st request in a minute gets 429 with `Retry-After` as
  the branded page; a request without the header gets "Access denied" while `/healthz` answers.

**Verification:** the gates; the README's `ADDRESS_HEADER` and `XFF_DEPTH` section (the port
reachable only through the proxy).

**Dependencies:** task 1.

**Files:** `server/security/client-address.ts` (+ test), `server/security/rate-limit.ts`
(+ test), `server/config/address-header.ts` (+ test), `src/env.ts`,
`server/services/setup/startup.ts`, `src/hooks.server.ts`, `tests/e2e/` (the fixture,
`global-setup.ts`, `smoke.test.ts`, `i18n.test.ts`, `errors.test.ts`, `rate-limits.test.ts`),
`playwright.config.ts`, `README.md`.

**Size:** L. The fixture has to move with the stage, or the suite trips its own limit.

## Task 3: the claim's limit and the hash slots

**Description:** `security/hash-slots.ts`, at most 4 hashes at once, a fifth refused at once as
"Too many requests" with `Retry-After: 5`; and the claim's limit of 5 per 5 minutes, checked in its
action and answered with `fail(429)` beside the button. The claim takes its slot before it checks
and uses up the token ("Signing in"). Filling the slots needs a second hashing endpoint, so their
e2e waits for sign-in (task 7).

**Acceptance criteria:**
- [x] `server/security/hash-slots.test.ts` first fails, then passes: the fifth refused at once,
  a slot freed on success and on failure.
- [x] `server/services/setup/claim.test.ts` gains: a refused slot leaves the token unused; the
  sixth claim within 5 minutes is refused without touching the token.
- [x] `src/routes/setup/page.server.test.ts`: a refused slot and the claim's limit become the
  form's 429 error with `Retry-After`.
- [x] `tests/e2e/setup.test.ts`: the sixth claim attempt shows "Too many attempts…" beside the
  button, with `Retry-After`.
- [x] `route-setup.md` gains its too-many-attempts state, built in the claim page.

**Verification:** the gates; the claim page's new state at 360px and 1440px.

**Dependencies:** task 2.

**Files:** `server/security/hash-slots.ts` (+ test), `server/services/setup/claim.ts` (+ test),
`src/routes/setup/+page.server.ts` (+ `page.server.test.ts`), `src/routes/setup/+page.svelte`,
`messages/`, `tests/e2e/setup.test.ts`, `.impeccable/surfaces/route-setup.md`.

**Size:** M.

## Checkpoint: after task 3

See [plan.md](plan.md).

## Task 4: the browser's address at the claim

**Description:** `security/browser-address.ts` ("The browser's address and cookies"): `ORIGIN`, or
the validated `Origin` of the POST. The claim, its first caller, refuses a POST with `Origin`
stripped and `ORIGIN` unset first, before the claim's limit counts it and before the fields, with
the 403 that says so: an action can't return a page of its own, so it raises `error(403)` with the
message, which reaches the branded error page under "Access denied", or SvelteKit's JSON error for
an enhanced form. An instance already claimed answers 404 first. `/setup` and its action become
`Cache-Control: no-store`. The spawn helpers in `setup.test.ts` (`startServer`, `claim`) move to
`tests/e2e/server.ts`.

**Acceptance criteria:**
- [x] `server/security/browser-address.test.ts` first fails, then passes: `ORIGIN`, a validated
  `Origin`, a stripped one; and it searches `src/` for the request URL's origin or protocol,
  however it is written, with a check that its patterns match and its walk reaches app code.
- [x] `src/routes/setup/page.server.test.ts`: the 403 before anything else, a claimed instance's
  404 before it, and `no-store`; the e2e checks the message in both languages and as JSON.
- [x] `tests/e2e/setup.test.ts`, through `server.ts`: a claim with `Origin` stripped gets the 403
  that says so and leaves the token unused; `/setup` and the claim's response are `no-store`.

**Verification:** the gates.

**Dependencies:** task 3.

**Files:** `server/security/browser-address.ts` (+ test), `server/security/cross-origin.ts` (its
bare-origin rule, shared), `src/routes/setup/+page.server.ts` (+ test), `messages/`,
`tests/e2e/server.ts`, `tests/e2e/setup.test.ts`.

**Size:** M.

## Task 5: sessions, started at the claim

**Description:** The `owner_session` table and its migration; `security/session-token.ts` and
`session-cookie.ts`; `services/sign-in/sessions.ts` (start, look up, renew at most hourly,
expired rows deleted, only for the current hash; ending one session and ending the others join
with their callers, tasks 10 and 11); the session stage in `handle`,
which puts the owner in `event.locals` and clears an expired or unknown session's cookie with
`secure: false`; and the claim, which writes the session in its transaction and sets
`obzorarr_session` (its `Max-Age` the time left to the 30-day end). The claim still lands on `/`
until task 6.

**Acceptance criteria:**
- [x] Unit tests first fail, then pass: `session-token`, `session-cookie` (`http`, `https`,
  deletion with `secure: false`, `Max-Age`), `db/owner-session`, `services/sign-in/sessions` (both
  limits at their edges, the hourly write, expiry, the current-hash check), `claim` (the session
  in its transaction, none on failure); startup deletes expired sessions.
- [x] `tests/e2e/sign-in.test.ts`, on fresh servers through `server.ts`: the claim's cookie is
  `HttpOnly`, `SameSite=Lax` and not `Secure`, on `127.0.0.1` and on a non-loopback host name
  (Chromium's `--host-resolver-rules`).
- [x] The migration is generated with `db:generate` and reviewed; the README says the cookie works
  over plain HTTP.

**Verification:** the gates.

**Dependencies:** task 4.

**Files:** `server/db/owner-session.ts` (+ test), `drizzle/`, `drizzle.config.ts`,
`server/security/session-token.ts`, `session-cookie.ts` (+ tests),
`server/services/sign-in/sessions.ts` (+ test), `server/services/setup/claim.ts` (+ test),
`server/services/setup/startup.ts`, `src/hooks.server.ts`, `src/app.d.ts`,
`src/routes/setup/+page.server.ts`, `tests/e2e/sign-in.test.ts`, `README.md`.

**Size:** L. The session needs its first caller, the claim, to merge used.

## Task 6: the claim lands in the admin

**Description:** The claim sends the browser to `/admin`, which redirects to
`/admin/settings/security`, and `/admin/settings` to its first tab. That page is only its heading,
with no data or actions, until task 10 builds the shell and the tab; the owner check arrives with
the sign-in page (task 8). Every e2e file that expects `/` after a claim moves to the admin.

**Acceptance criteria:**
- [x] `tests/e2e/global-setup.ts` waits for the Security tab after its claim; `server.ts`'s claim
  expects `/admin`; `setup.test.ts`'s browser claim waits for the Security tab.
- [x] `tests/e2e/sign-in.test.ts` gains: the claim lands on the Security tab, signed in.
- [x] `route-setup.md` says the claim lands in the admin.

**Verification:** the gates.

**Dependencies:** task 5.

**Files:** `src/routes/setup/+page.server.ts`, `src/routes/(admin)/admin/(shell)/` (the redirects
and the heading), `messages/`, `tests/e2e/` (`global-setup.ts`, `server.ts`, `setup.test.ts`,
`sign-in.test.ts`), `.impeccable/surfaces/route-setup.md`.

**Size:** M.

## Task 7: owner sign-in

**Description:** `/admin/sign-in` through `/impeccable` from `route-admin-sign-in.md`, and
`services/sign-in/sign-in.ts` ("Signing in"): the browser's address first, reading the owner
(`db/owner.ts`), the one answer, the dummy verification, a hash slot, the session, the logs
without the username, the return path (`security/return-path.ts`) and "Forgot your password?".
`PasswordField` moves to `lib/components/credentials/`, shared with the claim. With no owner check
yet, a signed-in owner lands on `/admin` as after the claim.

**Acceptance criteria:**
- [x] Unit tests first fail, then pass: `return-path` (each rule at its limits),
  `services/sign-in/sign-in` (right and wrong credentials, the username's case and trim, the dummy
  verification, the logs, an old-password check that ends after the hash changed starting no
  session), `db/owner` (reading the owner).
- [x] `tests/e2e/sign-in.test.ts` gains, on a fresh server: a wrong password is refused with the
  username kept; the right one signs in and returns to `next`; an unsafe `next` is dropped; a POST
  with `Origin` stripped gets the 403 that says so; with several sign-ins in flight at once, no
  more than 4 hash and the rest get the form's 429 with `Retry-After: 5` (asserted on the set of
  answers, not on which request is refused); the page logs no console error or CSP violation, in
  both languages.
- [x] The page follows its brief in every state it names but too many attempts (task 9), at each
  width, zoom, keyboard and reduced motion, in English and Danish, with screenshots in the PR body.

**Verification:** the gates; the brief's checks.

**Dependencies:** task 6.

**Files:** `server/services/sign-in/sign-in.ts` (+ test), `server/db/owner.ts` (+ test),
`server/security/return-path.ts` (+ test), `src/routes/(admin)/admin/sign-in/`,
`src/lib/components/credentials/PasswordField.svelte`, `src/routes/setup/+page.svelte`,
`messages/`, `tests/e2e/sign-in.test.ts`, `.impeccable/surfaces/route-admin-sign-in.md` (its
direction contract).

**Size:** L.

## Task 8: the owner check

**Description:** The owner check joins `handle` ("Owner-only pages"): every path under `/admin` but
sign-in and sign-out; a page or data request without a session goes to sign in with `next`, any
other method gets the "Your session ended" 403 (a `refusal-page.ts` variant, or JSON for an
enhanced form); a signed-in owner opening the sign-in page goes to `/admin`; and every owner-only
response and the sign-in page are `no-store`. The placeholder `/` gets its "Owner sign-in" link.

**Acceptance criteria:**
- [x] `server/security/refusal-page.test.ts` gains the session-ended page and its JSON form, in
  both languages.
- [x] `tests/e2e/sign-in.test.ts` gains: without a session, `/admin` goes to sign in and back after,
  and its `__data.json` request gets SvelteKit's JSON redirect with `next` set to the page's path;
  an owner-only POST gets 403 (a plain form gets the page; `x-sveltekit-action: true` gets
  SvelteKit's action error, so its error page shows the message; another JSON caller gets `{
  message }`); a signed-in owner opening the sign-in page goes to
  `/admin`; the headers are `no-store`; `/` links to sign in; signed in, a direct request to
  `/admin` and to `/admin/settings` gets the 307 to the Security tab, so the owner check runs
  before those redirects.

**Verification:** the gates.

**Dependencies:** task 7.

**Files:** `src/hooks.server.ts`, `server/security/refusal-page.ts` (+ test),
`src/routes/(public)/+page.svelte`, `messages/`, `tests/e2e/sign-in.test.ts`.

**Size:** M.

## Task 9: the sign-in limit and the waits

**Description:** Signing in's limit of 10 per 5 minutes, and `security/failed-sign-ins.ts`: after
10 failures in a row an address waits 5 minutes, doubling to an hour, reset by a success or 24
quiet hours, each wait logged at warn with the address ("Rate limits and failed sign-ins"). Both
are checked in the action and answered with `fail(429)`, its headers, and the message that names
`ADDRESS_HEADER`.

**Acceptance criteria:**
- [x] `server/security/failed-sign-ins.test.ts` first fails, then passes: 5, 10, 20, 40, 60 and
  60 minutes; reset by a success and after 24 hours; swept and capped; the warn entry.
- [x] `server/services/sign-in/sign-in.test.ts` gains: a wait refuses before any hash.
- [x] `tests/e2e/sign-in.test.ts` gains: after 10 successful sign-ins, which leave no failures,
  the 11th within 5 minutes shows the form's 429 message with `Retry-After`; the sign-in page's
  too-many-attempts state follows its brief; the earlier sign-in tests still pass under the limits.
- [x] The README's `ADDRESS_HEADER` section says it also keeps one visitor's failures from making
  others wait.

**Verification:** the gates.

**Dependencies:** task 8.

**Files:** `server/security/failed-sign-ins.ts` (+ test), `server/services/sign-in/sign-in.ts`
(+ test), `src/routes/(admin)/admin/sign-in/`, `messages/`, `tests/e2e/sign-in.test.ts`,
`README.md`; not `server/services/setup/startup.ts`, as first planned: the tables live in memory
and sweep themselves, so startup has nothing to do.

**Size:** M.

## Checkpoint: after task 9

See [plan.md](plan.md).

## Task 10: the admin shell and signing out

**Description:** The shell through `/impeccable` from `route-admin-settings-security.md`
("The admin shell"): the sidebar, the rail and the drawer, the footer with the username, the
language switcher and the version (`OBZORARR_VERSION` at build time, else `dev`), and Sign out
behind its confirmation; `/admin/sign-out` (POST needs the browser's address and ends the session,
or only clears the cookie without one; GET only redirects); the settings tabs with Security. The
Security tab gets its frame and heading.

**Acceptance criteria:**
- [x] `vite.config.test.ts` gains: the version is `OBZORARR_VERSION` when set at build time and
  `dev` otherwise.
- [x] `tests/e2e/sign-in.test.ts` gains: a GET to `/admin/sign-out` signs nobody out; Sign out asks
  first, then ends the session and lands on sign-in; a sign-out POST without a session only clears
  the cookie; one with `Origin` stripped gets the 403 that says so; the drawer below 768px traps
  focus, closes on Escape and makes the page inert; the shell logs no console error or CSP
  violation, in both languages.
- [x] The shell follows its brief in every state it names, at each width, zoom, keyboard and
  reduced motion, in English and Danish, with screenshots in the PR body.

**Verification:** the gates; the brief's checks.

**Dependencies:** task 9.

**Files:** `src/routes/(admin)/admin/(shell)/+layout.svelte`, `settings/`,
`src/routes/(admin)/admin/sign-out/+page.server.ts`, `src/lib/components/layout/` (the sidebar,
drawer, owner footer and sign-out confirmation), `vite.config.ts` (+ `vite.config.test.ts`),
`messages/`, `tests/e2e/sign-in.test.ts`,
`.impeccable/surfaces/route-admin-settings-security.md` (its direction contract), `README.md` (the
version).

**Size:** L.

## Task 11: the password change and "Sign out everywhere else"

**Description:** The Security tab's Password and Sessions sections ("The Security tab"):
`services/sign-in/password-change.ts`, which shares signing in's window, takes a hash slot, counts a
wrong current password as a failed sign-in, needs the browser's address, follows `setup`'s rules,
and in one transaction replaces the hash, ends the other sessions and renews this one; and the
count of other sessions with "Sign out everywhere else". Its e2e runs on fresh servers, since it
changes the owner's password and sessions.

**Acceptance criteria:**
- [x] `server/services/sign-in/password-change.test.ts` first fails, then passes: a wrong current
  password counted, the shared window, a refused hash slot, the rules against the stored username,
  the other sessions ended, a new token, and a sign-in check with the old password that ends after
  the change starting no session.
- [x] `tests/e2e/sign-in.test.ts` gains, on fresh servers: the password change ends a second
  browser's session and keeps this one; "Sign out everywhere else" does the same and says how
  many, and with none shows no button; the enhanced password form, after its session ends in
  another browser, gets the error page through SvelteKit; a change with `Origin` stripped gets the
  403 that says so; the tab logs no console error or CSP violation, in both languages.
- [x] Both sections follow the brief's states (initial, field errors, too many attempts, saving,
  saved; none, one and several other sessions), at each width, in English and Danish.

**Verification:** the gates; the brief's checks.

**Dependencies:** task 10.

**Files:** `server/services/sign-in/password-change.ts` (+ test),
`server/services/sign-in/sessions.ts`, `server/db/owner.ts` (+ test),
`src/routes/(admin)/admin/(shell)/settings/security/`, `messages/`, `tests/e2e/sign-in.test.ts`.

**Size:** M.

## Task 12: the recovery token at startup

**Description:** `config/recovery.ts` (`OBZORARR_RECOVERY`), `security/console-token.ts` (renamed
from `bootstrap-token.ts`), and recovery's startup work in `services/sign-in/recovery.ts`
("Recovery"): the token printed to standard output while the setting is on, the instance claimed
and the token unused; the `settings` key once used, cleared when the setting is off; the warnings,
also on an unclaimed instance; and the Security tab's warning while recovery is on. The printed
line names `/recovery`, which task 13 builds; no release is cut in between.

**Acceptance criteria:**
- [ ] Unit tests first fail, then pass: `config/recovery`; `recovery` (the token printed or not for
  each state of the setting, the key and the claim; the key cleared when the setting is off; the
  warnings); `console-token` (renamed, unchanged).
- [ ] `tests/e2e/recovery.test.ts`, through `server.ts`: a claimed server restarted with the
  setting on prints the token in no log entry or response, and the Security tab shows the warning;
  an unclaimed one prints none and warns.

**Verification:** the gates; the README lists `OBZORARR_RECOVERY`.

**Dependencies:** task 11.

**Files:** `server/config/recovery.ts` (+ test), `src/env.ts`, `server/security/console-token.ts`
(+ test, renamed), `server/services/sign-in/recovery.ts` (+ test),
`server/services/setup/first-run.ts`, `server/services/setup/startup.ts`,
`src/routes/(admin)/admin/(shell)/settings/security/`, `messages/`, `tests/e2e/recovery.test.ts`,
`README.md` (the variable).

**Size:** M.

## Task 13: `/recovery`

**Description:** Recovering the account ("Recovery"): `/recovery` through `/impeccable` from
`route-recovery.md`, `no-store`, not found unless the token is waiting; the browser's address
first; its limit of 5 per 5 minutes; the checks in the claim's order (the rules, a hash slot, the
token used up with no `await` between, the hash); one transaction that replaces the hash, ends
every session, starts this one and records the key; and the landing on the Security tab.
`TokenField` and `token-format.ts` move to `lib/components/credentials/`, shared with the claim.
The README gets the recovery steps.

**Acceptance criteria:**
- [ ] `server/services/sign-in/recovery.test.ts` gains: the order of the checks; a wrong and an
  expired token never reaching the hash; a refused slot and the sixth try within 5 minutes leaving
  the token unused; every session ended; the key recorded; a sign-in check with the old password
  that ends after the recovery starting no session.
- [ ] `tests/e2e/recovery.test.ts` gains: `/recovery` sets a new password and lands on the Security
  tab, signed in; the old password and the other sessions no longer work; a POST with `Origin`
  stripped gets the 403 that says so; after a restart with the setting on, no new token and
  `/recovery` is not found; the page is `no-store` and logs no console error or CSP violation, in
  both languages.
- [ ] The page follows its brief in every state it names, at each width, zoom, keyboard and reduced
  motion, in English and Danish, with screenshots in the PR body.

**Verification:** the gates; the brief's checks; the README's recovery steps.

**Dependencies:** task 12.

**Files:** `server/services/sign-in/recovery.ts` (+ test), `src/routes/recovery/`,
`src/lib/components/credentials/` (`TokenField.svelte`, `token-format.ts` + test, moved from
`src/routes/setup/`), `src/routes/setup/+page.svelte`, `messages/`, `tests/e2e/recovery.test.ts`,
`README.md`, `.impeccable/surfaces/route-recovery.md` (its direction contract).

**Size:** L.

## Task 14: the scanner filter (obzorarr)

**Description:** `security/scanner-filter.ts` before the rate limits ("The scanner filter"): the
probe paths get a quiet 404, the scanner user agents a 403, neither logged above debug.

**Acceptance criteria:**
- [ ] `server/security/scanner-filter.test.ts` first fails, then passes: each kind of path and
  agent, and no route the app serves matched.
- [ ] `tests/e2e/rate-limits.test.ts` gains: a probe path gets 404 and a scanner agent 403, and
  neither counts towards the general limit.

**Verification:** the gates.

**Dependencies:** task 2 (it may land any time after it; the order here keeps one PR open at once).

**Files:** `server/security/scanner-filter.ts` (+ test), `src/hooks.server.ts`,
`tests/e2e/rate-limits.test.ts`.

**Size:** S.

## Checkpoint: complete

See [plan.md](plan.md).

## Task 15: close the work stream

**Description:** Cleanup procedure 2: reduce `docs/SPEC-sign-in.md` to what code and tests can't
say, fold durable outcomes into `docs/SPEC.md` (row 5 built) and `docs/decisions.md`, delete
`tasks/`, and report to the owner.

**Acceptance criteria:**
- [ ] The PR body maps every removed line of the spec to code, a test or a decision
  (cleanup procedure 4).
- [ ] AGENTS.md's status says the owner can sign in, and names the next module.

**Verification:** prek; links resolve.

**Dependencies:** tasks 1–14.

**Files:** `docs/SPEC-sign-in.md`, `docs/SPEC.md`, `docs/decisions.md`, `AGENTS.md`, `tasks/`.

**Size:** S.
