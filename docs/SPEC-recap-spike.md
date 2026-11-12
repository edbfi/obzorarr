# Spec: `recap-spike`

**Status:** draft for the owner's approval. Module 3 of the capability map ([docs/SPEC.md](SPEC.md));
it closes D19. `recap-spike` is obzorarr's own: the recap isn't a shared area
([Shared groundwork](../AGENTS.md#shared-groundwork)), so no sibling ports it.

## Objective

The animated recap is the surface most likely to need custom work beyond Panda CSS and Ark UI (D19).
Before its design is committed, the spike builds three slides on the demo fixtures, in story mode,
with motion, reduced motion and text in English and Danish, so the owner can judge the real thing in
a browser rather than a raster. It answers D19's questions:
1. **What `recap` keeps** of the story, the slides' look and the motion.
2. **What changes** before `recap`'s brief and spec are written.
3. **Whether `recap` needs custom work beyond Panda and Ark,** and where.

**The design input** is the surface brief
[`route-wrapped-2025-me.md`](../.impeccable/surfaces/route-wrapped-2025-me.md), with this spec's
corrections, and DESIGN.md. The brief is input only: `recap`'s brief follows from the verdict.

The spike is not product. It has no database, sign-in, Plex, statistics or sharing, it is linked
from nowhere, and the PR that records D19's verdict deletes it.

**Left out on purpose,** because `recap` builds them (Module notes in [SPEC.md](SPEC.md#recap), D23,
D24) and none changes what the spike can settle: every other slide, scroll mode, the empty recap,
the share dialog, returning to the previous page, the slide index in the URL fragment, year
navigation, the logo mode, artwork, the server recap, the total's days or weeks comparison, the
time-zone note ("Times in …"), the note when runtimes are missing, and loading and failure states
(the data is fixed, so there are none).

## The route and its data

`/spike/recap` (`src/routes/spike/recap/`), served by the built server like `/`, through the same
`handle` (so in the viewer's language), and not linked from anywhere.
- **`+page.server.ts`** imports `tests/fixtures/demo-fixtures.json` statically, so Vite bundles it
  into the build and nothing reads `tests/` at runtime. The import from `tests/` is deliberate: the
  fixture is the canonical demo data (DESIGN.md), and copying it would make two. It returns only the
  member's figures under the `obzorarr` key (`year`, `member`, `hours`, `movies`, `series`,
  `longestStreakDays`, `monthlyHours`), so the slides take their figures as props, as `recap`'s will
  from the statistics, and never import the fixture.
- **`+page.svelte`** renders the story with the three slides, and sets the page title.
- **No security headers or CSP** (ground-floor choice 5). The spike serves fictional figures, stores
  nothing and is deleted before `setup` is built, so it never meets `setup`'s gate or headers. The
  verdict PR closes choice 5 as "no headers needed".

## Story mode

Story mode is `recap`'s ([SPEC.md](SPEC.md#recap), Module notes), less what the spike leaves out.

**The story** is at least the dynamic viewport's height, with no app shell. A top bar holds the page
heading, progress and Close; a bottom bar holds Previous and Next; both stay in view (sticky). One
step shows at a time: total time, monthly hours, then the summary end card. A step taller than the
screen, at 200% zoom say, scrolls the page itself, so ↑, ↓ and the scroll wheel work wherever focus
is. Each move scrolls the page to the top of the story at once, before the new step enters.

**The summary is the story's third step,** where the Module notes make `recap`'s summary a page
after the slides. Three equal steps are the honest test of the story; the verdict records which
`recap` keeps.

**Moving** (one move goes one step; nothing loops):

| Input | Forward | Back | Other |
|---|---|---|---|
| Tap | anywhere on the step but its left 15% | the left 15% | — |
| Swipe | leftward, more than 50 px | rightward, more than 50 px | — |
| Keys | →, Space, Enter | ← | Home: the first step; End: the summary; Escape: Close |
| Buttons | Next | Previous | — |

- **A tap** is a press that moves less than 10 px. Only the primary pointer's primary button counts
  (a right-click or a second finger moves nothing). A press on a control (Close, Previous, Next, a
  link or a button) is that control's, never a tap.
- **A swipe** counts only when it moves further horizontally than vertically. The story sets
  `touch-action: pan-y pinch-zoom`, so the browser keeps vertical scrolling and zoom and leaves
  horizontal drags to the story; a cancelled gesture (`pointercancel`) moves nothing, and text isn't
  selected during a drag.
- **Keys** are read on the whole page, but not when Shift, Ctrl, Alt or Meta is held, so browser
  shortcuts such as Alt+← and Shift+Space still work. Space on a focused button presses it, and
  Enter on a focused button or link activates it; otherwise both move the story (Space on a link
  doesn't follow it, and doesn't scroll). ↑ and ↓ are left to the browser.
- **Throttled:** a move within the `story` duration (320 ms) of the last one is ignored, so a held
  key, a quick double tap or a double click can't skip a step.
- **Previous and Next** show at every width (the screen shows them on desktop too, and the Module
  notes' phone buttons are the minimum). Each is a labelled 44 px button. At either end, the button
  that can't move is `aria-disabled` and does nothing on a click, Enter or Space, not `disabled` or
  removed, so a keyboard user's focus never falls to the page.
- **Close** is a labelled 44 px link to `/`. Escape does the same. The spike always closes to `/`.
- **"Tap to continue"** shows on the first step only.

**Semantics.** The page's `h1` is the visible "Your 2025 story" in the top bar. The story follows
the WAI-ARIA Authoring Practices' carousel pattern: a region named by that heading with
`aria-roledescription` "carousel"; each step a group with `aria-roledescription` "slide", named
"1 of 3", "2 of 3", "3 of 3", with its own `h2`. Screen readers speak `aria-roledescription` verbatim,
so both words are messages ("karrusel", "dias" in Danish); the steps' container
`aria-live="polite"`, since nothing moves on its own. Progress is three segments, past, current and
remaining, drawn with tokens and hidden from assistive technology.

**Focus.** Only the current step is in the page; a step leaving is `inert` until its transition
ends.
- Arriving at the summary always moves focus to its `h2` (`tabindex="-1"`), even from a control in
  the bars, so a stray Enter doesn't press a button (Module notes).
- On the other steps, focus on a control in the bars (Close, Previous, Next) stays there, and focus
  inside the leaving step moves to the new step's `h2`, so it never falls to the page.

**Without JavaScript** the first step shows and nothing moves. `recap`'s scroll mode decides the
no-script path; the spike doesn't.

**The story shell is the spike's own code, not Ark UI's Carousel** (`@ark-ui/svelte` 5.25.1, Zag's
carousel 1.47.0). The Carousel is a scroll-snap track: its transition is the browser's smooth
scroll, whose duration the app can't set (DESIGN.md caps the story transition at 320 ms, from a
token), and it doesn't read the reduced-motion preference. It handles ←, →, Home and End only while
it holds focus, never Space, Enter or Escape, and has no tap zones or throttle. All steps sit side by
side in one horizontally scrolling track, so a step taller than the screen at 200% zoom would scroll
on both axes. What Ark would have given, the region and slide roles and the previous and next
buttons, is a few attributes and two buttons. The verdict records whether `recap` keeps this shell.

## The three slides

All figures come from the fixture; nothing is computed from the raster. Every step keeps one
dominant idea and wraps long and translated text without hiding Close, Previous or Next. No imagery
sits behind text or figures (DESIGN.md).

1. **Total time.** The `h2` is the sentence "842 hours of everything you played in 2025" (D23: never
   "watched"), its number in the `display` text style at poster size (below, "Imagery and
   tokens"); then "Movie Buff" as fixed message text, not a computed badge. Beside the text, the
   cyan projector beam over an abstract cinema silhouette.
2. **Monthly hours.** The `h2` "Hours of everything you played in 2025, month by month", and a chart
   of the twelve months: a list labelled by that heading (`aria-labelledby`), one row per month,
   each with the month's short name, a bar and its hours as text ("42 hours", a plural message, so
   a screen reader never reads "Jan 42" as a date). Bars are proportional to the
   busiest month and drawn with tokens; the list is the chart's text, so a screen reader reads every
   month and its hours, and it fits at 360 px and at 200% zoom without a chart library.
3. **The summary end card.** "Your recap" above the `h2` "Alex’s 2025", then 127 movies, 38 series
   and "Longest streak" 21 days, each with a decorative icon and its number in the display size, and
   the "Members only" badge (icon and text, a tinted `secondary` background with readable text,
   never colour alone). "Share recap" is a native `disabled` button that stays visibly labelled.
   "Back to overview" is a link to `/`.

**Large numbers keep their whole sentence.** Each figure shown large ("842 hours of everything…",
"127 movies", "38 series", "21 days") is one plural message with `{{count, number}}`, as
[SPEC-i18n.md](SPEC-i18n.md#messages) requires, so the plural and the word order stay the
translator's. The component splits the formatted message around the formatted count
(`formatNumber(count)`, which formats a whole number exactly as the message's `number` format does)
and styles that part large. It matches the count only where no digit or group separator touches it,
so a count of 20 is never found inside "2025". If the count isn't found, the message shows unstyled.
A caption without its count would read "1 hours" on real data and break the message check's rule.

## Motion

Svelte's built-in transitions, `prefersReducedMotion` from `svelte/motion` and CSS, with every
duration from Panda's motion tokens, never a literal. No animation library.
- **Durations in script:** `Story.svelte` converts `token("durations.story")` ("320ms") to a number
  once, and the transitions and the throttle use that number. CSS uses the token names.
- **Between steps:** the new step slides in from the side it comes from and fades, over `story`
  (320 ms), through Svelte's transitions, with no duration under reduced motion.
- **Each step's entrance** is a CSS keyframe animation in `panda.config.ts`, run only under
  `_motionSafe`: the total and its caption fade and rise; the month bars grow from zero together;
  the summary's figures fade in. All over `story`. CSS, because Svelte doesn't play `in:`
  transitions when a server-rendered page hydrates, and so the first step animates on load and is
  never hidden waiting for JavaScript.
- **Progress:** a segment fills over `feedback` (160 ms).
- **No count-up.** The numbers are their final text from the first frame, so a screen reader or a
  translated layout never meets an intermediate value.
- **Nothing loops or moves on its own.** The beam is still.
- **Reduced motion** shows each step's final state at once: no slide, fade, rise or growth, and
  moving is instant. The throttle still applies.

## Text

Every string is a message in `messages/en.json` and `messages/da.json`, named `recap_spike_…` so the
verdict PR finds them all. Numbers go through `formatNumber` and month names through
`formatDateTime` with `{ month: "short", timeZone: "UTC" }` (a calendar value,
[SPEC-i18n.md](SPEC-i18n.md#formatting)). The year is a bare `{{year}}`. Agents write both
languages; the owner may spot-check the Danish.

| Message | English |
|---|---|
| `recap_spike_page_title` | Your {{year}} story · Obzorarr |
| `recap_spike_story_label` | Your {{year}} story |
| `recap_spike_carousel_role`, `recap_spike_slide_role` | carousel, slide |
| `recap_spike_slide_position` | {{current, number}} of {{total, number}} |
| `recap_spike_close` | Close |
| `recap_spike_previous`, `recap_spike_next` | Previous slide, Next slide |
| `recap_spike_tap_to_continue` | Tap to continue |
| `recap_spike_total_time` (plural) | {{count, number}} hours of everything you played in {{year}} |
| `recap_spike_total_badge` | Movie Buff |
| `recap_spike_monthly_title` | Hours of everything you played in {{year}}, month by month |
| `recap_spike_monthly_hours` (plural) | {{count, number}} hours |
| `recap_spike_summary_eyebrow` | Your recap |
| `recap_spike_summary_title` | {{name}}’s {{year}} |
| `recap_spike_summary_movies` (plural) | {{count, number}} movies |
| `recap_spike_summary_series` (plural) | {{count, number}} series |
| `recap_spike_summary_streak_label` | Longest streak |
| `recap_spike_summary_streak_days` (plural) | {{count, number}} days |
| `recap_spike_members_only` | Members only |
| `recap_spike_share` | Share recap |
| `recap_spike_back` | Back to overview |

**A name never takes a Danish genitive.** Danish adds `s` to most names but only an apostrophe after
s, x or z ("Alex' 2025"), which a message can't choose, so the Danish title puts the name where it
needs no ending ("{{name}} i {{year}}").

## Fonts

The dependency ground-floor choice 1 deferred to the first surface, approved by the owner on
2026-10-29.
- **Packages:** `@fontsource-variable/space-grotesk` 5.3.0, `@fontsource-variable/instrument-sans`
  5.3.0 and `@fontsource/ibm-plex-mono` 5.3.0, exact-pinned dev dependencies (SIL OFL 1.1).
- **Imports, in the root layout** (`src/routes/+layout.svelte`): each variable package's default CSS
  (every subset behind `unicode-range`, weights 300–700 and 400–700), plus
  `@fontsource/ibm-plex-mono/400.css` and `/500.css`. Vite bundles the files into the build, so the
  fonts come from the app (DESIGN.md: no remote font requests).
- **Panda's font tokens** name the families the packages register: `Space Grotesk Variable`,
  `Instrument Sans Variable` and `IBM Plex Mono`, each with its system fallback.

The fonts stay after the verdict: every page uses them.

## Icons

The summary and the controls need nine icons (close, previous, next, back, share, lock, film, TV
and flame), and DESIGN.md asks for one 20 px line family with a 1.5–2 px stroke. The spike adds
`@lucide/svelte` 1.72.0 (ISC), an exact-pinned dev dependency, imported one icon per path
(`@lucide/svelte/icons/x`) at size 20 with a 2 px stroke and `currentColor`. Every icon here is
decorative (`aria-hidden`): the control or figure beside it has the text. It is a new dependency,
for the owner's approval, and stays after the verdict because every later surface needs icons.

## Imagery and tokens

The projector beam is a CSS gradient and the silhouette an inline SVG in the total-time slide, both
decorative (`aria-hidden`), coloured only through tokens, sharp at every width and with no asset
pipeline. The verdict records whether `recap` needs drawn or raster art instead.

**Two new tokens,** for the owner's approval with this spec, since DESIGN.md has neither:
- **`fontSizes.poster`:** the total's number, a fluid `clamp()` that fits 360 px and reaches about
  three times `display` at 1440 px, as on the screen. The summary's figures use `display`.
- **`gradients.beam`:** the beam, from `primary` fading to transparent, so it shows no edge over the
  silhouette. A semantic token, because it refers to semantic colours.

Both go with the verdict PR unless the verdict keeps them. The story's height is `preset-base`'s
`dvh` keyword. Dimensions only the spike uses (a progress segment's thickness, the beam's and the
silhouette's size) use Panda's `[…]` escape hatch, which `strictTokens` allows, and leave with the
spike. Nothing else departs from DESIGN.md's tokens, and the spike uses no Ark primitive: nothing in
it is a dialog, menu or form control.

## Project structure

```text
src/routes/spike/recap/+page.server.ts         the fixture's member figures
src/routes/spike/recap/+page.svelte            the story with its three slides; the page title
src/lib/components/recap/Story.svelte          the story shell: the bars, progress, taps, swipes,
                                               keys, focus, transitions
src/lib/components/recap/story-input.ts        a key or pointer gesture to a move, and the
                                               throttle (+ test)
src/lib/components/recap/count-emphasis.ts     a message split around its count (+ test)
src/lib/components/recap/TotalTimeSlide.svelte the total, Movie Buff, the beam and silhouette
src/lib/components/recap/MonthlyHoursSlide.svelte
src/lib/components/recap/SummaryCard.svelte
tests/e2e/recap-spike.test.ts                  the spike against the built server
```

The components sit in `lib/components/recap/`, the home the capability map gives `recap-spike`,
rather than beside the one route that uses them, so `recap` can adopt them from git history.

The build also changes:
- `package.json` and `bun.lock`: the font packages and `@lucide/svelte`;
- `src/routes/+layout.svelte`: the font imports;
- `panda.config.ts`: the font tokens, the two new tokens and the entrance keyframes;
- `messages/en.json` and `messages/da.json`;
- `tests/e2e/smoke.test.ts`: the font check.

`Story.svelte` takes the slides as snippets and knows nothing of their content, so `recap` can
judge it apart from them. Progress stays inside it: nothing else uses it.

## Testing strategy

- **Unit (Vitest, `node`):**
  - `story-input.test.ts`: each key to its move, modifiers ignored; Space and Enter on a focused
    button or link; Shift held; a tap in the left 15% and elsewhere; swipes either way past 50 px;
    a short or mostly vertical drag, a cancelled one, and a press of another button or pointer,
    doing nothing; the throttle ignoring a move within
    320 ms and taking one after it.
  - `count-emphasis.test.ts`: English and Danish messages split around their count, thousands
    included ("1,234", "1.234"); a count that also appears inside the year (20 in a message holding
    2025); a message without the count left whole.

  No component test is needed, so `happy-dom` doesn't join yet (SPEC.md, tech stack).
- **e2e (Playwright, against the built server):** `recap-spike.test.ts` checks that:
  - `/spike/recap` answers 200 in English and, for a Danish browser, in Danish with
    `<html lang="da">`, with the month names in the language ("May", "maj");
  - →, Space, Enter, ←, Home and End move the story and the step's name changes ("2 of 3"); Enter
    on a focused Close follows the link instead;
  - clicking Next moves one step; clicking the `aria-disabled` Next on the summary, or Previous on
    the first step, does nothing; Enter on a focused Next moves exactly one step;
  - a click in the left 15% goes back and elsewhere forward, and a mouse drag of more than 50 px
    moves the story;
  - arriving at the summary focuses its `h2`; then ← moves to "2 of 3" with focus inside that step;
    Share recap is disabled;
  - Close, Escape and Back to overview all go to `/`;
  - with reduced motion (`emulateMedia`), the next step's final state shows at once: the month bars
    at their final widths and no running animation;
  - at a short viewport, a move from a step scrolled to its bottom leaves the page at the top;
  - at 360 px nothing scrolls sideways;
  - no console errors.

  Moves in the e2e are spaced past the `story` duration (waiting for the leaving step to detach),
  so the throttle never drops a key the test meant.

  `smoke.test.ts` also checks that the three bundled families load: for each of Panda's three
  `fonts` values, `document.fonts.load("16px <family>")` returns at least one face. A wrong family
  name returns none, where `document.fonts.check()` would pass it. A mouse drag
  can't show how a touch browser shares a gesture with scrolling, so touch is in the owner's
  review.

## Commands

The ground floor's ([docs/SPEC.md](SPEC.md#commands)); `smoke` also runs `recap-spike.test.ts`.

## The owner's review and the verdict

When the spike's last build PR merges, the owner runs it from `main`:

```sh
bun ci && bun run --bun build && bun run --bun preview   # with a master key (README, Master key)
```

then opens `http://localhost:3000/spike/recap`, and reviews:
- **widths** 360, 390, 768 and 1440 px (the browser's device toolbar);
- **200% zoom** at 1440 px;
- **the keyboard alone:** →, Space, Enter, ←, Home, End and Escape, Tab through Close, Previous,
  Next and the summary's actions, with the focus ring visible;
- **touch** on a phone on the same network (or the device toolbar's touch emulation): a horizontal
  swipe moves the story, and a vertical scroll of a tall step doesn't;
- **reduced motion** (the system setting, or the device toolbar's rendering emulation);
- **Danish:** press "Dansk" on `/`, then open the spike again; then "English" to return.

The owner gives the verdict: what `recap` keeps (the shell, the summary as a step or a page after
it, the imagery, the poster size), what changes, and whether it needs custom work beyond Panda and
Ark. The verdict PR then:
- moves D19 to Decided with that verdict;
- deletes the route, `lib/components/recap/`, `recap-spike.test.ts`, the `recap_spike_…` messages
  and the entrance keyframes in `panda.config.ts`, always: `recap`'s spec adopts what the verdict
  keeps from git history, by naming the commit before the verdict PR;
- deletes the two new tokens, unless the verdict keeps them;
- closes ground-floor choice 5 as "no headers needed";
- marks row 3 built, removes the spike's entries from SPEC.md and AGENTS.md, and reduces this spec
  (below).

`setup`'s build starts only after the verdict PR merges.

## Boundaries

- **Always:** fixture figures only, passed as props; every string a message in both languages;
  durations from motion tokens; the final state under reduced motion; D23's wording.
- **Ask first:** any dependency beyond the four packages above; any token beyond the two above; any
  slide or state beyond the three steps.
- **Never:** a link to the spike; a database, sign-in, Plex, statistics or a real member's data; a
  Pause control or a timer; "watched" for a runtime total; an animation library; the spike surviving
  the verdict PR.

## Docs this module changes

**The build PRs,** as the code lands:
- **`docs/SPEC.md`:** the status line; the tech-stack table (the font packages and
  `@lucide/svelte`); ground-floor choice 1 (fonts bundled); the `smoke` command row; the testing
  section.
- **`AGENTS.md`:** the status and the structure tree, with the spike's files marked temporary.
- **`PRODUCT.md`:** "No bundled font files yet" goes.

**The verdict PR:** D19, choice 5 and row 3 as above. In SPEC.md, the spike's entries in the
testing section, the `smoke` row and "Where modules live", and the `recap-spike` line of "Open
decisions", go; in AGENTS.md, the spike's files in the tree and the boundary that waits for the
spike. The fonts and icons stay. If the verdict keeps a new token, DESIGN.md is refreshed from
Panda's config. This spec is reduced to what code can't say, as cleanup procedure 2 asks, since the
code it describes is deleted.

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke` and `ci-ok` pass.
2. The built server serves `/spike/recap` in English and Danish, and it moves by tap, swipe, keys
   and buttons as above, with and without reduced motion.
3. The owner has reviewed it as listed and given the verdict, and the verdict PR has merged.
