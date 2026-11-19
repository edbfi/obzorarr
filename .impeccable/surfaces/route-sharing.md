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

None yet. Use the shared [design system](../../DESIGN.md).

## Required content

Members only selected. Private link (anonymous) and Public disabled under the server's members-only privacy floor. Copy member link remains available and requires Plex authentication. Unsaved changes and saved audience preview distinct.

## Acceptance criteria

Public disabled under members-only privacy floor. Distinguish saved versus draft preview. No global privacy settings.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

Reflow the same desktop components at 390px width. No owner navigation on mobile member screens. Keep identical palette and labels to desktop. Each bottom action clear and touch-sized.

Required content: Members only, the 'Member link' panel, Save sharing preferences. Under this privacy floor the panel is an authenticated member link; do not silently enable anonymous sharing.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
