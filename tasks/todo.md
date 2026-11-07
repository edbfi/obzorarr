# Tasks: `i18n`

The spec is [docs/SPEC-i18n.md](../docs/SPEC-i18n.md), and the plan is [plan.md](plan.md). Each
task is one PR and writes its tests first. Each one adds its files to AGENTS.md's structure, ticks
off its items in `tasks/`, names the sibling apps in its PR body (AGENTS.md, Shared groundwork), and
runs `bun run --bun check`, `bun run --bun test`, `bun run --bun lint` and
`prek run --all-files --hook-stage manual` before every commit. Paths under `src/lib/` are
shortened to `lib/`.

## Task 1: Paraglide compiles the messages

**Description:** Add the two packages and the inlang project, and compile the messages in
`prepare`, `check`, dev, build and Vitest. The message files hold the placeholder page's text in
English and Danish, which the page starts using in task 2. Run the Weblate round trip.

**Acceptance criteria:**
- [x] `@inlang/paraglide-js` 3.2.1 and `@inlang/plugin-i18next` 6.5.3 are exact-pinned dev
  dependencies. `project.inlang/settings.json` and `project.inlang/paraglide.config.ts` are as the
  spec gives them, and the Vite plugin is added with nothing else.
- [x] `prepare` and `check` compile the messages after `svelte-kit sync` and before Panda's
  codegen, calling the CLI as `bun --bun <bin>`, so a fresh clone's `bun ci` compiles them, and
  `check` then type-checks `project.inlang/*.ts`. Everything passes with no Node on `PATH` (CI's
  shims). Running `check` while `dev` is up doesn't rewrite the output under the dev server.
- [x] A call to a message that doesn't exist fails `check`, shown with a probe that isn't
  committed, its output in the PR body.
- [x] `src/lib/paraglide/` and `project.inlang/cache/` are gitignored, Panda's `exclude` skips the
  output, and `lint` and prek pass with it present.
- [x] The message files are flat and Biome-formatted, their names fit the spec's rule, and they
  leave out the name Obzorarr.
- [x] The Weblate round trip passes all four of the spec's conditions, with the script and its
  output in the PR body; neither the script nor its temporary message is committed.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek.

**Dependencies:** none.

**Files:** `package.json`, `bun.lock`, `project.inlang/settings.json`,
`project.inlang/paraglide.config.ts`, `messages/en.json`, `messages/da.json`, `vite.config.ts`,
`tsconfig.json`, `panda.config.ts`, `.gitignore`, `AGENTS.md`, `docs/SPEC.md` (the tech-stack
table, the setup fact and the Commands rows for `bun ci` and `check`). Most gain a line or two.

**Size:** M.

## Task 2: each request gets the viewer's language, and the browser keeps it

**Description:** Run every request through `paraglideMiddleware` in `handle`, write the language
into `<html lang>`, and keep the page's language in the browser. The placeholder page renders its
text from the messages.

**Acceptance criteria:**
- [x] `tests/e2e/i18n.test.ts`, against the built server: a `da-DK` browser gets `/` in Danish
  with `<html lang="da">` and `Vary: Cookie, Accept-Language`; a browser whose header says `fr-FR`
  and whose `navigator.languages` an init script sets to `fr-FR`, `da-DK` gets English, and no
  cookie is written after hydration; neither logs a console error. The smoke test passes
  unchanged in English.
- [x] The placeholder renders its messages as text, never with `{@html}`, and keeps Obzorarr as
  it is.
- [x] `app.html` has `<html lang="%lang%">` with the Biome suppression just above it, which doesn't
  contain the token. `hooks.server.ts` and `hooks.client.ts` are as the spec's Code style gives
  them, and the `init` hook is unchanged.
- [x] The concurrency check passes: 200 concurrent requests in both languages against the built
  server, through a temporary route that awaits a random delay in its `load`, each render in their
  own language. The script and its output are in the PR body; neither it nor the route is
  committed.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek. Manual
check: in `dev`, a browser set to Danish sees the placeholder in Danish.

**Dependencies:** task 1.

**Files:** `src/app.html`, `src/hooks.server.ts`, `src/hooks.client.ts`,
`src/routes/(public)/+page.svelte`, `tests/e2e/i18n.test.ts`, `AGENTS.md`, `docs/SPEC.md` (the
testing section and the `smoke` Commands row).

**Size:** M.

## Task 3: the language switcher

**Description:** `LanguageSwitcher.svelte` as the spec describes it, on the placeholder `/`, and in
the landing brief's signed-out navigation.

**Acceptance criteria:**
- [x] It is a labelled group of native buttons, the label a message, each button naming its
  language in that language with `lang` set, from `Intl.DisplayNames` with the first letter
  upper-cased in that language ("English", "Dansk"), through a helper private to the component,
  never a message or a literal. The current language's button has
  `aria-current="true"` and does nothing when pressed; another calls `setLocale`. It is styled
  only with tokens.
- [x] `i18n.test.ts` gains: pressing "English" from a Danish browser reloads `/` in English and
  writes `PARAGLIDE_LOCALE=en` with `SameSite=Lax` and without `Secure` over plain HTTP, and the
  next visit stays in English; in the `fr-FR` case the switcher marks English as current after
  hydration. No console errors.
- [x] The landing brief's signed-out navigation has the switcher, written through
  `.agents/skills/impeccable/scripts/impeccable surface-brief write`, and D16 no longer lists
  browser interaction with a real component.

**Verification:** `bun run --bun test`, `build`, `smoke`, `check`, `lint`, prek. Manual check at
360, 390, 768 and 1440 px, at 200% zoom and with reduced motion: both buttons are
reachable by keyboard, focus is visible, and pressing the current language does nothing.

**Dependencies:** task 2.

**Files:** `lib/components/layout/LanguageSwitcher.svelte`, `src/routes/(public)/+page.svelte`,
`messages/en.json`, `messages/da.json`, `tests/e2e/i18n.test.ts`, `.impeccable/surfaces/route.md`,
`docs/decisions.md`, `AGENTS.md`, `docs/SPEC.md` (the testing section, and "Surfaces with no brief
yet", whose landing sentence names the signed-out navigation's items).

**Size:** M.

## Checkpoint: after task 3

- [ ] Everything passes locally and in CI (`checks`, `smoke`, `ci-ok`), and the built server serves
  and switches both languages.

## Task 4: formatting numbers and dates

**Description:** `formatNumber` and `formatDateTime` in `lib/shared/i18n/format.ts`, browser-safe,
in the current language, with the time zone required.

**Acceptance criteria:**
- [ ] `format.test.ts` runs both inside `paraglideMiddleware` with a request for each language:
  `da` formats as `da`, and `en` as `en-GB`, with the day first and a 24-hour clock.
- [ ] `formatDateTime` follows the zone it is given, not the machine's, and its type refuses a
  call without `timeZone`.

**Verification:** `bun run --bun test`, `check`, `lint`, prek.

**Dependencies:** task 1.

**Files:** `lib/shared/i18n/format.ts`, `format.test.ts`, `AGENTS.md`, `docs/SPEC.md` (the testing
section).

**Size:** S.

## Task 5: the message check, and closing the work stream

**Description:** `lib/shared/i18n/messages.test.ts` finds every problem in a set of message files,
and runs on `messages/*.json` in the existing `tests` hook. This task also closes the work stream.

**Acceptance criteria:**
- [ ] The check passes on `messages/*.json`. Every rule in the spec's list, each clause on its
  own, has an in-memory file that breaks only it and is reported, and a file with several problems
  reports them all.
- [ ] The PR body lists every validation in the spec with its evidence or the PR that holds it.
- [ ] The end-of-work-stream cleanup is done:
  - the rest of the spec's "Docs this module changes when built" list;
  - `tasks/` is deleted;
  - SPEC-i18n.md is reduced to what code and tests can't say;
  - AGENTS.md's status is updated;
  - the PR body maps every removed requirement to a test or a spec.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek.

**Dependencies:** tasks 1 to 4.

**Files:** `lib/shared/i18n/messages.test.ts`, `docs/SPEC.md`, `docs/SPEC-i18n.md`,
`docs/decisions.md`, `PRODUCT.md`, `AGENTS.md`, `tasks/`.

**Size:** M.
