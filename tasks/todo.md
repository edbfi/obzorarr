# Tasks: `recap-spike`

The spec is [docs/SPEC-recap-spike.md](../docs/SPEC-recap-spike.md), and the plan is
[plan.md](plan.md). Each task is one PR and writes its tests first. Each one adds its files to
AGENTS.md's structure (the spike's marked temporary), ticks off its items in `tasks/`, and runs
`bun run --bun check`, `bun run --bun test`, `bun run --bun lint` and
`prek run --all-files --hook-stage manual` before every commit. Paths under `src/lib/` are shortened
to `lib/`.

## Task 1: the bundled fonts

**Description:** Bundle Space Grotesk, Instrument Sans and IBM Plex Mono from fontsource, import
them in the root layout, and point Panda's font tokens at the families the packages register.
Every page, `/` included, uses them from here on.

**Acceptance criteria:**
- [ ] `smoke.test.ts` first fails, then passes: for each of Panda's three `fonts` values,
  `document.fonts.load("16px <family>")` returns at least one face.
- [ ] `@fontsource-variable/space-grotesk`, `@fontsource-variable/instrument-sans` and
  `@fontsource/ibm-plex-mono` are exact-pinned dev dependencies at their newest stable release
  (5.3.0 when the spec was approved, D27); if that has moved, the spec's version moves with it.
- [ ] The root layout imports each variable package's default CSS and `ibm-plex-mono/400.css` and
  `/500.css`; the built server serves the font files itself (the network panel in `preview` shows
  no request to another host).
- [ ] Panda's `fonts` tokens name `Space Grotesk Variable`, `Instrument Sans Variable` and
  `IBM Plex Mono`, each with its system fallback, and the comment about system fallbacks goes.

**Verification:** `test`, `check`, `lint`, `build`, `smoke`, prek. Manual check: `/` in `preview`
renders in Space Grotesk and Instrument Sans.

**Dependencies:** none.

**Files:** `package.json`, `bun.lock`, `src/routes/+layout.svelte`, `panda.config.ts`,
`tests/e2e/smoke.test.ts`, `docs/SPEC.md` (the status line: module 3 being built; the tech-stack
table, ground-floor choice 1 and the testing section), `PRODUCT.md` ("No bundled font files yet"
goes), `AGENTS.md` (the status), and `docs/SPEC-recap-spike.md` if a version moved.

**Size:** S.

## Task 2: the story shell on `/spike/recap`

**Description:** The route, the fixture's figures, and `Story.svelte` with everything the spec's
"Story mode" gives it: the bars, progress, Close, Previous and Next with their icons, taps, swipes,
keys, the throttle, scrolling (tested in task 3, once a step can be taller than the screen), focus,
the carousel semantics, "Tap to continue" on the first step and the page title. Each of the three
steps shows only its `h2` for now. No motion yet: moves are instant.

**Acceptance criteria:**
- [ ] `lib/components/recap/story-input.test.ts` first fails, then passes, covering the spec's
  unit list for keys, pointers and the throttle; `story-input.ts` is pure and has no DOM imports.
- [ ] `tests/e2e/recap-spike.test.ts` first fails, then passes, covering the spec's e2e items for
  answering in both languages, keys, buttons, `aria-disabled`, taps and drags, focus at the summary
  and after ←, Close and Escape, no sideways scroll at 360 px on any step and no console errors,
  with moves spaced past the `story` duration.
- [ ] `Story.svelte` converts `token("durations.story")` to a number once, and the throttle uses
  it; no duration is written as a literal.
- [ ] `+page.server.ts` imports the fixture statically and returns only the seven member figures.
- [ ] `@lucide/svelte` is an exact-pinned dev dependency at its newest stable release (1.72.0 when
  the spec was approved; if that has moved, the spec's version moves with it), imported one icon
  per path, 20 px, decorative.
- [ ] Every string is a `recap_spike_…` message in both languages, the role descriptions included,
  with D23's wording and the Danish title without a genitive; the message check passes.
- [ ] Built through `/impeccable` from the brief, checked at 360, 390, 768 and 1440 px, 200% zoom
  and with the keyboard, with screenshots in the PR body.

**Verification:** `test`, `check`, `lint`, `build`, `smoke`, prek. Manual checks, with their
evidence in the PR body: on a touch screen or touch emulation, a horizontal swipe moves and a
vertical scroll doesn't; with JavaScript off, the first step shows.

**Dependencies:** task 1.

**Files:** `src/routes/spike/recap/+page.server.ts`, `src/routes/spike/recap/+page.svelte`,
`lib/components/recap/Story.svelte`, `lib/components/recap/story-input.ts` (+ test),
`tests/e2e/recap-spike.test.ts`, `messages/en.json`, `messages/da.json`, `package.json`,
`bun.lock`, `docs/SPEC.md` (the tech-stack table, the `smoke` Commands row, the testing section),
`AGENTS.md`, and `docs/SPEC-recap-spike.md` if a version moved.

**Size:** L. One coherent unit: `story-input.ts` alone would merge as dead code.

## Task 3: the three steps' content

**Description:** Fill the three steps in their final state: the total with Movie Buff and the beam
and silhouette, the twelve monthly rows, and the summary card with its badge and actions. Add the
two approved tokens.

**Acceptance criteria:**
- [ ] `lib/components/recap/count-emphasis.test.ts` first fails, then passes, covering the spec's
  cases, the count inside the year included.
- [ ] `recap-spike.test.ts` gains the month names in each language ("May", "maj"), Share recap
  disabled, Back to overview going to `/`, a move from the monthly step scrolled to its bottom
  leaving the page at the top (at a short viewport), and the reduced-motion case (the next
  step's final state at once, with the month bars at their final widths and no running
  animation), which guards task 4.
- [ ] The three slide components take their figures as props and never import the fixture.
- [ ] The steps match the spec's "The three slides", "Text" and "Icons" (the summary's six
  decorative icons, share and back included): D23's wording, the month list
  labelled by its heading, each row's hours as a plural message, the Danish title without a
  genitive, the badge as icon and text, and Share recap a native `disabled` button; the message
  check passes.
- [ ] `fontSizes.poster` and `gradients.beam` (a semantic token fading `primary` to transparent)
  are in `panda.config.ts`; spike-only sizes use the `[…]` escape hatch; nothing else departs from
  DESIGN.md's tokens.
- [ ] No imagery sits behind text or figures, and long and Danish text wraps without hiding Close,
  Previous or Next at 360 px.
- [ ] Built through `/impeccable`, checked at the four widths and 200% zoom, with screenshots in
  the PR body.

**Verification:** `test`, `check`, `lint`, `build`, `smoke`, prek.

**Dependencies:** task 2.

**Files:** `lib/components/recap/TotalTimeSlide.svelte`,
`lib/components/recap/MonthlyHoursSlide.svelte`, `lib/components/recap/SummaryCard.svelte`,
`lib/components/recap/count-emphasis.ts` (+ test), `src/routes/spike/recap/+page.svelte`,
`panda.config.ts`, `messages/en.json`, `messages/da.json`, `tests/e2e/recap-spike.test.ts`,
`docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Task 4: motion and reduced motion, and the owner's review

**Description:** The transitions between steps (Svelte's, with no duration under
`prefersReducedMotion`, the throttle unchanged), each step's entrance as CSS keyframes under
`_motionSafe`, and the progress fill, also under `_motionSafe`, all from the motion tokens.
Reduced motion shows task 3's final state at once. The PR merges like the others; its body then
hands the spike on `main` to the owner with the spec's review checklist.

**Acceptance criteria:**
- [ ] `recap-spike.test.ts` first fails, then passes: without reduced motion, a move leaves an
  animation running on the entering step or its content. Task 3's reduced-motion case stays
  green.
- [ ] During a transition, the leaving step is `inert`, focus stays where the spec puts it, and
  nothing scrolls sideways at 360 px. The e2e pauses the animations right after the move
  (`document.getAnimations()`, `pause()`), checks, then resumes them, so it doesn't depend on
  timing.
- [ ] The transitions use the duration task 2 converted, and the progress fill the `feedback`
  token; no duration is written as a literal anywhere.
- [ ] With JavaScript off, the first step still shows its final content (a manual check, its
  evidence in the PR body).
- [ ] Nothing loops or moves on its own, and there is no count-up.
- [ ] Checked through `/impeccable` at the four widths with and without reduced motion.
- [ ] The PR body gives the owner the run commands and the review checklist from the spec, and
  asks for the verdict.

**Verification:** `test`, `check`, `lint`, `build`, `smoke`, prek.

**Dependencies:** task 3.

**Files:** `lib/components/recap/Story.svelte`, the three slide components, `panda.config.ts` (the
keyframes), `tests/e2e/recap-spike.test.ts`, `docs/SPEC.md` (the status line: built, awaiting the
verdict; the testing section, naming the two motion checks), `AGENTS.md`.

**Size:** M.

## Task 5: the verdict PR

**Description:** After the owner's verdict, record D19 and delete the spike, as the spec's "The
owner's review and the verdict" and "Docs this module changes" list.

**Acceptance criteria:**
- [ ] D19 moves to Decided with the owner's verdict: what `recap` keeps, what changes, and whether
  it needs custom work beyond Panda and Ark. `recap`'s spec names the commit it adopts code
  from (the spec's rule), so D19 doesn't.
- [ ] The route, `lib/components/recap/`, `recap-spike.test.ts`, the `recap_spike_…` messages and
  the entrance keyframes are deleted; the two new tokens too, unless the verdict keeps them, in
  which case DESIGN.md is refreshed from Panda's config.
- [ ] Ground-floor choice 5 closes as "no headers needed"; row 3 is marked built.
- [ ] SPEC.md, AGENTS.md and the spec are cleaned up as the spec lists; `tasks/` is deleted, with
  the preservation map in the PR body (cleanup procedures 2 and 4).

**Verification:** `test`, `check`, `lint`, `build`, `smoke`, prek; `git grep -e recap_spike -e
spike/recap -e recap-spike -e components/recap -- src tests messages panda.config.ts` finds
nothing.

**Dependencies:** task 4 and the owner's verdict.

**Files:** `docs/decisions.md`, `docs/SPEC.md`, `docs/SPEC-recap-spike.md`, `AGENTS.md`, the
deleted files, `panda.config.ts`, `messages/en.json`, `messages/da.json`, `tasks/`, and
`DESIGN.md` if a token stays.

**Size:** S.
