---
version: 1
slug: "route-admin-settings-privacy"
primary_target: "route:/admin/settings/privacy"
related_targets: []
---

# Obzorarr Privacy settings and exposure preview

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Owner admin**. Proposed route: `/admin/settings/privacy`.

## Purpose and composition

Settings tabs Appearance, Connections, Privacy, Security, System. Main privacy form plus separate comparison preview with Current saved and After saving headings.

## Visual reference

None yet. Use the shared [design system](../../DESIGN.md).

## Required content

'Privacy'. Presets Maximum privacy, Members only selected, Public showcase. Toggle Public username lookup OFF. Server recap Members only. Member default Members only. 'Apply defaults to existing users' unchecked. 'Save privacy settings'. Exposure preview rows Visitor cannot open recaps; Member can see permitted recaps; Owner can administer.

## Acceptance criteria

Saved and draft previews distinct. No success toast for conflict. Privacy explanation accurate; public lookup remains off.

- Under a members-only privacy floor, anonymous private-link and public choices are disabled. A copied member link still requires authentication.
- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Conflict state

'Settings changed in another tab.' with Reload. Text and icon convey the state; color is never the sole cue.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
