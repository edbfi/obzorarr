---
version: 1
slug: "route-admin"
primary_target: "route:/admin"
related_targets: []
---

# Obzorarr Owner dashboard

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Owner admin**. Proposed route: `/admin`.

## Purpose and composition

Operational ocean-blue dashboard with owner sidebar, year selector, simple metric strip, sync status and viewing distribution chart, quick links below.

## Visual reference

None yet. Use the shared [design system](../../DESIGN.md).

## Required content

'Server overview for 2025'. 24 viewers, 12,460 hours, 3,842 plays. Last sync 5 min ago; Next sync Today 23:00 UTC; scheduler Active. 'Sync new activity'. Activity chart is yearly history, not real-time streams. 'Preview server Wrapped' secondary. Sync history text rows.

## Acceptance criteria

Only owner sees this screen. Do not display active streams or concurrent playback. No count-up animation implied in admin metrics.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json), charts' totals included.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Sync and status states

Each is its own state of this route, not one screen.

- Sync running: 'Syncing history… 2,400 of 3,842 records' with Cancel.
- Buttons: primary, secondary and disabled.
- Status text: Active, Attention, Failed.

Error and status states do not disclose other viewers. Color is never the sole status cue.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
