---
version: 1
slug: "route-admin-settings-connections"
primary_target: "route:/admin/settings/connections"
related_targets: []
---

# Obzorarr Connection and appearance settings

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Owner admin**. Proposed route: `/admin/settings/connections`.

## Purpose and composition

Owner settings page with two independent configuration sections and narrow appearance preview rail. Flat surfaces, no hero art.

## Visual reference

[Detailed mockup](../../docs/design/screens/08-settings-connections.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

Plex address 'https://plex.example', key 'Stored •••• 4821', replace field blank labelled 'New token'. Test connection and Save connection. Public address read-only with lock label 'Managed by deployment'. Appearance selected After Hours; Interface theme and Wrapped theme independent. Muted receipt 'Connection verified'.

## Acceptance criteria

Never reveal stored token. Separate save actions per form. Re-test credentials against the intended unchanged destination.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Appearance has two independent values, interfaceTheme and wrappedTheme; seed both to After Hours. Do not copy the raster's invented Ocean/Cinema theme names.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
