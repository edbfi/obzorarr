# Implementation plan: obzorarr ground floor (skeleton)

**Status:** approved with [docs/SPEC.md](../docs/SPEC.md) (2026-10-18).
The tasks, with acceptance criteria and checks, are in [todo.md](todo.md).

## Overview

Build the skeleton the spec describes: a SvelteKit 3 app on Bun with adapter-bun, Panda tokens from
the design seed, Ark UI, a placeholder `/` page and `/healthz`, one unit test and one e2e smoke, and
the edbfi Bun web prek, CI and Dependabot setup. No database, auth or features. Each task leaves the
app working, and every PR in the stream goes through the house review loop (AGENTS.md).

## Architecture decisions

- **Build the app before the tooling around it.** The Bun web prek config and CI need `package.json`,
  `check`, `test`, `build` and `smoke` to exist, so they come last and switch on green.
- **Tests come with the code they cover** (TDD): `/healthz` lands with its unit test, and the smoke
  test lands once there's something to smoke.
- **Tokens move once.** Panda takes every value from `docs/design/tokens.json`; the seed files are
  deleted in a separate task that also repoints the links, so the move is easy to review.
- **The tier change goes with CI.** obzorarr becomes a Bun web repo in the same PR that adds the
  Bun web `ci.yml`; edbfi-ci's STATE.md records it afterwards (outside this repo).
- **Reuse the existing weekly CI minute** (`29 3 * * 0`), which is already unique to this repo.

## Dependency graph

```text
T1 app shell on Bun ──┬── T2 /healthz + unit test
                      ├── T3 Panda tokens ── T4 drop seed token files
                      ├── T5 Ark UI
                      └── T6 e2e smoke (needs T2, T3)
T7 Biome ── T8 prek Bun web config (needs T2, T6) ── T9 CI, Dependabot, biome-migrate
T10 close the work stream (needs everything)
```

## Phases

1. **App:** T1–T2, then checkpoint A.
2. **Design system and smoke:** T3–T6, then checkpoint B.
3. **Tooling and CI:** T7–T9, then checkpoint C.
4. **Close:** T10 (end-of-stream cleanup).

T2, T3 and T5 can run in parallel after T1. Everything else is sequential.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Panda codegen, `svelte-kit sync` and the Vite plugin order differs under SvelteKit 3 and Vite 8 | High | `prepare` runs sync before codegen (proven in the stack validation); T3 checks a clean clone |
| Playwright or Vitest calls Node somewhere | High | run every check with failing `node`/`npm`/`npx` shims on `PATH`, as CI does |
| Hydration isn't proven by server-rendered HTML alone | Medium | the smoke test waits for a client-side signal, not only the HTML |
| `check-peers` fails on a required peer | Medium | fix the peer before the hook is enabled (edbfi-ci prek rule 12) |
| The adapter-bun output or preview command differs from `bun ./build` | Low | T1 records the working command in the `preview` script |
