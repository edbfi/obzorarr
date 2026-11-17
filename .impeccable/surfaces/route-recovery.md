---
version: 1
slug: "route-recovery"
primary_target: "route:/recovery"
related_targets: []
---

# Obzorarr Owner recovery

## Status

Built in `sign-in`'s task 13 (2026-11-17), code-led from the claim's page, with no mockup. Mode: **operate**. Audience: **the owner who lost their password**, who can set the environment and read the server console. Route: `/recovery`, which exists only while `OBZORARR_RECOVERY` is on and its token is unused. Module: `sign-in` ([docs/SPEC-sign-in.md](../../docs/SPEC-sign-in.md)).

## Purpose and composition

The claim's form again, for getting back in: one quiet, centred form within the 672px form width, with the same header (logo, wordmark, language switcher) and the same token field (`route-setup.md`). Operational, not expressive.

## Visual reference

None yet. Match the claim page (`route-setup.md`) in the shared [design system](../../DESIGN.md).

## Required content

Heading 'Recover the owner account'. One line: 'Enter the recovery token printed in the server console, then set a new password. Every session ends.' (`two-factor` adds that it turns off.) Fields: 'Recovery token' (helper: 'Shown as xxxx-xxxx-xxxx. Restart Obzorarr for a new one.'), 'New password' (helper: 'At least 15 characters.', with the Show/Hide control). Primary action 'Set new password'; while submitting 'Saving…', and the button can't be pressed twice.

## Acceptance criteria

- After a failed submit the title starts with 'Error: ', and the error summary (D29) is first in the form, as on the claim. Field errors also sit beside their field with helper/error IDs and `aria-invalid`. With JavaScript, focus moves to the summary after each failure; without it, nothing is focused. A wrong or expired token gets one message that names the console, never which of the two it was.
- After a failed submit, neither the token nor the password is kept.
- The token field behaves as the claim's: dashes inserted as typed, any case accepted, not a password field.
- The password field has `autocomplete="new-password"`. The username is never shown before the token is accepted; after success, the admin shell shows it.
- Too many attempts: the sign-in page's message (`route-admin-sign-in.md`).
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports, in English and Danish.
- States: initial, field errors, token refused, too many attempts, submitting. After success the browser lands on the Security tab.

## Handoff prompt

> Implement only this surface in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md, docs/SPEC-sign-in.md and this brief first. Reuse the claim page's token and password fields and Panda CSS tokens. Keep it quiet: this is an operational screen.
