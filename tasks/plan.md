# Implementation plan: `secrets`

## Overview

Build module 1 of the capability map as [docs/SPEC-secrets.md](../docs/SPEC-secrets.md) specifies:
the master key read and checked at startup, the cipher every stored secret goes through, and the
`Secret` wrapper. Six tasks, one PR each, each test first. The tasks are in
[todo.md](todo.md).

## Architecture decisions

- **The riskiest work comes early.** Task 4 wires the key into SvelteKit (`src/env.ts`, the `init`
  hook, adapter-bun, Playwright and CI) before the cipher exists, so a surprise in the framework
  shows up while the code is small. Tasks 1–3 are the pure parts it needs.
- **Errors are composed in one place.** `key-text.ts` names the check that failed, `secret-key.ts`
  names the variable, and `loadKeyring` joins them into the one startup line, adding
  `openssl rand -base64 32` where a new key is the fix. No message ever holds key text.
- **One loaded keyring.** `loadKeyring(env)` keeps the keyring it loaded, and the cipher uses it,
  failing if none is loaded; a failed load leaves none loaded. Production loads it once in `init`.
  The cipher test proves `SecretKeyMismatchError` by loading key A, encrypting, loading key B and
  decrypting; there is no test-only way in.
- **Tests never see a developer's `.env`** (SPEC-secrets.md, "Startup").
- **Imports go downwards:** `hooks.server.ts` → `security/secrets/` → `config/`. `config/` reads
  text and knows nothing about keys.

## Task list

### Phase 1: the key

- [x] Task 1: key text and the weak-key checks
- [x] Task 2: reading the key from the environment or a file
- [x] Task 3: the keyring

### Phase 2: the app needs a key

- [ ] Task 4: the app refuses to start without a valid key

### Checkpoint: after task 4

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass with no stored secret.
- [ ] The built server without a valid key exits non-zero before it listens, and with one serves
  `/` and `/healthz` as before.

### Phase 3: storing secrets

- [x] Task 5: the `Secret` wrapper
- [ ] Task 6: the cipher, and closing the work stream

### Checkpoint: complete

- [ ] Every success criterion in SPEC-secrets.md is met.
- [ ] The end-of-work-stream cleanup (AGENTS.md, "Cleanup procedures") is done in task 6.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| SvelteKit 3 or adapter-bun runs `init` or reads `src/env.ts` differently than their 3.1.0 and 1.0.0 sources show | High | Task 4 comes before the cipher; its e2e tests run against the built server |
| A developer's `.env` or exported variable changes a test's result | Medium | The isolation in SPEC-secrets.md, "Startup", and an e2e case that proves it |
| A weak-key check refuses a random key | Low | About 1 in 62 billion by design; a test generates 10,000 random keys |

## The other apps

obzorarr is the reference for `secrets` ([Shared groundwork](../AGENTS.md#shared-groundwork)). The
other four apps already have their own `SPEC-secrets.md`, kept in step with this one, and port from
obzorarr's code and tests once they're built, keeping what their own specs add. A PR here that
changes the spec names the sibling apps that need the same change.

## Open questions

None. The owner approved the spec, with its 2026-10-29 amendments, and this plan.
