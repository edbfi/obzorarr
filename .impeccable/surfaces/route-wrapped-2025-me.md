---
version: 1
slug: "route-wrapped-2025-me"
primary_target: "route:/wrapped/2025/me"
related_targets: []
---

# Obzorarr Portrait story and summary

## Status

Proposed design seed for review. Mode: **experience**. Audience: **Member**. Proposed route: `/wrapped/2025/me`.

## Purpose and composition

Two large portrait web viewports side-by-side, no phone hardware. Left total-time story, right final summary card. Keep content large.

## Visual reference

[Detailed mockup](../../docs/design/screens/03-story-and-summary.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

Left segmented story progress with Pause and Close; 'You watched', huge '842', 'hours in 2025', 'Movie Buff'. Cyan projector beam behind abstract cinema silhouette. Right 'Alex’s 2025', 127 movies, 38 series, Longest streak 21 days; 'Share recap', 'Back to overview', Members only badge.

## Acceptance criteria

Pause/close labelled controls; private by default. One dominant idea per slide. Other viewer identities absent.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

[Mobile board](../../docs/design/screens/09-mobile-member.webp), middle view.

Three narrow mobile web viewports share one board: dashboard, story and sharing form. No physical devices. Reflow the same desktop components at 390px width. No owner navigation on mobile member screens. Keep identical palette and labels to desktop. Each bottom action clear and touch-sized. Reduced motion preserves the final story state.

Required content: Story 842 hours, segmented progress, Pause and Close.

## Recap states

[States and components board](../../docs/design/screens/10-states-and-components.webp), separate specimens; each is its own state of this route, not one screen.

- Empty recap: 'No viewing history for 2025 yet.' and 'Back to overview'.
- Share dialog: Members only, Copy link, Close.

Error, empty and privacy states do not disclose other viewers. Color is never the sole status cue.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Use fixture totals in demo-fixtures.json when constructing charts; raster chart labels and server totals are illustrative.
- Under a members-only privacy floor, anonymous private-link and public choices are disabled. A copied member link still requires authentication.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
