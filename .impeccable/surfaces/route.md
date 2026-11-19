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

None yet. Use the shared [design system](../../DESIGN.md).

## Required content

Heading 'Your year in stories.' Text 'Sign in with Plex to see your personal recap.' Primary 'Continue with Plex'. Secondary 'How it works' link. Three short factual steps Sign in, Open your Wrapped, Choose how to share. Small 'Your recap is visible to server members only.' No username lookup form or disclosed member stats.

## Acceptance criteria

Signed-out navigation contains only Obzorarr, Help and the language switcher (`LanguageSwitcher.svelte`, docs/SPEC-i18n.md). Sign-in uses provider redirect. Do not show real viewer details.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
