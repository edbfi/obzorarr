# Implementation plan: `recap-spike`

## Overview

Build module 3 of the capability map as [docs/SPEC-recap-spike.md](../docs/SPEC-recap-spike.md)
specifies: three steps on the demo fixtures in story mode at `/spike/recap`, with motion, reduced
motion and text in English and Danish, so the owner can give D19's verdict. Four tasks, one PR
each, each test first, then the verdict PR once the owner has reviewed the spike. The tasks are in
[todo.md](todo.md).

## Architecture decisions

- **The durable part lands first.** Task 1 bundles the fonts, which stay after the verdict and
  touch every page, so a font problem shows on `/` before any spike code exists.
- **The riskiest part comes next.** Task 2 builds the story shell, whose input, focus and scroll
  rules are what D19 most needs judged, with each step showing only its heading. Its e2e tests run
  against the built server before any slide content or motion could hide a navigation bug.
- **Content and motion are separate.** Task 3 fills the three steps in their final state and adds
  the reduced-motion test, which passes from then on; task 4 adds every animation on top, with a
  test that fails until an animation runs.
- **Every PR leaves `main` working.** `/spike/recap` exists from task 2 and is linked from nowhere;
  each task adds to it.
- **The design goes through Impeccable.** Tasks 2–4 build the surface with `/impeccable` from the
  brief (`route-wrapped-2025-me.md`) and the spec's corrections, and check 360, 390, 768 and
  1440 px, 200% zoom, the keyboard and reduced motion before their PRs open.
- **Facts change in the task that changes them.** Each task updates SPEC.md's status line, tech
  stack, Commands and testing sections, AGENTS.md's status and structure, and ticks off its items
  here. The verdict PR does the rest of the spec's cleanup and ends the work stream.

## Task list

### Phase 1: the groundwork

- [x] Task 1: the bundled fonts

### Phase 2: the story

- [ ] Task 2: the story shell on `/spike/recap`
- [ ] Task 3: the three steps' content

### Checkpoint: after task 3

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass.
- [ ] The built server serves `/spike/recap` in English and Danish, and it moves by tap, swipe,
  keys and buttons, with every step's final content.

### Phase 3: motion and the review

- [ ] Task 4: motion and reduced motion, and the owner's review

### Checkpoint: the owner's verdict

- [ ] The owner has reviewed the spike as the spec's checklist asks and given D19's verdict.

### Phase 4: the verdict

- [ ] Task 5: the verdict PR

### Checkpoint: complete

- [ ] Every success criterion in SPEC-recap-spike.md is met.
- [ ] The end-of-work-stream cleanup (AGENTS.md, "Cleanup procedures") is done in task 5.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A family name doesn't match what fontsource registers, so pages fall back to system fonts unnoticed | Medium | Task 1's `document.fonts.load()` check fails on a wrong name |
| Taps, swipes and native scrolling fight on a touch screen | High | `touch-action: pan-y pinch-zoom` from task 2; touch is in the owner's checklist, since Playwright's mouse can't show it |
| Focus falls to the page when a step leaves | High | Task 2's e2e: ← from the summary keeps focus inside "2 of 3"; task 4's checks focus mid-transition |
| The throttle drops keys in the e2e and makes it flaky | Medium | Moves in the e2e wait past the `story` duration (task 2) |
| The large number is matched inside the year in a translation | Low | `count-emphasis.test.ts`'s year case (task 3) |
| Clipping the slide-in with `overflow: hidden` on the story breaks the sticky bars | Medium | Task 4 clips with `overflow-x: clip`, and its mid-transition check covers 360 px |
| The first step's entrance doesn't play on load, or hides it without JavaScript | Medium | Entrances are CSS keyframes under `_motionSafe` (task 4), checked with and without JavaScript |
| The agents' Danish reads badly | Low | The owner reviews the spike in Danish (task 4's checklist) |

## Porting to the other apps

None: the recap is obzorarr's own (SPEC-recap-spike.md). The fonts' setup is a pattern the other
apps can reuse for their own typefaces, but each app's fonts follow its own DESIGN.md.

## Open questions

None. The owner approved the spec on 2026-11-12, with `@lucide/svelte` and the two new tokens.
