---
version: 1
slug: "route-setup"
primary_target: "route:/setup"
related_targets: []
---

# Obzorarr First-run claim

## Status

Proposed brief for review, with no mockup yet. Mode: **operate**. Audience: **the person installing Obzorarr**, who can read the server console. Route: `/setup`. Module: `setup` ([docs/SPEC-setup.md](../../docs/SPEC-setup.md)).

## Purpose and composition

One quiet, centred form within the 672px form width: the first screen a fresh install shows, before anyone is signed in. No sidebar or member navigation; the header has only the Obzorarr wordmark and the language switcher (`LanguageSwitcher.svelte`). Operational, not expressive: no projector-light imagery.

## Visual reference

None yet. Use the shared [design system](../../DESIGN.md): flat `surface` panel with a 1px border, `h1` heading, labelled fields with helper text, one solid primary button.

## Required content

Heading 'Claim this Obzorarr'. One line: 'Enter the setup token printed in the server console, then create the owner account.' Fields: 'Setup token' (helper: 'Shown as xxxx-xxxx-xxxx. A new one is printed every 15 minutes.'), 'Username', 'Password' (helper: 'At least 15 characters.', with a control that shows what was typed). Primary action 'Claim and create owner'. While submitting: 'Claiming…', and the button can't be pressed twice.

## Acceptance criteria

- Errors sit beside their field with helper/error IDs and `aria-invalid`; a wrong or expired token gets one message that names the console, never which of the two it was.
- After a failed submit, the username is kept; the token and password are not.
- The token field takes the token with or without dashes and in any case; it is not a password field, so the person can check what they typed.
- No other viewer, server or Plex detail appears.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports. Translated text wraps without hiding the primary action.
- States: initial, field errors, token refused, submitting. After success the browser leaves the page.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md, docs/SPEC-setup.md and this brief first. Reuse existing Panda CSS tokens; build native accessible form controls. Keep it quiet: this is an operational screen.
