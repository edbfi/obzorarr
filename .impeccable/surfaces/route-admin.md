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

[Detailed mockup](../../docs/design/screens/05-admin-dashboard.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Server overview for 2025'. 24 viewers, 12,460 hours, 3,842 plays. Last sync 5 min ago; Next sync Today 23:00 UTC; scheduler Active. 'Sync new activity'. Activity chart is yearly history, not real-time streams. 'Preview server Wrapped' secondary. Sync history text rows.

## Acceptance criteria

Only owner sees this screen. Do not display active streams or concurrent playback. No count-up animation implied in admin metrics.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Sync and status states

[States and components board](../../docs/design/screens/10-states-and-components.webp), separate specimens; each is its own state of this route, not one screen.

- Sync running: 'Syncing history… 2,400 of 3,842 records' with Cancel.
- Buttons: primary, secondary and disabled.
- Status text: Active, Attention, Failed.

Error and status states do not disclose other viewers. Color is never the sole status cue.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Use fixture totals in demo-fixtures.json when constructing charts; raster chart labels and server totals are illustrative.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
