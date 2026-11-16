---
version: 1
slug: "route-setup"
primary_target: "route:/setup"
related_targets: []
---

# Obzorarr First-run claim

## Status

Built in `setup`'s task 7 (2026-11-15), code-led, with no mockup. Mode: **operate**. Audience: **the person installing Obzorarr**, who can read the server console. Route: `/setup`. Module: `setup` ([docs/SPEC-setup.md](../../docs/SPEC-setup.md)).

## Purpose and composition

One quiet, centred form within the 672px form width: the first screen a fresh install shows, before anyone is signed in. No sidebar or member navigation; the header has only the Obzorarr logo and wordmark (Decisions) and the language switcher (`LanguageSwitcher.svelte`). Operational, not expressive: no projector-light imagery.

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
- Too many attempts (5 per 5 minutes from one address, or the server busy hashing): 'Too many attempts. Try again in {minutes} minutes. Behind a reverse proxy, set ADDRESS_HEADER so each visitor is counted apart.', beside the button, in an assertive live region; the token stays usable.
- States: initial, field errors, token refused, too many attempts, submitting. After success the browser leaves the page.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md, docs/SPEC-setup.md and this brief first. Reuse existing Panda CSS tokens; build native accessible form controls. Keep it quiet: this is an operational screen.

## Decisions

The owner chose, on 2026-11-15: the header shows the logo (`obzorarr-icon.svg`) beside the wordmark; the token field inserts the dashes as the person types (it still takes the token in any form without JavaScript); and a Show/Hide button with an eye icon sits at the end of the password field.

## Direction contract

THESIS: a console-to-browser handoff. The token from the server console is the one unusual input, so it reads like the console line it came from; everything else is the familiar sign-up form, refusing the card-grid onboarding wizard.

OWN-WORLD: After Hours at its quietest: `background` page, one flat `surface` panel with a 1px `border` and `panel` radius, `text-field` controls on `control-border`, one solid `primary` button, `danger` text for errors, the `secondary` focus ring. No beam, no imagery.

STORY: the person installing Obzorarr sees what to do in one line, copies the token from the console, chooses a username and password, and claims the instance in one submission; a wrong token says where to find the right one.

FIRST VIEWPORT: header with logo, wordmark and language switcher across the form width; below it the panel, centred within 672px: `h1`, the one line, then token, username and password fields with helpers, then the full-width primary button. At 360px the button is above the fold.

FORM: seed: none (pinned) "One quiet, centred form within the 672px form width".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
