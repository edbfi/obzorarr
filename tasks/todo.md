# Tasks: `secrets`

The spec is [docs/SPEC-secrets.md](../docs/SPEC-secrets.md), and the plan is [plan.md](plan.md).
Each task is one PR and writes its tests first. Each one adds its files to AGENTS.md's structure,
and runs `bun run --bun check`, `bun run --bun test`, `bun run --bun lint` and
`prek run --all-files --hook-stage manual` before every commit. Paths under `src/lib/server/` are
shortened to `server/`.

## Task 1: key text and the weak-key checks

**Description:** Decode a key's text to its 32 bytes, accepting only canonical standard base64,
and refuse weak keys. Each error names the check that failed and never holds key text.

**Acceptance criteria:**
- [ ] Canonical 44-character keys decode to 32 bytes. 43 or 45 characters, a missing `=`,
  base64url, non-canonical trailing bits, embedded whitespace, and empty or whitespace-only text
  fail as malformed, and a 64-character hex key gets the hex hint.
- [ ] A repeated byte, 16 distinct values each twice (exactly 4.0 bits), a doubled 16-byte key, an
  ascending and a descending counter, and a base64-encoded passphrase each fail and name their
  check. 10,000 generated random keys all pass.
- [ ] No error message contains any part of the key text.

**Verification:** `bun run --bun test`, `check`, `lint`, prek.

**Dependencies:** none.

**Files:** `server/security/secrets/key-text.ts`, `key-text.test.ts`, `AGENTS.md`.

**Size:** S.

## Task 2: reading the key from the environment or a file

**Description:** Return the key's text and the variable it came from, given the two variables'
values. No key logic.

**Acceptance criteria:**
- [ ] Exactly one non-empty variable is accepted. Both set is an error, even with the same key;
  neither is an error. An empty variable counts as unset: an empty key with a file uses the file,
  a key with an empty file variable uses the key, and both empty is "missing".
- [ ] A file is read once, must be at most 4 KiB, and loses one trailing LF or CRLF; any other
  whitespace stays in the text. An unreadable file is an error naming the variable and the path.
- [ ] An empty key file returns empty text, which task 1 refuses as malformed.

**Verification:** `bun run --bun test`, `check`, `lint`, prek.

**Dependencies:** none.

**Files:** `server/config/secret-key.ts`, `secret-key.test.ts`, `AGENTS.md`.

**Size:** S.

## Task 3: the keyring

**Description:** `loadKeyring(env)` reads the key (task 2) and checks it (task 1), then imports it
into WebCrypto as non-extractable HKDF input. It derives the AES-256-GCM key and the key ID, and
keeps the loaded keyring for the cipher.

**Acceptance criteria:**
- [ ] Every failure is one line naming the variable and the check, with `openssl rand -base64 32`
  where a new key is the fix, and holds no key text.
- [ ] The key ID is 22 characters of unpadded base64url, stable across loads of the same key, and
  different for different keys. The AES key isn't extractable.
- [ ] The `info` labels are exactly `edbfi:secrets:v1:aes-256-gcm` and `edbfi:secrets:v1:key-id`.

**Verification:** `bun run --bun test`, `check`, `lint`, prek.

**Dependencies:** tasks 1 and 2.

**Files:** `server/security/secrets/keyring.ts`, `keyring.test.ts`, `AGENTS.md`.

**Size:** S.

## Task 4: the app refuses to start without a valid key

**Description:** Declare the two variables in `src/env.ts` and load the keyring in the `init` hook,
then prove with e2e tests that the built server refuses to start without a valid key.

**Acceptance criteria:**
- [ ] `bun ./build` with no key, a malformed key and a weak key each exits non-zero before it
  listens, naming the check. Its output never contains the key, and a key in the developer's
  `.env` changes none of these results.
- [ ] The smoke test passes with the key Playwright generates, and `build` passes with no key set.
- [ ] The README has a "Master key" section (making a key, the two variables, an empty variable
  counting as unset). SPEC.md's commands and testing sections are updated, and CI needs no
  stored secret.

**Verification:** all of the above, then `bun run --bun build` and `bun run --bun smoke`. Manual
check: `bun run --bun dev` with no key fails every request with the key error in the terminal.

**Dependencies:** task 3.

**Files:** `src/env.ts`, `src/hooks.server.ts`, `playwright.config.ts`,
`tests/e2e/secret-key.test.ts`, `README.md`, `AGENTS.md`, `docs/SPEC.md`.

**Size:** M.

## Checkpoint: after task 4

- [ ] Everything passes locally and in CI (`checks`, `smoke`, `ci-ok`) with no stored secret.

## Task 5: the `Secret` wrapper

**Description:** `Secret` holds one plaintext string that only `reveal()` returns.

**Acceptance criteria:**
- [ ] `String()`, template strings, `+`, `JSON.stringify`, `console.log`, `Bun.inspect` and
  `util.inspect` all give `[redacted]`.
- [ ] `reveal()` returns the value, and the type has no other behaviour.

**Verification:** `bun run --bun test`, `check`, `lint`, prek.

**Dependencies:** none.

**Files:** `server/security/secrets/secret.ts`, `secret.test.ts`, `AGENTS.md`.

**Size:** XS.

## Task 6: the cipher, and closing the work stream

**Description:** `encryptSecret(secret, binding)` and `decryptSecret(stored, binding)` with the
stored format, the binding and the three error classes. This task also closes the work stream.

**Acceptance criteria:**
- [ ] A round trip works, and two encryptions of one secret differ. Another table, field or row
  ID, a flipped bit in any segment, a swapped key ID and a truncated value each fail with the
  right error, and every segment's length is checked. An empty secret can't be encrypted, and a
  value written under another key fails with `SecretKeyMismatchError`.
- [ ] The README covers changing the key and backups.
- [ ] The end-of-work-stream cleanup is done:
  - `tasks/` is deleted;
  - SPEC-secrets.md is reduced to what code and tests can't say;
  - durable outcomes are folded into `docs/SPEC.md` and `docs/decisions.md`;
  - AGENTS.md's status is updated;
  - the PR body maps every removed requirement to a test or a spec.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek.

**Dependencies:** tasks 3 and 5.

**Files:** `server/security/secrets/cipher.ts`, `cipher.test.ts`, `README.md`, `AGENTS.md`,
`docs/SPEC.md`, `docs/SPEC-secrets.md`, `docs/decisions.md`, `tasks/`.

**Size:** M.
