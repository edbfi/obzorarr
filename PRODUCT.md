# Obzorarr product context

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

## Product requirements

- Plex sign-in only; no local member accounts or passwords.
- Personal and server recaps default to members-only; public username lookup off. Other viewers anonymized as User #2.
- The owner is the sole administrator. Members have no user, sync or server configuration controls.
- Viewing hours count full item runtimes, not exact playback time. No live now-playing dashboard.
- Keep admin privacy floors in force; do not offer a public choice when members-only is required.

## Confirmed visual direction

After Hours. Cool dark cinema, cyan projector light, crisp geometric typography. Expressive imagery and light beams only on landing/recap surfaces; dashboards use flat ocean-blue surfaces. Header wordmark Obzorarr. The selected direction is confirmed; these expanded layouts and exact token values are a proposed design seed for review.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation.

## Product source and rewrite proposals

Read [the legacy product specification](docs/product/legacy-spec.md) for domain behavior and current gaps. Routes in this handoff describe proposed information architecture, not implemented endpoints.

The new direction changes the interface; preserve the original specification's authorization and lifecycle behavior.
