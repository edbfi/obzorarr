# Input for the `i18n` and `recap-spike` specs

The owner approved these decisions on 2026-10-29, after a council review (Claude Opus 5.5,
GPT 6.1 Sol, Gemini 4 Argon) and a sol-loop review. Each spec records its own part; this file is
deleted once both specs are approved.

## `i18n`

- **The switcher:** `src/lib/components/layout/LanguageSwitcher.svelte`, a labelled native
  `<select>` that uses only tokens and sets Paraglide's default cookie, `PARAGLIDE_LOCALE`. It is
  shown on the placeholder `/`, and each shell places it when that shell is built. The landing
  brief (`.impeccable/surfaces/route.md`) gains it in its signed-out navigation. It needs no
  surface brief of its own.
- **Danish text:** agents write the English and the Danish messages. The owner may spot-check them
  but doesn't approve them, and Weblate corrects them later.
- **Completeness:** a Vitest test, `src/lib/shared/i18n/messages.test.ts`. It checks that both files
  have the same keys and the same `{{…}}` placeholders, and that each plural message has exactly
  the categories `Intl.PluralRules(locale)` gives (en and da: `one`, `other`). It runs in the
  existing `tests` hook and in CI, so no new hook is needed. It sits in `src/` only because Vitest
  runs `src/**`; its sources are `messages/*.json`.
- **D22's three checks:**
  - **Pinned versions:** `check`, `test`, `build` and `smoke` pass with them.
  - **Serving:** an e2e test against `bun ./build` shows that the middleware serves non-empty pages
    in both languages (`Accept-Language: da`, then switching with the switcher). This also closes
    D16's "browser interaction with a real component".
  - **Weblate round trip:** a one-off run through `uvx` of translate-toolkit's `I18NextV4File`
    reads and writes `messages/da.json` with a plural and an interpolation. It passes when the
    parsed JSON is equal (the library rewrites indentation), Paraglide compiles the result, and
    both plural branches render. The evidence goes in the PR body.
- **Plugins load from disk:** `@inlang/paraglide-js` and `@inlang/plugin-i18next` (6.2.0 or later)
  are exact-pinned dev dependencies, with
  `"modules": ["./node_modules/@inlang/plugin-i18next/dist/index.js"]`. Nothing is fetched at
  build time or in CI. With no network, `paraglide-js compile` 2.29.3 and inlang SDK 4.0.4 loaded
  this local path. The first task checks it again with the pinned versions. The files Paraglide
  writes into `project.inlang/` besides `settings.json` stay untracked, through Paraglide's own
  `.gitignore`.
- **Compiled output:** `src/lib/paraglide/`, gitignored, imported as `#lib/paraglide/…`.
  - **When it compiles:** in `prepare` and `check` before `svelte-check`, and through Paraglide's
    Vite plugin in dev, build and Vitest.
  - **Its options, kept in one place:** that folder, and the strategy `cookie` →
    `preferredLanguage` → `baseLocale` (D22; no URL prefixes).
  - **Panda:** its `include` excludes the folder.
  - **The stack table:** both packages join SPEC.md's tech-stack table.
- **SPEC.md, "Where modules live":** `messages/` and `project.inlang/` are at the repo root, not
  under `src/lib/server/`.

## `recap-spike`

- **The brief:** `.impeccable/surfaces/route-wrapped-2025-me.md` is the spike's design input only,
  with the corrections below. `recap`'s brief follows from the spike's outcome.
- **The three slides,** all from the existing demo fixtures:
  1. **Total time:** "842 hours of everything you played in 2025" (D23, never "watched"), with
     "Movie Buff" as fixed message text, not a computed badge.
  2. **Monthly hours:** an animated chart, labelled the same way.
  3. **The summary end card:** "Alex's 2025", 127 movies, 38 series, a 21-day streak and the
     "Members only" badge (icon and text). Share recap is visibly disabled; Back to overview goes
     to `/`.
- **Story mode works as the legacy spec says** (legacy-spec.md:415-423):
  - you move through it by tap, swipe and keys;
  - it has no timer, so it has no Pause button (the brief's Pause is dropped);
  - it shows segmented progress;
  - Close always goes to `/`, and the slide index isn't kept in the URL fragment: the spike leaves
    out the legacy return to the previous page and the deep link.
- **Text:** every string comes from `messages/` in English and Danish, and numbers and months are
  formatted for the locale through `lib/shared/i18n/`.
- **Fonts:** the dependency that ground-floor choice 1 deferred to the first surface.
  - **Packages:** `@fontsource-variable/space-grotesk`, `@fontsource-variable/instrument-sans` and
    `@fontsource/ibm-plex-mono`, as exact-pinned dev dependencies.
  - **Imports, in the root layout:** each variable package's default CSS (every subset behind
    `unicode-range`), plus `@fontsource/ibm-plex-mono/400.css` and `/500.css`.
  - **Panda's font tokens** use the family names the packages register: `Space Grotesk Variable`,
    `Instrument Sans Variable` and `IBM Plex Mono`.
- **Where it runs:** `/spike/recap`, served by the built server like `/`, not linked from anywhere.
  - **Removal:** the PR that records D19's verdict deletes the route and its components, and
    `setup`'s build starts only after that PR merges.
  - **Choice 5:** the spike never meets `setup`'s gate or headers, so ground-floor choice 5 closes
    as "no headers needed".
  - **Reuse:** `recap`'s spec adopts spike code from git history by naming the commit.
- **Motion:** Svelte's built-in transitions, `svelte/motion` (`prefersReducedMotion`) and CSS, with
  durations from Panda's motion tokens. There is no animation library, and reduced motion shows
  each slide's final state.
- **D19 closes with an assessed outcome.** The owner reviews the running spike at 360, 390, 768 and
  1440 px, at 200% zoom, with the keyboard, with reduced motion and in Danish as well as English.
  D19 records the verdict: what `recap` keeps, what changes, and whether it needs custom work
  beyond Panda and Ark.
- **"Three slides"** in D19, SPEC.md and AGENTS.md stays true: the spec names them as total time,
  monthly hours and the summary end card. `happy-dom` joins with whichever test first needs it
  (SPEC.md, tech stack).
