---
version: 1
slug: "route-admin-sign-in"
primary_target: "route:/admin/sign-in"
related_targets: []
---

# Obzorarr Owner sign-in

## Status

Proposed brief for review, with no mockup yet. Mode: **operate**. Audience: **the instance's owner**. Route: `/admin/sign-in`. Module: `sign-in` ([docs/SPEC-sign-in.md](../../docs/SPEC-sign-in.md)).

## Purpose and composition

The owner's door to the admin panel: one quiet, centred form within the 672px form width, the claim's sibling (`route-setup.md`). No sidebar or member navigation; the header has only the Obzorarr logo and wordmark and the language switcher. Operational, not expressive: no projector-light imagery. Members never use it: they sign in with Plex from `/`.

## Visual reference

None yet. Use the shared [design system](../../DESIGN.md) and match the claim page: flat `surface` panel with a 1px border, `h1` heading, labelled fields, one solid primary button.

## Required content

Heading 'Sign in to Obzorarr'. Fields: 'Username', 'Password' (with the claim's Show/Hide control). Primary action 'Sign in'; while submitting 'Signing in…', and the button can't be pressed twice. Below the form, a disclosure 'Forgot your password?' that opens three steps: 'Set OBZORARR_RECOVERY=true in the environment and restart Obzorarr.', 'Copy the recovery token printed in the server console.', 'Open /recovery and set a new password.'

## Acceptance criteria

- A wrong username or password gets one message, 'Username or password is wrong.', in an assertive live region, never saying which; the username is kept and the password cleared.
- Too many attempts: 'Too many attempts. Try again in {minutes} minutes. Behind a reverse proxy, set ADDRESS_HEADER so each visitor is counted apart.', beside the button, which stays usable once the wait is over.
- A browser that stripped its address gets the 'Access denied' page that names `ORIGIN` (the spec's wording).
- The password field is a real password field with `autocomplete="current-password"`; the username has `autocomplete="username"`, so password managers fill both.
- Later modules add below the form: `oidc-sign-in` its button, `public-address` its address hint. Leave room without placeholders for them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports, in English and Danish. Translated text wraps without hiding the primary action.
- States: initial, wrong credentials, too many attempts, submitting. After success the browser leaves the page.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md, docs/SPEC-sign-in.md and this brief first. Reuse the claim page's components and Panda CSS tokens; build native accessible form controls. Keep it quiet: this is an operational screen.
