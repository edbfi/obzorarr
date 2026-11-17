---
version: 1
slug: "route-admin-settings-security"
primary_target: "route:/admin/settings/security"
related_targets: []
---

# Obzorarr Security settings and the admin shell

## Status

The shell and the tab's frame built in `sign-in`'s task 10 (2026-11-16), code-led, with no mockup; the Password and Sessions sections in task 11 and the recovery warning in task 12, the same way. Mode: **operate**. Audience: **the instance's owner**. Route: `/admin/settings/security`, the first tab of `/admin/settings` and, until `overview`, where `/admin` lands. It is also the first page in the admin shell, so this brief sets the shell. Module: `sign-in` ([docs/SPEC-sign-in.md](../../docs/SPEC-sign-in.md)).

## Purpose and composition

The one place the owner secures the instance: their password, their other sessions, and later two-factor, the Plex and OIDC links and the address check, each a section. Flat ocean-blue surfaces, no hero art, a settings page within the 672px form width under a tab bar.

**The shell** (PRODUCT.md): a 224px sidebar with the logo and wordmark, then the navigation, which lists only pages that exist (Settings now), and a footer with the owner's username beside an initial (a Plex avatar once linked), linking to this tab; Sign out; the language switcher; and the version as small selectable mono text. From 1024px down the sidebar is a rail; below 768px a drawer behind a menu button in a 64px top bar, which traps focus, closes on Escape and makes the page behind it inert.

## Visual reference

None yet. The shared [design system](../../DESIGN.md); the owner dashboard's mockup (`route-admin.md`) shows the sidebar's look, and the connections mockup (`route-admin-settings-connections.md`) a settings page's.

## Required content

Page heading 'Settings', tab bar with 'Security' (the only tab for now). While `OBZORARR_RECOVERY` is on, a warning at the top: 'Recovery is on. Remove OBZORARR_RECOVERY from the environment and restart Obzorarr.'

- **Password** (`h2`): 'Current password', 'New password' (helper: 'At least 15 characters.'), each with the Show/Hide control; action 'Change password', 'Saving…' while saving. Saved: 'Password changed. Other sessions were signed out.' Too many attempts (it shares sign-in's limit, and a wrong current password counts as a failed sign-in): the sign-in page's message (`route-admin-sign-in.md`).
- **Sessions** (`h2`): 'Signed in on {count} other browsers' (plural-aware) and the secondary action 'Sign out everywhere else'; done: 'Signed out of {count} other browsers.'; with none: 'No other browser is signed in.' and no button.
- **Sign out** in the shell's footer opens a dialog: 'Sign out of Obzorarr?', actions 'Cancel' and 'Sign out'.

## Acceptance criteria

- Only the owner sees the shell and this page. Nothing about members, Plex or the server shows here yet.
- Field errors use the claim's messages for the new password and 'The current password is wrong.' for the current one; the current-password field has `autocomplete="current-password"`, the new one `new-password`.
- Status and saved messages go to a polite live region. A failed change titles the page 'Error: Settings' and shows the error summary (D29) first in the password form: a wrong current password or a broken rule links to its field, too many attempts or a busy server is text. With JavaScript, focus moves to the summary after each failure; without it, nothing is focused. Nothing reports success before the change is stored.
- The sign-out dialog and the drawer trap focus, close on Escape and restore focus to the control that opened them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports, in English and Danish. Long translated labels wrap without hiding the actions.
- States: the recovery warning on and off; password initial, field errors, too many attempts, saving, saved; sessions with none, one and several others, signing out, done; the drawer open and closed; the sign-out dialog.

## Handoff prompt

> Implement only this surface and the admin shell in Obzorarr's existing application. Read PRODUCT.md, DESIGN.md, docs/SPEC-sign-in.md and this brief first. Reuse existing Panda CSS tokens and Ark UI's Dialog for the drawer and the confirmation. Keep it quiet: this is an operational screen. Do not add navigation links or tabs for pages that don't exist yet.

## Direction contract

THESIS: a quiet operator's frame. The sidebar holds where you are and who you are; the page holds one task at a time under its heading and tabs. Nothing in the shell asks for attention except the page's own content.

OWN-WORLD: After Hours at its flattest: `background` page, the sidebar on `surface` with a 1px `border` edge, the current page and hover on `raised`, `muted` labels that brighten to `text`, the active tab underlined in `primary`. The sign-out confirmation is the one floating sheet, on the `scrim` with the `dialog` shadow and radius. No beam, no imagery.

STORY: the owner sees Settings and Security as the only places that exist yet; their own initial and name sit at the foot, linking back here; Sign out asks once before it ends the session; on a phone the same sidebar slides in from the menu and gives focus back when it closes.

FIRST VIEWPORT: from 1024px, the 224px sidebar (logo and wordmark, Settings, then the owner, Sign out, the languages and the version at its foot) beside the page: `h1` Settings, the tab bar with Security, within 672px. From 768px the sidebar is a 96px rail of icons, the initial and the stacked languages. Below 768px, a 64px top bar with the wordmark and Menu.

FORM: seed: none (pinned) "a 224px sidebar with the logo and wordmark, then the navigation … and a footer"; the rail and drawer from DESIGN.md's layout.

FINISH: checked at 360, 390, 768, 1024 and 1440px and at 200% zoom, by keyboard (the sidebar, then the tabs), in English and Danish, with the drawer open and closed and the sign-out confirmation open; no horizontal overflow at any width; the Password and Sessions sections in every state of Required content, the field to fix taking focus; and the recovery warning, on and off, in task 12.
