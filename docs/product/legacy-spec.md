# Obzorarr — Year in Review for Plex Media Server

> [!NOTE]
> **Legacy product specification**, imported from the pre-rewrite documentation. It describes the
> shipped app's behaviour, which the rewrite keeps unless an approved spec or decision changes it.
> Its technology and deployment content is superseded by [`docs/decisions.md`](../decisions.md) and
> [`docs/SPEC.md`](../SPEC.md): "Status" (the state of the old code), and in "Configuration and
> operations" the deployment shape, the front process, the startup sequence and the schema history
> in "Upgrades". Its visual direction (the five theme presets, and typefaces loaded from a public
> web-font service with that origin in the content security policy) is superseded by
> [PRODUCT.md](../../PRODUCT.md) and [DESIGN.md](../../DESIGN.md), which seed both theme settings to
> After Hours and bundle fonts locally; whether more presets return is left to a later module ([`docs/SPEC.md`](../SPEC.md),
> ground-floor choice 4). Sections are deleted as approved `docs/SPEC-<id>.md` files cover
> them, and the file goes once nothing is left (AGENTS.md, cleanup procedures).

## Status

Shipped and actively maintained. Obzorarr is a mature, single-instance, self-hosted application with
640+ commits, a long tail of structured "dogfood" QA rounds, property-based and unit test suites that
pin most of the rules described below, and a published container image maintained in a sibling
repository. Everything in this document describes behaviour that exists and has been exercised in
practice unless it is explicitly marked as a gap, a latent bug, or an idea.

## Purpose

Obzorarr is a "Wrapped for Plex": it reads viewing history from a Plex Media Server, builds yearly
statistics for every person who watches on that server, and presents them as an animated, phone-first
slideshow in the style of Spotify Wrapped. It is aimed at the hobbyist who runs a Plex server for
family and friends and wants to give each of them a personalised, shareable year-end recap, plus a
server-wide community recap with a leaderboard.

It sits beside the media server in a self-hosted stack and depends on nothing else. In particular it
deliberately **does not require Tautulli** or any other history collector: it talks only to the Plex
server and to Plex's own account service. Operators who already run Tautulli gain nothing extra and
lose nothing by having it.

What Obzorarr deliberately does not do:

- It does not manage, request, download or organise media; it only reads history and metadata.
- It does not track real-time "now playing" sessions or build live dashboards; it is a yearly recap.
- It does not have its own accounts or passwords. Identity is always the Plex account, and the only
  administrator is the owner of the configured Plex server.
- It does not measure actual seconds watched. A play counts for the full runtime of the item.
- It does not store or expose anything to the public internet by default; public exposure is an
  explicit administrator choice.

## Product feel and goals

The tone and the engineering history point to a handful of opinionated goals:

**Spotify-Wrapped-grade presentation, built portrait-first.** The recap is a full-viewport, dark,
gradient-backed story with one idea per slide, large animated numbers, spring-based entrances,
staggered lists, counting-up totals, emoji badges ("Movie Buff", "Completionist", "Night owl" style
personality labels), and a summary card at the end. It is designed for a phone held upright, then
widened for desktop. Tap targets are at least 44 px. Every animation respects the user's
reduced-motion preference by jumping straight to final states. Two viewing modes exist because people
share recaps differently: *story mode* (tap or swipe through slides, like a social story) and *scroll
mode* (the whole recap on one page you can screenshot or skim).

**Two audiences, two visual surfaces, chosen independently.** The admin panel and the recap each have
their own theme setting from the same five presets, because the panel the operator works in and the
recap their users see need not match. The app is dark-only. Each theme carries its own accent hue,
typeface and corner radius, and the recap background is a dark gradient tinted to the theme with
subtle noise and vignette.

**Privacy by default, with honest previews.** The fresh-install posture is: names in shared stats are
*hybrid* (you see your own name, everyone else is "User #N"), personal and server recaps are
members-only, and the public username lookup on the landing page is off. Five one-click privacy
presets range from "Maximum Privacy" to "Public Showcase", and a "What this exposes" preview is
written from three perspectives (admin, visitor, member) and always ends with the reminder that
sign-in still guards everything else. A recurring rule from QA: previews must never overstate or
understate exposure, and onboarding and admin must use identical wording.

**Anti-enumeration as a design value.** Anyone who is not allowed to see a recap gets a
byte-identical "not found" response whether the user doesn't exist, has opted out, is behind a stale
mapping, or used a wrong or revoked link. The landing lookup returns the same answer for unknown and
opted-out usernames. Share links never carry the sequential internal user id.

**The operator can always recover.** Bootstrap claim tokens are printed to the console; a mistaken
cross-site origin setting can be repaired from the one page that is exempt from the check; clearing
the origin is refused if it would lock everyone out; the destructive instance reset shows the new
claim token before wiping and prints it to the console too.

**Environment always wins, and the UI says so.** Any setting supplied by the deployment environment is
shown read-only with an "environment" badge and a sentence explaining that the value is owned by the
container configuration. Stored values shadowed by the environment are deleted at startup rather than
silently ignored.

**Warnings inform; they rarely block.** A reverse-proxy mismatch, a missing AI key, or a first sync
still running all warn and let the admin continue.

**No false success.** A save that was discarded because another tab changed the settings must never
toast "Saved". Every settings form carries a version and conflicts produce a clear "changed in another
tab, reload" error with a reload action.

**Plain, active, specific copy.** A dedicated copy audit removed "please", em dashes used as pauses,
marketing adjectives and passive voice. Obzorarr is named as the actor ("Obzorarr finished syncing
your viewing history"), "Wrapped" is always capitalised, failures name the thing that failed, empty
states say what to do next ("No sync history yet. Run your first sync to see results here.").

**Speed through caching and background work.** Statistics are computed on demand, cached per
user-year for an hour, invalidated precisely by the sync that changes the underlying rows, and
served with no-store headers so anonymisation and access rules are always applied per request. Opening
a recap triggers a best-effort background "live sync" so the numbers are fresh without making the
visitor wait.

## Users, roles and permissions

| Role | Who | Can do |
| --- | --- | --- |
| Administrator | The **owner** of the configured Plex server (ownership is proven against Plex, re-derived on every session revalidation, never assigned manually). There is exactly one admin identity. | Everything: onboarding, admin panel, settings, sync control, slide editing, user sharing overrides, instance reset. Can open any user's recap read-only by internal id for inspection. Still bound by the privacy floor. |
| Member | Any Plex account that currently has the server shared with them and has signed in. | Personal dashboard, own sharing preferences for the current year, own recap, members-only recaps of others, the server recap when it is members-only or public. |
| Anonymous visitor | Anyone else. | Landing page, public recaps, private-link recaps when holding the token, the server recap only if it is public, the landing username lookup only if the admin enabled it. |

Rules that must hold:

- A member keeps access only while a **fresh identity mapping** (see Identity reconciliation) proves
  they are still shared on the server. Un-sharing removes access to recaps even if a session is still
  alive; re-sharing and a sync restore it.
- Admin pages redirect anonymous visitors to the landing page with a safe return path (path only, no
  query string, so nothing leaks through Plex's redirect logs); signed-in non-admins are sent to their
  dashboard. Admin form actions answer "forbidden"; member form actions without a session answer
  "unauthenticated" rather than crashing.
- Nobody, including the admin, can set a share mode more open than the global privacy floor.

## Domain model

### Entities

| Entity | Identity | Key facts | Lifecycle |
| --- | --- | --- | --- |
| **User** | Plex account id (global, unique) | Also stores the *server-local* account id used by history rows (the owner is always local account 1; shared users' local id equals their Plex id), username, email, avatar, admin flag. | Upserted at login and by reconciliation. Never deleted by un-sharing; history outlives membership. |
| **Plex account mapping** | Server-local account id | Maps local ids to Plex ids, usernames, avatars and an owner flag. Replaced wholesale by each successful reconciliation, together with a proof record (epoch, machine id, config fingerprint, confirmation time). | Fresh for 24 hours; invalidated immediately when the Plex URL, token or machine id changes. |
| **Play history record** | Plex history key (unique) | Rating key, title, type (movie, episode, track), viewed-at time, local account id, library section, artwork reference, duration (seconds), show title and key, season title, genres, release year. | Inserted by sync with duplicates ignored; enriched later; cleared only by the admin per year or wholesale. |
| **Metadata cache entry** | Rating key | Duration, genres, release year, fetched-at, failed flag. | Written once; no expiry; a failed key is never refetched. |
| **Sync run** | Sequential id | Started/completed times, records processed, high-water mark (latest viewed-at), status (running, completed, failed, cancelled), error text. | At most one in *running* at any time. Interrupted runs are marked failed at startup. |
| **Cached statistics** | (local account id or none for server-wide, year, kind) | Serialised statistics plus calculation time. | One-hour time-to-live; invalidated per year by sync and enrichment; entries that fail schema validation are treated as missing. |
| **Share settings** | (user, year) — unique | Stored mode, mode source (default or explicit), optional private-link token, optional public slug, per-user "can control" flag, per-user logo preference. | Created lazily; tokens minted lazily and only in private-link mode; slugs minted lazily when first shared or viewed. |
| **Slide configuration** | Slide type | Enabled flag and sort order, global across years. | Missing types are appended as enabled on every recap load. |
| **Custom slide** | Sequential id | Title (1–200 chars), content (1–10,000 chars of lightweight text markup), enabled, sort order (shared space with built-ins), optional year (none means every year). | Admin-created, edited, deleted. |
| **Application setting** | Key | Value plus a millisecond last-updated time used for optimistic concurrency. | Env-shadowed keys are deleted at startup. |
| **Session** | Random id in a cookie | User, the user's own Plex token, admin flag, expiry. | 7-day fixed lifetime; no sliding renewal; lazily deleted when expired; all of a user's sessions deleted on loss of membership. |
| **Sign-in transaction** | Random state value | Plex PIN id, expiry, callback-verified flag. | 15-minute lifetime; one per browser via a cookie. |
| **Log entry** | Sequential id | Level, message, free-text source, structured metadata, timestamp. | Retained 7 days / 50,000 entries by default; nightly cleanup. |

### Relationships and invariants

- Statistics, cache keys and the percentile population are all keyed by the **server-local account
  id**, never by the internal user id. The internal id is used only for sessions, share settings and
  admin inspection URLs.
- Exactly one share-settings row per (user, year); exactly one slug and one token per row, even under
  concurrent creation.
- A private-link token belongs to one year. Tokens from one year must never resolve or be revealed on
  another.
- Watch history is never deleted when a user leaves the server; server-wide stats still count them and
  name them "User {local id}" when no name is known.
- Built-in slide order is global; custom slides may be year-scoped.

## Core behaviours and workflows

### First-run onboarding

Until onboarding is complete, every page except static assets, sign-in and the onboarding helpers
redirects to the current onboarding step. The server stores one "current step" pointer; a browser
cannot jump ahead, every step action re-checks that it is the current step, and three steps offer
"Previous", which only moves the pointer back. Seven steps:

1. **Claim.** So nobody can hijack a fresh install, the first request prints a banner to the server
   console with the setup URL and a one-time bootstrap token of the form xxxx-xxxx-xxxx (12 random
   lowercase alphanumerics). The token lives only in memory, never in logs or storage, expires after
   **15 minutes** (a new one is printed after expiry), and is compared in constant time. A successful
   claim stores a hashed proof and sets a strict same-site cookie: the claim lasts **30 minutes**, renews
   on every onboarding page load and action (so a slow Plex sign-in does not lose it), and only one
   browser may hold it; a second browser gets "already claimed in another browser". Claim attempts are
   limited to 5 per 5 minutes per client. An already-onboarded instance refuses claims as "invalid
   token" without destroying the live token (so a reset in flight still works).
2. **Security (cross-site request origin).** Shows whether access looks direct or proxied and the
   detected origin. If the public origin is set by the environment the card is locked. Otherwise the
   admin can accept the detected origin, type one, "Detect", and must pass a "Test" that compares the
   typed origin with the one the browser actually sends before "Save & Continue" enables. "Skip" records
   an explicit opt-out. Until an origin exists or is skipped, every admin page shows a security warning
   banner whose dismissal takes two confirmations and can be re-enabled later.
3. **Reverse proxy / public address.** A diagnostic runs automatically and never blocks. It compares
   the **browser origin**, the **origin the app believes it has**, and the **origin a proxy forwards**
   (last hop only), and classifies the forwarded headers (usable, missing, partial, invalid) and the
   source address (loopback, private LAN, container range, overlay network, public, unknown). Outcomes
   each have an illustration: *already matches* (success), *set the public origin to X and restart*
   (warning), *open the app at its intended public address* (warning), and *diagnostic could not
   finish* (danger, with an explicit note that this does not prove misconfiguration, plus re-run). A
   details panel shows the evidence, a safety note that the public-origin setting needs no forwarding
   headers, and copyable header recipes for the common reverse proxies.
4. **Connect Plex.** Sign in with Plex (popup by default, same-tab redirect as a fallback or on
   request). If the server URL and token come from the environment, a locked card shows the server name
   with the URL masked, probes it live, and only the proven owner may continue; a reachable server that
   plex.tv does not list can be claimed with an explicit "I confirm I am the owner" override that
   verifies the machine identity with the user's own token. Otherwise the admin picks from their
   **owned** servers, expands one to see its connections sorted secure-direct, remote, local, relay (local
   plex.direct addresses hidden; a public plex.direct address synthesised if none is advertised), and
   clicking a connection tests and saves it in one go. A custom URL (for a reverse-proxied Plex) is
   tested then auto-saved. Plain-HTTP Plex is allowed only for private/local hosts with an explicit
   opt-in.
5. **Sync.** "Start Sync" imports the current year with a live progress ring, phase text, counters and
   an enrichment bar; it reconnects if the stream drops. Continue is enabled as soon as a sync has
   started; it runs on in the background.
6. **Configure.** A four-panel carousel saved in one submission: *Appearance* (UI theme and Wrapped
   theme), *Privacy* (six preset cards, live "what this means" preview, collapsed advanced options),
   *Slides* (toggle each built-in slide), *AI fun facts* (enable, frequency, provider key, base URL,
   model, persona, test connection; a missing key never blocks and falls back to templates).
7. **Done.** Confetti, a configuration summary, sync status, a notice if fun facts are in template
   mode pointing to the Connections settings, and "Go to Dashboard", which is the only thing that
   actually marks onboarding complete and clears the claim.

### Sign-in and sessions

Identity is Plex's PIN-based sign-in:

- The server mints a PIN with Plex, records a transaction with a random state, and sets a 15-minute
  same-site cookie carrying that state. The user is sent to Plex's hosted sign-in page with a forward
  URL back to Obzorarr. An optional return path must be a safe same-origin path (single leading
  slash, no backslashes or control characters, at most 2048 characters) and is validated on the server,
  on the redirect page and again on the client.
- **Popup mode (default):** the opener polls every two seconds for up to five minutes; the popup page
  verifies the state on return, announces completion to the opener (as a speed-up only, never as
  proof), and closes. Closing the popup counts as cancel. If the popup is blocked (common in Safari and
  privacy browsers), a modal offers "Continue to Plex" in the same tab or cancel.
- **Redirect mode:** chosen explicitly, or automatically for automated browsers. The pending PIN is
  kept in session storage with a 15-minute staleness limit; a token-free server fallback covers
  browsers without storage.
- Completion requires that the callback state matched the cookie, then checks membership of the
  configured server with the user's token. During onboarding it additionally requires an active claim
  and ownership. On success the user row is upserted, a **7-day session** is created holding the user's
  own Plex token, and the user lands in the admin panel or the dashboard (onboarding always wins).
- **Revalidation:** after 15 minutes since the last check, the next request re-proves membership and
  ownership against Plex and the live server identity. Lost access or an explicit "unauthorised" from
  Plex deletes **all** of the user's sessions. Transient failures (timeouts, upstream 5xx) get a grace
  window: up to four consecutive failures or 60 minutes, then that one session is invalidated.
  Certificate errors and malformed responses are not transient. Revalidation is skipped while
  onboarding is incomplete so a flaky Plex cannot strand the owner mid-setup.
- Logout is a POST-only action with a confirmation dialog; a GET does nothing but redirect, so an
  image tag or prefetch cannot sign someone out.
- A development-only bypass can impersonate the owner, a random member, or a named account; it is
  inert outside development mode.

### Data collection: sync

Sync pulls the server's complete play history through the Plex history endpoint using the **server
token**, page by page (pages of 100, stopping early on an empty page so a misbehaving server cannot
loop forever), optionally filtered by "viewed after" a watermark.

Three ways to choose the start point:

| Mode | Start point |
| --- | --- |
| New activity only (default) | The high-water mark of the most recent *completed* run. Cancelled and failed runs never supply a watermark. |
| Full | No completed run with a watermark exists, so everything is fetched. |
| Backfill from year | Midnight UTC on 1 January of a chosen year (2000–2100). |

Phases of a run:

1. **Claim the single running slot** atomically. This is the only real single-flight guard; the admin
   button also pre-checks and answers "conflict" with a persistent, screen-reader-announced banner if a
   sync is already running. Cancel answers "bad request" when nothing is running.
2. **Account reconciliation** (below). A failure here only warns ("Top Contributors may show generic
   usernames") and never blocks history.
3. **History fetch.** Each item must have a history key, library section, type, integer viewed-at and
   account id; otherwise the whole envelope is rejected and the sync fails. Items without a rating key
   or title (deleted media, non-library content) are skipped, counted and logged. Rows are inserted with
   duplicates ignored on the history key, so re-fetching the boundary record or re-running a backfill is
   idempotent. Progress (processed, inserted, skipped, page) is kept in memory and persisted
   periodically; the abort signal is honoured between pages.
4. **Cache invalidation.** If anything was inserted, cached statistics are cleared for every year from
   the watermark year to the newest viewed-at year, for every user and for the server.
5. **Enrichment.** Only if something was inserted: scan the whole history table for rows missing
   duration, genres or release year; fetch metadata for rating keys not already in the metadata cache
   with bounded concurrency (default 8, clamped 1–20); record failures as "fetch failed" so they are
   never retried; apply grouped updates; then clear cached statistics for exactly the years touched,
   which may include older years outside the sync window. Counts distinguish enriched, skipped (cache
   hit or already filled) and genuinely failed.
6. **Completion.** Mark completed with the count and the maximum viewed-at as the new watermark.

Failure rules: any error marks the run failed with its message; inserted rows stay (no rollback) and
the next run is idempotent. An error while cancellation is in progress records *cancelled*. Any run
still marked running at process start is marked failed with "Interrupted by restart", otherwise the
stuck row would block every future sync. A known weakness: an incremental run that finds nothing
leaves no watermark, so the following run re-fetches full history (harmless because of dedup, but
slow).

**Live sync.** Not a poller. Opening the server recap, a personal recap, or a successful landing
lookup fires a best-effort background sync, guarded in order by: the feature being enabled (environment
value wins over the stored setting; default on), a **3-minute cooldown** counted from the last
*completed* live sync, nothing already running, and an in-process lock with a 30-minute safety release.
The page renders immediately with current data; signed-in viewers see a progress overlay and the page
reloads its data when the run ends. A landing lookup sets a short-lived cookie so the destination page
knows to show the overlay and, if the run fails, a toast: "Could not refresh your viewing history from
Plex. Showing the most recent data instead."

**Progress streams.** Two live streams exist: an admin stream with full progress and a reduced
member stream (phase and small counters only, never titles, names or error text). The reduced stream
is open to anonymous visitors only while onboarding is incomplete; the gate is re-checked on every tick
so an anonymous stream closes when onboarding finishes. Scheduled runs do not populate the in-memory
progress record, so they show no live progress and cannot be cancelled from the UI (a weakness).

**Clearing data.** The admin can clear cached statistics or play history per year or wholesale. Clearing
history does **not** reset the watermark, so a backfill is required to re-import it.

### Identity reconciliation

Plex history records a *server-local* account id, not a global identity, so each sync rebuilds the
mapping from four sources: the owner's identity from Plex, the list of **accepted** shares for this
exact machine (not deleted or left, consistent invitation ids, no duplicates, and any pagination
evidence must exactly describe the whole list), the server's own local account list, and proof that the
owner owns this server resource. The rule is **all-or-nothing**: if any source is partial or any shared
user cannot be correlated with a local account, the previous snapshot is kept rather than guessed. The
write happens in one transaction that re-checks that the Plex URL/token fingerprint, authority epoch and
machine id did not change while it ran; conflicting pairs abort the run. On success, user rows are
upserted, stale mappings removed and a proof record stored.

A mapping is **fresh for 24 hours** (allowed at 23:59:59, denied at exactly 24:00:00). Non-admins need a
fresh, exactly matching mapping to view or act on any recap, whether by slug, token or id. Changing the
Plex URL or token advances an "authority epoch" at startup and invalidates the proof, so the next sync
must re-prove every identity; the operator documentation tells operators to back up before changing either.

### Statistics engine

Statistics are computed from history rows whose viewed-at falls inside the calendar year in **UTC**
(all date bucketing is server-side UTC, not the viewer's zone — a known limitation). Watch time is the
sum of item durations (full runtime; abandoned plays count in full; duplicates were already dropped at
ingest; a missing duration counts as zero). Per-user and server-wide statistics run the same
calculators; user stats filter by local account id and add a percentile; server stats add the number
of active viewers and a top-viewers leaderboard, and their series completion counts unique episodes
across everyone.

| Statistic | Definition and rules |
| --- | --- |
| Total time and plays | Minutes summed; plays counted. "Has history" means either is positive. |
| Top movies | Grouped by **title** (same-titled films merge), ranked by plays, ties alphabetical, top 10 kept, first artwork seen. |
| Top shows | Episode plays grouped by show title; count is episode plays, not unique episodes; top 10. |
| Top genres | Each genre on a play counts once; malformed genre data is skipped silently; top 10. |
| Monthly / hourly / weekday distributions | Fixed 12 / 24 / 7 buckets of minutes and plays; their sums must equal the totals. Weekday is stored Sunday-first and displayed Monday-first. |
| Content type | Counts and minutes for movies, episodes, tracks; unknown types ignored. |
| Decades | By release year, labelled "2000s" style, oldest first; unknown years skipped. |
| Rewatches | Items (by rating key) played **2 or more** times; top 10 by count. |
| Marathon day | The UTC date with the most minutes, earliest wins ties, **capped at 1,440 minutes** because summed runtimes can exceed a day; up to 10 item titles kept. |
| Streak | Longest run of consecutive UTC days with at least one play; earlier run wins ties; several plays in a day count once. |
| Binge session | Plays sorted by time; a play joins the session if it starts within **30 minutes** of the previous play's end; the longest session by content minutes wins, earlier wins ties; a single play is a valid session. |
| First / last watch | Earliest and latest play; episodes titled "Show: Episode". |
| Year comparison | Null if both years are zero; +100% if last year was zero; otherwise percent change to one decimal. |
| Percentile (personal only) | Share of accounts with *strictly less* watch time among all accounts with any play that year; ties count as not-less; the top of N viewers gets (N−1)/N. |
| Series completion | Unique episodes watched per show against the show's total episode count fetched from Plex in a batch; percent rounded and capped at 100; top 10 by episodes watched. If the batch lookup fails the recap still renders but totals equal watched, so shows read as complete (weakness). |
| Top viewers (server only) | Top 10 local accounts by minutes; names from the account mapping, then local users, then "User {id}". |

Determinism is a tested requirement: rows are read in time order, every tie-break is defined, and five
forced recomputations must produce identical results. Fun facts are the deliberate exception (random
or AI-generated on each load).

**Caching.** A computed result is stored per (account, year, kind) with a **one-hour** time-to-live,
replaced on recompute, invalidated by sync and enrichment per year, cleared by the admin per year or
wholesale, and treated as missing if it fails the strict read-back schema (arrays of exactly 12/24/7,
rewatch count at least 2, percentages 0–100). Anonymisation and artwork signing are applied *after* the
cache read, per request, and recap pages are served no-store.

### Slides and the Wrapped experience

**Slide catalogue.** Sixteen configurable built-in slides, plus fun-fact slides inserted
automatically, custom slides, and a top-viewers slide that replaces the percentile slide on the server
recap — nineteen kinds. Default order, all enabled: total time, top movies, top shows, genres,
distribution, weekday patterns, content type, decade, series completion, rewatch, marathon, streak,
year comparison, percentile, binge, first/last. The summary end card is a page, not a slide.

| Slide | Shows | Empty-state rule |
| --- | --- | --- |
| Total time | "You watched N hours" (minutes under an hour; counts up only when 24 h or more) with a days/weeks comparison line. | — |
| Top movies / shows | Top **6** with artwork and play or episode counts. | "No movies/shows watched this year" |
| Genres | Top **5** as bars scaled to the leader, fixed colour per genre. | "No genre data available" |
| Distribution | Months and hours; side by side on wide screens, otherwise one chart with a toggle; peak labelled; hours are UTC. | — |
| Weekday patterns | Monday-first, peak day, weekend share of minutes. | — |
| Content type | Donut and cards (tracks only if present) plus a personality badge: 60%+ gives Movie Buff / TV Addict / Music Lover; both movies and episodes 40%+ gives All-Rounder; else Balanced Viewer. | — |
| Decade | Timeline plus an era badge ("Y2K vibes", "Classic cinema lover", …). | "No release year data available" |
| Series completion | Top **5** with progress colour steps; badge Completionist (5+ complete), Dedicated Viewer (2+), Serial Sampler (10+ series), else Explorer. | "No series data available" |
| Rewatch | Top **5** with ×N; badge by total rewatches: Creature of Habit (>50), Comfort Seeker (>20), Has Favorites (>10), else Explorer. | "Every play this year was something new." |
| Marathon | Date, duration, item count, six thumbnails then "+N more". | — |
| Streak | Days, date range, flame tiers at 14 and 30 days, messages at 3/7/14/30. | — |
| Year comparison | Two bars, arrow, ±%; under 5% is "About the same"; stronger wording above 25% and 50%. | "No previous year data available" |
| Percentile | "Top X%" where X = max(1, 100 − rank), highlighted at 10 or better; messages at 1/5/10/25/50. | — |
| Binge | Wall-clock span, content time, plays, local date and time. | — |
| First / last | Two cards. | — |
| Fun fact | Icon, fact, optional comparison line. | — |
| Custom | Title plus sanitised rich text. | — |
| Top viewers | "Top Contributors": top 10 with gold/silver/bronze and compact durations ("2d 3h"). | — |

A slide that is enabled is always shown, with its own empty state; nothing is auto-hidden for lack of
data. When there is no history at all for the year, the whole slideshow is replaced by a friendly
"No viewing history for {year} yet" page (personal) or "No {year} data yet" (server), the latter
returned as a normal page, not an error — but only after access has been checked, so anonymous
visitors cannot distinguish an empty year from a private one.

**Configuration rules.** Built-in order and enablement are global across years; any slide type missing
from the configuration is appended as enabled whenever a recap loads. Custom slides carry an optional
year (none means evergreen) and share one sort-order space with built-ins. Custom content is authored as
lightweight text markup, rendered on the server and then reduced to an allow-list of headings,
paragraphs, line breaks, rules, lists, emphasis, code, quotes, links and images. Saving is **refused**
(with a specific reason that does not echo the input) when content contains script tags, inline event
handlers, script-scheme links, or base64-embedded scripts; rendered output additionally strips every
class and inline style attribute (an author's class could otherwise pick up the app's own full-screen
layout utilities), forces links to open in a new tab without referrer, restricts link schemes to web and
mail, and allows inline images only in raster formats (never vector or markup images).

**Fun-fact placement.** Frequency setting: few = 2, normal = 4 (default), many = 8, custom = 1–15 per
recap. Facts are capped at one fewer than the number of slides, never placed first or last, and spread
evenly through the deck; users with no history get none.

**Story mode (default).** Full-screen. Tap anywhere except the left 15% to advance; the left 15% goes
back. Horizontal swipes over 50 px navigate. Arrow keys, space, enter, home, end and escape work and are
throttled. On phones, round arrow buttons appear. There is **no auto-advance and no timer**; the
segmented progress bar fills past segments, pulses the current one and dims future ones. A "Tap to
continue" hint shows on the first slide. Transitions are a short horizontal slide (about half a
second) in the direction of travel; the incoming slide then plays its own entrance. Advancing past the
last slide opens the summary. Closing returns to the previous page if you arrived from the same site,
otherwise to the landing page. The current slide index is kept in the URL fragment as a deep link
without polluting history; "Watch Again" resets it.

**Scroll mode.** All slides stacked as full-height sections with an "N / total" counter; each reveals
as it scrolls into view and reverses when scrolled back; escape closes; there is no summary at the end.
Switching back to story mode returns to the last story position rather than the scrolled slide
(a gap).

**Motion.** Named spring presets (gentle, snappy, bouncy, impactful, list item), list stagger that
tightens as item counts grow, exponential ease-out count-ups, and full instant-state fallbacks under
reduced motion.

**Page chrome.** Mode toggle top-right (icon-only on phones; on personal pages only when there is
history). Year navigation as a pill bottom-left, shown only when more than one year of server data
exists; "previous" means the older year. For visitors other than the owner, other years link only to
*existing* share identifiers (nothing is minted, private-link years are omitted, no other year's token is
ever revealed); a year without a link falls through to the server recap. The logo is shown or hidden
according to the admin's logo mode (always show by default, always hide, or user choice; under user
choice the owner has an eye toggle that saves immediately, defaulting to shown).

**Summary page.** "{user}'s {year} Wrapped" or "{year} Server Wrapped" with cards for hours, top
movie, top show, top genre, "Top X%" or active viewers, and the longest binge (hidden if it rounds to
zero); buttons Watch Again, Share, Return Home (admin panel, dashboard or landing page by role). Focus
lands on the heading so a stray Enter does not trigger a button.

**Voice.** Personal recaps address "you/your". The server recap speaks as "{Server name} Community" (or
"we/our" when the server has no name) and always uses plural verbs. Fun-fact templates and the AI
prompt follow the same rule.

### Fun facts

Every recap load generates fresh fun facts (never cached, skipped for users without history, errors
swallowed so the recap always renders). The generation context is: hours, days, plays, top movie and
count, top show and episode count, percentile (fixed at the median for server scope), longest binge
hours and plays, peak hour and month, first and last titles, unique movies and shows, scope, plus
"could watch X N times" ratios against well-known long-running shows and film series.

Eight **template categories**, each with applicability requirements and minimum thresholds set slightly
above the comparison so a "1×" fact never appears: time equivalency (flights, book-reading, walking,
sleep cycles, film marathons, coffee breaks, commutes, podcasts), content comparison (top movie three or
more times, top show ten or more episodes, variety), behavioural insight (90th/75th percentile, night
owl with peak at 21:00 or later, early bird with peak at 09:00 or earlier and 10+ plays, peak month,
plays per day), binge-related (6 h, 3 h, 5 items), temporal pattern (first, last, bookends and a
no-requirement fallback), achievement (100 h, 200 h, 500/1,000 plays, 50 movies, 50 episodes of one
show, top movie ten times, 20 shows), social comparison (number one, top 5%, top 15%, above average,
climbing, community fallbacks), entertainment trivia (the show ratios). Templates are selected by
weighted random draw without replacement; percentile templates are excluded for server scope; if none
applies the list is simply empty.

**AI mode** is enabled when a provider key and a valid https base URL are configured. The provider is
any AI text service with a chat-completions style interface; a default model name is provided and
reasoning-style models are detected by name and sent the request shape they require. Four personas
(witty, wholesome, nerdy, random). The system prompt fixes the persona, a celebratory tone, the
pronoun rule for the scope, a request for an emoji icon per fact, and a strict structured reply shape.
Requests have a short timeout and two retries on rate-limit, server-error, timeout and network
failures; other client errors fail at once. If the AI returns fewer facts than needed, templates fill
the gap; any AI error falls back to templates entirely. A "test connection" sends a minimal ping and
maps authentication failures and unknown-model/base-URL failures to specific messages. The key is
stored server-side and never returned to the browser.

### Sharing and access control

Three personal share modes, ordered by privacy level:

| Mode | Label | Who can view | Link form |
| --- | --- | --- | --- |
| Public (level 0) | Public | Anyone with the link. | 22-character opaque slug |
| Private link (level 1) | Private Link | Only holders of a long random per-year token; the owner and admins also need it. Regenerating the token invalidates the old link. | token |
| Members only (level 2) | Server Members Only | Any signed-in member (the session itself proves membership). | slug |

Global settings: a **default share mode** (applies to users who have not chosen; fresh install default
is members-only via the Balanced preset), an **allow user control** flag, and a **server recap share
mode** that is public or members-only only (private-link has no meaning server-wide; an invalid or
missing value falls back to members-only).

Effective-mode rules:

- Default-sourced rows follow the live global default. Explicit rows keep their stored value, but the
  effective mode is the **stricter** of the stored value and the global default — the default therefore
  doubles as the **privacy floor**. Relaxing the floor reveals stored choices again.
- Effective user control is the per-user flag AND the global flag.
- Nobody can save a mode below the floor (admins included); regenerate is refused when the floor is
  above private-link; the UI disables options below the floor and explains why.
- "Apply defaults to existing users" rewrites only default-sourced rows and reports updated and
  skipped counts; explicit choices are never overwritten.
- When the global default moves away from private-link, tokens on default-sourced rows are wiped.
- Tokens are stripped from every payload unless the effective mode is private-link, and even then
  exposed only to the owner or an admin. An admin inspecting by internal id mints nothing and sees no
  token.
- With public landing lookup enabled, the effective mode for the **current year** becomes public,
  except that when user control is allowed an explicit non-public user choice stays as an opt-out.

Identifier resolution for a personal recap URL is decided purely by shape: a long random token is
looked up as a private link (its year must match; if the row or floor is members-only, signed-in users
pass and anonymous ones get not-found; a token whose page became public is treated as stale); an
all-digits identifier resolves only for the owner or an admin; a 22-character slug names a public or
members-only page and access is still checked (a private-link page reached by slug is not found).
Slugs carry about 131 bits of randomness and are minted lazily. Anonymous denials of every kind are a
byte-identical not-found with the message "We couldn't find a Wrapped page for that link." Signed-in
users keep a more specific forbidden/not-found split.

**Share modal** (from the recap or summary): copies the slug or token link; shows the mode choices to
the owner (when control is allowed) or an admin, with floor-blocked options disabled; offers regenerate
only in private-link above the floor; explains that members-only recipients must sign in; tells an
owner without control where that is decided; on the server recap it is just the link.

**Member dashboard.** "Welcome back" with cards for the personal recap ("Appears here once you have
viewing history this year") and the server recap, plus a settings page for the current year: share
mode with floor notes, copy link, regenerate private link behind a confirmation, logo preference (only
under user-choice mode), and session expiry. The page is served no-store so floor changes show at once.

**Artwork.** All thumbnails are served through an app-side proxy so browsers never see the server
token and artwork follows the same sharing rules as its page: every artwork reference in a statistics
payload is rewritten to a signed URL that encodes the path, the kind (server or user), the year, the
user, a hash of the share token if any, and a **30-minute** expiry. Each request re-checks access, so
regenerating a private link also revokes its old artwork URLs. Responses are private and no-cache;
conditional requests are passed through to Plex.

### Anonymisation and privacy presets

Names in shared statistics (currently the server recap's top-viewers list; fun facts and percentiles
carry no names; admin pages always show real names) follow one of three modes: **real**, **anonymous**
("User #N" by leaderboard position), or **hybrid** (the signed-in viewer sees their own real name,
everyone else is anonymised; anonymous visitors see everyone anonymised). Fresh installs default to
hybrid, and a corrupt stored value also falls back to hybrid. Pseudonyms are positional, so they shift
when the ranking changes, but the same input always yields the same output and counts and order are
preserved.

Five **privacy presets** set six fields at once (names mode, personal default share mode, server recap
mode, public landing lookup, allow user control, logo mode); a sixth **Custom** card lights up when the
advanced fields match no preset:

| Preset | Names | Personal default | Server recap | Public lookup | User control |
| --- | --- | --- | --- | --- | --- |
| Maximum Privacy | anonymous | members-only | members-only | off | no |
| Internal Community | real | members-only | members-only | off | yes |
| Balanced (recommended, default) | hybrid | members-only | members-only | off | yes |
| Public Showcase | real | public | public | on | yes |
| Anonymous Public | anonymous | public | public | on | **no** (forced anonymity only holds if users cannot reveal themselves) |

All presets keep the logo always shown. A preset is a client-side convenience, never a stored field: the
admin "apply preset" writes the ordinary settings across three separately versioned groups in one
transaction, and if any group changed since the page loaded nothing is written and the message names the
stale sections. The admin page matches on five fields (logo excluded, since it lives under Appearance),
so a differing logo mode cannot drag a perfect match to Custom. On a fresh install no card is
highlighted and the "your choices don't match a preset" note appears only after the admin interacts.
Clicking Custom during onboarding seeds the Balanced values the first time.

### Landing lookup

Off by default; enabled by the admin. When off, the landing page shows "This server requires sign-in to
view Wrapped" with a Plex sign-in button, and a crafted lookup request is refused outright. When on, a
visitor can type a Plex username (1–100 characters, trimmed, matched case-insensitively against *fresh*
mappings resolving to exactly one user); unknown users, users without history this year, ambiguous
identities and opted-out or non-public users all receive the same not-found message. On success the app
triggers a non-blocking live sync, mints or reuses the public slug, and redirects to the current-year
recap. The lookup never creates users or share rows, never mints or reveals a private-link token, and
never uses the internal id. Lookups are limited to 10 per minute per client.

### Scheduling

Automatic sync runs on a standard five-field schedule expression (default: midnight daily; presets for
hourly, every six hours, midnight, 3 AM, weekly), validated by the app itself with stable error
messages. Overlapping ticks are skipped and each tick re-checks that no sync is running. The operator's
intent — running, paused or stopped — is persisted and rebuilt at boot, because the live job exists only
in memory; a stored expression without a state row restores as running. Changing only the expression
keeps the current state (an inactive scheduler stays inactive and says so). Pausing is an explicit
operator flag distinct from "currently executing". A log-retention job runs nightly at 03:00 in the same
zone.

**Time zone resolution:** the environment zone (only if it names a known IANA zone; case-insensitive,
canonicalised), else the admin's System setting (only if known), else UTC. Fixed offsets such as +02:00
are rejected because they have no daylight-saving rules and "midnight local" would be wrong half the
year. Zone changes apply live to both jobs. Admin scheduler actions are serialised through one queue and
write their state before touching the live job; tests require the stored state and the live job to agree
after many interleavings.

### Settings concurrency

Every settings form carries the version (latest update time) of its key group; a save with a missing,
blank or older version answers "conflict" with "Settings changed in another tab. Reload and try again."
and a reload action, and the success path is cancelled. Every successful write advances the version
strictly (never backwards, even after a clock correction) and returns the version it actually wrote so
two consecutive saves from one page succeed. Key groups are deliberately narrow (server-recap privacy,
user defaults, public lookup, cross-site origin, each appearance field, scheduler zone, log settings,
connections) so saving one form cannot falsely conflict with another. Deleting a connection value also
bumps a bookkeeping marker so a stale tab cannot resurrect a cleared secret.

### Instance reset

Under Data settings, a danger-zone card explains what comes back (watch statistics, which re-sync from
Plex), what does not (all settings, every per-user share setting, **every share link already handed
out**, curation, log history), and what is untouched (anything supplied by the environment). Three
stages: an explanatory dialog that writes nothing; a dialog showing a fresh **60-minute** claim token
with a copy button where the admin must type RESET exactly; then the wipe of every table in one
transaction while holding the sync slot (reset is refused while a sync runs). Afterwards the admin is
signed out, the scheduler stops, an audit entry is written, and the browser lands on the claim screen.
The token is also printed to the console as usual.

### Logging

Four levels (debug entries are dropped unless the debug switch is on), a free-text source, structured
metadata and a millisecond timestamp. Every entry goes to the console and, in small batches, to the
persistence layer. **Redaction runs before both**: credentials in URLs, token-like query parameters,
token/authorisation/cookie fields in structured payloads and headers, and any metadata key resembling
token, secret, password, cookie, session or key, recursively. Raw Plex hosts, server names and machine
ids appear only as short fingerprints with a coarse category (plex.direct, localhost, private IP,
container range, public domain, public IP, invalid). The bootstrap token never passes through the
logger at all. Retention defaults to 7 days and 50,000 entries, enforced nightly and on demand.

## External integrations

**Plex Media Server and Plex's account service.** Authentication is a token in a header (never in the
query string) plus client identification headers. Two kinds of token are used: the **server token**
configured by the admin (history, metadata, server identity, local accounts, artwork, owner identity,
accepted shares, owned-resource proof) and the **user's own token** from their session (their list of
servers, for membership and the onboarding server picker). Everything is pull/poll; nothing is pushed
from Plex. Data read: play history with pagination and a viewed-after filter; per-item metadata (duration,
genres, release year, episode counts and artwork for shows); the server's root for reachability and
friendly name; the identity endpoint for the machine identifier; the local account list; the owner's
profile; accepted shares for the machine; the resources list with secure connections. Nothing is ever
written to Plex. Failure handling is described per workflow above; the general rule is: history
validation failure fails the sync, metadata failure never does, identity-source incompleteness keeps the
previous mapping, membership-check transience gets a grace window, and every connection error is
sanitised to a fixed phrase ("Authentication failed. Check the access token.", "This does not appear to
be a Plex Media Server", "Connection timed out…") before reaching a user. Connection tests cap the
whole request including parsing at about ten seconds. Server-URL matching tolerates plex.direct hostnames
(embedded machine id, embedded IP and port), plain host and port, public address, and normalised origin,
in that priority after a live identity check.

**AI text provider (optional).** Any service exposing a chat-completions style interface over https;
configured by key, base URL and model; used only for fun facts; always with a template fallback.

**Web fonts.** Theme typefaces are loaded on demand from a public web-font service, once per theme; the
content security policy allows exactly that origin.

## User interface

### Information architecture

- **Landing page:** hero ("Year in Review", "Spotify Wrapped-style summaries for your Plex Media
  Server"), either a username lookup form or a sign-in call to action, and a note on what still needs
  sign-in. Signed-in members are redirected to their dashboard.
- **Member area:** dashboard (personal and server recap cards) and a sharing settings page.
- **Recap pages:** the server recap per year and personal recaps per year and identifier, each in story
  or scroll mode with the summary page, share modal and year navigation.
- **Onboarding:** the seven-step wizard with a non-clickable step indicator, logo and caption.
- **Admin panel:** sidebar with Dashboard, Wrapped, Slides, Sync, Users, Logs, Settings; a footer with
  the admin's avatar, a logout button behind a confirmation, and a selectable version string (release,
  nightly with short hash, or dev tag). On phones the sidebar is a drawer with focus trap, escape to
  close and the page made inert behind it.

### Admin screens

| Screen | Shows / lets you do |
| --- | --- |
| Dashboard | "Server overview for {year}" with a Live badge; cards for distinct viewers in synced history, hours watched (and days), total plays, history records; a sync status card (last run, records, duration, scheduler state, next run with expression and zone, or a prompt to configure a schedule); a Wrapped card whose "My Wrapped" link appears only when the admin has plays this year (never link to a page that would 404 or create a share row for nothing); quick links. |
| Wrapped hub | Year picker over years that have data (disabled with an explanation when only one); My Wrapped and Server Wrapped cards; links to slide configuration, privacy and display settings. |
| Slides | One ordered list of built-in and custom slides; reorder by drag or by labelled up/down buttons; enable toggles; custom rows with year badge, edit and inline delete confirmation; a modal to create or edit a custom slide (title, content, year or all years, enabled, server-rendered preview; validation keeps what was typed); fun-fact frequency with a status line saying whether AI or templates are active. |
| Sync | Mode choice (new activity only, or full history from a chosen year); start/cancel with live progress; scheduler status, pause/resume/initialise/stop, expression with presets, zone link; sync history 8 per page with first/previous/next/last. |
| Users | Per-year table: user (avatar, admin badge, masked email), watch time, effective share-mode badge (Public / Members-only / Link / Default), per-user "can control" toggle, link to their recap; a legend and a note that synced viewers who never signed in follow the global names setting; table becomes cards on phones. No delete, ban or role editing exists. |
| Logs | Stat chips, filters (levels, case-insensitive search over message and source, source, date range, clear all), live view with pause/resume and auto-scroll, table with expandable metadata and copy, cursor-based load more (100 default, 500 max), export up to 10,000 entries, run cleanup and clear all behind confirmations. |
| Settings: Appearance | UI theme, Wrapped theme (five presets each: Modern Minimal default, Supabase-style teal, Doom-64-style retro orange, Amber Minimal, Soviet Red), Wrapped logo mode; each its own form. |
| Settings: Connections | Plex URL, token ("stored, leave blank to keep"), allow insecure local HTTP (private hosts only); AI key, base URL (https only), model with clear buttons; test buttons that reuse a stored secret only if the URL (and model) still match what was stored, so a test can never send a saved secret to a freshly typed address; environment-locked fields disabled with a badge, and a submitted locked field yields "Some fields are controlled by environment variables and were not changed." |
| Settings: Privacy | Preset cards and apply-preset; "Current (saved)" versus "After you save" previews with an unsaved-sections banner; advanced options in three separately saved cards (server recap sharing, public landing lookup, user sharing defaults) plus "apply defaults to existing users" behind a confirmation. |
| Settings: Security | Cross-site origin field with a mismatch warning dialog spelling out the lockout and recovery, clear (refused unless the environment supplies the origin or skip is on), skip toggle, re-enable warning banner; the public-address diagnostic with toasts only on manual re-run. |
| Settings: Data | Stats cache count/clear and play history count/clear, per year or all; the reset danger zone. |
| Settings: System | Scheduler zone (locked when the environment sets it), log retention 1–365 days, max log entries 1,000–1,000,000, debug toggle, system info (version, uptime, platform). |

### Interaction patterns

- Save buttons show a spinner and "Saving…", are disabled while busy, and sit in a right-aligned
  action bar; success and error states have equal visual weight. Toasts appear top-right with a close
  button (success about 4 s, error about 7 s); identical toasts within a moment are deduplicated; a
  success without a message says the neutral "Done".
- Every destructive or risky action asks for confirmation; the riskiest (CSRF warning dismissal,
  instance reset) use two or three staged dialogs.
- Live data (sync progress, logs) arrives over server-push streams that reconnect on error; progress
  displays clear themselves a few seconds after a terminal state.
- Empty states are specific and actionable; busy buttons show a verb ("Testing...", "Claiming…").
- Error page titles: "Page not found", "Access denied", "Too many requests", "Something went wrong",
  with direct one-line descriptions and Go back / Home buttons; the bare status number is hidden for
  not-found.

### Theming, responsiveness, accessibility, localisation

The app is dark-only with five selectable themes applied via a theme cookie read before first paint to
avoid a flash. Three additional "premium" recap themes (obsidian, aurora, champagne) exist in the
stylesheet but are not selectable. The mobile breakpoint is 768 px; tables collapse to cards; the recap
uses dynamic viewport height. Accessibility practices are consistent: labelled fields, invalid/described-by
only while an error exists, assertive live regions for errors, named radio groups with roving tabindex,
switch roles on toggles, pressed state on toggles, focus trapped in dialogs and drawers and restored on
close, inert backgrounds behind modals, status announcements, one top-level heading per settings page,
and accessible names on every slide. All copy is English only; there is no localisation layer, and
time-of-day statistics are presented in UTC rather than the viewer's local time.

## Configuration and operations

**Deployment shape.** A single self-hosted instance (one process plus an optional thin front process)
with one embedded relational store on a persistent volume, typically run as a container behind the
operator's reverse proxy. There is no clustering; rate limits, live-sync locks and sync progress are
process-local.

**Configurable by environment (authoritative, locks the UI field):** Plex server URL and token; the AI
provider key, base URL and model; the **public origin** (the address people open in the browser —
required for plain-HTTP deployments, optional only behind an HTTPS proxy that preserves the host; must be a
bare scheme+host+port, normalised, and a value with a path, query, fragment or credentials stops startup
with an error that never echoes the value); optional header names for proxy-supplied protocol/host (only
without the public origin and only when every request passes through a proxy that overwrites both) and
for the client address (with a proxy depth count, default 1, for per-client rate limiting); the time
zone; metadata concurrency; live-sync enablement; listen host and port; persistence path; client idle
timeout (default 10 s, streams exempt); shutdown drain budget (default 30 s, to be kept below the
container stop timeout); request body limit (default half a megabyte; the app has no uploads). Placeholder
values from the sample configuration (for example a literal "your token here" or the default localhost
Plex address without a real token) are treated as unset so an unedited sample never trips onboarding.

**Configurable in the admin UI:** everything listed under the settings screens, plus slide order,
custom slides, fun-fact frequency, and per-user sharing overrides.

**Startup sequence (once, memoised):** run pending schema migrations; delete stored settings shadowed by
authoritative environment values; if the effective Plex URL/token fingerprint changed, advance the
authority epoch and invalidate the cached machine id and identity proof; warn once about the retired
proxy-trust switch and delete it; mark interrupted syncs failed; start log retention and restore the
scheduler in the effective zone (failures here are logged, not fatal); print the bootstrap banner on the
first request while onboarding is incomplete. On shutdown, stop both jobs, flush logs, drain open requests
and streams up to the budget, then exit even if a Plex call is still outstanding; a second signal exits
immediately; a hang-up is treated like a stop.

**Front process.** When the public origin is set, a small front binds the public port before the app
loads, forwards requests over a private local socket, stamps the origin itself on every request (client
headers cannot change it), suspends the idle timer while the app starts, answers service-unavailable
while unreachable, and owns graceful shutdown. Without the public origin the app serves directly and
derives its origin from proxy headers or assumes https plus the host header, warning once at startup.

**Persistence and backups.** One file-based relational store plus its write-ahead files on the configured
path; back it up before changing the Plex URL or token. Migrations run automatically on start. Only watch
statistics are reconstructible from Plex; settings, sharing choices and share links are not.

**Upgrades.** The schema has evolved through ten migrations (release-year and show-key columns, indexes,
mode source, sign-in transactions, update timestamps for concurrency, cascading share settings, public
slugs, de-duplication of share rows). Upgrade backfills are conservative: public lookup stays off until an
administrator enables it; an old proxy-trust switch is ignored and removed with a warning.

**Health and smoke checks.** A production smoke check starts the real entry point and requires a redirect
to the claim page with the exact setup title and form, then a clean exit. A lookup QA script verifies the
opaque redirect, the uniform not-found, the eleventh-lookup rate limit, the 24-hour freshness boundary and
fail-closed behaviour on authority changes.

**Privacy posture.** Data stays on the operator's instance. Public exposure is opt-in per surface
(personal default mode, server recap mode, landing lookup). Secrets are never returned to the browser.
Logs redact tokens and fingerprint hosts. Artwork never leaks the server token. No analytics or telemetry
exist.

## Security

- **Request pipeline:** scanner filter → rate limiting → cross-site origin check → initialisation →
  security headers → authentication → onboarding gate → admin authorisation.
- **Scanner filter:** quiet not-found for well-known probe paths (environment files, version-control
  directories, blog and database-admin tooling, framework consoles, script gateways) and forbidden for
  known scanner user agents.
- **Rate limits (fixed window, per client address; skipped with a one-time warning if no address can be
  determined, favouring availability):** default 60/min; sign-in family 10 per 5 min; sign-in polling
  60/min; sign-in redirect 30/min; onboarding claim 5 per 5 min; API 30/min; landing page 30/min; landing
  lookup 10/min; admin diagnostic 12/min. Responses carry retry-after and remaining/reset headers and come
  as a form-action error, a structured error body or a branded page depending on the caller.
- **Cross-site request protection:** state-changing requests must present an origin (or referrer) equal
  to the configured origin; missing or mismatched gets forbidden. If no origin is configured after
  onboarding and it was not explicitly skipped, every state-changing request is refused (so the warning
  banner is not cosmetic). The single exemption is the Security page's own origin-update action, keyed on
  route and action only, so a bad origin can be repaired without a restart. Cookies are additionally
  same-site restricted (lax for sessions, strict for the claim).
- **Origin and forwarded headers:** only the last proxy hop is trusted; protocol must be http or https;
  hosts with whitespace, control characters or URL-structural characters are rejected; forwarded headers
  never change the app's own notion of its URL or its strict-transport decision.
- **Headers on every response, including early returns:** deny framing, no sniffing, strict referrer
  policy, a permissions policy denying camera/microphone/geolocation, one-year strict transport (https
  only), and a nonce-based content security policy allowing scripts from self only, images from self and
  Plex's hosts (including the image proxy Plex uses for some avatars) and inline data, fonts from the
  web-font service, network connections to self and Plex only, no framing, self-only base and form
  targets.
- **Cookies:** the secure flag is set exactly when the public origin is https (including on deletion), so
  plain-HTTP LAN installs still work; session and claim cookies are http-only; the theme cookie is
  script-readable by design.
- **Credentialed URLs:** settings URLs may not embed credentials, query or fragment; the AI base URL must
  be https; plain-HTTP Plex is allowed only for private hosts with an explicit opt-in.
- **Error sanitiser:** unexpected errors are logged and the user sees "Something went wrong. Try again.";
  expected errors pass through; network failures map to fixed phrases; stacks never reach the client.
- **Anti-enumeration and link hygiene:** uniform anonymous not-found on recaps and lookups; no sequential
  ids in share links; return paths restricted to safe same-origin paths and stripped to the pathname;
  sign-in redirects allowed only to Plex's hosted sign-in; sign-in responses redacted to username, admin
  flag and an allow-listed destination.
- **Content injection:** custom slide content is rejected when it contains scripts, handlers or
  script-scheme links, and rendered output is reduced to an allow-list with classes and styles stripped and
  image sources restricted to raster formats.
- **Secrets:** the server token, AI key, thumbnail signing secret and claim proof are never sent to the
  browser; the claim token is never logged; test buttons never send a stored secret to a changed
  address.
- **Trust assumptions:** anyone who can read the server console can claim a fresh install; the operator's
  reverse proxy is trusted only to the extent the public-origin setting says; Plex's account service is
  the identity authority; a signed-in session is taken as proof of membership for members-only pages
  between revalidations.

## Non-functional requirements

- **Scale:** a household or friends-and-family server — tens of viewers, a few hundred thousand history
  rows at most. Sync is paged and idempotent; enrichment is concurrency-bounded and cached forever per
  item; statistics are computed per account-year on demand and cached for an hour.
- **Latency:** recap pages render immediately from current data and refresh in the background; admin
  pages stream progress rather than polling pages.
- **Reliability:** one sync at a time, interrupted runs self-heal at boot, scheduler intent survives
  restarts, identity mapping fails closed (keeps the previous snapshot) rather than guessing, cache
  entries that fail validation self-heal by recomputation, settings writes are optimistic-concurrency
  safe across tabs and clock corrections.
- **Graceful shutdown:** open requests and live streams get a bounded drain; force-closed streams end
  cleanly so browsers reconnect.
- **Determinism:** the same history must always yield the same statistics; only fun facts may vary.

## Known weaknesses and improvement ideas

Concrete problems found in the source, tests and history, with generic directions:

1. **All date bucketing is UTC.** Hourly, weekday, monthly, marathon-day and streak calculations ignore
   the viewer's or server's zone, so "peak hour" is wrong for most people. Compute distributions in the
   configured scheduler zone (or a per-user zone) and say which zone is used.
2. **Watch time is full runtime, not time watched.** Plex history does not carry watched duration, but
   abandoned plays inflate totals and binge lengths. Consider weighting by view offset where available,
   or at least labelling totals as "runtime of everything you played".
3. **Top movies group by title.** Same-titled films merge; remakes and foreign-title collisions are
   miscounted. Group by rating key and display the title.
4. **Series completion degrades silently.** When the episode-count lookup fails, shows read as 100%
   complete. Prefer hiding the percentage or marking totals unknown.
5. **Hybrid anonymisation likely mis-identifies the viewer.** The leaderboard is keyed by local account
   id but the viewer is compared by internal user id, so "your own name" probably shows only when the
   two coincide. Compare on the same identity.
6. **Scheduled syncs are invisible.** Only admin-triggered and live syncs publish progress and can be
   cancelled. Unify all sync starts behind the same progress record.
7. **Empty incremental runs drop the watermark**, causing a needless full re-fetch next time. Carry the
   previous watermark forward when nothing new arrives.
8. **Clearing history does not reset the watermark**, so cleared rows never come back without a manual
   backfill. Offer to reset the watermark when clearing.
9. **Metadata cache never expires and never retries failures.** Transient Plex errors permanently leave
   items without duration or genres. Add a retry window for failed keys and a long expiry.
10. **Pre-check and claim of the sync slot are not atomic**: a lost race after the button already said
    "started" surfaces only as a background failure. Make the start path return the claim result.
11. **Copy drift:** the claim page says claims expire after 10 minutes (real value 30); onboarding
    fun-fact options describe 1–2 / 3–5 / 6–10 while the backend uses 2 / 4 / 8; the settings index
    describes Security and Data sections inaccurately; the binge slide hint says "2+ plays" while the
    engine accepts single-play sessions; the summary page says "Your Year in Review" on the server recap;
    the percentile slide's "out of N viewers" line can never render. Pin copy to constants shared with
    the logic.
12. **Scroll-to-story position is not carried over** when switching modes, and scroll mode has no
    summary. Share one position store between modes and end scroll mode with the summary.
13. **Rate limiting, live-sync locks and sync progress are process-local**, and limits are skipped when
    no client address is known. Fine for one instance, but document it and consider a persisted limiter.
14. **Sessions never slide or rotate**; a 7-day fixed lifetime signs active users out mid-week. Consider
    sliding expiry with rotation on privilege change.
15. **Three premium recap themes exist but are unreachable** from the UI; either expose them or drop them.
16. **Anonymisation is positional**, so a user's pseudonym changes whenever rankings change; a stable
    per-user pseudonym (seeded hash) would make year-over-year sharing coherent.
17. **Logs page client-side filter** matches message only while the server matches message or source;
    unify.
18. **No localisation layer** and English-only copy; the slide system is a good candidate for
    message catalogues since all strings are already centralised for the privacy copy.
19. **Property test out of date:** one sharing property still claims users cannot enable private-link,
    while the service allows it; the service is the source of truth.
20. **Dormant code paths:** a current-streak field, a session-extension routine and a rate-limit cleanup
    routine exist but are never used.

## Glossary

| Term | Meaning |
| --- | --- |
| Wrapped / recap | The yearly statistics slideshow, personal or server-wide. |
| Server Wrapped | The server-wide recap: aggregate statistics plus the top-viewers leaderboard. |
| Story mode / scroll mode | Tap-through full-screen slides versus one continuous scrolling page. |
| Slide | One screen of the recap; sixteen built-in kinds plus fun facts, custom slides and top viewers. |
| Summary page | The end card after the last slide with headline numbers and share/replay actions. |
| Fun fact | A generated one-liner with an optional comparison, from templates or an AI provider, interspersed between slides. |
| Bootstrap / claim token | The console-printed one-time token that lets exactly one browser perform first-run setup. |
| Claim | The 30-minute, single-browser right to run onboarding, held in a cookie. |
| Public origin | The address users open in the browser; the basis for links, sign-in redirects, cookies and cross-site checks. |
| Public-address diagnostic | The check comparing browser origin, app origin and proxy-forwarded origin, with recommended fixes. |
| Environment-locked | A setting supplied by the deployment environment, shown read-only with a badge. |
| Server token | The Plex token configured by the admin, used for all server-side Plex reads. |
| Local account id | Plex's server-local viewer id found in history rows; the owner is always 1. |
| Identity mapping / reconciliation | The all-or-nothing rebuild of local-id-to-Plex-identity mappings on every sync; fresh for 24 hours. |
| Authority epoch | A counter advanced whenever the Plex URL or token changes, invalidating identity proofs. |
| Sync | A run that imports play history from Plex; modes: new activity, full, backfill from year. |
| Live sync | A best-effort background sync triggered by viewing a recap, with a 3-minute cooldown. |
| Watermark | The latest viewed-at time of the last completed sync; the start point of the next incremental run. |
| Enrichment | The post-sync phase filling duration, genres and release year from item metadata. |
| Share mode | Public, Private Link or Server Members Only; the effective mode is the stricter of the user's choice and the global default. |
| Privacy floor | The global default share mode acting as the minimum privacy level nobody can go below. |
| Mode source | Whether a user's share row follows the default or holds an explicit choice. |
| Public slug | The 22-character opaque identifier used in public and members-only links. |
| Share token | The long random per-year token that unlocks a private-link recap; regenerable. |
| Names mode | Real, Anonymous ("User #N") or Hybrid (own name visible, others anonymised). |
| Privacy preset | One of five bundles of six privacy fields, plus the client-only Custom card. |
| Public landing lookup | The admin-enabled username search on the landing page that opens eligible current-year recaps without sign-in. |
| Uniform not-found | The identical response given to anonymous visitors for every denied or missing recap. |
| Settings version | The timestamp carried by each settings form for optimistic concurrency. |
| Logo mode | Always show, always hide, or user choice for the Obzorarr logo on recap pages. |
| Instance reset | The staged, admin-only wipe that returns the instance to the claim screen with a 60-minute token. |
