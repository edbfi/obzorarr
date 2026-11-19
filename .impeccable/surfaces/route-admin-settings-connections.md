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

None yet. Use the shared [design system](../../DESIGN.md).

## Required content

Plex address 'https://plex.example', key 'Stored •••• 4821', replace field blank labelled 'New token'. Test connection and Save connection. Public address read-only: when `ORIGIN` is set, its value with lock label 'Managed by deployment'; otherwise 'Not set: links use the address you're on'. Appearance selected After Hours; Interface theme and Wrapped theme independent. Muted receipt 'Connection verified'.

## Acceptance criteria

Never reveal stored token. Separate save actions per form. Re-test credentials against the intended unchanged destination.

- Appearance has two independent values, interfaceTheme and wrappedTheme; seed both to After Hours, and invent no other theme names.
- `ORIGIN` is optional, so the public address carries no caption saying it is used for generated links.
- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
