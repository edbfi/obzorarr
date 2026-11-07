# Implementation plan: `i18n`

## Overview

Build module 2 of the capability map as [docs/SPEC-i18n.md](../docs/SPEC-i18n.md) specifies: the
messages Paraglide JS compiles, choosing each request's language, the language switcher, the
formatters and the message check, with D22's validations. Five tasks, one PR each, each test first.
The tasks are in [todo.md](todo.md).

## Architecture decisions

- **The riskiest work comes early.** Task 1 wires Paraglide into the build and runs the Weblate
  round trip before any product text exists, so a surprise in the toolchain or the file format
  changes nothing that was written in it. Task 2 then runs the middleware through the built
  adapter-bun server, where Paraglide issue
  [#725](https://github.com/opral/paraglide-js/issues/725) would show, and runs the concurrency
  check.
- **Every PR leaves `main` working.** Task 1 compiles the placeholder's messages, but the page keeps
  its own text until task 2 adds the server's language handle and the browser hook. A page that
  rendered messages without them would let the browser runtime choose a language by itself and
  write the cookie the viewer never asked for (SPEC-i18n.md, "In the browser").
- **The server and the browser change together.** Task 2 adds both hooks, because each half alone
  is wrong: the server's choice means nothing if the browser chooses again on hydration.
- **Each validation's evidence goes in the body of the PR that runs it:** the pinned versions with
  no Node on `PATH` and the Weblate round trip in task 1's, the concurrency check in task 2's, and
  the full list in task 5's, which closes D22.
  The temporary messages, route and scripts are never committed (SPEC-i18n.md, "Validation").
- **Facts change in the task that changes them.** Each task updates SPEC.md's tech stack,
  Commands and testing sections, and AGENTS.md's structure, as its files land. Task 5 does the
  rest of the spec's "Docs this module changes when built" list and the end-of-work-stream
  cleanup.

## Task list

### Phase 1: the toolchain

- [x] Task 1: Paraglide compiles the messages

### Phase 2: each page in the viewer's language

- [x] Task 2: each request gets the viewer's language, and the browser keeps it
- [x] Task 3: the language switcher

### Checkpoint: after task 3

- [x] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass.
- [x] The built server serves `/` in Danish to a Danish browser and in English otherwise, the
  switcher changes it, and `/healthz` is unchanged.

### Phase 3: the tools later modules write through

- [x] Task 4: formatting numbers and dates
- [ ] Task 5: the message check, and closing the work stream

### Checkpoint: complete

- [ ] Every success criterion in SPEC-i18n.md is met.
- [ ] The end-of-work-stream cleanup (AGENTS.md, "Cleanup procedures") is done in task 5.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The middleware returns nothing in the adapter-bun build (#725) | High | Task 2's e2e tests run against the built server, before the switcher or any formatter exists |
| The CLI and the Vite plugin write different layouts into one folder | Medium | `outputStructure: "message-modules"` in the shared config; task 1 runs `check` beside `dev` |
| Weblate writes the files in a shape Biome or the plugin refuses | Medium | Task 1's round trip, before any real message is written |
| Concurrent requests mix languages under Bun's AsyncLocalStorage | High | Task 2's 200-request check against the built server |
| Generated output trips Biome, Panda or the docs-set hook | Low | The two `.gitignore` lines and Panda's `exclude` land in task 1; prek runs with the output present |
| The agents' Danish reads badly | Low | The owner may spot-check it; Weblate corrects it later (SPEC-i18n.md, "Who writes them") |

## Porting to the other apps

Once task 5 merges, comradarr, zondarr, otpravkarr and zimuarr each specify `i18n` from this
app's spec, code and tests (AGENTS.md, Shared groundwork). What differs: their placeholder's
English and Danish text, where their shells place the switcher, any brief that gains it, and the
decision numbers. Everything else, the cookie name included, stays the same, so a language chosen
in one app carries over to the others on the same host.

## Open questions

None. The owner approved the spec on 2026-11-06. This plan's only change to it is
`@inlang/paraglide-js` 3.2.1 instead of 3.2.0: a patch released on 2026-11-07 that fixes path and
symlink handling in the bundler plugins, which D27 requires a new dependency to join at.
