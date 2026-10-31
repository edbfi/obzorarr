# Obzorarr product context

<!-- impeccable:product-schema 1 -->

A private Plex year-in-review for members, with personal/server recaps and owner administration.

## Platform

web

## Users

Member shell: top navigation Overview, My Wrapped, Sharing, account menu (the member's name). No admin links for members. Owner shell: 224px sidebar Dashboard, Wrapped, Slides, Sync, Users, Logs, Settings, owner footer. Do not invent media playback.

## Primary tasks

- **Visitor:** Landing and Plex sign-in. Proposed route: `/`.
- **Member:** Member dashboard. Proposed route: `/dashboard`.
- **Member:** Portrait story and summary. Proposed route: `/wrapped/2025/me`.
- **Member:** Member sharing preferences. Proposed route: `/sharing`.
- **Owner admin:** Owner dashboard. Proposed route: `/admin`.
- **Owner admin:** Wrapped slide configuration. Proposed route: `/admin/slides`.
- **Owner admin:** Privacy settings and exposure preview. Proposed route: `/admin/settings/privacy`.
- **Owner admin:** Connection and appearance settings. Proposed route: `/admin/settings/connections`.

## Positioning

A Wrapped-style year in review for one Plex Media Server that needs nothing but the Plex server and Plex's own account service: no Tautulli or other history collector, no member accounts of its own, and nothing written back to Plex. Members' identity and membership are proven against Plex rather than assigned in the app: a member keeps access only while the server is still shared with them. The single administrator is the instance's owner, who claims it at first run and signs in as in every edbfi app (D20).

It is private by default and built for a household or friends-and-family server: recaps are members-only on a fresh install, anyone denied a recap gets the same "not found" as for a recap that doesn't exist, and public exposure is an explicit owner choice with a preview of exactly what it exposes. Data stays on the owner's instance, with no analytics or telemetry.

## Operating Context

- **Where it runs:** self-hosted beside the owner's Plex Media Server as one Bun process with one HTTP port in one container, with its database file on a persistent volume. Container packaging lives in the separate `obzorarr-docker` repository. The owner usually reaches it through their own reverse proxy, which onboarding diagnoses rather than assumes.
- **Scale:** one owner and tens of viewers, with a few hundred thousand play-history rows at most. There is one admin account, the instance's owner, and no further roles. One process per database is an accepted limit.
- **Owner's setup ritual:** a fresh install is claimed with a one-time token printed to the server console, which creates the owner account; onboarding then offers two-factor and connects Plex, runs the first sync and sets appearance, privacy, slides and fun facts. Settings supplied by the deployment environment are shown read-only and always win.
- **Data rhythm:** play history arrives by scheduled sync (default daily at midnight in the configured zone) and by a best-effort background sync when someone opens a recap. Statistics are per calendar year. Members open recaps all year, and use peaks at year end.
- **Member's experience:** members sign in with their Plex account, open their own recap and the server recap, and share a link to theirs. The recap is a portrait-first story with a summary card, widened for desktop; the owner's admin panel is an operational tool that also works on phones, where its sidebar becomes a drawer.
- **Legacy app:** replaced by this rewrite, not ported; current rewrite status lives in `docs/SPEC.md`. Its known limitations are revisited, not carried over: watch time is labelled as the runtime of what was played (D23), and statistics use the instance's time zone instead of UTC (D24).
- **Language:** English, the default, and Danish, with dates and numbers formatted for each viewer's locale (D21). The legacy app was English only.

## Product requirements

- Members sign in with Plex only; no local member accounts or passwords. The owner signs in as D20 describes.
- Personal and server recaps default to members-only; public username lookup off. Other viewers anonymized as User #2.
- The owner is the sole administrator. Members have no user, sync or server configuration controls.
- Viewing hours are labelled with what they measure: the runtime of everything played (D23). No live now-playing dashboard.
- Keep admin privacy floors in force; do not offer a public choice when members-only is required.
- Copy is plain, active and specific. In English: no "please", no em dashes as pauses, no marketing adjectives and no passive voice; other languages keep that intent in their own grammar and punctuation. Obzorarr is named as the actor ("Obzorarr finished syncing your viewing history"), "Wrapped" is always capitalised, a failure names what failed, and an empty state says what to do next ("No sync history yet. Run your first sync to see results here.").

## Confirmed visual direction

After Hours. Cool dark cinema, cyan projector light, crisp geometric typography. Expressive imagery and light beams only on landing/recap surfaces; dashboards use flat ocean-blue surfaces. Header wordmark Obzorarr. The selected direction is confirmed; these expanded layouts and exact token values are a proposed design seed for review.

## Evidence on Hand

What exists:
- **Logo:** `src/lib/assets/obzorarr-icon.svg`, used by the README and as the favicon.
- **Design screens:** `docs/design/screens/01-landing.webp` to `10-states-and-components.webp`: generated mockups of the eight proposed routes, a mobile member board and a states board. They are composition references; their text, chart labels and totals are illustrative, and each surface brief lists the raster corrections.
- **Direction reference:** `docs/design/references/after-hours.webp`, the selected After Hours reference.
- **Surface briefs:** `.impeccable/surfaces/*.md`, one per proposed route, each with required content and acceptance criteria. All are marked "proposed design seed for review".
- **Demo fixtures:** `tests/fixtures/demo-fixtures.json`: one fictional member ("Alex") and one fictional server for 2025 (snapshot date 2025-10-15). They are for stable visual tests only; production values come from the server.

What does not exist, and must not be fabricated:
- No real Plex play history, server names, member names or avatars. Use the fictional fixtures and label them as such.
- No demo server and no screenshots of the legacy app in use.
- No testimonials, quotes, user research, adoption numbers, install counts, ratings or press. The app collects no analytics, so there are no usage metrics either.
- No screenshots of a built rewrite; the mockups are not product screenshots.
- No pricing, hosted offering or support commitment.
- No approved Plex brand mark. Surfaces use a labelled generic icon, never a redrawn logo (DESIGN.md).
- No bundled font files yet; they arrive with the first surface, as an owner-approved dependency.

## Product Principles

1. **Private until the owner says otherwise.** Members-only is the starting point, and the privacy floor the owner sets binds everyone, admins included. Anyone denied a recap learns nothing about whether it exists, and every preview states exposure exactly, never more or less than it is.
2. **Plex is the only authority for members.** Members' identity and membership come from Plex and are re-proven, never assigned in the app, and the connected server must belong to the Plex account whose token obzorarr uses. When Plex's answer is incomplete, keep the last proven state rather than guess. Obzorarr reads from Plex and never writes to it.
3. **Honest numbers: label what is measured.** The same history always yields the same statistics, every total says what it measures, and nothing reports success before it is durable. Watch time is the runtime of what was played, and says so (D23).
4. **A yearly recap, not a monitor.** No live now-playing, no media playback, no media management. Scope stays on looking back at a year.
5. **The owner can always recover.** A fresh or reset install is claimed with a token printed to the server console, a misconfigured origin can be repaired without a restart, environment-supplied settings visibly win, and destructive actions explain what they cost before they run.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation. Errors are announced in assertive live regions, and a field is marked invalid and linked to its error message only while it has an error; radio groups are named and use a roving tab index; switches have the switch role, and toggle buttons expose their pressed state; dialogs and drawers trap focus, restore it on close and make the page behind them inert; status changes are announced; each settings page has one top-level heading; and every recap slide has an accessible name.
