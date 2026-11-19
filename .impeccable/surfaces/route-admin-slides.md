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

None yet. Use the shared [design system](../../DESIGN.md).

## Required content

'Build the recap'. Rows Total time, Top movies, Top shows, Genres, Streak, Year comparison; each Enabled toggle and Move up / Move down buttons. Selected Genres shows preview bars Drama 42%, Sci-fi 31%, Comedy 18%, Other 9%. Fun facts frequency Normal. 'Save slide order'.

## Acceptance criteria

Keyboard reorder controls alongside drag handles. Global configuration applies to recaps across years. No custom raw HTML request controls.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
