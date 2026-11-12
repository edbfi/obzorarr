# Spec: `setup`

**Status:** draft for the owner's approval. Module 4 of the capability map ([docs/SPEC.md](SPEC.md));
it closes D15 and the logging half of D14, and ground-floor choice 3. `setup` is shared (D20,
[Shared groundwork](../AGENTS.md#shared-groundwork)) and obzorarr is its reference: comradarr,
zondarr, otpravkarr and zimuarr each specify theirs from this spec and obzorarr's code and tests once
it is built.

**Reading the marks.** A bullet or clause marked "(obzorarr)" is this app's own; the rest is the
shared wording. A "(obzorarr)" mark inside a bullet covers the rest of that bullet, and
"(obzorarr: …)" only its own parentheses. Decision numbers are obzorarr's; each app cites its own.
What else may differ is in Shared groundwork: the environment prefix, the app name, the database
engine, routes and wording.

## Objective

A fresh install starts safely and is claimed by its one owner (D20):
1. **Startup:** the configuration is checked, the database opened and migrated, and each module's
   startup work run, before any request is served; shutdown stops work, drains and closes cleanly.
2. **The database** (D5, D6): embedded Turso through Drizzle, with reviewed migrations, a settings
   store and the owner account.
3. **Logging** (D11): structured entries on standard output, redacted before they are written.
4. **The request checks:** the cross-origin check on every state-changing request, and security
   headers and a nonce-based CSP on every response the app renders (ground-floor choice 3).
5. **First run:** the setup gate, the bootstrap token printed to the console, and the claim, which
   creates the owner account.

**Left out on purpose:** signing the owner in at the claim, sessions, the browser's address, rate
limits, cookies and the error pages (`sign-in`); the two-factor offer (`two-factor`); every later
first-run step. Until `sign-in` is built, a claimed instance has no way to sign in, and first run
ends at the claim ("Before `sign-in`", below).

## Configuration and startup checks

Each of the app's own variables is read once, at startup, by its own file in `config/`, and
`src/env.ts` declares it (SvelteKit 3 exposes only declared variables). For these, an empty variable
counts as unset (D26's rule), and a check that fails stops startup with one line naming the variable
and what is wrong, never echoing the value.

| Variable | Default | Checked |
|---|---|---|
| `OBZORARR_SECRET_KEY`, `…_FILE` | — | as `secrets` checks them (D26) |
| `OBZORARR_DATABASE_PATH` | `data/obzorarr.db`, against the working directory | its folder exists or can be created, and is writable |
| `ORIGIN` | unset | below |
| `OBZORARR_LOG_DEBUG` | off | `true` or `false` |

**adapter-bun's own variables** are read and checked by the adapter (1.0.1), with its own defaults
and messages, which may echo a malformed value; the app adds no code for them, and the README lists
them:
- `SHUTDOWN_TIMEOUT` (default 30 s): the drain time, kept below the container's stop timeout;
- `CONNECTION_IDLE_TIMEOUT` (default 10 s, at most 255 s): the idle timeout. The adapter already
  exempts event streams;
- `BODY_SIZE_LIMIT` (default 512 KB) (obzorarr: takes no uploads).

**`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name: an app
prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
variable. When set, it is a bare `http` or `https` origin (a trailing `/` is fine), compared as a
parsed origin. It is checked twice:
- **adapter-bun 1.0.1** reads it when the server module loads, before `init`, and uses it to
  correct SvelteKit's `event.url`. An empty or unparseable value stops it with the adapter's own
  message, which includes the value, so the container image's entrypoint unsets an empty `ORIGIN`
  and its templates leave it out (the image's work, not this repo's).
- **The app** then refuses what the adapter accepts and quietly trims: a path, query, fragment or
  credentials. Startup stops with an error that doesn't echo the value.

The cross-origin check, the strict-transport decision and `sign-in`'s browser's address all use the
one value `config/origin.ts` gives.

## Startup and shutdown

**Startup** runs once, in SvelteKit's `init` hook, before any request is served, and is skipped
while building:
1. the master key (`secrets`, as now);
2. the configuration above;
3. the database: opened, then migrated (D5: the app is its one migration owner);
4. each module's startup work, in a fixed order. `setup`'s own: if the instance is unclaimed, print
   the bootstrap token. (obzorarr: later modules add deleting shadowed settings, advancing the
   authority epoch when the Plex URL or token changed, `identity`, and marking interrupted syncs
   failed, D7);
5. starting the jobs (none yet). A job that fails to start is logged, not fatal.

A failure in steps 1–4 stops startup, with the error logged and a non-zero exit.

**Shutdown.** adapter-bun 1.0.1 already drains open requests for `SHUTDOWN_TIMEOUT`, then closes
the rest, exits at once on a second signal, and emits `sveltekit:shutdown` without waiting for its
listeners. The app adds:
- **On the signal** (`SIGTERM`, `SIGINT`, and `SIGHUP`, which counts as a stop and is passed on to
  the adapter as `SIGTERM`): stop the jobs and timers and close open streams cleanly, so browsers
  reconnect, while the adapter drains.
- **On `sveltekit:shutdown`:** flush the logs and close the database, then exit 0.
- **A deadline:** if that cleanup hasn't finished within 5 seconds, the app exits non-zero anyway,
  even with an upstream call still outstanding.

## The database

**Versions:** `@tursodatabase/database` 0.8.3, `drizzle-orm` and `drizzle-kit` 1.0.0-rc.5 (the `rc`
dist-tag, D5, D27), exact-pinned dev dependencies, and adapter-bun moves to 1.0.1. The build
validates the pair (below), which closes D15.

**Access** follows D6: the client in `db/client.ts` opens the one file; each aggregate's file in
`db/` holds its tables and its named operations; services own the transactions, and every statement
in one goes through its transaction object.

**Migrations** are generated by Drizzle Kit from the schema (`bun run --bun db:generate`), reviewed
and committed in `drizzle/`. The built server applies them at startup with only `build/` and the
database file: Vite bundles each migration's SQL (`import.meta.glob` with `?raw`), and a Drizzle
migrator that takes the migrations' text applies them (rc.5 has one for Turso's WebAssembly driver
that takes them as a record). The build validates it against the native driver; if no such migrator
works there, `drizzle/` ships beside `build/` and the README says so.

**Tables** (each with `drizzle/`'s first migration):
- **`settings`:** key, value (text) and update time, through named operations to read and write a
  key. `setup` stores first run's step pointer here; later modules add their own keys.
- **`owner`:** one row at most, enforced by the schema (a fixed id): username, password hash and
  creation time. `two-factor`, `oidc-sign-in` (obzorarr: and `plex-sign-in`) add their fields.

## Logging

Four levels, debug dropped unless `OBZORARR_LOG_DEBUG` is on. Each entry is one JSON line on
standard output (D11) with a level, a message, a source, structured metadata and a millisecond
timestamp. `logging/` is the app's own small logger, with no library, which closes D14's logging
half: the redaction rules below need key matching at any depth that path-based library redaction
doesn't give, and the entry shape is fixed here. `logs` adds a way to store entries when it comes.

**Redaction** runs before an entry is written:
- credentials in URLs, and token-like query parameters;
- token, authorisation and cookie fields in payloads and headers;
- at any depth, any metadata key that looks like a token, secret, password, cookie, session or key;
- a `Secret` (`secrets`) is already `[redacted]`.

Console output that is meant for whoever runs the server, such as the bootstrap token, is never a
log entry. It still reaches the container's output, which is why the console is trusted (below).

## The request checks

`handle` runs its stages in this order: the language (`i18n`), the security headers, the
cross-origin check, then the setup gate. `sign-in` later adds its stages between the cross-origin
check and the gate. Every refusal is returned, never thrown
([SPEC-i18n.md](SPEC-i18n.md#choosing-the-language)), so it keeps the language and the headers.

### The cross-origin check

Brought forward from `sign-in`'s Module notes, because the claim is the first form: SvelteKit's own
check compares the browser's `Origin` with `event.url`, which adapter-bun builds as `https` unless
`ORIGIN` or a protocol header says otherwise, so it would refuse the claim over plain HTTP.
- **SvelteKit's own form check is off:** `sveltekit({ csrf: { trustedOrigins: ['*'] } })` in
  `vite.config.ts` (SvelteKit 3 takes its options in the `sveltekit()` call, with no `kit:`
  wrapper). Remote functions stay off. A config test asserts both, so SvelteKit's only remaining
  check before `handle` is the remote-function one, which nothing uses. The cross-origin check
  replaces SvelteKit's form check.
- **The cross-origin check** asks the browser, so the app doesn't need to know its own address and
  stores none. It is the first check in `handle`, after only the language (`i18n`), for every
  method except GET, HEAD and OPTIONS, and for every content type (form, JSON, multipart,
  `text/plain`, empty). Internal `event.fetch` subrequests (`event.isSubRequest`) skip it.
  - An `Origin` header, whenever it is present, must parse as one bare `http` or `https` origin;
    `null`, a malformed value or several values are refused. This applies on every branch below.
  - With `ORIGIN` set, a present `Origin` must equal `ORIGIN`, compared as parsed origins. Without
    `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`.
  - With `ORIGIN` unset, a present `Sec-Fetch-Site` passes only as `same-origin` or `none`
    (`same-site` and `cross-site` are refused). Otherwise `Origin`'s host and port must equal the
    `Host` header, with default ports normalised. Browsers send `Sec-Fetch-Site` only to HTTPS,
    `localhost` and loopback addresses, so over plain HTTP outside loopback every browser gets
    this comparison.
  - A request with neither `Origin` nor `Sec-Fetch-Site` doesn't come from a browser. It passes only
    on an explicit list of machine routes (obzorarr: none, so it refuses every such request): the
    API-key endpoints and other machine routes the app's approved docs already name, each with the
    credentials those docs require. The session cookie is never honoured on it: such a request that
    carries only a session cookie gets a 403.
  - A refusal is a 403 with the app's own "Access denied" page, or a JSON error for JSON callers,
    with the security headers and in the viewer's language. Until `sign-in` builds the error pages,
    the page is the title and its one-line description.
- **When `ORIGIN` or a proxy fix is still needed:** behind a proxy that rewrites `Host`, over plain
  HTTP for every browser, and over HTTPS only for browsers without `Sec-Fetch-Site` (Safari before
  16.4, Firefox before 90, Chrome before 76). The proxy fix is `proxy_set_header Host $http_host`
  (not `$host`, which drops a non-default port). Remote functions would need it too; they stay
  off.
- **Accepted residual risks.** Over plain HTTP, the `Origin` and `Host` comparison can't tell `http`
  from `https`, which is harmless on a port that speaks only HTTP; over HTTPS it affects only
  browsers without `Sec-Fetch-Site`, and only against a network attacker, and HSTS or `ORIGIN`
  closes it. DNS rebinding reaches only actions that need no sign-in, because cookies don't follow
  a rebind, and those are gated by a console token or rate-limited.

`security/cross-origin.ts` is one pure module, so each app copies it as D20 shares the opening
modules.

### Security headers and CSP

On every response that passes through `handle`, early returns and error pages included:
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: same-origin` (never `no-referrer`, which makes browsers send `Origin: null` on
  the app's own form posts);
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
- `Strict-Transport-Security: max-age=31536000` over HTTPS only, known when `ORIGIN` is `https`, or
  when the browser sent `Sec-Fetch-Site` to a host that isn't loopback (browsers send it only to
  HTTPS and loopback addresses). Never `includeSubDomains`: other apps may share the domain. An
  accepted risk: HSTS covers every port of the host name, so another app on the same host over plain
  HTTP becomes unreachable from that browser until it moves to HTTPS.

**The content security policy** goes on every page through SvelteKit's `csp` option in
`vite.config.ts`, in nonce mode:
- `default-src 'self'`, so a directive not listed falls back to the app;
- `script-src 'self'` with the nonce, so only the app's scripts run;
- `style-src 'self' 'unsafe-inline'`: `src/app.html` and server-rendered pages carry style
  attributes, which a nonce can't cover, and styles can't run code;
- `img-src 'self' data:` (obzorarr: `plex-connection` adds Plex's hosts, including the image proxy
  Plex uses for some avatars);
- `font-src 'self'` (DESIGN.md bundles the fonts);
- `connect-src 'self'` (obzorarr: `plex-connection` adds Plex);
- `frame-ancestors 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`.

No page is prerendered (`i18n` already forbids it), so every page gets its own nonce.

**A limit:** responses produced before `handle` carry none of these headers: the built files
(scripts, styles, fonts), which adapter-bun serves itself, and the adapter's own 400 and 413
answers. None is a document, so framing and the CSP don't apply to them, and Bun sends each file
with its real content type.

## First run

**The setup gate** is the last `setup` stage in `handle`. Until first run is complete, every request
except the claim, `/healthz` and the responses produced before `handle` gets a 303 to the current
first-run step (sign-in and first run's own helpers join the exceptions when their modules add
them). It reads first run's state from memory, which startup loads and the claim updates (one
process, D17).

**The step pointer.** The server keeps one current-step pointer in `settings`. The browser can't skip
ahead: each step's action checks that it is the current step, a step that offers Previous only moves
the pointer back, and only the last step's action completes first run. Every step after the claim
needs the owner's session, which `sign-in` brings. (obzorarr) The step indicator can't be clicked,
the configuration step saves the panels that later modules add in one submission, and the last step
summarises the configuration and the sync status.

**The bootstrap token** (D20):
- 12 random lowercase letters and digits, drawn without bias from WebCrypto, shown as
  `xxxx-xxxx-xxxx`;
- held only in memory: never in a log entry, the database or a response;
- printed to standard output at startup with the path `/setup`, and the full address when `ORIGIN`
  is set (the server doesn't otherwise know its address);
- valid for 15 minutes, after which a new one is printed; a timer that shutdown stops, and that
  waits while a claim is in progress;
- entered with or without the dashes, in any case, with spaces around it trimmed, and compared in
  constant time;
- once the instance is claimed, none is printed again.

**The claim** is `/setup`, the first step, and a POST form action. In this order:
1. **The fields:** the username and password are checked against the rules below, with nothing
   awaited. A field error leaves the token unused.
2. **The token:** checked and used up, with no `await` between the two. A wrong or expired token
   gets one error, "That setup token isn't valid. Use the newest one printed in the server console.",
   and never reaches the hash, so a guess costs the server nothing.
3. **The hash** of the password.
4. **One transaction** creates the owner and moves the step pointer; its insert fails if an owner
   exists.

If anything after the token is used up fails while the instance is still unclaimed, a new token is
printed. A failed claim keeps the typed username and clears the token and password. The claim
stores no address, and nothing but the owner row and the pointer.

**After it,** the claim no longer exists: `/setup` answers "not found" once first run is complete
(D20), and the claim action answers it whenever the instance is claimed.

**Owner credentials,** in `security/password.ts`, which `sign-in`'s password change and recovery
reuse:
- **Username:** trimmed and normalised to Unicode NFC, 1–64 characters, no control characters.
  Stored as entered, and compared after NFC and `toLowerCase()`, so case doesn't matter.
- **Password:** normalised to NFC, then 15–128 characters (Unicode code points), any characters,
  no composition rules. It may not contain, ignoring case, the app's name or, when the username has
  4 or more characters, the username, and it may not be on the bundled list of common passwords
  (below). 15 is NIST SP 800-63B-4's minimum for a password that is the only factor, which it is
  until two-factor is turned on.
- **The common-password list,** `security/common-passwords.txt`: the entries of 15 or more
  characters from a public list of the most common passwords (SecLists, MIT licence, named with
  its source in `password.ts`), compared after NFC and lower-casing. NIST requires checking a
  blocklist, and length alone lets `aaaaaaaaaaaaaaa` through.
- **Hashing:** `Bun.password` with argon2id and Bun's defaults, of the NFC form, so `sign-in`
  verifies what was hashed. The password is never logged or returned.
- The form has one password field with a control that shows what was typed (DESIGN.md), and no
  confirmation field.

**Trust:** anyone who can read the server console can claim a fresh install.

## Before `sign-in`

`setup` is built before `sign-in`, which brings the rest of the protections. Until then:
- **Rate limits:** none. The token has 62 bits and lasts 15 minutes, and a wrong token costs no hash,
  so guessing it isn't practical; `sign-in` adds the claim's limit (obzorarr: 5 per 5 minutes).
- **The browser's address and cookies:** the claim sets no cookie yet, so it needs neither. Once
  `sign-in` starts the owner's session at the claim, the claim needs the browser's address, and the
  session follows `sign-in`'s cookies.
- **First run ends at the claim,** its only step: the claim completes first run and sends the browser
  to `/`. `sign-in` signs the new owner in at the claim, and `two-factor` adds the first step after
  it, from which on the claim no longer completes first run.

No release is cut between `setup` and `sign-in`.

## Moved to `plex-connection`

(obzorarr) The capability map gives `setup` environment locks, settings versions, the rule on
settings URLs and Plex fingerprints in logs. None has anything to act on before
`plex-connection`'s connection form, the first setting the owner edits and the first Plex value
logged, so their Module notes move to `plex-connection` (for the owner's approval with this spec;
the capability map's rows 4 and 8 change with it). zondarr, which adopts environment locks, ports
them from `plex-connection` instead.

## Validation

The build runs D15's validation with the pinned versions, and records the evidence in its PR body:
- **Migrations:** Drizzle Kit generates the first migration from the schema; the built server
  applies the bundled migrations to a new database, records them as Drizzle Kit's own migrator
  would, and on a second start finds nothing to apply.
- **Type checking:** `check` passes with the schema, client and operations.
- **The production build:** `bun ./build` opens the database through Turso's native binding on
  Linux x64 and arm64. If the binding can't be bundled, the platform's package ships beside the
  build, and SPEC.md's "`bun ./build` needs no `node_modules`" says so.
- **Rollback isolation** (D5): a transaction that rolls back leaves a concurrent, unrelated write on
  the same connection in place.
- **No Node:** all of it with no `node`, `npm` or `npx` on `PATH`.

## Project structure

```text
src/env.ts                                  + OBZORARR_DATABASE_PATH, ORIGIN, OBZORARR_LOG_DEBUG
src/hooks.server.ts                         init: startup; handle: language, headers,
                                            cross-origin check, setup gate
src/lib/server/config/database-path.ts      the database file's path
src/lib/server/config/origin.ts             ORIGIN, parsed and checked
src/lib/server/config/log-debug.ts          OBZORARR_LOG_DEBUG
src/lib/server/db/client.ts                 opens the database
src/lib/server/db/migrate.ts                applies the bundled migrations
src/lib/server/db/settings.ts               the settings table and its operations
src/lib/server/db/owner.ts                  the owner table and its operations
src/lib/server/logging/logger.ts            levels, entries, standard output
src/lib/server/logging/redact.ts            the redaction rules
src/lib/server/security/bootstrap-token.ts  the token: drawing, formatting, comparing, expiry
src/lib/server/security/cross-origin.ts     the cross-origin check
src/lib/server/security/headers.ts          the security headers for a request
src/lib/server/security/password.ts         the credential rules, hashing and verifying
src/lib/server/security/common-passwords.txt
src/lib/server/services/setup/startup.ts    the startup steps and shutdown
src/lib/server/services/setup/first-run.ts  the steps, the pointer and the gate's decision
src/lib/server/services/setup/claim.ts      the claim
src/routes/setup/+page.svelte               the claim form
src/routes/setup/+page.server.ts            its load and the claim action
drizzle/                                    the reviewed migrations
drizzle.config.ts
tests/e2e/setup.test.ts                     first run and the request checks on the built server
tests/e2e/global-setup.ts                   claims the instance for the other tests
```

The build also changes `package.json` (the three packages, adapter-bun 1.0.1 and `db:generate`),
`vite.config.ts` (the form check off and the CSP), `playwright.config.ts` (a temporary database per
run, the token captured from the server's output, the global setup), `messages/` (the claim page's
and the refusal's text, `setup_…`), the README (the variables and first run) and `.gitignore`
(already ignores `/data/` and `*.db*`).

The claim page follows its brief, [`route-setup.md`](../.impeccable/surfaces/route-setup.md),
and shows the language switcher.

## Testing strategy

- **Unit (Vitest, `node`):**
  - each `config/` reader;
  - the redaction rules, one case each and nested;
  - the headers for HTTPS, plain HTTP, loopback and `ORIGIN`;
  - the cross-origin check against a matrix of methods, content types and `Origin`,
    `Sec-Fetch-Site`, `Host` and `ORIGIN` values, and the config test for SvelteKit's options;
  - the token's format, alphabet, expiry and comparison;
  - the credential rules at their limits, NFC and case included, and the list;
  - the shutdown deadline with a cleanup that never finishes;
  - against a temporary database file: migrations on a new database, and the claim: success; a
    field error leaving the token unused; a wrong and an expired token never reaching the hash; a
    second claim; two at once leaving one owner; a failed transaction printing a new token; and the
    gate's decision for each path.
- **e2e (Playwright, against the built server):** the web server starts with a generated key and a
  temporary database, Playwright captures the token from its output, and the global setup claims
  the instance through the form in a browser, so the smoke and language tests run on a claimed
  instance as before; the temporary database is removed afterwards. `setup.test.ts` starts its own
  fresh servers and checks that:
  - every page sends a fresh instance to `/setup`, and `/healthz` still answers `ok`;
  - a wrong token is refused, the right one claims, and `/setup` then answers 404;
  - a cross-site form POST is refused, and a same-origin POST with no `Sec-Fetch-*` headers passes,
    both on `localhost` and on a plain-HTTP host name that isn't loopback (Chromium's
    `--host-resolver-rules="MAP app.test 127.0.0.1"`);
  - the headers are on a page, `/healthz`, a 404, a refusal and the gate's redirect, and HSTS isn't,
    over plain HTTP;
  - the page's scripts carry the CSP nonce and the browser reports no CSP violation;
  - the server refuses to start with an `ORIGIN` holding credentials (`https://u:p@host`) or a path
    (`https://host/app`), or with an unwritable database folder, without echoing either value;
  - `SIGHUP` and `SIGTERM` each shut it down with exit code 0;
  - the token never appears in a response or a log entry.

## Commands

The ground floor's ([docs/SPEC.md](SPEC.md#commands)), plus `bun run --bun db:generate`
(Drizzle Kit generates a migration from the schema). `smoke` also runs `setup.test.ts`.

## Boundaries

- **Always:** startup finishes before the first request; reviewed migrations; named database
  operations and short transactions (D6); redaction before writing; the token only in memory and on
  the console; the cheap checks before the hash; refusals in `handle` returned, never thrown.
- **Ask first:** any dependency beyond the three packages; another database engine; a logging
  library; a second owner or any role (D20).
- **Never:** a token or password in a log entry, response or the database (only the hash); a stored
  address; a way to skip a first-run step; a claim after first run; `includeSubDomains`.

## Docs this module changes when built

- **`docs/SPEC.md`:** the status line and row 4 (built); the tech-stack table (Turso, Drizzle and
  adapter-bun 1.0.1); the `db:generate` and `smoke` command rows; the testing section; "Open
  decisions": the `setup` line goes; ground-floor choice 3 closes.
- **`docs/decisions.md`:** D15 moves to Decided with the validated pair; D14's logging half moves to
  Decided as the app's own logger and why (redaction at any depth, a fixed entry shape), and D14
  keeps only the job half.
- **README:** the variables above, `ORIGIN` and the proxy fix, and first run (the token in the
  console).
- **AGENTS.md:** the status and the structure tree.

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke` and `ci-ok` pass.
2. A fresh built server prints a token, sends every page to `/setup`, and is claimed once over
   plain HTTP; then the placeholder `/` serves as before, with the headers and CSP.
3. D15's validation has passed, with its evidence in the build PR's body.
4. The docs listed above say what was built.
