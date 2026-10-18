---
version: 1
slug: "route-admin-slides"
primary_target: "route:/admin/slides"
related_targets: []
---

# Obzorarr Wrapped slide configuration

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Owner admin**. Proposed route: `/admin/slides`.

## Purpose and composition

Three-pane ordered slide list, concise controls and portrait live-style preview. Same operational shell as admin dashboard.

## Visual reference

[Detailed mockup](../../docs/design/screens/06-admin-slides.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Build the recap'. Rows Total time, Top movies, Top shows, Genres, Streak, Year comparison; each Enabled toggle and Move up / Move down buttons. Selected Genres shows preview bars Drama 42%, Sci-fi 31%, Comedy 18%, Other 9%. Fun facts frequency Normal. 'Save slide order'.

## Acceptance criteria

Keyboard reorder controls alongside drag handles. Global configuration applies to recaps across years. No custom raw HTML request controls.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
