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

A portrait total-time story, then the final summary card. Keep content large.

## Visual reference

None yet. Use the shared [design system](../../DESIGN.md).

## Required content

Story: segmented story progress with Close; huge '842', 'hours of everything you played in 2025', 'Movie Buff'. Cyan projector beam behind abstract cinema silhouette. Summary: 'Alex’s 2025', 127 movies, 38 series, Longest streak 21 days; 'Share recap', 'Back to overview', Members only badge.

## Acceptance criteria

A labelled Close control; private by default. One dominant idea per slide. Other viewer identities absent.

- No Pause control, since stories never auto-advance, and no 'You watched … hours' wording, since a total says what it measures ([D23](../../docs/decisions.md#d23-watch-time-is-the-runtime-of-what-was-played)).
- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json), charts' totals included.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

Reflow the same desktop components at 390px width. No owner navigation on mobile member screens. Keep identical palette and labels to desktop. Each bottom action clear and touch-sized. Reduced motion preserves the final story state.

Required content: Story 842 hours of everything you played, segmented progress and Close.

## Recap states

Each is its own state of this route, not one screen.

- Empty recap: 'No viewing history for 2025 yet.' and 'Back to overview'.
- Share dialog: Members only, Copy link, Close. Under a members-only privacy floor, anonymous private-link and public choices are disabled. A copied member link still requires authentication.

Error, empty and privacy states do not disclose other viewers. Color is never the sole status cue.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve After Hours. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
