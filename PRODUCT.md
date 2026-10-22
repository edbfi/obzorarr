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

A Wrapped-style year in review for one Plex Media Server that needs nothing but the Plex server and Plex's own account service: no Tautulli or other history collector, no accounts of its own, and nothing written back to Plex. Identity, membership and the single administrator are all proven against Plex rather than assigned in the app: a member keeps access only while the server is still shared with them, and the only admin is the server's proven owner.

It is private by default and built for a household or friends-and-family server: recaps are members-only on a fresh install, anyone denied a recap gets the same "not found" as for a recap that doesn't exist, and public exposure is an explicit owner choice with a preview of exactly what it exposes. Data stays on the owner's instance, with no analytics or telemetry.

## Operating Context

- **Where it runs:** self-hosted beside the owner's Plex Media Server as one Bun process with one HTTP port in one container, with its database file on a persistent volume. Container packaging lives in the separate `obzorarr-docker` repository. The owner usually reaches it through their own reverse proxy, which onboarding diagnoses rather than assumes.
- **Scale:** one owner and tens of viewers, with a few hundred thousand play-history rows at most. There is one admin account, the Plex server's owner, and no further roles. One process per database is an accepted limit.
- **Owner's setup ritual:** a fresh install is claimed with a one-time token printed to the server console, then onboarding connects Plex, runs the first sync and sets appearance, privacy, slides and fun facts. Settings supplied by the deployment environment are shown read-only and always win.
- **Data rhythm:** play history arrives by scheduled sync (default daily at midnight in the configured zone) and by a best-effort background sync when someone opens a recap. Statistics are per calendar year. Members open recaps all year, and use peaks at year end.
- **Member's experience:** members sign in with their Plex account, open their own recap and the server recap, and share a link to theirs. The recap is a portrait-first story with a summary card, widened for desktop; the owner's admin panel is an operational tool that also works on phones, where its sidebar becomes a drawer.
- **Legacy app:** behaviour reference only (see Evidence on Hand); current rewrite status lives in `docs/SPEC.md`. Its known limitations, such as UTC date bucketing and counting full runtimes as watch time, are revisited in the rewrite's specs, not carried over.
- **Language:** English only, as in the legacy app, which had no localisation layer. Adding languages is a spec decision.

## Product requirements

- Plex sign-in only; no local member accounts or passwords.
- Personal and server recaps default to members-only; public username lookup off. Other viewers anonymized as User #2.
- The owner is the sole administrator. Members have no user, sync or server configuration controls.
- Viewing hours are labelled with what they measure; the legacy app counted full item runtimes, and the rewrite's spec decides the method. No live now-playing dashboard.
- Keep admin privacy floors in force; do not offer a public choice when members-only is required.

## Confirmed visual direction

After Hours. Cool dark cinema, cyan projector light, crisp geometric typography. Expressive imagery and light beams only on landing/recap surfaces; dashboards use flat ocean-blue surfaces. Header wordmark Obzorarr. The selected direction is confirmed; these expanded layouts and exact token values are a proposed design seed for review.

## Evidence on Hand

What exists:
- **Logo:** `src/lib/assets/obzorarr-icon.svg`, used by the README and as the favicon.
- **Design screens:** `docs/design/screens/01-landing.webp` to `10-states-and-components.webp`: generated mockups of the eight proposed routes, a mobile member board and a states board. They are composition references; their text, chart labels and totals are illustrative, and each surface brief lists the raster corrections.
- **Direction reference:** `docs/design/references/after-hours.webp`, the selected After Hours reference.
- **Surface briefs:** `.impeccable/surfaces/*.md`, one per proposed route, each with required content and acceptance criteria. All are marked "proposed design seed for review".
- **Demo fixtures:** `tests/fixtures/demo-fixtures.json`: one fictional member ("Alex") and one fictional server for 2025 (snapshot date 2025-10-15). They are for stable visual tests only; production values come from the server.
- **Behaviour reference:** `docs/product/legacy-spec.md`, the shipped legacy app's behaviour, including its QA-derived rules, glossary and a list of known weaknesses. The legacy code is on `legacy-old/v1`, with published releases up to 0.1.11; both are behaviour reference only, not evidence to cite.

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
2. **Plex is the only authority.** Identity, membership and ownership come from Plex and are re-proven, never assigned in the app. When Plex's answer is incomplete, keep the last proven state rather than guess. Obzorarr reads from Plex and never writes to it.
3. **Honest numbers: label what is measured.** The same history always yields the same statistics, every total says what it measures, and nothing reports success before it is durable. How watch time is measured is the spec's decision.
4. **A yearly recap, not a monitor.** No live now-playing, no media playback, no media management. Scope stays on looking back at a year.
5. **The owner can always recover.** A fresh or reset install is claimed with a token printed to the server console, a misconfigured origin can be repaired without a restart, environment-supplied settings visibly win, and destructive actions explain what they cost before they run.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation.

## Product source and rewrite proposals

Read [the legacy product specification](docs/product/legacy-spec.md) for domain behavior and current gaps. Routes in this handoff describe proposed information architecture, not implemented endpoints.

The new direction changes the interface; preserve the original specification's authorization and lifecycle behavior.
