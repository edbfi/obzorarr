# Decisions

Each entry is a decision and why it was made. Open entries keep their number when they're settled.
The stack entries come from the shared rewrite recipe used by all five edbfi apps, cut down to what
applies to obzorarr. Versions live in `package.json` and `bun.lock`.

## Decided

### D1. SvelteKit on one origin

Svelte 5 and SvelteKit 3, with TypeScript for browser and server code. SvelteKit serves pages, form
actions, API endpoints and assets on one origin, with server rendering on and interactive components
in the browser. Backend work happens in server routes, server `load` functions and form actions,
which call application services.

Why: one framework and one origin for every surface (landing, member area, recaps and the owner's
admin panel) keeps sessions, origin checks and deployment simple, and it's the recipe all five apps
share.

### D2. TypeScript 6, strict

The latest stable TypeScript 6.x at bootstrap, locked; no prereleases, and major upgrades wait until
the Svelte tooling supports them. Strict type checking, run explicitly (the `check` script): running
TypeScript under Bun doesn't type-check it. External input is validated at runtime.

Why: [SvelteKit 3 requires TypeScript 6](https://svelte.dev/docs/kit/migrating-to-sveltekit-3#Updated-dependencies).

### D3. Bun everywhere, no Node

Bun is the runtime and package manager in development, CI and production. Tools run with `--bun`
(`bun run --bun`, `bunx --bun`) so their Node shebangs don't apply; no `node`, `npm` or `npx`.
Packages still come from the npm registry. `bun.lock` is committed and CI installs with
`bun install --frozen-lockfile`.

Why: one runtime for every step, and the official Bun adapter needs it.

### D4. One container, one process, one port

[`@sveltejs/adapter-bun`](https://svelte.dev/docs/kit/adapter-bun) builds a Bun server. obzorarr
runs as one application process with one HTTP port in one container; container packaging lives in
the separate `obzorarr-docker` repository. Secrets are configured separately from the database and
used only in server-only code.

Why: a single self-hosted instance for one owner and tens of viewers doesn't need more, and
in-memory state (rate limits, the live-sync lock, sync progress) can assume one process (see D17).

### D5. Embedded Turso through Drizzle

The database is embedded Turso (`@tursodatabase/database`) through Drizzle
(`drizzle-orm/tursodatabase/database`), with the database file on a persistent data volume. Drizzle
Kit generates SQL migrations, which are reviewed and committed. Migrations run before the app
accepts requests or starts jobs, with one migration owner per database.

Drizzle must be `1.0.0-rc.5-5935859` (the verified reference, D15) or a later release that keeps its
Turso transaction fix (Drizzle
[`25abe07`](https://github.com/drizzle-team/drizzle-orm/commit/25abe0785e09cb562d999c9b6b8d92d85e3e7053),
using the API from [Turso #7898](https://github.com/tursodatabase/turso/pull/7898)). Never
`1.0.0-rc.4`: it can roll back unrelated writes that share the connection, and upgrading Turso alone
doesn't fix it.

Why: one file on one volume matches the one-process deployment and keeps backup simple; the
rollback-isolation check passed with the fixed adapter and no application-level write queue.

### D6. Transactions and data access

Database access sits behind named operations (insert a page of play history, claim the sync slot).
Application services own the business rules and the transaction boundaries. Every statement in a
transaction goes through the callback's transaction object; transactions stay short, and network
calls happen outside them. No generic layer that promises interchangeable SQL dialects.

Why: Turso transactions use async callbacks, and a statement outside the transaction handle escapes
it. obzorarr targets one engine, so a dialect abstraction would be cost without benefit.

### D7. In-process background jobs

Jobs (scheduled and live sync, enrichment, log retention) belong to application startup and
shutdown, never to page requests. Job state is persisted so work recovers after a restart, runs
never overlap, and retries are safe.

Why: SvelteKit and Drizzle provide none of this lifecycle, and the legacy app needed exactly these
guarantees: one sync at a time, interrupted runs marked failed at boot, and the scheduler's intent
rebuilt from storage after a restart.

### D8. SSRF-safe outbound HTTP

Every outbound call goes through server-side `fetch` with explicit address validation and a redirect
policy.

Why: the Plex address and the AI provider's base URL are admin-supplied, so the server must not
become a proxy to arbitrary hosts.

### D9. Generated HTTP API clients

Typed HTTP API clients come from `@hey-api/openapi-ts`, generated from the app's own OpenAPI
document during the build. Generated files are never edited by hand. Page loads and form actions use
SvelteKit's generated types instead; services call database operations directly.

Why: one typed contract for the JSON endpoints, without hand-written client code drifting from it.

### D10. Panda CSS and Ark UI only

Styling is Panda CSS 2 through its Vite plugin, with build-time transforms on. Accessible primitives
come from Ark UI for Svelte, unstyled and styled with Panda tokens. Design tokens are defined once,
in Panda's configuration, which loads only `@pandacss/preset-base` (utilities and conditions, no
preset palette) and sets `strictTokens`, so a raw value in a component fails type checking. No
second styling tool or primitive library.

Why: one token source and one primitive library keep the design system (DESIGN.md) enforceable.

### D11. Structured logs to standard output

Logs are structured, one entry per line, written to standard output. The library is open (D14).

Why: the container runtime collects stdout; structured lines can be filtered without parsing prose.

### D12. Plex through `@ctrl/plex` behind a provider

obzorarr uses [`@ctrl/plex`](https://github.com/scttcper/plex) wherever it supports the needed
behaviour, and Bun's `fetch` only for missing endpoints or app-specific variations, after checking the
library's implementation. Both sit behind one server-only Plex provider: services call methods such
as `listHistory()`, never build Plex requests. The provider applies consistent timeouts, error
handling and runtime response validation. Each custom method documents the missing library
behaviour beside it and is revisited when the library gains it. The
[official Plex API specification](https://developer.plex.tv/) is the reference for Media Server
operations, and `@hey-api/openapi-ts` may generate types or calls from a pinned copy; there's only
ever one implementation of an operation.

obzorarr's Plex scope is playback history, metadata, sign-in and membership checks. History is read
page by page; server-local account ids are mapped to Plex identities; runtime totals are estimates
of viewing time, not time watched. Membership means the configured server is currently shared with
the account, and the server token must belong to the server's owner; the administrator is the owner
who claimed the instance (D20).

Why: a maintained library covers most operations, and one provider boundary keeps the access rules
(a server share, proven ownership) explicit and testable.

### D20. Shared opening modules and owner sign-in, in the same shape in every app

Every edbfi rewrite app builds five modules before any feature module, in this order: `secrets`,
`i18n`, `setup`, `sign-in`, then `two-factor`. Each app also gets `oidc-sign-in` later. These
modules have the same shape in all five apps, so signing in works the same way everywhere. Each
app keeps its own copy; there is no shared package.

- **One owner.** Each instance has exactly one owner account, with no other roles: no co-admins,
  viewers or operators, and none planned for later.
- **`secrets`.** Secret values are encrypted in the app before they reach the database, with
  AES-256-GCM through WebCrypto, so this works on any database engine:
  - The key is 32 random bytes from an environment variable or a secret file. It is never derived
    from a password, and a missing or malformed key stops the app at startup.
  - Every encryption uses a fresh random 12-byte nonce.
  - Associated data ties each value to its record and field, so a value copied to another row or
    field fails to decrypt.
  - Every stored value carries its key ID, so a value written under another key fails with its
    own error (D26).
- **`i18n`.** The translation groundwork (D21), in place before the first screen.
- **`setup`.** If nobody has claimed the instance yet, the app prints a one-time bootstrap token to
  the console at startup, outside the structured logs (D11). Whoever types that token claims the
  instance and creates the owner account. After that, the claim no longer exists: its page answers
  "not found". `sign-in` adds signing the new owner in at the claim, as `two-factor` adds its offer,
  so the rest of first run, the steps later modules add, happens signed in.
- **`sign-in`.** The owner signs in with the username and password created in `setup`. Sessions
  are server-side, and only a hash of each session token is stored.
- **`two-factor`.** Optional, but strongly recommended: first-run setup offers it right after the
  owner account is created, before any connection step, and the admin shell keeps reminding the
  owner until it is on. It uses authenticator-app codes (TOTP), with
  the secret encrypted by `secrets`, single-use backup codes stored only as hashes, each code
  accepted once and a limit on failed attempts. When it is on, every way of signing in passes
  through it, with one optional exception for OIDC (below).
- **Recovery.** An owner who loses their password, or their authenticator and backup codes, turns on
  a recovery setting in the environment and restarts the app. It then prints a one-time recovery
  token to the console, outside the structured logs, as `setup` does. Typing the token lets the
  owner set a new password; it also turns two-factor off, so they can set it up again, and signs out
  every session. The token expires after 15 minutes (a restart prints a new one), failed attempts
  are limited per address, and once it is used the app prints no new one while the setting stays on,
  and warns at startup that the setting should be cleared. `sign-in` builds it, and `two-factor`
  adds turning itself off.
- **Plex for the owner is an option.** In the apps that use Plex (all of them except comradarr and
  zimuarr), the owner can link their account to their own Plex account in the admin settings once
  setup is done. After that, "Sign in with Plex" also signs them in as the owner. The password
  keeps working, and Plex sign-in for the owner stays off until they link. Where an app has users
  besides the owner, those users sign in with Plex.
- **`oidc-sign-in`.** The owner can also link their account to one OpenID Connect provider, such as
  Authentik, Authelia, Pocket ID or Tinyauth, which then signs them in as the owner. It uses
  discovery and the authorization code flow with PKCE, and keys the link on the provider's issuer
  and subject. As with Plex, linking never creates an owner, and the password keeps working.
  Signing in through a reverse proxy's headers isn't supported.
  - **The provider's own second factor can replace the app's, if the owner chooses.** When the ID
    token's `amr` claim (RFC 8176) reports that the owner used a second factor at the provider,
    such as Authentik's or Authelia's TOTP or a passkey, the app offers to skip its own two-factor
    for OIDC sign-ins. It stays on until the owner accepts. Every OIDC sign-in checks the claim
    again, and one that reports no second factor goes through the app's two-factor. Password and
    Plex sign-ins always do. A provider that doesn't send `amr` never gets the offer.

Each app's connection modules add their own first-run steps after `setup`, such as connecting Plex
here. In obzorarr this replaces the legacy rule that the only administrator is the Plex server's
proven owner (legacy spec "Users, roles and permissions"; owner decision): the administrator is the
owner who claimed the instance. Plex stays the authority for everything else. Connecting Plex is
accepted only when the server token belongs to the server's owner, because identity reconciliation
needs the owner's reads. Members sign in with Plex and keep access only while the server is shared
with them. The owner's own recap is that of the Plex account behind the server token (the server's
local account 1), so it needs no Plex link, as otpravkarr's self-subscription does. The server
owner's Plex account signing in through the member flow while unlinked gets a member session, never
the owner's. The three-slide recap spike (D19) runs right after `i18n`: it is a design spike on demo
fixtures, with no database or sign-in, not a feature module.

Why: the owner wants the five apps to look and work alike, and everything else depends on these
modules: every app stores upstream secrets, shows text that must be translatable, needs a safe first
claim and has to know who its owner is. Encrypting in the app (D4: secrets are configured apart from
the database) keeps stolen database files unreadable without the key. Two-factor and OIDC sign-in
were the owner's call for every app, and so was letting a provider's own second factor stand in for
the app's, optionally; one standard OIDC flow covers the self-hosted identity providers without a
client for each, and `amr` is the standard way to see the provider's factor. Recovery was the
owner's call for every app too, after comradarr's legacy recovery mode showed that the opening had
no way back in. A copy per app is enough for five apps and avoids building a shared package before
it's needed (YAGNI). Keeping Plex as the authority for members keeps obzorarr's privacy model, while
the owner model matches the other four apps.

### D21. Every interface is translatable, in English and Danish

Every edbfi app is built for translation from its first screen. No user-facing text is written into
components or services: it comes from message files, one per language. English is the source
language and the default, and Danish is the second language. Each request uses the viewer's own
choice, then the browser's preferred languages, then English. Dates, times and numbers are formatted
for the viewer's locale through `Intl`, never in a fixed format. The message files use a format
Weblate reads, plurals included, so a Weblate project can be connected later without changing code.
Connecting Weblate is later work and belongs to no module yet. Text the owner writes, such as
custom slides, is content and isn't translated through the message files. Fun-fact templates are
messages too, and AI fun facts are requested in the viewer's language.

Why: the owner wants full translation support in every app, with Weblate as the translation tool,
and English and Danish now. Adding translation afterwards touches every screen; building it in from
the first one costs little. This fixes legacy spec weakness 18 (English only, no localisation
layer).

### D22. Paraglide JS with i18next JSON v4 messages

Translation (D21) uses Paraglide JS 2 (`@inlang/paraglide-js`) through its Vite plugin, SvelteKit's
official i18n integration. Messages live in `messages/en.json` and `messages/da.json` in i18next
JSON v4, through `@inlang/plugin-i18next` 6.2.0 or later (which fixed its plural handling), with
plurals under CLDR suffixes. Weblate reads that format as "i18next JSON v4" (`i18nextv4`),
monolingual, with `messages/en.json` as the base file.

- Components and services call the typed message functions Paraglide compiles, so a missing
  message is a type error. The compiled output is generated and gitignored.
- On the server, `paraglideMiddleware` in `hooks.server.ts` picks each request's language (the
  viewer's cookie, then the browser's preferred languages, then English) and keeps it in
  AsyncLocalStorage, so concurrent requests can't mix languages. Under SvelteKit 3 it passes the
  translated request on a copy of the event, because `event.request` is read-only.
- Dates, times and numbers stay with `Intl` (D21).

Still to validate in the `i18n` module: the pinned versions with SvelteKit 3, TypeScript 6 and Bun;
building and serving through adapter-bun (Paraglide issue
[#725](https://github.com/opral/paraglide-js/issues/725) reports the middleware returning nothing in
builds that use instrumentation); and a Weblate round trip of a plural message.

Why: it is the integration SvelteKit itself points to. Compiled, tree-shaken message functions add
almost nothing to the bundle and are checked by strict TypeScript. A language per request through
AsyncLocalStorage is safe for server rendering. i18next JSON v4 is a native Weblate format with
correct plurals for English and Danish. gettext PO (through wuchale or Lingui) would also carry
notes for translators, which i18next JSON v4 can't, but those integrations are younger and keep the
language in stores, which need care when the server renders concurrent requests; svelte-i18n
resolves messages at runtime, without typed messages. The owner left the choice to the agents.

### D23. Watch time is the runtime of what was played

Every time total (hours and minutes, binge length, marathon day, the top-viewers leaderboard, the
percentile and fun facts) is the sum of the full runtimes of the items played, as in the legacy app.
An abandoned play counts in full. A play without a known runtime still counts as a play but adds no
time, and the recap says when runtimes are missing. Every place that shows a total says what it
measures, such as "hours of everything you played", never "hours watched". Watched time and runtime
are never mixed in one total.

The Plex library audit (D18) checks whether Plex's history reports a watched duration or view offset
for each play, and what it means for finished, abandoned and resumed plays. If it does, a later spec
may switch every total to it at once, with the label changing too.

Why: Plex's history carries no verified watched time (D12). A total that was watched time for some
plays and runtime for others couldn't be labelled truthfully, and would make viewers, years and the
leaderboard incomparable (PRODUCT.md, principle 3). An honest label answers legacy spec weakness 2.
The owner took the agents' recommendation, which two independent reviews agreed with.

### D24. Statistics use the instance's time zone

Calendar years and every daily bucket (hour, weekday, month, marathon day, streak, binge date) are
computed on the server in one instance time zone: the environment's zone if it names a valid IANA
zone, else the owner's setting, else UTC, the same resolution the sync schedule uses (legacy spec
"Scheduling"). Recaps name the zone, such as "Times in Europe/Copenhagen". A first-run step asks
for the zone, suggesting the browser's, so no install falls back to UTC unnoticed. Changing the zone
invalidates the cached statistics of every year, because year boundaries move. Stored timestamps and
the sync watermark stay in UTC. Formatting still follows each viewer's locale through `Intl` (D21),
with the instance zone passed explicitly.

Why: recaps are shared and cached, so one zone gives every viewer the same recap, which the
determinism requirement needs (legacy spec "Statistics engine"). A household or friends-and-family
server lives mostly in one zone, and the setting already exists for the schedule. A zone per member
can come later without changing the engine. This fixes legacy spec weakness 1 (everything in UTC).
The owner took the agents' recommendation, which two independent reviews agreed with.

### D25. Other software: the latest stable release only

Each edbfi app works with the latest stable release of every service it talks to, and with nothing
older. Its contract tests run against that release; when a new stable release ships, the tests and
the app move to it in the app's next release, and support for the one before goes. The app adds no
code for older versions and no workarounds for upstream bugs that a later release may fix: a bug
that harms users is reported upstream and named in the app's docs. A service on any other version
(older, newer than the one tested, a prerelease, or a version the app can't read) keeps working, and
the app tells the owner plainly which version it is tested with, in setup and on the owner's own
status screens; the public health endpoint never shows a version. Responses are still validated, so
a real difference in the API shows up as an error, not as wrong data.

In obzorarr the service is Plex Media Server, held to its latest public release. Plex's account
service has no version to check. The warning shows where the server is connected (`plex-connection`)
and on `/admin` (`overview`).

Why: the owner doesn't want a backlog of backwards compatibility in any app (owner decision). Code
for old versions and for upstream bugs is seldom removed once it's in, and each workaround outlives
the upstream fix as code to maintain. Warning instead of refusing keeps users who update a week
late working.

### D26. The master key: its format, its checks, and when it's required

`secrets` (D20) takes one master key, exactly 32 bytes in canonical standard base64, from
`OBZORARR_SECRET_KEY` or `OBZORARR_SECRET_KEY_FILE`; setting both is an error. Startup refuses a key
whose bytes have at most 4.0 bits of Shannon entropy per byte, step by one constant amount, or are
all printable ASCII; there is no denylist. The key is imported only as HKDF input, and each use
derives its own key under its own label: the AES-256-GCM key and a 16-byte key ID. A stored value is
one text value, `v1.<key id>.<nonce>.<ciphertext and tag>`, with `NULL` for none, and decrypts only
under the table, field, row and app it was written for. The `Secret` wrapper keeps plaintext out of
logs, errors and JSON, and `reveal()` is the only way to read it. There is no rotation: the key ID
D20 asks for makes a value written under another key fail with its own clear error, and a new key
means entering the stored secrets again. `secrets` checks the key in SvelteKit's `init` hook from
its first version, so every way of running the app, dev and CI included, needs one. The key is
restored with the database file (D16). The details are in [SPEC-secrets.md](SPEC-secrets.md). The
design is the same in all five edbfi apps; only the variable prefix, the app name and the stored
secrets differ.

Why: the shared opening keeps `secrets` the same in every app (D20), and comradarr settled its
design first, with safety first (owner decision, after a council of three models and a review). Each
check catches a real mistake (a padded or doubled short secret, a counter, a passphrase), and
together they refuse a random key about once in 62 billion. A denylist adds upkeep without safety
once no key is ever written in the repo. One encoding and an error when both variables are set leave
nothing ambiguous at startup. HKDF keeps the master key out of every primitive but one, so later
uses can derive their own keys safely. One self-describing column can't come apart. The wrapper
joins every app, not only comradarr (owner decision). Rotation is left out because the apps are
rewritten from scratch with no stored data to carry over, and a key change is rare enough to handle
by entering a few secrets again (owner decision). Checking the key from the first version makes it
part of installing obzorarr from the start, rather than a surprise when a later module first stores
a secret.

## Open

### D13. Producing the OpenAPI document

How the OpenAPI document is generated from SvelteKit endpoints isn't chosen. The generator must be
validated with the pinned TypeScript 6 and Bun versions. Closes when the first JSON endpoint needs a
generated client.

### D14. Logging library and job lifecycle

The logging library (D11) and the concrete job lifecycle implementation (D7) aren't chosen. Close
before the first background job lands.

### D15. Turso and Drizzle versions

The exact Drizzle ORM and Drizzle Kit pair for Turso is still to be validated in the app: migrations,
type checking, production builds and rollback isolation (D5). Only a focused rollback-isolation check
has passed (Drizzle `1.0.0-rc.5-5935859` with Turso `0.8.3` and `0.9.0-pre.1`). Closes with the first
database module.

### D16. Runtime validation gaps

Not yet validated for this stack: browser interaction with a real component, production containers,
realistic load, and job recovery after a restart. Hydration is validated: the e2e smoke test waits
for the hydrated app in Chromium against the built server, with no console errors.
A crash test doesn't prove recovery from power loss or storage faults. The Turso backup and restore
procedure is still to be defined and tested; the master key is restored with the database file
(D26). Each closes with the work that first depends on it.

### D17. One process

The deployment assumes one application process per database. Horizontal scaling and job
coordination across processes would need a new design. Stays open as an accepted limit.

### D18. Plex library audit

The Plex operations obzorarr needs (D12) still have to be audited against a pinned `@ctrl/plex`
version, checked for Bun and TypeScript 6 compatibility, and tested for request payloads and
response parsing, including history pagination, the local-account mapping, and whether history
reports a watched duration or view offset for each play and what it means (D23). Sign-in and the
membership checks must be verified against Plex before they replace a working flow. Closes with the
Plex provider.

### D19. The animated recap

The animated recap is the surface most likely to need custom work beyond Panda CSS and Ark UI. Three
slides are built as a spike before its design is committed. Closes with that spike, which runs right
after `i18n` (D20).
