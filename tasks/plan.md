# Implementation plan: `sign-in`

## Overview

Build module 5 of the capability map as [docs/SPEC-sign-in.md](../docs/SPEC-sign-in.md) specifies:
the error pages, the client address and rate limits, sessions and the owner check, signing in at
the claim and at `/admin/sign-in`, the admin shell with sign-out, the Security tab's password
change and "Sign out everywhere else", recovery, and (obzorarr) the scanner filter. Nine tasks,
one PR each, each test first, then a docs PR that ends the work stream. The tasks are in
[todo.md](todo.md).

`sign-in` is shared (D20): obzorarr is the reference, so the code and tests these tasks write are
what comradarr, zondarr, otpravkarr and zimuarr port. Each task's PR body names what they take.

## Architecture decisions

- **The pages `handle` builds come first.** Rate limits, the owner check and the stripped-`Origin`
  refusal all answer with a page `handle` builds itself, so task 1 makes those pages (and
  SvelteKit's error page) look right before anything refuses with them. Its riskiest part is
  getting Panda's token declarations into an inline style: task 1 chooses how (Panda's generated
  CSS at build time, imported as text) and proves it with a computed-colour test.
- **The client address before anything counts on it.** Task 2 brings the address, the general
  limit and the `ADDRESS_HEADER` refusal, and moves the shared e2e server to
  `ADDRESS_HEADER=x-forwarded-for` with a per-test address, so no later task's tests trip each
  other's limits.
- **The claim is each new mechanism's first caller.** The hash slots and the claim's limit
  (task 3), then the session, the browser's address and the cookie (task 4) land through the
  claim, which already exists, so nothing merges unused.
- **A plain Security page until the shell.** Task 4 makes the claim land on `/admin`, which
  redirects to `/admin/settings/security`. That page is only its heading until task 6 builds the
  shell and the tab through `/impeccable`, and task 7 fills it. No release is cut in between.
- **The owner check is a `handle` stage from task 4,** never a layout `load`, and its e2e covers a
  form POST, which a layout guard would miss.
- **Surfaces go through `/impeccable`, one brief at a time:** the sign-in page (task 5), the shell
  and the Security tab (task 6, filled in task 7), and recovery (task 8). Each is checked at 360,
  390, 768 and 1440px, at 200% zoom, by keyboard, with reduced motion and in every state its brief
  names, in English and Danish, with screenshots in the PR body.
- **Shared fields move with their second user.** `PasswordField` moves to
  `lib/components/credentials/` in task 5, when sign-in joins the claim; `TokenField` and
  `token-format.ts` in task 8, when recovery does. `bootstrap-token.ts` becomes `console-token.ts`
  in task 8 too.
- **The schema change is the spec's:** one `owner_session` table, in task 4's migration, generated
  with `db:generate` and reviewed.
- **Facts change in the task that changes them.** Each task updates the README, SPEC.md (the
  testing section), AGENTS.md's status and structure, and the briefs it builds, and ticks off its
  items here. Task 10 reduces the spec and deletes `tasks/`.

## Task list

### Phase 1: refusing well

- [ ] Task 1: the error pages
- [ ] Task 2: the client address and the general limit
- [ ] Task 3: the claim's limit and the hash slots

### Checkpoint: after task 3

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass.
- [ ] A cross-site POST, the 61st request in a minute and an unknown page each get their branded
  page, in the viewer's language, with the tokens' colours.

### Phase 2: signing in

- [ ] Task 4: sessions, the owner check and signing in at the claim
- [ ] Task 5: owner sign-in
- [ ] Task 6: the admin shell and signing out

### Checkpoint: after task 6

- [ ] On a fresh built server over plain HTTP, the claim signs in, signing out and in again works,
  and an owner-only page sends a signed-out browser to sign in and back.

### Phase 3: the Security tab and recovery

- [ ] Task 7: the password change and "Sign out everywhere else"
- [ ] Task 8: recovery
- [ ] Task 9: the scanner filter (obzorarr)

### Checkpoint: complete

- [ ] Every success criterion in SPEC-sign-in.md is met.

### Phase 4: closing

- [ ] Task 10: close the work stream (cleanup procedure 2)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Panda's token declarations can't be inlined into the pages `handle` builds | Medium | Task 1 picks the source (Panda's generated CSS, imported as text at build time) and an e2e reads the computed colours |
| A layout guard is used where `handle` must guard, leaving form actions open | High | Task 4's e2e POSTs to an owner-only action without a session and expects 403 |
| `requestIP()` is `null` for the copied request `handle` sees | High | The spec refuses a request missing the configured header instead; task 2's unit test uses a copied `Request` |
| The e2e tests trip each other's limits | Medium | Task 2's per-test `X-Forwarded-For` fixture on the shared server |
| A check with the old password starts a session after a password change or recovery | High | Tasks 5, 7 and 8 write the session with a check on the stored hash; a unit test races them |
| A refused hash slot burns a console token | Medium | Tasks 3 and 8 take the slot before the token, with a unit test each |
| argon2id is slow on a small ARM board, so tests time out | Low | Unit tests stub the hash where they test ordering; e2e uses real hashes with Playwright's timeouts |
| SvelteKit's `__data.json` and enhanced actions don't follow a redirect or 403 from `handle` | Medium | Task 4's e2e covers a client-side navigation and an enhanced form, besides a full page load |
| A cookie written without `secure` set is `Secure` on a plain-HTTP host that isn't `localhost` | High | Task 4's e2e checks the cookie on a non-loopback host name (Chromium's `--host-resolver-rules`) |
| `event.url.origin` creeps into app code | Medium | Task 4's unit test searches `src/` |

## Porting to the other apps

comradarr, zondarr, otpravkarr and zimuarr specify their `sign-in` from SPEC-sign-in.md and
obzorarr's code and tests once task 10 merges (AGENTS.md, Shared groundwork). Each task's PR body
names what they take.

## Open questions

None. The owner approved the spec on 2026-11-16, with D28 and the one Security tab. As with
`setup` (#324), this task list is approved by the orchestrating session after the council's
review, and merged once its review loop ends.
