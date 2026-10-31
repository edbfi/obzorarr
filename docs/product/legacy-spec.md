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
> ground-floor choice 4). Its owner model (the only administrator is the Plex server's proven owner,
> and the app has no accounts of its own) is superseded by D20, its English-only interface by D21,
> its UTC date bucketing by D24, and its watch time is labelled per D23. Sections are deleted as
> approved `docs/SPEC-<id>.md` files cover them, and the file goes once nothing is left (AGENTS.md,
> cleanup procedures).

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

### Data collection: sync

**Clearing data.** The admin can clear cached statistics or play history per year or wholesale. Clearing
history does **not** reset the watermark, so a backfill is required to re-import it.

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
**AI text provider (optional).** Any service exposing a chat-completions style interface over https;
configured by key, base URL and model; used only for fun facts; always with a template fallback.

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

## Security

- **Content injection:** custom slide content is rejected when it contains scripts, handlers or
  script-scheme links, and rendered output is reduced to an allow-list with classes and styles stripped and
  image sources restricted to raster formats.
## Known weaknesses and improvement ideas

Concrete problems found in the source, tests and history, with generic directions:

5. **Hybrid anonymisation likely mis-identifies the viewer.** The leaderboard is keyed by local account
   id but the viewer is compared by internal user id, so "your own name" probably shows only when the
   two coincide. Compare on the same identity.
8. **Clearing history does not reset the watermark**, so cleared rows never come back without a manual
   backfill. Offer to reset the watermark when clearing.
12. **Scroll-to-story position is not carried over** when switching modes, and scroll mode has no
    summary. Share one position store between modes and end scroll mode with the summary.
15. **Three premium recap themes exist but are unreachable** from the UI; either expose them or drop them.
16. **Anonymisation is positional**, so a user's pseudonym changes whenever rankings change; a stable
    per-user pseudonym (seeded hash) would make year-over-year sharing coherent.
17. **Logs page client-side filter** matches message only while the server matches message or source;
    unify.
