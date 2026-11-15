# Spec: `recap-spike`

**Status:** closed (2026-11-15). Module 3 of the capability map ([docs/SPEC.md](SPEC.md)). The
owner's verdict closed D19, and the verdict PR deleted the spike's code. `recap` adopts what the
verdict keeps from git history, naming in its own spec the commit before the verdict PR. This file
keeps what that code can't say: the rules the spike settled, which `recap`'s spec folds in before it
deletes this file. The verdict itself is D19, and what `recap` builds from it is in SPEC.md's
Module notes (`recap`, `slides-admin`, `appearance`). The recap is obzorarr's own, not a shared
area ([Shared groundwork](../AGENTS.md#shared-groundwork)), so no sibling ports it.

## The story shell

Story mode is `recap`'s (Module notes); the spike settled these details of it.
- **A tap** is a press that moves less than 10 px. Only the primary pointer's primary button counts
  (a right-click or a second finger moves nothing). A press on a control is that control's, never a
  tap.
- **A swipe** counts only when it moves further horizontally than vertically. The story sets
  `touch-action: pan-y pinch-zoom`, so the browser keeps vertical scrolling and zoom; a cancelled
  gesture (`pointercancel`) moves nothing, and text isn't selected during a drag.
- **Keys** are read on the whole page, but not when Shift, Ctrl, Alt or Meta is held, so browser
  shortcuts such as Alt+← still work. Space on a focused button presses it, and Enter on a focused
  button or link activates it; otherwise both move the story. ↑ and ↓ are left to the browser.
- **Throttled:** a move within the `story` duration of the last one is ignored, so a held key or a
  double tap can't skip a slide.
- **Long and translated text wraps** without hiding Close, Previous or Next, at 360 px and in
  Danish.
- **Previous and Next** show at every width as labelled 44 px buttons. At either end, the one that
  can't move is `aria-disabled` and does nothing, not `disabled` or removed, so a keyboard user's
  focus never falls to the page.
- **A slide taller than the screen** (at 200% zoom, say) scrolls the page itself, so ↑, ↓ and the
  wheel work wherever focus is; each move scrolls the page to the top of the story first.
- **Semantics:** the WAI-ARIA Authoring Practices' carousel pattern. A region named by the page's
  `h1` with `aria-roledescription` "carousel", each slide a group with `aria-roledescription`
  "slide", named "1 of N", with its own `h2`. Screen readers speak both role words verbatim, so they
  are messages ("karrusel", "dias"). The slides' container is `aria-live="polite"`, since nothing
  moves on its own; progress is hidden from assistive technology.
- **Focus:** only the current slide is in the page; a leaving slide is `inert` until its transition
  ends. Focus on a control in the bars stays there; focus inside the leaving slide moves to the new
  slide's `h2`. A heading that takes focus this way draws no focus ring, since it isn't a control;
  controls keep theirs.
- **Not Ark UI's Carousel** (D19), because it is a scroll-snap track whose transition is the browser's
  smooth scroll, whose duration the app can't set; it doesn't read the reduced-motion preference,
  handles keys only while it holds focus and never Space, Enter or Escape, has no tap zones or
  throttle, and a tall slide in its horizontal track would scroll on both axes.

## The look

- **The cinema screen:** every slide plays on a screen lit by the projector (`gradients.beam`), the
  light it throws back into the room, and two rows of seats in silhouette along its foot. Light is
  CSS gradients and the seats an inline SVG, all decorative (`aria-hidden`) and coloured only
  through tokens. No imagery sits behind text or figures.
- **Calm colours:** figures are in the projector's white; cyan (`primary`) marks only the total's
  badge, the busiest month's bar and progress.
- **The total:** its number at the `poster` size, in a sentence that says what it measures (D23).
- **The months:** a list labelled by its heading, one row per month with its short name, a bar and
  its hours as a plural message, so a screen reader never reads "Jan 42" as a date. Rows on a phone;
  from a tablet up the same list shows as columns, each showing its count while the rest of its
  message stays in the page for screen readers.
- **The summary's figures:** five layouts (D19, Module notes), drawn in
  [design/recap/](design/recap/). The mockups guide the layouts' feel; when built, a ticket or a
  rotated word takes its size from its content, not fixed dimensions, and every colour is a token.

## Text

- **Large numbers keep their whole sentence.** A figure shown large is one plural message with
  `{{count, number}}` ([SPEC-i18n.md](SPEC-i18n.md#messages)), so the plural and the word order stay
  the translator's. The component splits the formatted message around the formatted count and
  styles that part large, matching it only where no digit or group separator touches it, so 20 is
  never found inside "2025"; if it isn't found, the message shows unstyled.
- **A name never takes a Danish genitive.** Danish adds `s` to most names but only an apostrophe
  after s, x or z, which a message can't choose, so the Danish title puts the name where it needs no
  ending ("{{name}} i {{year}}").
- Month names come from `formatDateTime` with `{ month: "short", timeZone: "UTC" }`, a calendar
  value.

## Motion

The standard level's starting point (D19); durations come from motion tokens, never literals.
- **Between slides,** the move dips like a projector changing reels: the leaving slide fades out
  over the first 30% of `story`, then the new one slides in from the side it comes from and fades
  in, so the two never show at once. The leaving slide keeps its place and height, so nothing moves
  up or down. The story clips the slide-in with `overflow-x: clip`, never `overflow: hidden`, which
  would break the sticky bars.
- **Entrances,** one per slide: the total and its caption rise and the total's number comes into
  focus (a short blur clearing); the month bars grow from zero, along the row on a phone and up the
  column from a tablet; the summary's figures fade in; and a progress segment fills over
  `feedback`. They are CSS keyframes under `_motionSafe`, each holding its start through the reel
  change. CSS, because Svelte doesn't play `in:` transitions when a server-rendered page hydrates,
  so the first slide animates on load and is never hidden waiting for JavaScript.
- **No count-up:** numbers are their final text from the first frame, so a screen reader or a
  translated layout never meets an intermediate value. Nothing loops or moves on its own.
- **Reduced motion** shows each slide's final state at once; the throttle still applies.

## Tests worth keeping

- Moves in the e2e are spaced past the `story` duration, so the throttle never drops a key the test
  meant.
- The motion check pauses the animations mid-move to see that the leaving slide is `inert`, focus
  stays put, nothing scrolls sideways at 360 px and no slide's content moves up or down; under
  reduced motion, the next slide's final state shows one frame after the move with nothing running.
- A mouse drag can't show how a touch browser shares a gesture with scrolling, so touch stays in the
  owner's review.

## Open for `recap`'s spec

- **A frame around the story:** the design boards frame it in a rounded panel and let the room's
  light reach the top and bottom bars; the spike kept the bars flat.
- **"Tap to continue"** on the first slide: whether the hint itself takes taps.
- **Hover on touch screens:** gate the bar buttons' hover style on `(hover: hover)`, so it doesn't
  stick after a tap.
- **The reduced-motion e2e** passed trivially until animations existed; with real motion levels it
  must prove each level's final state, not only that nothing runs.
- **Proposals from the advice rounds,** for `recap`'s spec to accept or drop:
  - **Motion:** standard could swap the total's blur and the bars' clipped growth for cheaper
    transform and opacity equivalents that look the same on low-end phones. Cinematic's effects
    (the projector's light, a shared-element move into the summary, a swipe that scrubs the reel
    change) would each run only where the browser supports them. Reduced motion would be honoured
    in CSS before hydration as well as in script. `recap`'s spec would set budgets (frame time,
    script size) and the default level, after measuring on real phones.
  - **Layouts:** the admin preview drawn by the recap's own layout components with the demo
    fixture's figures, so a preview can't drift from the recap; layouts with no motion of their
    own, so motion is tested once on the shared entrance; all five layouts checked at 360 and
    1440 px in both languages and at 200% zoom, with the full story tests on Credits axis only.
