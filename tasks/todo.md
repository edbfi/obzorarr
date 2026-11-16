# Tasks: `sign-in`

The spec is [docs/SPEC-sign-in.md](../docs/SPEC-sign-in.md), and the plan is [plan.md](plan.md).
Each task is one PR and writes its tests first. Each one updates AGENTS.md's status and structure,
ticks off its items in `tasks/`, names what the sibling apps take in its PR body, gets a council
review, and runs `bun run --bun check`, `test`, `lint`, `build`, `smoke` and
`prek run --all-files --hook-stage manual` before every commit. Paths under `src/lib/server/` are
shortened to `server/`, and the spec's sections are named in quotes.

## Task 1: the error pages

**Description:** The pages users see when something is refused or fails ("Errors and error
pages"). `security/access-denied.ts` becomes `security/refusal-page.ts`, styled from Panda's token
declarations inline, with plain Home and (where it applies) Sign in links; `routes/+error.svelte`
titles each status, with Go back, Home, the logo and wordmark and the language switcher;
`handleError` (#344) also returns the translated "Something went wrong. Try again."; and
`src/error.html` says it in English and Danish.

**Acceptance criteria:**
- [ ] `server/security/refusal-page.test.ts` first fails, then passes: "Access denied" and "Too
  many requests" in both languages, their JSON forms, their fixed policy, `class="dark"`, the
  inline token declarations and the links; no script and no Go back.
- [ ] `server/logging/request-error.test.ts` gains the returned message, in both languages.
- [ ] `tests/e2e/errors.test.ts` first fails, then passes: an unknown page shows "Page not found"
  without its number; a cross-site POST's "Access denied" page shows the tokens' computed colours;
  no page logs a console error or a CSP violation.
- [ ] The error page follows DESIGN.md (no brief: it is a state of every route) at 360, 390, 768
  and 1440px and 200% zoom, in English and Danish.

**Verification:** the gates; the error page checked in a browser at each width.

**Dependencies:** none.

**Files:** `server/security/refusal-page.ts` (+ test, renamed from `access-denied.ts`),
`src/hooks.server.ts`, `server/logging/request-error.ts` (+ test), `src/routes/+error.svelte`,
`src/error.html`, `messages/en.json`, `messages/da.json`, `tests/e2e/errors.test.ts`.

**Size:** M.

## Task 2: the client address and the general limit

**Description:** `security/client-address.ts` and `security/rate-limit.ts` ("Configuration",
"Rate limits and failed sign-ins"): the address per IPv4, per IPv6 `/64` and IPv4-mapped; with
`ADDRESS_HEADER` set, a request missing it or carrying a bad one refused (`/healthz` excepted);
the warnings; the fixed windows, swept and capped; and the rate-limit stage in `handle` with the
general limit of 60 a minute, answered with the "Too many requests" page or JSON and its headers.
The shared e2e server moves to `ADDRESS_HEADER=x-forwarded-for` with a per-test address.

**Acceptance criteria:**
- [ ] `server/security/client-address.test.ts` first fails, then passes, on a copied `Request` as
  `handle` sees it: each address kind, the refusal and its one warning, the `X-Forwarded-For`
  warning without `ADDRESS_HEADER`, no address as unknown with one warning.
- [ ] `server/security/rate-limit.test.ts`: a window at its edges, the headers, sweeping, the cap
  of 10,000 with the oldest out first.
- [ ] A fixture in `tests/e2e/` gives each test its own `X-Forwarded-For`; `global-setup.ts`,
  `smoke.test.ts` and `i18n.test.ts` use it, and `playwright.config.ts` starts the shared server
  with `ADDRESS_HEADER=x-forwarded-for`.
- [ ] `tests/e2e/rate-limits.test.ts`: the 61st request in a minute gets 429 with `Retry-After` as
  the branded page; a request without the header gets "Access denied" while `/healthz` answers.

**Verification:** the gates; the README's `ADDRESS_HEADER` and `XFF_DEPTH` section (the port
reachable only through the proxy).

**Dependencies:** task 1.

**Files:** `server/security/client-address.ts` (+ test), `server/security/rate-limit.ts`
(+ test), `src/hooks.server.ts`, `tests/e2e/` (the fixture, `global-setup.ts`, `smoke.test.ts`,
`i18n.test.ts`, `rate-limits.test.ts`), `playwright.config.ts`, `README.md`.

**Size:** L. The fixture has to move with the stage, or the suite trips its own limit.

## Task 3: the claim's limit and the hash slots

**Description:** `security/hash-slots.ts`, at most 4 hashes at once, and the claim's limit of 5 per
5 minutes, checked in its action and answered with `fail(429)` beside the button. The claim takes
its slot before it checks and uses up the token ("Signing in").

**Acceptance criteria:**
- [ ] `server/security/hash-slots.test.ts` first fails, then passes: the fifth refused at once,
  a slot freed on success and on failure.
- [ ] `server/services/setup/claim.test.ts` gains: a refused slot leaves the token unused; the
  sixth claim within 5 minutes is refused without touching the token.
- [ ] `tests/e2e/setup.test.ts`: the sixth claim attempt shows "Too many attempts…" beside the
  button, with `Retry-After`.
- [ ] `route-setup.md` gains its too-many-attempts state, built in the claim page.

**Verification:** the gates; the claim page's new state at 360px and 1440px.

**Dependencies:** task 2.

**Files:** `server/security/hash-slots.ts` (+ test), `server/services/setup/claim.ts` (+ test),
`src/routes/setup/+page.server.ts`, `src/routes/setup/+page.svelte`, `messages/`,
`tests/e2e/setup.test.ts`, `.impeccable/surfaces/route-setup.md`.

**Size:** M.

## Checkpoint: after task 3

See [plan.md](plan.md).

## Task 4: sessions, the owner check and signing in at the claim

**Description:** The `owner_session` table and its migration; `security/session-token.ts`,
`session-cookie.ts` and `browser-address.ts`; `services/sign-in/sessions.ts` (start, look up,
renew at most hourly, end, end the others, expired rows deleted, only for the current hash); the
session stage and the owner check in `handle`; and the claim, which now needs the browser's
address, writes the session in its transaction, sets the cookie and lands on `/admin`. `/admin`
redirects to `/admin/settings/security`, which is only its heading until task 6.

**Acceptance criteria:**
- [ ] Unit tests first fail, then pass: `session-token`, `session-cookie` (`http`, `https`,
  deletion), `browser-address` (`ORIGIN`, a validated `Origin`, a stripped one),
  `db/owner-session`, `services/sign-in/sessions` (both limits at their edges, the hourly write,
  expiry, the current-hash check), `claim` (the session in its transaction, none on failure), and
  the search for `url.origin` and `url.protocol` in `src/`.
- [ ] `tests/e2e/sign-in.test.ts`: the claim lands on the Security tab with a cookie that is
  `HttpOnly`, `SameSite=Lax` and not `Secure`, on `localhost` and on a non-loopback host name;
  without a session, `/admin` and a client-side navigation go to `/admin/sign-in?next=…` and an
  owner-only form POST (plain and enhanced) gets 403; a claim with `Origin` stripped gets the 403
  that says so and leaves the token unused.
- [ ] The migration is generated with `db:generate` and reviewed; startup deletes expired sessions.

**Verification:** the gates.

**Dependencies:** task 3.

**Files:** `server/db/owner-session.ts` (+ test), `drizzle/`, `drizzle.config.ts`,
`server/security/session-token.ts`, `session-cookie.ts`, `browser-address.ts` (+ tests),
`server/services/sign-in/sessions.ts` (+ test), `server/services/setup/claim.ts` (+ test),
`server/services/setup/startup.ts`, `src/hooks.server.ts`, `src/app.d.ts`,
`src/routes/setup/+page.server.ts`, `src/routes/(admin)/admin/(shell)/` (the redirects and the
heading), `tests/e2e/sign-in.test.ts`.

**Size:** L. The session needs its first caller, the claim, to merge used.

## Task 5: owner sign-in

**Description:** `/admin/sign-in` through `/impeccable` from `route-admin-sign-in.md`, and
`services/sign-in/sign-in.ts` ("Signing in"): the one answer, the dummy verification, a hash slot,
the logs without the username, the return path (`security/return-path.ts`), the sign-in limit and
the doubling waits (`security/failed-sign-ins.ts`), and "Forgot your password?". `PasswordField`
moves to `lib/components/credentials/`, shared with the claim. The placeholder `/` gets its
"Owner sign-in" link.

**Acceptance criteria:**
- [ ] Unit tests first fail, then pass: `return-path` (each rule at its limits), `failed-sign-ins`
  (5, 10, 20, 40, 60 and 60 minutes; reset by a success and after 24 hours; swept and capped),
  `services/sign-in/sign-in` (right and wrong credentials, the username's case and trim, the dummy
  verification, the logs, an old-password check that ends after the hash changed starting no
  session).
- [ ] `tests/e2e/sign-in.test.ts` gains: a wrong password is refused with the username kept; the
  right one signs in and returns to `next`; an unsafe `next` is dropped; a signed-in owner opening
  the page goes to `/admin`; the 11th attempt in 5 minutes shows the form's 429 message.
- [ ] The page follows its brief in every state it names, at each width, zoom, keyboard and
  reduced motion, in English and Danish, with screenshots in the PR body.

**Verification:** the gates; the brief's checks.

**Dependencies:** task 4.

**Files:** `server/services/sign-in/sign-in.ts` (+ test), `server/security/return-path.ts`
(+ test), `server/security/failed-sign-ins.ts` (+ test), `src/routes/(admin)/admin/sign-in/`,
`src/lib/components/credentials/PasswordField.svelte`, `src/routes/setup/+page.svelte`,
`src/routes/(public)/+page.svelte`, `messages/`, `tests/e2e/sign-in.test.ts`,
`.impeccable/surfaces/route-admin-sign-in.md` (its direction contract).

**Size:** L.

## Task 6: the admin shell and signing out

**Description:** The shell through `/impeccable` from `route-admin-settings-security.md`
("The admin shell"): the sidebar, the rail and the drawer, the footer with the username, the
language switcher and the version (`OBZORARR_VERSION` at build time, else `dev`), and Sign out
behind its confirmation; `/admin/sign-out` (POST ends the session, GET only redirects); the
settings tabs with Security. The Security tab gets its frame and heading.

**Acceptance criteria:**
- [ ] `tests/e2e/sign-in.test.ts` gains: a GET to `/admin/sign-out` signs nobody out; Sign out asks
  first, then ends the session and lands on sign-in; the drawer below 768px traps focus, closes on
  Escape and makes the page inert.
- [ ] `vite.config.test.ts` (or a unit test beside the version's source): the version is
  `OBZORARR_VERSION` when set at build time and `dev` otherwise.
- [ ] The shell follows its brief in every state it names, at each width, zoom, keyboard and
  reduced motion, in English and Danish, with screenshots in the PR body.

**Verification:** the gates; the brief's checks.

**Dependencies:** task 5.

**Files:** `src/routes/(admin)/admin/(shell)/+layout.svelte`, `settings/`,
`src/routes/(admin)/admin/sign-out/+page.server.ts`, `src/lib/components/layout/` (the sidebar,
drawer, owner footer and sign-out confirmation), `vite.config.ts`, `messages/`,
`tests/e2e/sign-in.test.ts`, `.impeccable/surfaces/route-admin-settings-security.md` (its
direction contract), `README.md` (the version).

**Size:** L.

## Checkpoint: after task 6

See [plan.md](plan.md).

## Task 7: the password change and "Sign out everywhere else"

**Description:** The Security tab's Password and Sessions sections ("The Security tab"):
`services/sign-in/password-change.ts` (the current password counted as a failed sign-in, `setup`'s
rules, one transaction that replaces the hash, ends the other sessions and renews this one), and
the count of other sessions with "Sign out everywhere else".

**Acceptance criteria:**
- [ ] `server/services/sign-in/password-change.test.ts` first fails, then passes: a wrong current
  password counted, the rules against the stored username, the other sessions ended, a new token.
- [ ] `tests/e2e/sign-in.test.ts` gains: the password change ends a second browser's session and
  keeps this one; "Sign out everywhere else" does the same and says how many; with none, no button.
- [ ] Both sections follow the brief's states (initial, field errors, too many attempts, saving,
  saved; none, one and several other sessions), at each width, in English and Danish.

**Verification:** the gates; the brief's checks.

**Dependencies:** task 6.

**Files:** `server/services/sign-in/password-change.ts` (+ test),
`server/services/sign-in/sessions.ts`, `server/db/owner.ts`,
`src/routes/(admin)/admin/(shell)/settings/security/`, `messages/`, `tests/e2e/sign-in.test.ts`.

**Size:** M.

## Task 8: recovery

**Description:** `config/recovery.ts` (`OBZORARR_RECOVERY`), `security/console-token.ts` (renamed
from `bootstrap-token.ts`), `services/sign-in/recovery.ts` (the token at startup, the `settings`
key once used, the warnings, the order of the checks, one transaction that replaces the hash,
ends every session and starts this one), `/recovery` through `/impeccable` from its brief,
`TokenField` and `token-format.ts` moved to `lib/components/credentials/`, and the Security tab's
warning while recovery is on ("Recovery").

**Acceptance criteria:**
- [ ] Unit tests first fail, then pass: `config/recovery`; `recovery` (the token printed or not for
  each state of the setting, the key and the claim; a wrong and an expired token never reaching
  the hash; a refused slot leaving the token unused; every session ended; the key cleared when the
  setting is off).
- [ ] `tests/e2e/recovery.test.ts`, on its own server: the token is printed in no log entry or
  response; `/recovery` sets a new password and lands on the Security tab with the warning; the old
  password and sessions no longer work; after a restart with the setting on, no new token; with it
  off, `/recovery` is not found.
- [ ] The page follows its brief in every state it names, at each width, in English and Danish.

**Verification:** the gates; the brief's checks; the README's recovery steps.

**Dependencies:** task 7.

**Files:** `server/config/recovery.ts` (+ test), `src/env.ts`, `server/security/console-token.ts`
(+ test, renamed), `server/services/sign-in/recovery.ts` (+ test),
`server/services/setup/first-run.ts`, `server/services/setup/startup.ts`, `src/routes/recovery/`,
`src/lib/components/credentials/` (`TokenField.svelte`, `token-format.ts` + test, moved from
`src/routes/setup/`), `src/routes/(admin)/admin/(shell)/settings/security/`, `messages/`,
`tests/e2e/recovery.test.ts`, `playwright.config.ts`, `README.md`,
`.impeccable/surfaces/route-recovery.md` (its direction contract).

**Size:** L.

## Task 9: the scanner filter (obzorarr)

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

## Task 10: close the work stream

**Description:** Cleanup procedure 2: reduce `docs/SPEC-sign-in.md` to what code and tests can't
say, fold durable outcomes into `docs/SPEC.md` (row 5 built) and `docs/decisions.md`, delete
`tasks/`, and report to the owner.

**Acceptance criteria:**
- [ ] The PR body maps every removed line of the spec to code, a test or a decision
  (cleanup procedure 4).
- [ ] AGENTS.md's status says the owner can sign in, and names the next module.

**Verification:** prek; links resolve.

**Dependencies:** tasks 1–9.

**Files:** `docs/SPEC-sign-in.md`, `docs/SPEC.md`, `docs/decisions.md`, `AGENTS.md`, `tasks/`.

**Size:** S.
