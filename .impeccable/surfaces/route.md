---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: []
---

# Obzorarr Landing and Plex sign-in

## Status

Proposed design seed for review. Mode: **persuade**. Audience: **Visitor**. Proposed route: `/`.

## Purpose and composition

Two-column welcoming landing. Restrained cyan projector-light illustration occupies one third; a clean sign-in block is focal point.

## Visual reference

[Detailed mockup](../../docs/design/screens/01-landing.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

Heading 'Your year in stories.' Text 'Sign in with Plex to see your personal recap.' Primary 'Continue with Plex'. Secondary 'How it works' link. Three short factual steps Sign in, Open your Wrapped, Choose how to share. Small 'Your recap is visible to server members only.' No username lookup form or disclosed member stats.

## Acceptance criteria

Signed-out navigation contains only Obzorarr and Help. Sign-in uses provider redirect. Do not show real viewer details.

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
