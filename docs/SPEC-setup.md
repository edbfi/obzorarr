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
   startup work run, before any request is served; shutdown drains and closes cleanly.
2. **The database** (D5, D6): embedded Turso through Drizzle, with reviewed migrations, a settings
   store and the owner account.
3. **Logging** (D11): structured entries on standard output, redacted before they are written.
4. **Security headers and a nonce-based CSP** on every response the app renders (ground-floor
   choice 3).
5. **First run:** the setup gate, the bootstrap token printed to the console, and the claim, which
   creates the owner account.

**Left out on purpose:** signing the owner in at the claim, sessions, rate limits, the cross-origin
check and cookies (`sign-in`); the two-factor offer (`two-factor`); every later first-run step. Until
`sign-in` is built, a claimed instance has no way to sign in, and first run ends at the claim
("Before `sign-in`", below).

## Configuration and startup checks

Each variable is read once, at startup, by its own file in `config/`; `src/env.ts` declares the
app's own (SvelteKit 3 exposes only declared variables). An empty variable counts as unset (D26's
rule). A check that fails stops startup with one line naming the variable and what is wrong, never
echoing the value.

| Variable | Default | Checked |
|---|---|---|
| `OBZORARR_SECRET_KEY`, `…_FILE` | — | as `secrets` checks them (D26) |
| `OBZORARR_DATABASE_PATH` (obzorarr) | `data/obzorarr.db` | its folder exists or can be created, and is writable |
| `ORIGIN` | unset | a bare `http` or `https` origin (a trailing `/` is fine; no path, query, fragment or credentials) |
| `OBZORARR_LOG_DEBUG` | off | `true` or `false` |
| `SHUTDOWN_TIMEOUT` | 30 s | adapter-bun's: the drain time, kept below the container's stop timeout |
| `CONNECTION_IDLE_TIMEOUT` (obzorarr) | 10 s | adapter-bun's: the idle timeout (at most 255 s) |
| `BODY_SIZE_LIMIT` (obzorarr) | 512 KB | adapter-bun's: the request body limit (obzorarr takes no uploads) |

- **`ORIGIN`** keeps its plain name, not an app-prefixed one (`sign-in`'s Module notes say why).
  `setup` reads and checks it because the strict-transport decision uses it; `sign-in` uses the
  same value for the cross-origin check and the browser's address.
- **The adapter's variables** are adapter-bun 1.0's own, with these defaults, so the app adds no code
  for them; the README lists them.

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

**Shutdown.** adapter-bun 1.0 already drains open requests for `SHUTDOWN_TIMEOUT`, then closes the
rest, exits at once on a second signal, and emits `sveltekit:shutdown`. The app adds:
- **a hang-up counts as a stop:** `SIGHUP` starts the same shutdown as `SIGTERM`;
- **on `sveltekit:shutdown`:** stop the jobs and timers, flush the logs, close the database, then
  exit, even if an upstream call is still outstanding.

(Later modules' live streams end cleanly when closed, so browsers reconnect, and are exempt from the
idle timeout; nothing streams yet.)

## The database

**Versions:** `@tursodatabase/database` 0.8.3, `drizzle-orm` and `drizzle-kit` 1.0.0-rc.5 (the `rc`
dist-tag, D5, D27), exact-pinned dev dependencies. The build validates the pair (below), which
closes D15.

**Access** follows D6: the client in `db/client.ts` opens the one file; each aggregate's file in
`db/` holds its tables and its named operations; services own the transactions, and every statement
in one goes through its transaction object.

**Migrations** are generated by Drizzle Kit from the schema (`bun run --bun db:generate`), reviewed
and committed in `drizzle/`. The built server applies them at startup with only `build/` and the
database file, so the migrations ship inside the build.

**Tables** (each with `drizzle/`'s first migration):
- **`settings`:** key, value (text) and update time, through named operations to read and write a
  key. `setup` stores first run's step pointer here; later modules add their own keys.
- **`owner`:** one row at most, enforced by the schema (a fixed id): username, password hash and
  creation time. `two-factor`, `plex-sign-in` and `oidc-sign-in` add their fields.

## Logging

Four levels, debug dropped unless `OBZORARR_LOG_DEBUG` is on. Each entry is one JSON line on
standard output (D11) with a level, a message, a source, structured metadata and a millisecond
timestamp. `logging/` is the app's own small logger, with no library, which closes D14's logging
half: the redaction rules below need key matching at any depth that path-based library redaction
doesn't give, and the entry shape is fixed here. It exposes a sink, so `logs` can store entries
later without `logging/` importing `db/`.

**Redaction** runs before an entry is written anywhere:
- credentials in URLs, and token-like query parameters;
- token, authorisation and cookie fields in payloads and headers;
- at any depth, any metadata key that looks like a token, secret, password, cookie, session or key;
- a `Secret` (`secrets`) is already `[redacted]`.

Console output that is meant for whoever runs the server, such as the bootstrap token, never goes
through the logger.

## Security headers and CSP

On every response that passes through `handle`, early returns and error pages included:
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: same-origin` (never `no-referrer`, which makes browsers send `Origin: null` on
  the app's own form posts);
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
- `Strict-Transport-Security: max-age=31536000` over HTTPS only, known when `ORIGIN` is `https`, or
  when the browser sent `Sec-Fetch-Site` to a host that isn't loopback (browsers send it only to
  HTTPS and loopback addresses). Never `includeSubDomains`: other apps may share the domain.

**The content security policy** goes on every page through SvelteKit's `csp` option in
`vite.config.ts`, in nonce mode:
- `script-src 'self'` with the nonce, so only the app's scripts run;
- `style-src 'self' 'unsafe-inline'`: Svelte's transitions and `src/app.html` set inline styles,
  which a nonce can't cover, and styles can't run code;
- `img-src 'self' data:` (obzorarr: `plex-connection` adds Plex's hosts, including the image proxy
  Plex uses for some avatars);
- `font-src 'self'` (DESIGN.md bundles the fonts);
- `connect-src 'self'` (obzorarr: `plex-connection` adds Plex);
- `frame-ancestors 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`.

No page is prerendered (`i18n` already forbids it), so every page gets its own nonce.

**A limit:** adapter-bun serves the built files (scripts, styles, fonts) itself, before `handle`, so
they carry none of these headers. None is a document, so framing and the CSP don't apply to them,
and Bun sends each with its real content type.

## First run

**The setup gate** is a `handle` stage after the language and the headers. Until first run is
complete, every request except the claim, `/healthz` and the built files, which never reach
`handle`, gets a 303 to the current first-run step (sign-in and first run's own helpers join the
exceptions when their modules add them). The gate returns its response, never throws
([SPEC-i18n.md](SPEC-i18n.md#choosing-the-language)), and reads first run's state from memory, which
startup loads and the claim updates (one process, D17).

**The step pointer.** The server keeps one current-step pointer in `settings`. The browser can't skip
ahead: each step's action checks that it is the current step, a step that offers Previous only moves
the pointer back, and only the last step's action completes first run. Every step after the claim
needs the owner's session, which `sign-in` brings. (obzorarr) The step indicator can't be clicked,
the configuration step saves the panels that later modules add in one submission, and the last step
summarises the configuration and the sync status.

**The bootstrap token** (D20):
- 12 random lowercase letters and digits, drawn without bias from WebCrypto, shown as
  `xxxx-xxxx-xxxx`;
- held only in memory: never logged, stored or put in a response;
- printed to standard output at startup with the path `/setup`, and the full address when `ORIGIN`
  is set (the server doesn't otherwise know its address);
- valid for 15 minutes, after which a new one is printed; a timer that shutdown stops;
- entered with or without the dashes, in any case, with spaces around it trimmed, and compared in
  constant time;
- once the instance is claimed, none is printed again.

**The claim** is `/setup`, the first step, and a POST form action:
- **It needs** a valid bootstrap token, a username and a password (rules below). One error for a
  wrong or expired token: "That setup token isn't valid. Use the newest one printed in the server
  console." Field errors keep what was typed except the token and password.
- **Atomic:** the token is checked and used up with no `await` between them, then the owner is
  created and the step pointer moved in one transaction, whose insert fails if an owner exists.
  If that transaction fails, a new token is printed.
- **It stores no address,** and nothing but the owner row and the pointer.
- **After it,** the claim no longer exists: `/setup` answers "not found" once first run is complete
  (D20), and the claim action answers it whenever the instance is claimed.

**Owner credentials:**
- **Username:** trimmed and normalised to Unicode NFC, 1–64 characters, no control characters.
  Stored as entered and matched without regard to case.
- **Password:** 15–128 characters (Unicode code points after NFC), any characters, no composition
  rules, and not containing the app's name or, when it has 4 or more characters, the username.
  15 is NIST SP 800-63B-4's minimum for a password that is the only factor, which it is until
  two-factor is turned on. A common-password list isn't checked: nearly every entry on one is
  shorter than 15.
- **Hashing:** `Bun.password` with argon2id and Bun's defaults, in `security/password.ts`, which
  `sign-in` uses to verify. The password is never logged or returned.
- The form has one password field with a control that shows what was typed (DESIGN.md), and no
  confirmation field.

**Trust:** anyone who can read the server console can claim a fresh install.

## Before `sign-in`

`setup` is built before `sign-in`, which brings protections the claim relies on. Until then:
- **Cross-origin:** SvelteKit's own form check stays on and guards the claim; `sign-in` replaces it
  with its own check.
- **Rate limits:** none. The token has 62 bits and lasts 15 minutes, so guessing it isn't practical;
  `sign-in` adds the claim's limit (5 per 5 minutes in obzorarr).
- **The browser's address and cookies:** the claim sets no cookie yet, so it needs neither. Once
  `sign-in` starts the owner's session at the claim, the claim needs the browser's address, and the
  session follows `sign-in`'s cookies.
- **First run ends at the claim,** its only step: the claim completes first run and sends the browser
  to `/`. `sign-in` signs the new owner in at the claim, and `two-factor` adds the first step after
  it, from which on the claim no longer completes first run.

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
  applies it to a new database and, on a second start, finds nothing to apply.
- **Type checking:** `check` passes with the schema, client and operations.
- **The production build:** `bun ./build` opens the database through Turso's native binding on
  Linux x64 and arm64. If the binding can't be bundled, the platform's package ships beside the
  build, and SPEC.md's "`bun ./build` needs no `node_modules`" says so.
- **Rollback isolation** (D5): a transaction that rolls back leaves a concurrent, unrelated write on
  the same connection in place.
- **No Node:** all of it with no `node`, `npm` or `npx` on `PATH`.

## Project structure

```text
src/env.ts                                 + OBZORARR_DATABASE_PATH, ORIGIN, OBZORARR_LOG_DEBUG
src/hooks.server.ts                        init: startup; handle: language, headers, setup gate
src/lib/server/config/database-path.ts     the database file's path
src/lib/server/config/origin.ts            ORIGIN, parsed and checked
src/lib/server/config/log-debug.ts         OBZORARR_LOG_DEBUG
src/lib/server/db/client.ts                opens the database
src/lib/server/db/migrate.ts               applies the bundled migrations
src/lib/server/db/settings.ts              the settings table and its operations
src/lib/server/db/owner.ts                 the owner table and its operations
src/lib/server/logging/logger.ts           levels, entries, standard output, the sink
src/lib/server/logging/redact.ts           the redaction rules
src/lib/server/security/bootstrap-token.ts the token: drawing, formatting, comparing, expiry
src/lib/server/security/headers.ts         the security headers for a request
src/lib/server/security/password.ts        hashing and verifying
src/lib/server/services/setup/startup.ts   the startup steps and shutdown
src/lib/server/services/setup/first-run.ts the steps, the pointer and the gate's decision
src/lib/server/services/setup/claim.ts     the claim and the credential rules
src/routes/setup/+page.svelte              the claim form
src/routes/setup/+page.server.ts           its load and the claim action
drizzle/                                   the reviewed migrations
drizzle.config.ts
tests/e2e/setup.test.ts                    first run against the built server
tests/e2e/global-setup.ts                  starts the built server and claims it for the other tests
```

The build also changes `package.json` (the three packages and `db:generate`), `vite.config.ts`
(the CSP), `playwright.config.ts` (the global setup, a temporary database per run), `messages/`
(the claim page's text, `setup_…`), the README (the variables and first run) and `.gitignore`
(already ignores `/data/` and `*.db*`).

The claim page follows its brief, [`route-setup.md`](../.impeccable/surfaces/route-setup.md),
and shows the language switcher.

## Testing strategy

- **Unit (Vitest, `node`):** each `config/` reader; the redaction rules, one case each and nested;
  the headers for HTTPS, plain HTTP, loopback and `ORIGIN`; the token's format, alphabet, expiry and
  comparison; the credential rules at their limits; and, against a temporary database file,
  migrations on a new database, the claim (success, a wrong and an expired token, a second claim,
  two at once leaving one owner, a failed transaction printing a new token) and the gate's decision
  for each path.
- **e2e (Playwright, against the built server):** the global setup starts it with a generated key and
  a temporary database, reads the token from its output and claims the instance, so the smoke and
  language tests run on a claimed instance as before. `setup.test.ts` starts its own fresh servers
  and checks that:
  - every page sends a fresh instance to `/setup`, and `/healthz` still answers `ok`;
  - a wrong token is refused, the right one claims, and `/setup` then answers 404;
  - the headers are on a page, `/healthz`, a 404 and the gate's redirect, and HSTS isn't, over
    plain HTTP;
  - the page's scripts carry the CSP nonce and the browser reports no CSP violation;
  - the server refuses to start with a malformed `ORIGIN` or an unwritable database folder, without
    echoing either value;
  - `SIGHUP` and `SIGTERM` each shut it down with exit code 0;
  - the token never appears in a response or a log entry.

## Commands

The ground floor's ([docs/SPEC.md](SPEC.md#commands)), plus `bun run --bun db:generate`
(Drizzle Kit generates a migration from the schema). `smoke` also runs `setup.test.ts`.

## Boundaries

- **Always:** startup finishes before the first request; reviewed migrations; named database
  operations and short transactions (D6); redaction before writing; the token only in memory and on
  the console; refusals in `handle` returned, never thrown.
- **Ask first:** any dependency beyond the three packages; another database engine; a logging
  library; a second owner or any role (D20).
- **Never:** a token or password in a log, response or the database (only the hash); a stored
  address; a way to skip a first-run step; a claim after first run; `includeSubDomains`.

## Docs this module changes when built

- **`docs/SPEC.md`:** the status line and row 4 (built); the tech-stack table (Turso and Drizzle);
  the `db:generate` and `smoke` command rows; the testing section; "Open decisions": the `setup`
  line goes, and `sign-in`'s password-rules line keeps only the slowing of failed sign-ins;
  ground-floor choice 3 closes.
- **`docs/decisions.md`:** D15 moves to Decided with the validated pair; D14 keeps only the job
  half.
- **README:** the variables above and first run (the token in the console).
- **AGENTS.md:** the status and the structure tree.

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke` and `ci-ok` pass.
2. A fresh built server prints a token, sends every page to `/setup`, and is claimed once; then the
   placeholder `/` serves as before, with the headers and CSP.
3. D15's validation has passed, with its evidence in the build PR's body.
4. The docs listed above say what was built.
