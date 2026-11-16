# Spec: obzorarr

**Status:** the ground floor (skeleton) is specified here, approved by the orchestrator
(2026-10-18) and built. The capability map below is approved; module 1, `secrets`
([SPEC-secrets.md](SPEC-secrets.md)), and module 2, `i18n` ([SPEC-i18n.md](SPEC-i18n.md)), are
built, module 3, `recap-spike` ([SPEC-recap-spike.md](SPEC-recap-spike.md)), ran and closed D19
with the owner's verdict, module 4, `setup` ([SPEC-setup.md](SPEC-setup.md)), is built, and module
5, `sign-in` ([SPEC-sign-in.md](SPEC-sign-in.md)), is approved.

## Objective

obzorarr is a private year in review for a Plex Media Server: it reads the server's play history and
gives each member a personal recap, plus a server-wide recap, as an animated story, with an admin
panel for the server's owner ([PRODUCT.md](../PRODUCT.md)).

**This spec covers only the ground floor:** an empty, production-shaped SvelteKit app that builds,
type-checks, tests, lints and serves on Bun, styled from the design tokens, with the edbfi Bun web
CI around it. It has no database, authentication, Plex, sync, recap or any other product feature. Its
job is to make the first module spec cheap to build: every later PR adds behaviour, not plumbing.

## Capability map

**Status:** approved by the owner (2026-10-24; shared rows aligned 2026-10-30; rows 5, 6, 11 and 24
given the one Security tab with `sign-in`'s spec, 2026-11-16). Module ids never change. Each module
gets its own `docs/SPEC-<id>.md`, which the owner approves just before it is built.
Sources: [PRODUCT.md](../PRODUCT.md), [decisions.md](decisions.md), the
[surface briefs](../.impeccable/surfaces/) and the [Module notes](#module-notes) below.

**Every module keeps to [Code structure](../AGENTS.md#code-structure).** Its spec names the files it
adds in that layout, and review checks them. In short:
- The same role folders as every edbfi app. A folder exists only once it holds a real file.
- One purpose per file. No `utils`, `helpers`, `common` or `misc` files.
- Group by domain under the role folders. The folder says where; the file name says what.
- Imports only go downwards. Routes, hooks and jobs stay thin and call services.
- Tests sit next to their source.

**Every module writes its text in English and Danish** through `i18n` (D21): no user-facing text in
components or services, and dates and numbers formatted for the viewer's language.

| # | Module id | Responsibility | Depends on | Surfaces |
|---|---|---|---|---|
| 1 | `secrets` | **Built.** Encrypts stored secrets (the Plex server token, members' Plex tokens in their sessions, the AI key, the artwork signing key, two-factor secrets, the OIDC client secret) before they reach the database (D20, D26), and the secret wrapper that shows only a redaction marker and opens at one named call | — | — |
| 2 | `i18n` | **Built.** The translation groundwork (D21) with Paraglide JS (D22): message files in English and Danish, choosing each request's language, the language switcher, formatting dates and numbers for the viewer's language, and a check that every message exists in both languages | — | the language switcher in each shell |
| 3 | `recap-spike` | **Built.** The three-slide spike (D19): three slides on the demo fixtures in story mode, with motion, reduced motion and translated text, to settle the recap's design before it was committed. It closed D19 with the owner's verdict, and the verdict PR deleted its code, which becomes product code only through `recap`'s spec | `i18n` | none: `/spike/recap` went with the verdict |
| 4 | `setup` | **Built.** Startup checks, database and migrations, settings, structured logging with redaction, security headers and CSP (ground-floor choice 3), `ORIGIN` and the cross-origin check (it asks the browser, stores no address and takes `ORIGIN` as an optional override), the setup gate, the bootstrap token, printed to the console and never through the stored logs, and claiming the instance for its one owner, with the owner's password rules and hashing | `secrets`, `i18n` | first-run setup (brief: `/setup`, the claim) |
| 5 | `sign-in` | Owner sign-in with username and password, signing the new owner in at the claim (D20), sessions, sign-out (POST only), rate limits, app-named cookies that work over plain HTTP at home and behind an HTTPS proxy, password change, error pages, recovery (D20), and the admin shell. obzorarr adds the scanner filter | `setup` | owner sign-in (brief: `/admin/sign-in`); recovery (brief: `/recovery`); the admin shell; `/admin/settings`, which it builds first with the Security tab (brief: `/admin/settings/security`), where the owner changes the password; later modules add their tabs, and their sections to the Security tab |
| 6 | `two-factor` | Optional but strongly recommended (D20): authenticator codes, backup codes and the challenge after every way the owner signs in (except the optional OIDC skip, D20), with replay protection and a limit on failed attempts. Recovery turns it off. Adds the offer to first-run setup, right after the owner account is created and before any connection step, and the reminder in the admin shell while it is off | `sign-in` | the two-factor offer in first-run setup; its section of the Security tab; the reminder in the admin shell |
| 7 | `public-address` | The public-address check, which only diagnoses: comparing the address the browser uses with the `Host` the app receives, `ORIGIN` when set and the forwarded address, classifying the forwarded headers and the source address, suggesting `ORIGIN=<address>` or the proxy line `proxy_set_header Host $http_host`, and the header recipes for common reverse proxies. It never blocks and saves nothing, and its suggestion also shows on the claim and owner sign-in pages, so someone without a session can recover | `sign-in` | its first-run step; a section of the Security tab; its hint on the claim and owner sign-in pages |
| 8 | `plex-connection` | The Plex provider (D12, D18), SSRF-safe outbound HTTP (D8), and connecting the server: picking one of the owner's servers through a one-time Plex sign-in, or a URL and token; sorted connections; plain HTTP only for private hosts by opt-in; test and save; environment locks on settings and the per-group versions that catch a save from a stale tab; accepted only when the token belongs to the server's owner (D20). Changing the URL or token advances the authority epoch | `sign-in` | its first-run step; `/admin/settings/connections` (the Plex form) |
| 9 | `identity` | Identity reconciliation: the all-or-nothing mapping from server-local accounts to Plex accounts, its proof record, the 24-hour freshness and the authority epoch | `plex-connection` | — |
| 10 | `sync` | History sync: the three modes, a watermark that survives empty runs, enrichment with a retry window for failed lookups, the single running slot, claimed atomically by the start itself so a lost race shows at once, cancel, the admin and member progress streams, live sync when a recap opens, and the schedule with pause, resume and the instance time zone (D24), with every start visible and cancellable. Adds the first-run sync and time zone steps | `identity` | its first-run steps; `/admin/sync` (no brief yet); the time zone in the System tab |
| 11 | `plex-sign-in` | Sign in with Plex. For members: PIN sign-in in a popup or by redirect, safe return paths, the membership check against a fresh mapping, revalidation with its grace window, member sessions and sign-out. For the owner: linking their Plex account in the Security tab, after which Plex signs them in as the owner, through two-factor when it is on. Unlinked, the server owner's Plex account gets a member session (D20) | `two-factor`, `identity` | the sign-in flow and its popup page; the Plex section of the Security tab |
| 12 | `stats` | The statistics engine: every calculator with its tie-breaks and determinism, runtime totals (D23), years and buckets in the instance time zone (D24), top movies and top shows grouped by key rather than title, series completion marked unknown when the lookup fails, and the per account-year cache with its invalidation | `sync` | — |
| 13 | `sharing` | Share modes and the privacy floor, user control, slugs and per-year private-link tokens, identifier resolution with the uniform not-found, the names mode with hybrid comparing the same identity, and the member's sharing page | `plex-sign-in` | `/sharing` |
| 14 | `recap` | The Wrapped experience, built on the spike's outcome: the slide catalogue with its empty states, story and scroll modes sharing one position and both ending with the summary, the summary's five layouts and the three motion levels (D19), year navigation, the voice rules, the logo mode, the artwork proxy with signed URLs, and the server recap with top viewers | `recap-spike`, `stats`, `sharing` | `/wrapped/[year]/[id]` (brief: `/wrapped/2025/me`); the server recap (no brief yet) |
| 15 | `member-dashboard` | The member overview: the personal and server recap cards, the year picker and the monthly chart | `recap` | `/dashboard` |
| 16 | `landing` | The landing page with Plex sign-in, and the optional public username lookup (off by default) with its rate limit and uniform not-found | `recap` | `/` |
| 17 | `privacy-settings` | The privacy presets, the saved and after-saving exposure previews in the same wording onboarding uses, the individual settings and applying defaults to existing users. Adds its panel to first-run configuration | `sharing` | `/admin/settings/privacy` |
| 18 | `slides-admin` | Ordering and enabling built-in slides with keyboard controls, custom slides with checked markup and an optional year, and the summary's layout. Adds its panel to first-run configuration | `recap` | `/admin/slides` |
| 19 | `fun-facts` | Template fun facts as translated, plural-aware messages, and the optional AI text provider (key, https base URL, model, persona, connection test), asked in the viewer's language with templates as the fallback; placement and frequency. Adds its panel to first-run configuration | `recap` | the fun-fact control on `/admin/slides`; the AI form on `/admin/settings/connections` |
| 20 | `appearance` | The interface and Wrapped theme settings, the logo mode and the recap's motion level. It decides whether more presets than After Hours return (ground-floor choice 4). Adds its panel to first-run configuration | `recap` | the appearance rail on `/admin/settings/connections` |
| 21 | `users-admin` | The per-year users table: watch time, effective share mode, the per-user control toggle and each recap's link. No delete, ban or roles | `sharing`, `stats` | `/admin/users` (no brief yet) |
| 22 | `logs` | Stored log entries, the logs page with filters that match on the server, the live view, export, the retention job and the log settings | `sign-in` | `/admin/logs` (no brief yet); the log settings in the System tab |
| 23 | `data-admin` | Clearing cached statistics and play history per year or wholesale, offering to reset the watermark, and the instance reset, which returns to the claim with a new token | `sync`, `stats` | the Data tab of `/admin/settings` (no brief yet) |
| 24 | `oidc-sign-in` | Connecting one OpenID Connect provider (Authentik, Authelia, Pocket ID, Tinyauth and others) by its issuer, client id and secret, and linking the owner's account to it, after which it signs them in as the owner, and offering to skip `two-factor` when the provider's `amr` claim reports its own second factor (D20) | `two-factor` | its section of the Security tab; its button on owner sign-in |
| 25 | `overview` | The owner dashboard and the Wrapped hub: viewers, hours, plays and records for a year, the sync card, the yearly activity chart, the owner's own recap (only when it has plays) and the server recap, and quick links | `sync`, `stats`, `recap` | `/admin`; the Wrapped hub (no brief yet) |

Build order: `secrets` → `i18n` → `recap-spike` → `setup` → `sign-in` → `two-factor` →
`public-address`, `plex-connection` → `identity` → `sync` → `plex-sign-in`, `stats` → `sharing` →
`recap` → `member-dashboard`, `landing`, `privacy-settings`, `slides-admin`, `fun-facts`,
`appearance`, `users-admin`, `logs`, `data-admin`, `oidc-sign-in` → `overview`. A comma means
either order works. The shared opening (D20) runs in its usual order, with the recap spike right
after `i18n`, so the riskiest design is settled early and its text is translated from the start.
`recap` is the first time a member gets something they can use.

First-run setup grows step by step: `setup` claims the instance and creates the owner account,
`two-factor` offers itself, `public-address` checks the address, `plex-connection` connects Plex,
`sync` asks for the time zone and runs the first sync, and `privacy-settings`, `slides-admin`,
`fun-facts` and `appearance` each add their panel to the configuration step.

### Where modules live

Paths are under `src/lib/server/`, except those starting with `routes/` (under `src/`) or `lib/`
(under `src/`), the hooks (`src/hooks.server.ts`, `src/hooks.client.ts`), and `messages/` and
`project.inlang/` (the repo root). They follow the
[Code structure](../AGENTS.md#code-structure) layout:

| Module | Main homes |
|---|---|
| `secrets` | `security/secrets/` (key checks, keyring, cipher, `Secret`), `config/secret-key.ts`, `src/env.ts` and the `init` hook in `hooks.server.ts` |
| `i18n` | `messages/en.json` and `messages/da.json`, `project.inlang/` (the inlang project and Paraglide's options), `lib/shared/i18n/` (formatting and the message check), `lib/components/layout/LanguageSwitcher.svelte`; the language handle in `hooks.server.ts`, and `hooks.client.ts` |
| `setup` | `db/` (client, migrations, settings and owner schema), `config/`, `logging/` (with redaction), `services/setup/`, `security/bootstrap-token.ts`, `security/headers.ts`, `security/password.ts`, `security/cross-origin.ts`, `vite.config.ts` (SvelteKit's own form check off, the CSP); `routes/setup/`, and the cross-origin check, the setup gate and the headers in `hooks.server.ts` |
| `sign-in` | `services/sign-in/` (sessions, signing in, the password change, recovery), `db/owner-session.ts`, `config/recovery.ts`, `security/` (the session token and cookie, the browser's and client's addresses, the in-memory rate limits, failed sign-ins, the return path, the refusal pages, the scanner filter); the sign-in at the claim in `routes/setup/`, `routes/recovery/`, `routes/(admin)/admin/` (the sign-in and sign-out routes, the shell's layout and `settings/security/`), `routes/+error.svelte`, `lib/components/layout/` (the shell) and `lib/components/credentials/` (the credential fields the claim shares) |
| `two-factor` | `services/two-factor/`, the owner schema's two-factor fields in `db/`; the offer in `routes/setup/`, the challenge page beside the sign-in page, its section of the Security tab, and the reminder in `lib/components/layout/` |
| `public-address` | `services/public-address/`; its first-run step, its section of the Security tab and its hint on the claim and owner sign-in pages |
| `plex-connection` | `providers/plex/`, `http/`, `services/connections/plex.ts`, `services/settings/` (environment locks and settings versions); `routes/(admin)/admin/settings/connections/` |
| `identity` | `services/identity/`, `db/` account-mapping schema |
| `sync` | `services/sync/`, `jobs/sync.ts`, `db/` history, metadata and sync-run schema; `routes/(admin)/admin/sync/`, the progress streams under `routes/api/` |
| `plex-sign-in` | `services/plex-sign-in/`, `db/` member-session and sign-in-attempt schema; the sign-in routes under `routes/(public)/` |
| `stats` | `services/stats/`, `db/` statistics-cache schema |
| `sharing` | `services/sharing/`, `db/` share-settings schema; `routes/(app)/sharing/` |
| `recap` | `services/recap/`, `services/artwork/`, `lib/shared/recap/` (the layout names, the motion levels and their checks), `lib/components/recap/` (the story shell, `slides/`, and `summary/` with the summary's layouts in `summary/layouts/`); the recap routes and the artwork route |
| `member-dashboard` | `routes/(app)/dashboard/` (uses `recap` and `stats`) |
| `landing` | `services/lookup/`; `routes/(public)/` |
| `privacy-settings` | `routes/(admin)/admin/settings/privacy/` (uses `sharing`) |
| `slides-admin` | `services/slides/`, `db/` slide schema; `routes/(admin)/admin/slides/` |
| `fun-facts` | `services/fun-facts/`, `providers/ai/` |
| `appearance` | `services/appearance/` |
| `users-admin` | `routes/(admin)/admin/users/` (uses `sharing` and `stats`) |
| `logs` | `services/logs/` (stores entries through a sink that `logging/` exposes, because `logging/` can't import `db/`), `db/` log schema, `jobs/log-retention.ts`; `routes/(admin)/admin/logs/` |
| `data-admin` | `services/data/`; the Data tab under `routes/(admin)/admin/settings/` |
| `oidc-sign-in` | `services/sign-in/oidc.ts`, the provider settings and the owner's link in `db/`; its callback route beside the sign-in page |
| `overview` | `services/overview/`; `routes/(admin)/admin/` and the Wrapped hub |

### Open decisions each module closes

- `sync` closes D14, the job lifecycle, with the first background job: `sign-in` has none
  ([SPEC-sign-in.md](SPEC-sign-in.md#sessions)).
- `plex-connection`: D18, including the watched-time question (D23) and the history and mapping
  checks that `identity` and `sync` rely on.
- D13: the first JSON endpoint called from the browser (`sync`'s progress stream or
  `plex-sign-in`'s polling) decides whether it needs a generated client. D17 stays open as an
  accepted limit.

### Left out on purpose

- Any role beyond the one owner, and the Plex-proven administrator (owner decision, D20).
- Signing in through a reverse proxy's headers (D20): `oidc-sign-in` covers the same identity
  providers.
- Connecting Weblate (D21): later work, outside this map. The message files are ready for it.
- Watched time instead of runtime, until the Plex audit shows the data exists (D23), and a time
  zone per member (D24).
- The legacy app's development-only sign-in bypass: development tooling, not product.
- Live now-playing, media playback and anything written to Plex (PRODUCT.md, principle 4).
- **The container image's first start** (deferred: a note, not a design). It is specified and
  built only when Obzorarr is first tested through its image (`edbfi/obzorarr-docker`); building
  images through GitHub, including the nightly build of `main`, is a later goal. The intent, with
  the app's code unchanged: when `OBZORARR_SECRET_KEY` and `OBZORARR_SECRET_KEY_FILE` are both unset
  or empty, the image's setup script points `OBZORARR_SECRET_KEY_FILE` at `/config/secret.key`
  whenever that file exists. It creates the file first (a random 32-byte key in standard base64,
  written atomically, mode 0600, owned by the app's user) only when `/config/data` is empty and
  nothing shows an older install (such as the previous app's secret or database variables; the
  image's own defaults don't count, and the exact checks are decided with the image); otherwise it
  creates nothing, and the app stops with its own key error. An operator's own key or secret file
  always wins, and the README tells the operator to keep a copy of the key file. Nothing the v0.1.x
  images left is ever used as a key; how such an install upgrades is decided with the image.

### Surfaces with no brief yet

First-run setup's steps after the claim, the server recap, the Wrapped hub, `/admin/sync`,
`/admin/users`, `/admin/logs` and the Data and System tabs of `/admin/settings` are needed (the
capability map, the Module notes or PRODUCT.md's admin shell describe them) but have no brief. The
landing brief's signed-out navigation has only Obzorarr, Help and the language switcher, so it needs
a way to owner sign-in. Each gets its brief before its module is specced.

### Module notes

What a capability-map row commits to in more detail than a clause fits, carried over from the legacy
app and adapted to the decisions. It is behaviour to keep unless the module's approved spec or a
decision changes it. Layout, placement, visuals and exact wording are not behaviour: where a note
describes them, DESIGN.md and the surface's brief win, and for a surface with no brief yet the note
is only a starting point for that brief. Each block moves into its module's `SPEC-<id>.md` when that
module is specced (`setup`'s is in [SPEC-setup.md](SPEC-setup.md), `sign-in`'s in
[SPEC-sign-in.md](SPEC-sign-in.md), which also lists every rate limit once). Decision numbers in
these blocks are obzorarr's.

#### public-address

- **The check** only diagnoses: it runs by itself, never blocks and saves nothing. It compares the
  address the browser uses, the `Host` header the app receives, `ORIGIN` when it is set, and the
  address a proxy forwards (last hop only). It classifies the forwarded headers (usable, missing,
  partial, invalid) and the source address (loopback, private LAN, container range, overlay
  network, public, unknown).
- **Outcomes:** already matches (success); the proxy rewrites `Host`, so add
  `proxy_set_header Host $http_host` to it (not `$host`, which drops a non-default port) or set
  `ORIGIN=<the shown address>` and restart (warning); `ORIGIN` names another address, so open the
  app there, or fix or remove `ORIGIN` and restart (warning); or the check couldn't finish
  (danger), saying that this doesn't prove a misconfiguration, with a way to run it again.
- **Without a session:** it provides the address hint on the claim and owner sign-in pages
  (`sign-in`).
- **Details** show the evidence, note that `ORIGIN` needs no forwarding headers, and give copyable
  header recipes for the common reverse proxies. In the Security tab only a manual rerun shows a
  toast.

#### plex-connection

- **Requests** send the Plex token in a header, never in the query string, with Plex's client
  identification headers. Everything is pulled or polled.
- **Picking a server:** the one-time Plex sign-in opens in a popup by default, or in the same tab on
  request or when the popup is blocked, and creates no session (D20). Only servers the account owns
  are listed. Expanding one shows its connections sorted secure direct, remote, local, relay; local
  `plex.direct` addresses are hidden, and a public `plex.direct` address is synthesised when none is
  advertised. Choosing a connection tests and saves it in one step. A custom URL (such as Plex
  behind a reverse proxy) is tested, then saved. Plain HTTP is allowed only for private or local
  hosts, with an explicit opt-in.
- **From the environment:** when the URL and token come from the environment, a locked card shows
  the server's name with the URL masked and checks it live, and setup continues only when the
  token belongs to the server's owner (D20).
- **The settings form:** the token shows only that one is stored, with a blank field to replace it
  (DESIGN.md). A test reuses the stored token only while the URL still matches the stored one, so a
  test never sends a saved secret to a newly typed address.
- **Errors:** a Plex error reaches the user only as a fixed phrase ("Authentication failed. Check
  the access token.", "This does not appear to be a Plex Media Server", "Connection timed out…").
  A connection test caps the whole request, parsing included, at about 10 seconds. History that
  fails validation fails the sync; a metadata failure never does; an incomplete identity source
  keeps the previous mapping (`identity`); a transient membership-check failure gets a grace window
  (`plex-sign-in`).
- **Matching a URL to the server,** after a live identity check: a `plex.direct` host name (the
  machine id in it, then its IP address and port), the plain host and port, the public address,
  then the normalised origin, in that order.
- **Changing the URL or token** advances the authority epoch at the next startup and invalidates
  the stored machine id and identity proof, so the next sync proves every identity again. This
  module adds a README line telling the owner to back up the database before changing either.
- **Environment locks** (moved from `setup`; obzorarr is the reference for the apps that adopt them,
  which port them from here). A setting the environment supplies wins: its field is read-only and
  says that the deployment's configuration owns the value. A submitted locked field is left
  unchanged, with "Some fields are controlled by environment variables and were not changed." A
  stored value the environment shadows is deleted at startup. A placeholder from the sample
  configuration (such as a literal "your token here", or the default local Plex address without a
  real token) counts as unset.
- **Settings versions** (moved from `setup`). Every settings form carries its key group's version,
  the group's last update time in milliseconds. A save with a missing, blank or older version is
  refused as a conflict, "Settings changed in another tab. Reload and try again.", with a reload
  action, and nothing reports success. Each write moves the version strictly forward, even after
  the clock is corrected, and returns the version it wrote, so two saves in a row from one page
  both succeed. Groups are narrow (server-recap privacy, user defaults, public lookup, each
  appearance field, the time zone, log settings, connections), so saving one form never conflicts
  with another. Clearing a connection value moves its group's version too, so a stale tab can't
  bring back a cleared secret.
- **Settings URLs:** upstream base URLs may not hold credentials, a query or a fragment.
- **In logs** (moved from `setup`), Plex host names, server names and machine ids appear only as
  short fingerprints with a coarse category (`plex.direct`, localhost, private IP, container range,
  public domain, public IP, invalid).

#### identity

- **Sources:** the owner's identity, the accepted shares for this exact machine (none deleted or
  left, consistent invitation ids, no duplicates, and any pagination evidence describing the whole
  list exactly), the server's local accounts, and proof that the owner owns the server. All or
  nothing: if any source is partial, or any shared user can't be matched to a local account, the
  previous mapping is kept rather than guessed. A failure only warns ("Top Contributors may show
  generic usernames") and never blocks the history fetch.
- **The write** is one transaction that checks the Plex URL and token fingerprint, the authority
  epoch and the machine id haven't changed during the run; a conflicting pair of local and Plex
  accounts aborts it. On success users are upserted, stale mappings removed and the proof record
  stored (epoch, machine id, configuration fingerprint, confirmation time). The mapping is replaced
  as a whole: each server-local account id maps to a Plex account id, username, avatar and a flag
  for the Plex server's owner, which grants nothing in the app (D20).
- **Freshness:** a mapping is fresh for 24 hours (allowed at 23:59:59, refused at exactly
  24:00:00), and is invalid at once when the URL, token or machine id changes. Everyone but the
  owner needs a fresh, exactly matching mapping to view or act on any recap, whether by slug, token
  or id.
- **Users** are keyed by Plex account id and keep their server-local id, username, email and
  avatar. A user is never deleted when the server stops being shared with them: history outlives
  membership.

#### sync

- **Fetching** uses the server token, 100 plays a page, and stops at the first empty page so a
  misbehaving server can't loop forever.
- **A play** keeps its history key (unique), rating key, title, type, viewed-at time, server-local
  account id, library section and artwork reference, and, once enriched, its duration in seconds,
  genres and release year; an episode also keeps its show's title and key and its season's title.
  Only the owner clears history (`data-admin`).
- **Modes:** new activity only (the default) starts at the watermark of the latest completed run; a
  cancelled or failed run never supplies one. When no completed run has a watermark, a run fetches
  the full history. Backfill starts at the beginning of 1 January of a chosen
  year (2000–2100) in the instance time zone (D24).
- **A run:**
  1. Claims the single running slot atomically. Starting while a sync runs answers "conflict",
     shown in a persistent banner that screen readers announce; cancelling with nothing running
     answers "bad request".
  2. Reconciles identities (`identity`).
  3. Fetches history. A page with an item missing its history key, library section, type, integer
     viewed-at time or account id is rejected whole and fails the sync. An item without a rating
     key or title is skipped, counted and logged. Plays are inserted ignoring duplicate history
     keys, so refetching the boundary play or rerunning a backfill changes nothing. Progress
     (processed, inserted, skipped, page) is kept in memory and saved periodically; a cancel takes
     effect between pages.
  4. If anything was inserted, clears the cached statistics of every year, counted in the instance
     time zone (D24), from the watermark's year to the newest play's year, for every member and the
     server.
  5. Enriches, again only if something was inserted: finds plays missing a duration, genres or a
     release year across the whole history, and fetches metadata for rating keys not cached, or
     whose failure is past the retry window (row 10), 8 at a time by default (set in the
     environment, clamped to 1–20). The cache keeps, per rating key, the duration, genres, release
     year, when it was fetched and whether it failed; a successful entry never expires. It records
     failures, applies grouped updates, then clears the cached statistics of exactly the years it
     touched, older years included. Its counts separate enriched, skipped (cached or already
     filled) and failed.
  6. Completes with the count, and the newest viewed-at time as the watermark, or keeps the
     previous watermark when nothing new arrived (row 10).
- **A run's record:** a sequential id, start and completion times, the plays processed, the
  watermark, the status (running, completed, failed or cancelled) and the error text.
- **Failures:** any error fails the run with its message. Inserted plays stay, and the next run is
  idempotent. An error while cancelling records "cancelled". A run still marked running at startup
  is marked failed with "Interrupted by restart".
- **Live sync** isn't a poller. Opening the server recap or a personal recap, or a successful
  landing lookup, starts a best-effort background sync, guarded in this order: live sync is on (the
  environment wins over the stored setting; on by default), 3 minutes have passed since the last
  completed live sync, no sync is running, and an in-process lock is free (released after 30
  minutes at the latest). The page renders at once from current data; signed-in viewers see a
  progress overlay, and the page reloads its data when the run ends. A landing lookup sets a
  short-lived cookie so the recap shows the overlay and, if the run fails, "Could not refresh your
  viewing history from Plex. Showing the most recent data instead."
- **Progress streams:** the owner's stream has full progress; the member stream, open only to a
  signed-in member, carries only the phase and small counters, never titles, names or error text.
  Streams reconnect when they drop, and a progress display clears itself a few seconds after the run
  ends.
- **First run:** the sync step imports the current year with live progress (phase, counters and
  enrichment) and reconnects if the stream drops. Continue is enabled as soon as the sync has
  started, and the sync runs on in the background.
- **The schedule** is a standard five-field expression, validated by the app with stable error
  messages: midnight daily by default, with presets for hourly, every six hours, midnight, 3 AM and
  weekly. A tick that overlaps a run is skipped, and each tick checks again that no sync is running.
  The owner's intent (running, paused or stopped) is stored and rebuilt at startup, because the
  live job exists only in memory; a stored expression without a state restores as running.
  Changing only the expression keeps the state (an inactive scheduler stays inactive and says so).
  Paused is its own flag, apart from "running a sync now". Scheduler actions go through one queue
  and store their state before touching the live job; tests require the stored state and the live
  job to agree after many interleavings.
- **The time zone** (D24): the environment's zone counts only if it is a known IANA zone, matched
  case-insensitively and canonicalised; so does the owner's setting. Fixed offsets such as `+02:00`
  are refused, because they have no daylight-saving rules and "midnight local" would be wrong half
  the year. A change applies to the scheduled jobs at once.
- **`/admin/sync`:** the mode (new activity only, or full history from a chosen year); start and
  cancel with live progress; the scheduler's status with pause, resume, initialise and stop, the
  expression with its presets, and a link to the time zone; the run history, 8 a page, with first,
  previous, next and last.

#### plex-sign-in

- **Starting** is a POST that needs the browser's address (`sign-in`): the server creates a PIN with
  Plex, records the PIN id, its expiry, the browser's address and whether the callback was verified
  under a random state for 15 minutes, and sets a 15-minute `SameSite=Lax` cookie holding that
  state, one attempt per browser. The user goes to Plex's hosted sign-in page, the only place Plex
  sign-in redirects to, with a forward URL back to obzorarr built from that address. A return path
  (`sign-in`'s rule) is checked on the server, on the redirect page and again in the browser.
- **Popup** (the default): the opener polls every 2 seconds for up to 5 minutes. The popup checks
  the state on return, tells the opener it is done (only to speed things up, never as proof) and
  closes; closing it cancels. When the browser blocks the popup, a dialog offers to continue to
  Plex in the same tab, or to cancel.
- **Redirect:** chosen explicitly, or automatically for automated browsers. The pending PIN is kept
  in session storage for at most 15 minutes, and a server fallback that keeps no token in the
  browser covers browsers without storage.
- **Finishing** needs the returned state to match the cookie. An owner who linked their Plex account
  continues as D20 and row 11 say (through two-factor when it is on) and lands in the admin panel.
  Anyone else needs membership of the server, checked with their own token; then the user is
  upserted, a member session of a fixed 7 days (no sliding renewal) is created under a random cookie
  token, holding their own Plex token, and they land on the return path or their dashboard. Expired
  sessions are deleted lazily. Sign-in responses carry only the username, whether it is the owner,
  and an allow-listed destination.
- **Revalidating a member session:** once 15 minutes have passed since the last check, the next
  request proves membership again against Plex and the live server identity. Lost access, or an
  explicit "unauthorised" from Plex, deletes every session of that user. Transient failures
  (timeouts, upstream 5xx) get a grace window of up to 4 failures in a row or 60 minutes, then that
  one session ends; certificate errors and malformed responses aren't transient.
- **Access:** a member keeps access only while a fresh mapping (`identity`) proves the server is
  still shared with them. Un-sharing removes access to recaps even while a session lives;
  re-sharing and a sync restore it. Between revalidations a member's session is proof of
  membership for members-only pages.

#### stats

- **Scope:** a year's statistics come from the plays whose viewed-at time falls in that calendar
  year (D24). Watch time is the sum of runtimes (D23); duplicates were dropped at sync. A member's
  and the server's statistics run the same calculators: a member's filter by their server-local
  account id and add a percentile; the server's add the number of active viewers and the top
  viewers, and count unique episodes across everyone for series completion. Statistics and their
  cache are keyed by the server-local account id, never the internal user id, which only sessions,
  share settings and the owner's inspection links use. They are computed on demand.
- **The calculators:**
  - Total time and plays: minutes summed, plays counted; a year has history when either is
    positive.
  - Top movies: grouped by rating key and titled from the item (row 12), ranked by plays, ties
    alphabetical, top 10, with the first artwork seen.
  - Top shows: episode plays grouped by show key and titled from the show (row 12), counting plays
    rather than unique episodes, ranked by plays, ties alphabetical, top 10, with the first artwork
    seen.
  - Top genres: each genre on a play counts once; malformed genre data is skipped; top 10.
  - Months, hours and weekdays: 12, 24 and 7 buckets of minutes and plays, whose sums equal the
    totals. Weekdays are stored Sunday first and shown Monday first.
  - Content type: counts and minutes for movies, episodes and tracks; other types are ignored.
  - Decades: by release year, labelled like "2000s", oldest first; unknown years are skipped.
  - Rewatches: items (by rating key) played 2 or more times; top 10 by count.
  - Marathon day: the day with the most minutes, earliest on a tie, capped at 1,440 minutes
    because summed runtimes can exceed a day; up to 10 titles kept.
  - Streak: the longest run of consecutive days with a play, earlier on a tie; several plays in a
    day count once.
  - Binge session: plays in time order; a play joins the session if it starts within 30 minutes of
    the previous play's end. The longest by content minutes wins, earlier on a tie, and a single
    play is a session.
  - First and last watch: the earliest and latest play; an episode is titled "Show: Episode".
  - Year comparison: none when both years are zero, +100% when last year was zero, otherwise the
    percent change to one decimal.
  - Percentile (personal recaps only): the share of accounts with strictly less watch time among all
    accounts with a play that year; a tie doesn't count as less, and the top of N viewers gets
    (N−1)/N.
  - Series completion: unique episodes watched per show against the show's episode count from
    Plex, fetched in a batch; the percentage is rounded and capped at 100; top 10 by episodes
    watched. When the lookup fails, the recap still renders with the totals unknown (row 12).
  - Top viewers (server only): the top 10 accounts by minutes, named from the mapping, then the
    stored users, then "User {id}", so a member who left still counts.
- **Determinism:** plays are read in time order, every tie-break is defined, and five forced
  recomputations give identical results. Fun facts are the one exception.
- **The cache** keeps one result per account, year and kind for an hour, replaced on recompute. Sync
  and enrichment invalidate it per year, a time-zone change invalidates every year (D24), and the
  owner clears it per year or wholesale. A cached result that fails the strict read-back check
  (exactly 12, 24 and 7 buckets, rewatch counts of at least 2, percentages from 0 to 100) counts as
  missing. Names are anonymised and artwork URLs signed after the cache read, per request, and
  recap pages are served with `no-store`, so access rules apply to every request.

#### sharing

- **Share modes,** from most open to most private: public (anyone with the link; a slug link);
  private link (only holders of the year's long random token, which the member and the owner need
  too; regenerating it invalidates the old link); and server members only (any signed-in member,
  whose session proves membership; a slug link).
- **Global settings:** a default share mode for members who haven't chosen (members-only on a
  fresh install), whether members may choose (user control), and the server recap's mode, which is
  public or members-only only; an invalid or missing value means members-only.
- **The effective mode:** a member who never chose follows the live default. An explicit choice is
  kept, but the effective mode is the stricter of the choice and the default, so the default is also
  the privacy floor; relaxing the floor reveals stored choices again. User control is the member's
  own flag and the global flag together. Nobody, the owner included, can save a mode below the
  floor; regenerating a token is refused when the floor is stricter than private link; the interface
  disables the options below the floor and says why. "Apply defaults to existing users" rewrites
  only the members who follow the default, and reports how many were updated and skipped; explicit
  choices are never overwritten. When the default moves away from private link, the tokens of
  members who follow the default are wiped. Enabling the public lookup never lowers the effective
  mode or the floor: the lookup finds only a current-year recap that is already effectively public.
- **Share settings** are created lazily, one row per member and year, also under concurrent
  creation: the stored mode, whether it is the default or an explicit choice, the token if any, the
  slug, the member's own control flag and their logo preference. A token is minted lazily and only
  in private-link mode, a slug lazily when the recap is first shared or viewed, and each row has at
  most one of each, also under concurrent minting. A token belongs to one year, and never resolves
  or shows on another.
- **Tokens** are left out of every payload unless the effective mode is private link, and even then
  only the member whose recap it is and the owner see them.
- **Resolving a link,** by its shape alone: a long random token is looked up as a private link (its
  year must match; when the member's mode or the floor is members-only, signed-in members pass and
  anonymous visitors get not found; a token whose recap became public is stale). An all-digits id
  resolves only for the member it belongs to and for the owner. The owner opening a member's recap
  by internal id gets it read-only, still bound by the privacy floor: it mints nothing and shows no
  token or share controls. On their own recap (local account 1) the owner is the member whose recap
  it is. A 22-character slug (about 131 bits of randomness) names a public or members-only recap,
  and access is still checked: a private-link recap reached by its slug is not found. Share links
  never carry the internal user id.
- **Not found:** every anonymous denial (an unknown member, an opt-out, a stale mapping, a wrong or
  revoked link) is the same byte-identical not-found, "We couldn't find a Wrapped page for that
  link." Signed-in members get a more specific forbidden or not-found.
- **Names** in shared statistics (today the server recap's top viewers; fun facts and percentiles
  carry no names; the owner's pages always show real names) are real, anonymous ("User #N" by
  leaderboard position) or hybrid: the signed-in viewer sees their own name and everyone else is
  anonymised, and anonymous visitors see everyone anonymised. Hybrid compares the viewer on the same
  identity the leaderboard uses (row 13). A fresh install, and an unreadable stored value, use
  hybrid. Pseudonyms follow position, so they shift when the ranking changes, but the same input
  always gives the same output, and counts and order are kept.
- **The share dialog,** from the recap or its summary, copies the slug or token link. It shows the
  mode choices to the member whose recap it is (when user control allows) and to the owner, with
  options below the floor disabled; offers regenerating only in private-link mode above the floor;
  says that members-only recipients must sign in; and tells that member, when user control is off,
  where that is decided. On the server recap it is only the link.
- **`/sharing`,** for the current year: the share mode with the floor's notes, copy link,
  regenerate the private link behind a confirmation, the logo preference (only when the logo mode
  lets members choose), and when the session expires. It is served `no-store`, so a floor change
  shows at once.

#### recap

- **The catalogue:** sixteen built-in slides the owner configures, plus fun-fact slides placed
  automatically, custom slides, and a top-viewers slide that replaces the percentile on the server
  recap. The default order, all enabled: total time, top movies, top shows, genres, distribution,
  weekday patterns, content type, decade, series completion, rewatch, marathon, streak, year
  comparison, percentile, binge, first and last. The summary is a page after the slides, not a
  slide.
- **The slides,** with their empty states; their look is the spike's (D19), and their text is
  messages (D21).
  - Total time: the hours played (minutes under an hour), with a days or weeks comparison.
  - Top movies and top shows: the top 6 with artwork and play or episode counts; empty: "No
    movies watched this year", "No shows watched this year".
  - Genres: the top 5; empty: "No genre data available".
  - Distribution: months and hours, each with its peak.
  - Weekday patterns: Monday first, the peak day and the weekend's share of minutes.
  - Content type: each type's share (tracks only if there are any) and a badge: 60% or more of one
    type is Movie Buff, TV Addict or Music Lover; movies and episodes both at 40% or more is
    All-Rounder; otherwise Balanced Viewer.
  - Decade: the decades and an era badge ("Y2K vibes", "Classic cinema lover", …); empty: "No
    release year data available".
  - Series completion: the top 5 with their progress, and a badge: Completionist (5 or more
    complete), Dedicated Viewer (2 or more), Serial Sampler (10 or more series), otherwise Explorer;
    empty: "No series data available".
  - Rewatch: the top 5 with ×N, and a badge by total rewatches: Creature of Habit (more than 50),
    Comfort Seeker (more than 20), Has Favorites (more than 10), otherwise Explorer; empty: "Every
    play this year was something new."
  - Marathon: the date, the duration, the item count, and six thumbnails, then "+N more".
  - Streak: the days and the date range, tiers at 14 and 30 days, messages at 3, 7, 14 and 30.
  - Year comparison: both years and the change in percent; under 5% reads "About the same", with
    stronger wording above 25% and 50%; empty: "No previous year data available".
  - Percentile: "Top X%", where X is max(1, 100 − rank), highlighted at 10 or better, with messages
    at 1, 5, 10, 25 and 50.
  - Binge: the wall-clock span, the content time, the plays, and its date and time.
  - First and last: two cards.
  - Fun fact: an icon, the fact and an optional comparison.
  - Custom: the title and the sanitised rich text (`slides-admin`).
  - Top viewers: "Top Contributors", the top 10 with compact durations ("2d 3h").
- **Empty years:** an enabled slide always shows, with its own empty state; nothing is hidden for
  lack of data. When a year has no history at all, the whole recap is replaced by "No viewing
  history for {year} yet" (personal) or "No {year} data yet" (server), returned as a normal page,
  not an error, and only after access is checked, so an anonymous visitor can't tell an empty year
  from a private one.
- **Story mode** (the default) fills the screen, sized to the dynamic viewport height. A tap
  anywhere but the left 15% goes forward and the left 15% goes back; a horizontal swipe of more than
  50 px moves either way; the arrow keys, space, enter, home, end and escape work, throttled. Phones
  also get previous and next buttons. There's no auto-advance and no timer; progress shows the past,
  current and remaining slides. "Tap to continue" shows on the first slide. Going past the last
  slide opens the summary. Close returns to the previous page when it was on the same site,
  otherwise to the landing page. The slide index is kept in the URL fragment as a deep link, without
  adding history entries, and replaying from the start resets it.
- **Scroll mode** stacks every slide with an "N / total" counter, and escape closes. Story and
  scroll mode share one position, and both end with the summary (row 14).
- **Around the slides:** on a personal recap the mode toggle shows only when there is history. Year
  navigation shows only when the server has more than one year of data; "previous" is the older
  year. For anyone but the member whose recap it is, other years link only to share links that
  already exist: nothing is minted, private-link years are left out, and no other year's token is
  revealed; a year without a link falls through to the server recap. The logo follows the logo mode
  (`appearance`); when members choose, the member whose recap it is has a toggle that saves at once
  and starts as shown.
- **The summary page** ends both modes. Its cards, actions and labels follow the recap's brief
  (`/wrapped/2025/me`; the server recap's own brief once it exists) as the spike settled them (D19).
  Sharing opens the share dialog, the way home depends on who is viewing (the admin panel, the
  dashboard or the landing page), and focus lands on the heading, so a stray Enter doesn't press a
  button.
- **The summary's figures** (the movies, the series and the longest streak) come in five layouts
  (D19), drawn in [design/recap/](design/recap/): Credits axis, the default (numbers end on a
  centre line and their words start from it); Title card (one sentence); Centred pairs; Edge print
  (each word set vertically beside its number); and Ticket stubs. The owner picks one
  (`slides-admin`); the server renders it, so it never flashes, and a stored layout that no longer
  exists falls back to Credits axis with a warning in the logs. Each layout is a component in a
  typed registry keyed by a stable name (`credits-axis`, never a letter), so adding one is a
  component, its registry entry and its admin label, and the type check refuses a name without a
  component or a component without a name. Every layout shows each figure's number and word as
  text in reading order, from plural messages; Title card builds its sentence from the three plural
  phrases.
- **Motion levels** (D19): reduced, standard and cinematic. The owner sets the level
  (`appearance`), a member may only lower it, and the system's reduced-motion setting always wins.
  Reduced shows each slide's final state at once; standard is the spike's motion; cinematic adds
  more on top, which `recap`'s spec chooses. Cinematic steps down to standard for the rest of a
  recap when its first slide drops frames, and only between slides, so nothing jumps and no
  content goes missing.
- **Voice:** a personal recap says "you" and "your". The server recap speaks as "{server name}
  Community", or "we" and "our" when the server has no name, and always takes plural verbs.
- **Artwork** goes through the app, so browsers never see the server token, and follows the same
  rules as its page: each artwork reference in a statistics payload becomes a signed URL that
  encodes the path, the kind (server or member), the year, the member, a hash of the share token if
  there is one, and a 30-minute expiry. Every request checks access again, so regenerating a
  private link also revokes its old artwork URLs. Responses are private and `no-cache`, and
  conditional requests are passed on to Plex.

#### member-dashboard

- Before the member has history this year, their recap card says "Appears here once you have
  viewing history this year".

#### landing

- **Signed out, lookup off** (the default): the page offers only Plex sign-in (the landing brief's
  copy), with no lookup form, and refuses a crafted lookup request outright. A signed-in member goes
  to their dashboard.
- **Lookup on:** a visitor types a Plex username (1–100 characters, trimmed), matched without regard
  to case against fresh mappings that resolve to exactly one member. An unknown name, a member
  without history this year, an ambiguous identity, and an opted-out or non-public member all get
  the same not-found message. On success the app starts a live sync without waiting (`sync`),
  mints or reuses the public slug, and redirects to the current year's recap. The lookup never
  creates members or share rows, never mints or reveals a private-link token, and never uses the
  internal id.

#### privacy-settings

- **Presets** are shortcuts to the ordinary settings, never stored. The privacy brief decides their
  labels, layout, selected and Custom states, and whether applying defaults is a checkbox or a
  separate control. Each preset also sets the logo to always shown, a fresh install uses the Members
  only values, and the other combinations stay reachable through the individual settings.

  | Preset | Names | Members' default | Server recap | Public lookup | User control |
  |---|---|---|---|---|---|
  | Maximum privacy | anonymous | members-only | members-only | off | no |
  | Members only | hybrid | members-only | members-only | off | yes |
  | Public showcase | real | public | public | on | yes |

- **Saving** settings from several separately versioned groups writes them in one transaction: if
  any group changed since the page loaded, nothing is written and the message names the stale
  sections.
- **Previews:** the saved settings and the settings after saving, each written from three points of
  view (the owner, a visitor, a member) and always ending with the reminder that sign-in still
  guards everything else. A preview never overstates or understates what is exposed.
- **Applying defaults to existing users** asks for confirmation and never overwrites a member's
  explicit choice (`sharing`).
- **First run's privacy panel:** the presets, the individual settings and the live preview.

#### slides-admin

- **Order:** any slide type missing from the configuration is appended, enabled, whenever a recap
  loads. First run's panel toggles each built-in slide.
- **Custom slides:** a title (1–200 characters), content (1–10,000 characters of lightweight text
  markup), enabled, a place in the same order as the built-in slides, and an optional year (none
  means every year). A row shows the year badge, edit, and an inline delete confirmation. A dialog
  creates or edits one (title, content, a year or all years, enabled, and a preview rendered on the
  server), and a failed validation keeps what was typed.
- **Checked markup:** content is rendered on the server, then reduced to an allow-list: headings,
  paragraphs, line breaks, rules, lists, emphasis, code, quotes, links and images. Saving is
  refused, with a specific reason that doesn't echo the input, when the content has script tags,
  inline event handlers, script-scheme links or base64-embedded scripts. The output also loses every
  class and inline style (an author's class could otherwise pick up the app's own full-screen layout
  classes); links open in a new tab without a referrer and only with web and mail schemes; and
  inline images are raster formats only, never vector or markup images.
- **The summary layout** (`recap`): a picker below the slide order, whose preview shows the summary
  in the chosen layout before it is saved.

#### fun-facts

- **Every recap load** makes fresh fun facts: never cached, none for a member without history, and
  an error never stops the recap from rendering. They draw on the hours, days and plays; the top
  movie and its plays; the top show and its episodes; the percentile (fixed at the median for the
  server); the longest binge's hours and plays; the peak hour and month; the first and last titles;
  the number of different movies and shows; the scope; and "could watch X N times" ratios against
  well-known long-running shows and film series.
- **Templates** come in eight categories, each with the conditions it needs and thresholds set a
  little above the comparison, so a "1×" fact never appears: time equivalents (flights, reading
  books, walking, sleep cycles, film marathons, coffee breaks, commutes, podcasts); content
  comparisons (the top movie 3 or more times, the top show 10 or more episodes, variety);
  behaviour (the 90th or 75th percentile, a night owl with the peak at 21:00 or later, an early bird
  with the peak at 09:00 or earlier and 10 or more plays, the peak month, plays a day); binges (6
  hours, 3 hours, 5 items); time patterns (first, last, bookends, and a fallback with no
  condition); achievements (100 and 200 hours, 500 and 1,000 plays, 50 movies, 50 episodes of one
  show, the top movie 10 times, 20 shows); social comparisons (number one, top 5%, top 15%, above
  average, climbing, and community fallbacks); and trivia (the show ratios). They are drawn by
  weighted random draw without replacement, percentile templates are left out for the server, and
  when none applies there are none. They follow the recap's voice rule.
- **Placement:** few (2), normal (4, the default), many (8) or a custom 1–15 a recap; at most one
  fewer than the number of slides; never first or last; spread evenly through the recap.
- **AI mode** is on when a key and a valid HTTPS base URL are set: any text service with a
  chat-completions style interface, with a default model name, and reasoning-style models
  recognised by name and sent the request shape they need. Four personas: witty, wholesome, nerdy
  and random. The system prompt fixes the persona, a celebratory tone, the voice rule for the scope,
  an emoji icon per fact and a strict structured reply. Requests have a short timeout and two
  retries on rate limits, server errors, timeouts and network failures; other client errors fail at
  once. Templates fill in when the AI returns too few facts, and replace them all on any AI error.
  The connection test sends a minimal request and maps an authentication failure, and an unknown
  model or base URL, to their own messages.
- **The AI form** on `/admin/settings/connections`: the key (stored on the server and never sent
  back to the browser; the form shows only that one is stored), the base URL (HTTPS only) and the
  model, each with a clear button; the test reuses the stored key only while the URL and model still
  match what was stored; any of the three may come from the environment (`plex-connection`'s
  locks). On `/admin/slides`, the frequency, with a line saying whether AI or templates are in use.
- **First run's panel:** enable, frequency, key, base URL, model, persona and the connection test.
  A missing key never blocks and falls back to templates, and the last step says when fun facts run
  on templates and points to the connection settings.

#### appearance

- First run's panel sets the interface theme and the Wrapped theme.
- **The logo mode:** always show (the default), always hide, or the member's choice.
- **The recap's motion level** (`recap`): reduced, standard or cinematic, for every recap.
- The theme is applied from a cookie read before the first paint, so nothing flashes; that cookie is
  readable by scripts by design.

#### users-admin

- A table per year: each member (avatar, an owner badge on the server owner's account, a masked
  email), their watch time, their effective share mode (Public, Members-only, Link or Default), the
  member's control toggle and a link to their recap; a legend; and a note that synced viewers who
  never signed in follow the global names setting.

#### logs

- **Entries** go to standard output (D11) and, in small batches, into the database, both after
  `setup`'s redaction. They are kept for 7 days and at most 50,000 entries by default (the System
  tab allows 1–365 days and 1,000–1,000,000 entries), enforced nightly at 03:00 in the instance
  time zone and on demand. The System tab also holds the debug toggle.
- **`/admin/logs`:** counts by level; filters (levels, a search over message and source that ignores
  case, source, date range, clear all) that match on the server (row 22); a live view over a
  server-push stream that reconnects when it drops, with pause, resume and auto-scroll; a table with
  expandable metadata to copy; "load more" by cursor (100 by default, 500 at most); export of up to
  10,000 entries; and running cleanup and clearing everything, each behind a confirmation.

#### data-admin

- **Clearing:** the Data tab counts and clears cached statistics and play history, per year or
  all. Clearing history leaves the watermark, so without resetting it (row 23) a backfill is needed
  to import it again.
- **The instance reset** is a danger-zone card that says what comes back (watch statistics, which
  sync again from Plex), what doesn't (the owner account with its password, two-factor and linked
  sign-ins, every setting, every member's share settings, every share link already given out, the
  slide curation, the log history), and what is untouched (anything the environment supplies). Three
  stages: a dialog that explains and writes nothing; a dialog that shows a new claim token, valid
  for 60 minutes, with a copy button, where the owner must type RESET exactly; then every table is
  wiped in one transaction while holding the sync slot (a reset is refused while a sync runs).
  Afterwards the owner is signed out, the scheduler stops, the reset is logged, the browser lands on
  the claim, and the token is printed to the console too.

#### overview

- **`/admin`:** viewers count distinct accounts in the synced history; with no schedule set, the
  sync status asks the owner to set one; and its "My Wrapped" link appears only when the owner has
  plays this year, never linking to a page that would be not found or create a share row for
  nothing.
- **The Wrapped hub:** a year picker over the years with data (disabled, with an explanation, when
  there is only one), cards for My Wrapped and Server Wrapped, and links to slide configuration,
  privacy and display settings.

## Tech stack

The stack decisions are in [decisions.md](decisions.md) (D1–D12, D27). Versions are exact pins in
`package.json` (Bun from its `packageManager` field) and `bun.lock`; Dependabot moves them to the
newest stable release (D27). Every package is a dev dependency, so adapter-bun bundles it, and
`bun ./build` needs no `node_modules` but one package: Turso's native binding for the platform
(`@tursodatabase/database-linux-x64-gnu` or `-linux-arm64-gnu`), which can't be bundled and ships
beside `build/` (D15).

| Part | Package |
|---|---|
| Runtime and package manager | Bun |
| Language | `typescript` (6.x) |
| UI framework | `svelte` / `@sveltejs/kit` |
| Build | `vite` / `@sveltejs/vite-plugin-svelte` |
| Adapter | `@sveltejs/adapter-bun` |
| Styling | `@pandacss/dev`, `@pandacss/vite` (its Vite plugin), `@pandacss/preset-base` |
| Fonts | `@fontsource-variable/space-grotesk`, `@fontsource-variable/instrument-sans`, `@fontsource/ibm-plex-mono`, imported in the root layout |
| Icons | `@lucide/svelte`, imported one icon per path |
| Primitives | `@ark-ui/svelte` |
| Database | `@tursodatabase/database` (embedded Turso), `drizzle-orm` and `drizzle-kit` (the `rc` dist-tag, D27) |
| Translation | `@inlang/paraglide-js` (compiles the messages), `@inlang/plugin-i18next` (reads their i18next JSON v4 files) |
| Type check | `svelte-check` |
| Unit tests | `vitest` (`node` environment); `happy-dom` joins with the first component test |
| e2e | `@playwright/test` (Chromium) |
| Lint and format | `@biomejs/biome` |

Setup facts for this stack:
- SvelteKit 3 is configured through its Vite plugin (`vite.config.ts`); there's no
  `svelte.config.js`. `tsconfig.json` extends `$app/tsconfig`, which `svelte-kit sync` generates.
- Package subpath imports replace `$lib` and need explicit file targets: `#lib/*` maps to
  `./src/lib/*` and imports name the file with its extension (`#lib/server/services/health.ts`);
  `#styled-system/*` maps to the generated `./styled-system/*/index.js`.
- Assets are imported through Vite from `src/lib/assets/`: the root layout takes the favicon from
  `#lib/assets/obzorarr-icon.svg`, so there's no `static/` folder.
- `prepare` and `check` run `svelte-kit sync`, then Paraglide's compile, then Panda's codegen.
  Dev, build and Vitest compile the messages through Paraglide's Vite plugin.
- The Panda Vite plugin appends the generated CSS to the stylesheet that declares the layer order
  (`src/app.css`), and `transform: true` turns static `css()` calls into class strings at build
  time.
- Hook types come from `@sveltejs/kit/hooks`.
- SvelteKit 3 exposes only the environment variables declared in `src/env.ts`.
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.
- Bun blocks `@parcel/watcher`'s install script (it builds with Node); Panda works without it.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync`, the message compile, Panda codegen and Panda's token CSS (`styled-system/styles/`), which the refusal pages inline |
| `bun run --bun dev` | Vite dev server; needs a key in `.env` or the environment, and without one every request fails with the key error |
| `bun run --bun build` | production build through adapter-bun into `build/`; needs no key and never embeds one |
| `bun run --bun preview` | runs the built server (`bun ./build`; `PORT`, default 3000, and `HOST`); without a valid key it exits before listening |
| `bun run --bun check` | `svelte-kit sync`, the message compile, Panda codegen and token CSS, then `svelte-check` failing on any error or warning |
| `bun run --bun test` | Vitest unit tests (`src/**/*.test.ts` and `vite.config.test.ts`), once (no watch) |
| `bun run --bun smoke` | Playwright e2e: the browser smoke test, the language tests, the key tests, the setup tests, the error-page tests, the rate-limit tests and the sign-in tests, with a key and a temporary database it generates, never a developer's `.env` or exported key; it starts the built server, so `build` comes first, and Chromium comes from `bunx --bun playwright install chromium` |
| `bun run --bun lint` | `biome ci`, read-only; `biome.json` lists the file extensions Biome checks |
| `bun run --bun db:generate` | Drizzle Kit generates a migration in `drizzle/` from the schema, then Biome formats it; review it before committing |
| `prek run --all-files --hook-stage manual` | everything CI's `checks` job runs |

## Project structure

The folder tree is in [AGENTS.md](../AGENTS.md#structure) and its rules in
[Code structure](../AGENTS.md#code-structure).

## Code style

Biome's defaults with the shared `biome.json` (tabs, double quotes, 100 columns). TypeScript strict;
`#lib/…` imports. File names and layout follow
[Code structure](../AGENTS.md#code-structure).

```ts
import { healthResponse } from "#lib/server/services/health.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => healthResponse();
```

## Design tokens

- [`panda.config.ts`](../panda.config.ts) holds every design token: colours, type styles,
  spacing, radii, layout sizes, breakpoints and motion durations, under the names DESIGN.md uses.
- Colours are semantic tokens behind a colour-mode condition (`_dark`), dark by default
  (`class="dark"` on `<html>` in `src/app.html`); After Hours is the only theme, and other themes
  can be added later without touching components (ground-floor choice 4).
- Only `@pandacss/preset-base` is loaded (utilities and conditions), so no preset palette competes
  with the app's tokens, and `strictTokens` makes a raw value in `css()` a type error that `check`
  reports.
- Keyboard focus is one global rule in `globalCss`: DESIGN.md's 2px `secondary` ring with a 2px
  offset on every `:focus-visible` element, so controls don't each restyle it.
- The placeholder page uses only Panda tokens: no raw colour, size or font values in components.
  It stays quiet: no projector-light imagery or recap motion, which belong to the landing and recap
  modules.

## Testing strategy

- **Unit (Vitest, `node` environment):** the `/healthz` handler (status 200, body `ok`,
  `cache-control: no-store`), the `secrets` module (`config/secret-key.test.ts`, and
  `key-text.test.ts`, `keyring.test.ts`, `cipher.test.ts` and `secret.test.ts` in
  `security/secrets/`, under `src/lib/server/`), `setup`'s (under `src/lib/server/`:
  `config/database-path.test.ts`; `db/migrate.test.ts`, the bundled migrations on a temporary
  file against Drizzle Kit's file migrator; `db/client.test.ts`, D5's rollback isolation, which
  fails on Drizzle `1.0.0-rc.4`; `services/setup/startup.test.ts`, with a failed step logged
  before it is thrown, and shutdown: the work stopped on the signal, `SIGHUP` passed on as
  `SIGTERM`, the cleanup's exit codes and its 5-second deadline, and no handlers in `dev`;
  `logging/redact.test.ts`, each redaction rule and nested; `logging/logger.test.ts`, with
  `flushLogs` against a slow shell pipe; `logging/request-error.test.ts`, an unexpected error as
  one redacted entry without the query, its cause, no entry for app or framework errors, and never
  throwing; `src/hooks.server.test.ts`, the `handleError` hook writing through it and answering
  with the viewer's message;
  `config/log-debug.test.ts`; `config/origin.test.ts`; `security/headers.test.ts`, the headers
  for HTTPS through `ORIGIN` or `Sec-Fetch-Site`, plain HTTP, `localhost` and loopback;
  `config/address-header.test.ts`; `security/client-address.test.ts`, each address kind on a
  copied `Request`, the refusal without the configured header and the once-a-process warnings;
  `security/rate-limit.test.ts`, a window at its edges, the sweep, the cap and the headers;
  `security/session-token.test.ts` and `security/session-cookie.test.ts`, the token, its hash
  and the cookie's options; `db/owner-session.test.ts`; `services/sign-in/sessions.test.ts`, both
  session limits at their edges, the hourly write, expiry and the current-password check;
  `services/sign-in/sign-in.test.ts`, right and wrong credentials with one answer, the username's
  case and spaces, the dummy verification for a wrong username, its dummy hash made inside a hash
  slot and made again after it failed, a busy hash slot, the slot freed however the check ends,
  ended sessions deleted, the logs without the typed username, and a check that ends after the
  password changed starting no session; `security/return-path.test.ts`, each rule at its limits, a
  path percent-encoded as a `Location` header needs, and dot segments that would leave two leading
  slashes; `db/owner.test.ts`, also reading the owner;
  `security/browser-address.test.ts`, `ORIGIN`, a validated `Origin` and a stripped one, and the
  search that keeps the request URL's origin and protocol out of app code, however it is written;
  `security/cross-origin.test.ts`, the check against methods, content types and `Origin`,
  `Sec-Fetch-Site`, `Host` and `ORIGIN` values; `security/refusal-page.test.ts`, the "Access denied"
  and "Too many requests" pages and their JSON forms in both languages, styled from the inline
  token declarations, with only a link home; `security/bootstrap-token.test.ts`, the token's format,
  alphabet, unbiased draw, expiry and comparison; `security/password.test.ts`, the credential
  rules at their limits, NFC and case included, the list, patterns and an argon2id round trip;
  `db/owner.test.ts`; `db/settings.test.ts`; `services/setup/first-run.test.ts`, the token
  printed, renewed, held back during a claim, stopped, never printed once claimed, the gate's
  decision for each path before and after the claim, and a restart after the claim;
  `services/setup/claim.test.ts`, the claim's success, its field errors, wrong and expired tokens
  that never reach the hash, a second claim, two at once, a failed transaction printing a new
  token, and its limit and a refused hash slot leaving the token unused;
  `security/hash-slots.test.ts`, the fifth refused and a slot freed once),
  `src/routes/setup/token-format.test.ts` (the token field's dashes),
  `src/routes/setup/page.server.test.ts` (the claim action's 429 and its headers, its 403 for a
  browser that stripped `Origin` and a claimed instance's 404 before it, `no-store`, and the
  session cookie with the redirect to `/admin`), `src/routes/(admin)/admin/(shell)/` (`/admin`
  and `/admin/settings` open the Security tab),
  `src/routes/(admin)/admin/sign-in/page.server.test.ts` (the cookie, a safe `next` kept to its
  path and an unsafe one dropped, one answer, busy with its headers, the 403 for a browser that
  stripped `Origin` before any check, and `no-store`),
  `vite.config.test.ts` (SvelteKit's own form check and remote functions are off), and in
  `src/lib/shared/i18n/`:
  - `format.test.ts` runs the formatters inside `paraglideMiddleware` with a request for each
    language and checks that English formats as `en-GB` and that `formatDateTime` follows the zone
    it is given, not the machine's;
  - `messages.test.ts`, the message check, finds every problem in `messages/*.json`, and breaks
    each of its rules once in small files held in memory, to show that each is reported.

  Component tests, from the first one, use happy-dom; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** against the built adapter-bun server, with a master key
  Playwright generates for each run, so CI needs no stored secret, and a temporary database. The web
  server counts as started once its output runs from the token line through "Listening on", which
  captures the token; `global-setup.ts` then claims the instance through the form in a browser and
  waits for the Security tab, so the smoke and language tests run on a claimed instance.
  - `smoke.test.ts` checks that `/` returns 200, shows the placeholder heading, hydrates (it waits
    for the `data-hydrated` attribute the root layout sets when mounted), applies the Panda
    background token and display text style and logs no console errors; that each of Panda's three
    `fonts` values loads a bundled face (`document.fonts.load()`, which returns none for a family
    name nothing registers); and that `/healthz` returns `ok`.
  - `secret-key.test.ts` checks that the built server refuses to start without a valid key.
  - `setup.test.ts` starts its own built servers: one migrates a new database file and applies
    nothing on a second start on it, one uses the default path, and three refuse a database folder
    they can't create or a path they can't open, without echoing the path and naming the default
    when the variable is unset; a bad `OBZORARR_LOG_DEBUG` is one JSON log entry, and its value is
    never echoed; `SIGTERM` and `SIGHUP` each stop the server with exit code 0; a page, `/healthz`,
    the gate's redirect and a 404 carry the security headers, with no HSTS over plain HTTP; a page's
    scripts carry its policy's nonce and the browser reports no violation; an `ORIGIN` with
    credentials or a path stops the server without being echoed; a cross-site form POST gets the
    "Access denied" page with the headers, its own policy and the viewer's language; and a
    same-origin POST with no `Sec-Fetch-*` headers passes, on `localhost` and on a plain-HTTP host
    name that isn't loopback (Chromium's `--host-resolver-rules`), getting the gate's 303 while
    unclaimed; every page sends a fresh server to `/setup` while `/healthz` answers `ok`; a fresh
    server prints its bootstrap token before it listens, in no log entry or response; the sixth
    claim from one address within 5 minutes gets the form's 429 with `Retry-After`; a claim with
    `Origin` stripped gets the 403 that says so, in Danish too and as JSON to an enhanced form, and
    leaves the token usable, and `/setup` is `no-store`; while a claim is being sent, the button
    says "Claiming…" and can't be pressed, and the fields keep what was typed; each refusal puts a
    new alert in the page; and the claim
    refuses a wrong token, keeping the username and clearing the token and password, claims with the
    right one, and answers 404 at `/setup` afterwards, also after a restart, which serves `/`
    without a redirect, with neither the token nor the password in any log entry or response.
  - `i18n.test.ts` checks that a Danish browser gets `/` in Danish with `<html lang="da">` and
    `Vary: Cookie, Accept-Language`; that pressing "English" in the switcher reloads `/` in English,
    writes `PARAGLIDE_LOCALE=en` with `SameSite=Lax` and without `Secure` over plain HTTP, and keeps
    the next visit in English; and that a browser whose `Accept-Language` says `fr-FR` but whose
    `navigator.languages` lists `da-DK` gets English, the switcher marks English as current after
    hydration, pressing it does nothing, and no cookie is written. None logs a console error. The
    smoke test runs in English, Playwright's default.
  - The shared web server runs with `ADDRESS_HEADER=x-forwarded-for`, and `fixture.ts` gives each
    test its own address, so no test's requests count against another's.
  - `rate-limits.test.ts` checks that the 61st request in a minute gets the "Too many requests"
    page with `Retry-After` and the limit's headers, and that a request without the configured
    header gets "Access denied" while `/healthz` answers.
  - `sign-in.test.ts` checks, on fresh servers, that the claim signs the owner in and lands on the
    Security tab, with an `obzorarr_session` cookie that is `HttpOnly`, `SameSite=Lax`, host-only,
    about 30 days long and not `Secure`, on `127.0.0.1` and on a plain-HTTP host name that isn't
    loopback, and that a cookie naming no session is cleared, also without `Secure`. On
    `/admin/sign-in`, a wrong password gets one message, keeping the username and putting the
    cursor back in the emptied password field, and a second gets a new alert, so it is announced
    again; a busy answer keeps the password; the right one signs in, with the username in any case
    and spaces, and returns to `next` without its query string; an unsafe `next` goes to the admin,
    and without JavaScript a `next` with characters outside ASCII is percent-encoded and one with
    dot segments that resolve to two leading slashes goes to the admin;
    while signing in, the button says so and the username keeps what was typed; a POST with
    `Origin` stripped gets the 403 that says so; of 20 sign-ins at once, every answer is a wrong
    password or the form's 429 with `Retry-After: 5`, with some of each; and the page and its
    recovery steps show in English and Danish with no console error or CSP violation.
  - `errors.test.ts` checks that an unknown page is "Page not found" in English and Danish,
    without its number, styled and hydrated, with Go back and Home; that Go back returns to the
    page before; and that a cross-site POST's "Access denied" page shows the tokens' colours. None
    logs a console error or a CSP violation.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds with no key and runs `smoke`.

## CI and repo tooling

obzorarr is a Bun web repo with edbfi-ci's Bun web templates:
- `.pre-commit-config.yaml`: Biome, `biome-migrate`, `check-peers`, the `tests` hook, plus a
  `check` hook (`bun run --bun check`), keeping the vendored-skill exclusions and the `docs-set`
  hook.
- `.github/workflows/ci.yml`: `checks` (prek), `smoke` (Chromium install, build, smoke) and `audit`
  (outside PRs); `checks` and `smoke` sit behind `ci-ok`, every job that installs runs with failing
  `node`, `npm` and `npx` on `PATH`, and the weekly run is `29 3 * * 0`.
- `.github/dependabot.yml` covers `github-actions`, `pre-commit` and `bun`, and
  `.github/workflows/biome-migrate.yml` applies Biome migrations and formatter output to
  Dependabot's Biome PRs.

## Boundaries

- **Always:** Bun with `--bun` for every tool; tokens only through Panda; keep SvelteKit's
  configuration in the Vite plugin; prek green before each commit.
- **Ask first:** any dependency not in the tech stack table; any change to `biome.json` (it is
  shared by the five rewrite apps); any CI shape that differs from the edbfi-ci template.
- **Never:** a database, authentication, Plex, sync, a recap slide or any other product feature
  before its module's approved spec builds it; a second styling tool or primitive library; Node, npm
  or npx anywhere, including CI.

## Ground-floor choices

Choices 1–3 are carried over from the first rewrite app's skeleton, since obzorarr's design doesn't
call for anything different; choices 4 and 5 are obzorarr's own.

1. **Fonts.** DESIGN.md wants Space Grotesk, Instrument Sans and IBM Plex Mono bundled locally. The
   skeleton defined the font tokens with system fallbacks; `recap-spike` bundled the files from
   fontsource (approved by the owner on 2026-10-29), and the tokens name the families they
   register.
2. **Ark UI before its first use.** The skeleton installs `@ark-ui/svelte`, so the Panda and Ark
   pairing and `check-peers` are settled early; the first `ui/` wrapper comes with the first surface
   that needs one.
3. **Security headers and CSP.** Closed: `setup` added the nonce-based CSP and the security
   headers on every response that passes through `handle`
   ([SPEC-setup.md](SPEC-setup.md#security-headers-and-csp)), as the first module that serves
   real pages.
4. **Themes.** The owner picks the admin panel's theme and the recap's theme independently (the
   connections brief); the legacy app offered five presets, and the design seeds both to
   After Hours. The skeleton defines After Hours as the only theme, its colours as semantic tokens
   behind the dark colour-mode condition, and the module that brings back the two theme settings
   decides whether more presets return and how Panda switches them.
5. **CSP and the recap spike.** Closed: no headers needed. The spike served fictional figures,
   stored nothing and was deleted before `setup`, so it never met choice 3's headers.
