---
version: 1
slug: "route-dashboard"
primary_target: "route:/dashboard"
related_targets: []
---

# Obzorarr Member dashboard

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Member**. Proposed route: `/dashboard`.

## Purpose and composition

Airy desktop member overview with simple top nav, a dominant personal recap panel, a narrower server recap panel and watch-month chart beneath.

## Visual reference

[Detailed mockup](../../docs/design/screens/02-member-dashboard.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Welcome back, Alex.' year picker 2025. 'Your Wrapped' with 842 hours, 127 movies, 38 series, 'Open my Wrapped'. 'Our server’s year' with 'View server Wrapped' quieter. Members only badge. Horizontal monthly watch-time bars. Quick link 'Manage sharing'.

## Acceptance criteria

Do not mix admin sidebar into this surface. Recap cards are navigation, not video players. No play/stream buttons.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

[Mobile board](../../docs/design/screens/09-mobile-member.webp), left view.

Three narrow mobile web viewports share one board: dashboard, story and sharing form. No physical devices. Reflow the same desktop components at 390px width. No owner navigation on mobile member screens. Keep identical palette and labels to desktop. Each bottom action clear and touch-sized.

Required content: Welcome back Alex, 2025, Open my Wrapped, server recap.

## Year picker state

[States and components board](../../docs/design/screens/10-states-and-components.webp), input focus specimen; each specimen on that board is a separate state, not one screen. Focused labelled year field.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Use fixture totals in demo-fixtures.json when constructing charts; raster chart labels and server totals are illustrative.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
