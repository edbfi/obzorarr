# Spec: `setup`

**Status:** built (2026-11-16), module 4 of the capability map ([docs/SPEC.md](SPEC.md)); D11, D15
and D20 hold the decisions, and it closed ground-floor choice 3. `setup` is shared (D20,
[Shared groundwork](../AGENTS.md#shared-groundwork)) and obzorarr is its reference: comradarr,
zondarr, otpravkarr and zimuarr each specify theirs from this spec and obzorarr's code and tests.
This file keeps what the code and tests can't say. The full text before this cut is
`0fb3565:docs/SPEC-setup.md`.

**Reading the marks.** A bullet or clause marked "(obzorarr)" is this app's own; the rest is the
shared wording. A "(obzorarr)" mark inside a bullet covers the rest of that bullet, and
"(obzorarr: …)" only its own parentheses. Decision numbers are obzorarr's; each app cites its own.
What else may differ is in Shared groundwork: the environment prefix, the app name, the database
engine, routes and wording.

## Objective

A fresh install starts safely and is claimed by its one owner (D20): the configuration is checked
and the database opened and migrated before any request is served; entries are logged as redacted
JSON; every state-changing request passes the cross-origin check, and every rendered response
carries the security headers and a nonce-based CSP; and until the claim, every page sends the
visitor to `/setup`, where the bootstrap token printed to the console creates the owner account.

**Left out on purpose:** signing the owner in at the claim, sessions, the browser's address, rate
limits, cookies and the error pages (`sign-in`); the two-factor offer (`two-factor`); every later
first-run step. First run ends at the claim until `two-factor` adds the next step.

## Configuration and startup checks

Each of the app's own variables is read once, at startup, by its own file in `config/`, and
`src/env.ts` declares it (SvelteKit 3 exposes only declared variables). An empty variable counts as
unset (D26's rule; `ORIGIN` differs, below), and a failed check stops startup with one line naming
the variable and what is wrong, never echoing the value.

**adapter-bun's own variables** (`SHUTDOWN_TIMEOUT`, `CONNECTION_IDLE_TIMEOUT`, `BODY_SIZE_LIMIT`)
are read and checked by the adapter, with its own defaults and messages, which may echo a malformed
value; the app adds no code for them, and the README lists them. The container's stop timeout must
exceed `SHUTDOWN_TIMEOUT` plus the app's 5-second cleanup, so the image's Compose templates set
`stop_grace_period` (Docker's default is 10 seconds). The adapter already exempts event streams from
`CONNECTION_IDLE_TIMEOUT`. (obzorarr: the app takes no uploads, so `BODY_SIZE_LIMIT` needs no
change.)

**`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name: an app
prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
variable. It is checked twice:
- **adapter-bun** reads it when the server module loads, before `init`, and uses it to correct
  SvelteKit's `event.url`. An empty or unparseable value stops it with the adapter's own message,
  which includes the value, so the container image's entrypoint unsets an empty `ORIGIN` and its
  templates leave it out (the image's work, not this repo's).
- **The app** then refuses what the adapter accepts and quietly trims: a path, query, fragment or
  credentials.

The cross-origin check, the strict-transport decision and `sign-in`'s browser's address all use the
one value `config/origin.ts` gives.

## Startup and shutdown

**Startup** runs once, in SvelteKit's `init` hook, before any request is served: the master key,
the configuration, the database (D5: the app is its one migration owner), then each module's
startup work in a fixed order, then the jobs. (obzorarr: later modules add deleting shadowed
settings, advancing the authority epoch when the Plex URL or token changed, `identity`, and marking
interrupted syncs failed, D7.) A job that fails to start is logged, not fatal. A failure before the
jobs is logged and, once its entry has left the process or a quarter of a second has passed, thrown
from `init`: the built server exits non-zero before it listens, and the dev server stays up with
every request failing.

**Shutdown.** adapter-bun drains open requests for `SHUTDOWN_TIMEOUT`, exits at once on a second
signal, and emits `sveltekit:shutdown` without waiting for its listeners. So the app stops the jobs
and timers and closes open streams on the signal, so browsers reconnect, while the adapter drains;
on `sveltekit:shutdown` it waits for those jobs, closes the database, flushes the logs and exits 0;
and it exits non-zero anyway 5 seconds after `sveltekit:shutdown`, even with an upstream call still
outstanding.
`SIGHUP` counts as a stop.

## The database

D5, D6 and D15 hold the engine, the access rules and the validated versions.

**Migrations only go forward.** Before applying anything, startup reads the migrations the
database has recorded; one this build doesn't bundle stops startup with "The database was migrated
by a newer Obzorarr: run that version again, or restore the backup taken with this one"
(`NewerDatabaseError`), naming neither the path nor the migration. An older build would otherwise
run on a schema it doesn't know. A migrations table from before Drizzle 1.0, with no names, is what
obzorarr 0.1.x left on the same default path: startup refuses it with "The database was made by an
earlier Obzorarr (0.1), which this version can't use: keep running 0.1 on it, or start this version
on a new database file" (`LegacyDatabaseError`). How such an install upgrades is decided with the
image.

**Tables:**
- **`settings`:** one value per key. `setup` stores first run's step pointer here; later modules
  add their own keys.
- **`owner`:** one row at most, enforced by the schema. `two-factor` and `oidc-sign-in`
  (obzorarr: and `plex-sign-in`) add their fields.

## Logging

D11 holds the decision and why the app has its own logger. Four levels, debug dropped unless
`OBZORARR_LOG_DEBUG` is on. Each entry is one JSON line on standard output with a level, a message,
a source, structured metadata and a millisecond timestamp. `logs` adds a way to store entries when
it comes.

**Redaction** runs before an entry is written:
- credentials in URLs, and token-like query parameters, also inside a parameter's value once
  percent-decoded (up to three times), as in Plex's transcoder `url`, however deep in it the
  credential's name sits (`?a=1;u=token%3D…`, `?u=v%3Dtoken%3D…`); such a value is redacted whole;
- token, authorisation and cookie fields in payloads and headers;
- at any depth, any metadata key that looks like a token, secret, password, cookie, session or key,
  except the few names `redact.ts` lists as holding no credential, such as Plex's `ratingKey` (the
  owner's allowlist, 2026-11-16), whose values are still cleaned like any other;
- a `Secret` (`secrets`) is already `[redacted]`;
- anything shaped like an argon2 password hash, wherever it appears;
- a failed query's bound values, which can be the owner's username and password hash: the database
  is opened with Drizzle's `paramsInErrors` off, and a failed claim logs only the query and the
  database's own error (`queryFailure`); should values still appear, everything after `params:` in
  any text is hidden, an error's stack keeping its frames, and so is the `params` field of an
  error that also has a `query`.

Redacting never throws, so an entry is always written, and quickly: a value that throws as it is
read (a getter, `toJSON` or a proxy) is logged as `[unreadable]`, losing only its own part; one
nested more than 32 levels deep, such as a runaway chain of causes, as `[too deep]`; and past 10,000
objects, array elements and fields in one entry, such as a shared object reached by many paths or a
huge array, the rest is left out unread, as `[too large]`. So that a large part can't crowd out
what an entry is most often written for, its own errors, the ones among the first 10,000 fields at
its top, are walked before its other fields, and an error's cause and errors before its own fields;
finding them reads those fields' values, each once.

**An unexpected error** while answering a request is one such entry, written by the
`handleError` hook (`logging/request-error.ts`) with the request's method and path, never its
query; SvelteKit's default would write its stack to the console unredacted. Errors the app raises
itself and the framework's, such as a 404, aren't logged, as SvelteKit's default doesn't.

Console output meant for whoever runs the server, such as the bootstrap token, is never a
log entry. It still reaches the container's output, which is why the console is trusted (below).

## The request checks

`handle` runs the language (`i18n`), the security headers, the cross-origin check, then the setup
gate; [SPEC-sign-in.md](SPEC-sign-in.md#the-request-stages) gives the stages later modules add.
Every refusal is returned, never thrown ([SPEC-i18n.md](SPEC-i18n.md#choosing-the-language)), so it
keeps the language and the headers.

### The cross-origin check

SvelteKit's own form check compares the browser's `Origin` with `event.url`, which adapter-bun
builds as `https` unless `ORIGIN` or a protocol header says otherwise, so it would refuse the claim
over plain HTTP. So that check is off, remote functions stay off (they would need `ORIGIN` too), and
the app's own check replaces it. It asks the browser, through `Sec-Fetch-Site` and `Origin` (the
rules and their order are in `cross-origin.ts` and its test matrix), so the app needs no address of
its own and stores none.

What later modules must keep:
- **Requests from no browser,** with neither `Origin` nor `Sec-Fetch-Site`, pass only on an explicit
  list of machine routes, each with the credentials the app's approved docs require for it, such as
  the API-key endpoints (obzorarr: none, so every such request is refused). The session cookie is
  never honoured on one: such a request carrying only a session cookie gets a 403.
- **The refusal** is the app's own "Access denied" page, or a JSON `{ message }` for JSON callers;
  `sign-in`'s error pages reuse its messages.

**When `ORIGIN` or a proxy fix is still needed:** behind a proxy that rewrites `Host`, over plain
HTTP for every browser, and over HTTPS only for browsers without `Sec-Fetch-Site` (Safari before
16.4, Firefox before 90, Chrome before 76). The README gives the fix.

**Accepted residual risks.** Over plain HTTP, the `Origin` and `Host` comparison can't tell `http`
from `https`, which is harmless on a port that speaks only HTTP; over HTTPS it affects only
browsers without `Sec-Fetch-Site`, and only against a network attacker, and HSTS or `ORIGIN`
closes it. DNS rebinding reaches only actions that need no sign-in, because cookies don't follow a
rebind, and those are gated by a console token or rate-limited.

`security/cross-origin.ts` is one pure module, so each app copies it as D20 shares the opening
modules.

### Security headers and CSP

The headers go on every response that passes through `handle`, and the policy on every page,
through SvelteKit's `csp` option in nonce mode. No page is prerendered (`i18n` already forbids it),
so every page gets its own nonce. The choices the code can't explain:
- **`Referrer-Policy: same-origin`,** never `no-referrer`, which makes browsers send `Origin: null`
  on the app's own form posts.
- **Strict transport** only over HTTPS, known when `ORIGIN` is `https`, or, when `ORIGIN` is unset,
  from `Sec-Fetch-Site` sent to a host that isn't `localhost`, `*.localhost` or loopback, since
  browsers send it only to HTTPS and those hosts. Never `includeSubDomains`: other apps may share
  the domain. An accepted risk: HSTS covers every port of the host name, so another app on the same
  host over plain HTTP becomes unreachable from that browser until it moves to HTTPS.
- **`style-src 'unsafe-inline'`:** `src/app.html` and server-rendered pages carry style
  attributes, which a nonce can't cover, and styles can't run code.
- (obzorarr) `plex-connection` adds Plex's hosts to `img-src`, including the image proxy Plex uses
  for some avatars, and Plex to `connect-src`.
- **A page a `handle` stage builds itself,** such as the refusal, never passes through SvelteKit's
  renderer, so the stage sets its own fixed, stricter policy and `<html lang>`.

**A limit:** responses produced before `handle` carry none of these headers: the built files, which
adapter-bun serves itself, and the adapter's own 400 and 413 answers. None is a document, so
framing and the CSP don't apply to them, and Bun sends each file with its real content type.

## First run

**The setup gate** is the last `setup` stage in `handle`. Until first run is complete, every request
except the current first-run step, `/healthz` and the responses produced before `handle` gets a 303
to that step. A later first-run step's own helpers join the exceptions when its module adds them. It
reads first run's state from memory, which startup loads and the claim updates (one process, D17).

**The step pointer.** The server keeps one current-step pointer in `settings`. The browser can't
skip ahead: each step's action checks that it is the current step, a step that offers Previous only
moves the pointer back, and only the last step's action completes first run. Every step after the
claim needs the owner's session, which `sign-in` brings. (obzorarr) The step indicator can't be
clicked, the configuration step saves the panels that later modules add in one submission, and the
last step summarises the configuration and the sync status.

**The bootstrap token** (D20) is held only in memory, printed to standard output with the path
`/setup`, and the full address when `ORIGIN` is set, since the server doesn't otherwise know its
address. A new one is printed every 15 minutes until the claim, and none after it.

**The claim** checks the fields, then checks and uses up the token with no `await` between the two,
then hashes the password, then creates the owner and moves the step pointer in one transaction,
which (`sign-in`) also starts the owner's first session. The cheap checks come first so a wrong
guess never costs a hash, and a field error leaves the token unused. The claim stores no address,
and nothing but the owner row, the pointer and that session. After it, the claim no longer exists:
`/setup` answers "not found" once first run is complete (D20), and the claim action answers it
whenever the instance is claimed.

**Owner credentials,** in `security/password.ts`, which `sign-in`'s password change and recovery
reuse:
- **The username** is stored with its case kept, and `sign-in` compares it after `toLowerCase()`,
  so case doesn't matter.
- **The password** needs 15 characters because that is NIST SP 800-63B-4's minimum for a password
  that is the only factor, which it is until two-factor is turned on. NIST also requires a
  blocklist, and length alone accepts the long passwords such lists hold, so the bundled list of
  common passwords is checked too (the owner chose the list, 2026-11-12). `password.ts` names its
  source and how to rebuild it. The list holds only some patterns, so the password also may not be,
  as a whole, one unit of up to 4 characters repeated or one straight run up or down (the owner
  added this, 2026-11-16). There are no composition rules.
- **The hash** is of the NFC form, so `sign-in` verifies what was hashed. The password is never
  logged or returned.
- **The form** has one password field with a control that shows what was typed, and no
  confirmation field.

**Trust:** anyone who can read the server console can claim a fresh install.

## Boundaries

- **Always:** startup finishes before the first request; reviewed migrations; named database
  operations and short transactions (D6); redaction before writing; the token only in memory and on
  the console; the cheap checks before the hash; refusals in `handle` returned, never thrown.
- **Ask first:** another database engine; a logging library; a second owner or any role (D20).
- **Never:** a token or password in a log entry, response or the database (only the hash); a stored
  address; a way to skip a first-run step; a claim after first run; `includeSubDomains`.
