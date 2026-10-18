---
version: 1
slug: "route-sharing"
primary_target: "route:/sharing"
related_targets: []
---

# Obzorarr Member sharing preferences

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Member**. Proposed route: `/sharing`.

## Purpose and composition

Narrow settings form with compact left subnav Profile / Sharing, clear grouped radio choices, audience-preview panel on right.

## Visual reference

[Detailed mockup](../../docs/design/screens/04-member-sharing.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

Members only selected. Private link (anonymous) and Public disabled under the server's members-only privacy floor. Copy member link remains available and requires Plex authentication. Unsaved changes and saved audience preview distinct.

## Acceptance criteria

Public disabled under members-only privacy floor. Distinguish saved versus draft preview. No global privacy settings.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

[Mobile board](../../docs/design/screens/09-mobile-member.webp), right view.

Three narrow mobile web viewports share one board: dashboard, story and sharing form. No physical devices. Reflow the same desktop components at 390px width. No owner navigation on mobile member screens. Keep identical palette and labels to desktop. Each bottom action clear and touch-sized.

Required content: Members only, the member link panel (labelled 'Private link' in the raster; see the raster corrections), Save sharing preferences. The panel must be implemented as an authenticated Member link under this privacy floor.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Under a members-only privacy floor, anonymous private-link and public choices are disabled. A copied member link still requires authentication.
- The mobile 'Private link' panel means an authenticated member link in this seed. Implement its label as 'Member link'; do not silently enable anonymous sharing.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
