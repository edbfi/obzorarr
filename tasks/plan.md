# Implementation plan: `sign-in`

## Overview

Build module 5 of the capability map as [docs/SPEC-sign-in.md](../docs/SPEC-sign-in.md) specifies:
the error pages, the client address and rate limits, sessions and the owner check, signing in at
the claim and at `/admin/sign-in`, the admin shell with sign-out, the Security tab's password
change and "Sign out everywhere else", recovery, and (obzorarr) the scanner filter. Fourteen tasks,
one PR each, each test first, then a docs PR that ends the work stream. The tasks are in
[todo.md](todo.md).

`sign-in` is shared (D20): obzorarr is the reference, so the code and tests these tasks write are
what comradarr, zondarr, otpravkarr and zimuarr port. Each task's PR body names what they take.

## Architecture decisions

- **The pages `handle` builds come first.** Rate limits, the owner check and the stripped-`Origin`
  refusal all answer with a page `handle` builds itself, so task 1 makes those pages (and
  SvelteKit's error page) look right before anything refuses with them. Its riskiest part is
  getting Panda's token declarations into an inline style. No generated CSS file exists today
  (`styled-system/` holds only JavaScript, and the Vite plugin adds the CSS inside its transform),
  so task 1 generates one, with a `panda cssgen` step in `prepare` and `check` (so Vitest has it
  too) or a small Vite module on Panda's API, and proves it with a computed-colour test.
- **The client address before anything counts on it.** Task 2 brings the address, the general
  limit and the `ADDRESS_HEADER` refusal, and moves the shared e2e server to
  `ADDRESS_HEADER=x-forwarded-for` with a per-test address, so no later task's tests trip each
  other's limits.
- **The claim is each new mechanism's first caller.** The hash slots and the claim's limit
  (task 3), the browser's address (task 4), then the session and the cookie (task 5) land through
  the claim, which already exists, so nothing merges unused. The claim's landing moves to the admin
  in its own task (6), with every e2e file that expected `/`.
- **A plain Security page until the shell.** From task 6, `/admin` redirects to
  `/admin/settings/security`. That page is only its heading, with no data or actions, until task
  10 builds the shell and the tab through `/impeccable`, and task 11 fills it. No release is cut in
  between.
- **The sign-in page comes before the check that sends people to it.** Task 7 builds sign-in, task
  8 the owner check, so its redirect never points at a page that doesn't exist. The check is a
  `handle` stage, never a layout `load`, and its e2e covers a form POST, which a layout guard would
  miss.
- **Fresh servers through one helper.** Task 4 moves `setup.test.ts`'s spawn helpers to
  `tests/e2e/server.ts`, for every test that needs an unclaimed or restarted server, or changes the
  owner's password or sessions: the stripped `Origin` at the claim, the cookie on a non-loopback
  host, sign-in, the password change and recovery.
- **More e2e files than the spec lists.** The spec names one `sign-in.test.ts` and a second server
  in `playwright.config.ts` for recovery. The plan splits the e2e by subject (`errors.test.ts`,
  `rate-limits.test.ts`, `recovery.test.ts`) and starts fresh servers through `server.ts` instead
  of a second `webServer`, which can't be restarted mid-test. Task 15 records this in the reduced
  spec.
- **Surfaces go through `/impeccable`, one brief at a time:** the sign-in page (task 7), the shell
  and the Security tab (task 10, filled in task 11), and recovery (task 13). Each is checked at 360,
  390, 768 and 1440px, at 200% zoom, by keyboard, with reduced motion and in every state its brief
  names, in English and Danish, with screenshots in the PR body.
- **Shared fields move with their second user.** `PasswordField` moves to
  `lib/components/credentials/` in task 7, when sign-in joins the claim; `TokenField` and
  `token-format.ts` in task 13, when recovery does. `bootstrap-token.ts` becomes `console-token.ts`
  in task 12.
- **The schema change is the spec's:** one `owner_session` table, in task 5's migration, generated
  with `db:generate` and reviewed.
- **`no-store` lands with each response it covers:** the claim in task 4, owner-only pages and
  sign-in in task 8, recovery in task 13.
- **Facts change in the task that changes them.** Each task updates the README, SPEC.md (the
  testing section, and the `smoke` row for each new e2e file), AGENTS.md's status and structure,
  and the briefs it builds, and ticks off its items here. Task 15 reduces the spec and deletes
  `tasks/`.

## Task list

### Phase 1: refusing well

- [x] Task 1: the error pages
- [x] Task 2: the client address and the general limit
- [ ] Task 3: the claim's limit and the hash slots

### Checkpoint: after task 3

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass.
- [ ] A cross-site POST, the 61st request in a minute and an unknown page each get their branded
  page, in the viewer's language, with the tokens' colours.

### Phase 2: signing in

- [ ] Task 4: the browser's address at the claim
- [ ] Task 5: sessions, started at the claim
- [ ] Task 6: the claim lands in the admin
- [ ] Task 7: owner sign-in
- [ ] Task 8: the owner check
- [ ] Task 9: the sign-in limit and the waits

### Checkpoint: after task 9

- [ ] On a fresh built server over plain HTTP, the claim signs in with the right cookie; an
  owner-only page sends a signed-out browser to sign in and back; repeated failures wait.

### Phase 3: the admin

- [ ] Task 10: the admin shell and signing out
- [ ] Task 11: the password change and "Sign out everywhere else"
- [ ] Task 12: the recovery token at startup
- [ ] Task 13: `/recovery`
- [ ] Task 14: the scanner filter (obzorarr)

### Checkpoint: complete

- [ ] Every success criterion in SPEC-sign-in.md is met.

### Phase 4: closing

- [ ] Task 15: close the work stream (cleanup procedure 2)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Panda's token declarations can't be inlined into the pages `handle` builds | Medium | No CSS file exists to import; task 1 generates one (`panda cssgen` or a Vite module on Panda's API) and an e2e reads the computed colours |
| A layout guard is used where `handle` must guard, leaving form actions open | High | Task 8's e2e POSTs to an owner-only action without a session and expects 403 |
| A fallback to the connection's address, which `handle` can't read (`requestIP()` knows only the original request) | Low | The spec refuses a request missing the configured header instead; task 2's unit test uses a copied `Request` |
| The e2e tests trip each other's limits | Medium | Task 2's per-test `X-Forwarded-For` fixture on the shared server |
| A check with the old password starts a session after a password change or recovery | High | Task 5's sessions write with a check on the stored hash; tasks 7, 11 and 13 test the race in their unit tests |
| A refused hash slot burns a console token | Medium | Tasks 3 and 13 take the slot before the token, with a unit test each |
| A test needs an unclaimed or restarted server, which the shared one can't give | Medium | Task 4's `tests/e2e/server.ts` |
| argon2id is slow on a small ARM board, so tests time out | Low | Unit tests stub the hash where they test ordering; e2e uses real hashes with Playwright's timeouts |
| An enhanced action doesn't show the 403 from `handle` (SvelteKit 3.2's `enhance` turns a non-ok `{ message }` into an error page) | Low | Task 8 checks the enhanced request's wire format, task 11 the form in a browser |
| A cookie written without `secure` set is `Secure` on a plain-HTTP host that isn't `localhost` | High | Task 5's e2e checks the cookie on a non-loopback host name (Chromium's `--host-resolver-rules`) |
| `event.url.origin` creeps into app code | Medium | Task 4's unit test searches `src/`, exempting `config/origin.ts`, which validates `ORIGIN` |

## Porting to the other apps

comradarr, zondarr, otpravkarr and zimuarr specify their `sign-in` from SPEC-sign-in.md and
obzorarr's code and tests once task 15 merges (AGENTS.md, Shared groundwork). Each task's PR body
names what they take.

## Open questions

None. The owner approved the spec on 2026-11-16, with D28 and the one Security tab. As with
`setup` (#324), this task list is approved by the orchestrating session after the council's
review, and merged once its review loop ends.
