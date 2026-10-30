# Spec: `secrets`

**Status:** approved by the owner (2026-10-28). Module 1 of the capability map
([docs/SPEC.md](SPEC.md)). The design is the same in all five edbfi apps (D20, D26); only the
environment variable prefix, the app name in the associated data and the list of stored secrets
differ.

## Objective

Every later module that stores a secret (the Plex server token, members' Plex tokens in their
sessions, the AI key, the artwork signing key, two-factor secrets, the OIDC client secret) encrypts
it in the app before it reaches the database, so a stolen database file or backup is unreadable
without the master key (D20). `secrets` builds that groundwork and nothing that stores anything:
1. **The master key** is read once at startup from an environment variable or a secret file,
   checked, and turned into the keys the cipher uses. A missing, malformed or weak key stops the
   app before it serves a request (D20, D26).
2. **The cipher** encrypts a secret into one self-describing text value bound to its table, field
   and row, and decrypts it only under that same binding.
3. **The secret wrapper** keeps plaintext out of logs, errors and JSON: it prints as a redaction
   marker everywhere, and its value comes out only through one named call (D26).

## The master key

| Variable | Holds |
|---|---|
| `OBZORARR_SECRET_KEY` | the master key |
| `OBZORARR_SECRET_KEY_FILE` | the path of a file holding it (the form Docker and Compose secrets mount) |

**Reading.**
- Exactly one of the two must be set. Both set is an error, even when they hold the same key:
  precedence would hide a stale setting.
- **Set means non-empty.** An empty variable counts as unset, because Compose writes `VAR=` for a
  `${VAR}` that isn't defined, and an empty string can never be a key or a path. Only the
  variable's own text counts: a whitespace-only key is malformed, and so is an empty or
  whitespace-only key file.
- A file is read once at startup, must be at most 4 KiB, and may end in one newline (LF or CRLF);
  anything else around the key is part of it. A file that can't be read is an error naming the
  variable and the path.

**Format.** A key is exactly 32 bytes in canonical standard base64: 44 characters
(`A–Z a–z 0–9 + /`) ending in one `=`, which decode to 32 bytes and encode back to the same text.
`openssl rand -base64 32` prints one. Hex, base64url, other lengths and embedded whitespace are
malformed; a 64-character hex key gets a hint saying so.

**Weak-key checks:**

| Check | Refuses | A random key trips it |
|---|---|---|
| Shannon entropy of the 32 bytes at most 4.0 bits per byte (with a 10⁻⁹ tolerance for rounding) | a repeated byte, 16 or fewer distinct values, a 16-byte key written twice, a short secret padded out | about 1 in 62 billion (1.62 × 10⁻¹¹) |
| every byte one constant step (mod 256) from the one before | counters such as `00 01 02 …` and `ff fe fd …` | about 2⁻²⁴⁰ |
| every byte printable ASCII (0x20–0x7E) | a passphrase or other text encoded to base64 | about 1.7 × 10⁻¹⁴ |

There is no denylist: no doc, example or test in the repo holds a decodable key, and docs use a
placeholder that fails as malformed.

**Failing.** Every key error stops startup with one line naming the variable and the check that
failed, plus `openssl rand -base64 32` where a new key is the fix. No message, error or test output
ever contains a key or part of one.

**Derivation.** The 32 bytes are imported once into WebCrypto as non-extractable HKDF input and used
for nothing else, so any later use derives a key of its own without touching the cipher's. Each use
derives its own key with HKDF-SHA-256, an empty salt and its own `info` label:

| `info` | Gives |
|---|---|
| `edbfi:secrets:v1:aes-256-gcm` | the non-extractable AES-256-GCM key |
| `edbfi:secrets:v1:key-id` | 16 bytes, written as 22 characters of unpadded base64url: the key ID |

The key ID is derived, so nobody assigns it, and it reveals nothing about the key. Its one job is a
clear error: a value written under another key says so, instead of failing as tampered.

## Startup

`src/hooks.server.ts` is created with SvelteKit's `init` hook, which loads the keys. `init` skips
the load while the app is being built (`building` from `$app/env`), so a build never needs or embeds
a key. `setup` later adds its own startup checks after this one.
- **The built server** (`bun ./build`): adapter-bun awaits `init` before it listens, so a key error
  stops the process with a non-zero exit code and nothing is ever served.
- **`bun run --bun dev`:** SvelteKit's dev server runs `init` on the first request and doesn't exit
  when it fails; every request then fails with the key error in the terminal, so dev fails closed
  but keeps running.

**Declaring the variables.** SvelteKit 3 exposes only the variables declared in `src/env.ts`, so
`secrets` declares the two there with `defineEnvVars`: private, read when the app starts (not
inlined at build time), each optional through a schema function that returns the value unchanged and
never throws, so SvelteKit's own validation can't print a key. The hook imports them from
`$app/env/private`, and every check stays in `secrets`. They come from the environment or from an
ignored `.env` file: `dev` reads it through Vite, and Bun loads it into every `bun` process started
in the repo, the built server included.

Every way of running the app now needs a key: the README says how to make one, and the Playwright
config generates a fresh one for each run, so CI needs no secret and no change. A developer's own
`.env` or exported variables never reach a test: `playwright.config.ts` deletes both variables from
`process.env` and passes the generated key only to its web server, every built server a test
starts runs as `bun --no-env-file ./build`, and the e2e tests build each server's environment
without either variable, adding only what the case needs (Playwright's workers are new Bun
processes, which load `.env` again).

## The cipher

```ts
encryptSecret(secret: Secret, binding: SecretBinding): Promise<string>
decryptSecret(stored: string, binding: SecretBinding): Promise<Secret>
// SecretBinding = { table: string; field: string; rowId: string }
```

**The stored value** is one text value in a nullable text column:

```text
v1.<key id>.<nonce>.<ciphertext and tag>
```

- Each segment after `v1` is canonical unpadded base64url: the key ID is 22 characters (16 bytes),
  the nonce 16 characters (12 fresh random bytes from WebCrypto for every encryption), and the
  ciphertext ends in GCM's 16-byte tag.
- **A stored secret is never `NULL` or empty; `NULL` means none.** Encrypting an empty secret is an
  error, so an empty string never means "nothing stored". Any stored text that isn't exactly this
  shape is corruption and an error, never a silent empty value.
- One self-describing column: its parts can't drift apart, and it works on any database engine.

**The binding.** The associated data is the UTF-8 bytes of the JSON array
`["v1", <key id>, "obzorarr", <table>, <field>, <row id>]`. The array can't be read two ways
(unlike joined strings), and it also binds the version and the key ID. The caller always passes the
binding of the place it reads from or writes to, never one stored beside the value, so a value
copied to another row, field or app fails to decrypt. Table, field and row ID must be non-empty.

A rule for the modules that store secrets: **every row holding an encrypted field has a stable ID
the app generates before the insert** (an autoincrement ID doesn't exist yet when the value is
encrypted), which never changes for the row's life; names and URLs, which do change, are never part
of it. A table with one row uses a fixed ID.

**Errors.** Each is its own error class, and none carries the plaintext, the key or the stored
value:
- `SecretFormatError`: the stored text isn't the format above, or names an unknown version.
- `SecretKeyMismatchError`: the value's key ID isn't the loaded key's: it was written under another
  master key. It names the table, field and row ID.
- `SecretDecryptError`: the tag doesn't verify: the value was changed, or read under another
  binding.

**The limit:** with random 12-byte nonces, one master key may encrypt at most 2³² values (NIST SP
800-38D); obzorarr encrypts one Plex token per member session and a few settings, so this is never
near.

## The secret wrapper

`Secret` holds one plaintext string in a private field. `reveal()` is the only way to read it, so
review can list every place a secret is used (`grep reveal\(`). Everything else gets
`[redacted]`: `String()`, template strings, `JSON.stringify`, `console.log` and Bun's inspect (the
`nodejs.util.inspect.custom` symbol), and conversion to a primitive. The type has no other
behaviour.

`encryptSecret` takes a `Secret` and `decryptSecret` returns one, so a decrypted value is never a
bare string by accident.

## Changing the key

There is one master key and no rotation. A new key makes every stored secret fail with
`SecretKeyMismatchError`, and the owner enters those secrets again; the README says so. Rotation
with re-encryption is left out until the owner asks for it.

## Backups

The master key is stored apart from the database file and restored with it (D16): a database
restored without the key it was written with fails with `SecretKeyMismatchError` on every stored
secret. The README's key section says this. The Turso backup and restore procedure itself stays open
in D16.

## Project structure

```text
src/lib/server/config/secret-key.ts             reads the two variables and the file, nothing more
src/lib/server/security/secrets/key-text.ts     canonical base64 decoding, the weak-key checks
src/lib/server/security/secrets/keyring.ts      HKDF import and derivation, the key ID, the key
src/lib/server/security/secrets/cipher.ts       stored format, binding, encrypt, decrypt, errors
src/lib/server/security/secrets/secret.ts       the wrapper
  (each with its *.test.ts)
src/env.ts                                      declares the two variables (SvelteKit's file)
src/hooks.server.ts                             the `init` hook; thin, calls the keyring
tests/e2e/secret-key.test.ts                    the built server refuses to start without a key
```

`config/` reads text and knows nothing about keys; `security/secrets/` imports it, as imports go
downwards. `playwright.config.ts` gains the generated key, and the README a "Master key" section:
how to generate it, the two variables, what changing it means, and backups.

## Code style

As in [docs/SPEC.md](SPEC.md#code-style). The hook stays thin:

```ts
import { building } from "$app/env";
import * as env from "$app/env/private";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";
import type { ServerInit } from "@sveltejs/kit/hooks";

export const init: ServerInit = async () => {
	if (!building) await loadKeyring(env);
};
```

## Testing strategy

Unit tests (Vitest), next to their source; every key in them is generated at test time:
- **Reading:** each variable alone, neither, both, an unreadable file, a file over 4 KiB, a file
  with one trailing LF or CRLF and with other whitespace; an empty key with a file, a key with an
  empty file variable, both empty, and an empty key file.
- **Format:** canonical keys pass; 43 or 45 characters, a missing `=`, base64url, hex (with its
  hint), non-canonical trailing bits and embedded whitespace fail.
- **Weak keys:** a repeated byte, 16 distinct values each twice (exactly 4.0 bits), a doubled
  16-byte key, an ascending and a descending counter and a base64-encoded passphrase each fail and
  name their check; 10,000 generated random keys all pass.
- **Errors never echo a key:** for every failing case, the message contains no part of the key text.
- **Keyring:** the key ID is stable across loads, 22 characters, and differs between keys; the AES
  key isn't extractable.
- **Cipher:** a round trip; two encryptions of one secret differ; another table, field or row ID, a
  flipped bit in any segment, a swapped key ID and a truncated value each fail with the right error;
  an empty secret can't be encrypted; a value written under another key fails with
  `SecretKeyMismatchError`; every segment's length is checked.
- **Wrapper:** each form above prints `[redacted]`, and only `reveal()` returns the value.

e2e (Playwright, against the built server): `bun ./build` with no key, with a malformed key and with
a weak key each exits non-zero before listening, naming the check, and its output never contains the
key; the existing smoke test passes with the generated key. A key in the developer's `.env` changes
none of these results.

## Commands

The ground floor's commands ([docs/SPEC.md](SPEC.md#commands)). `dev` and `preview` now need a key
in `.env` or the environment.

## Boundaries

- **Always:** fresh random nonces from WebCrypto; non-extractable keys; the binding from the
  caller's place, never from stored data; typed errors that never carry a secret; keys generated at
  test time.
- **Ask first:** any dependency (none is planned: WebCrypto and Bun cover it); any change to the
  stored format or the `info` labels once a value is stored, since the five apps share them.
- **Never:** a key or a decodable example key in the repo, logs or test output; deriving a key from
  a password; a database, schema or re-encryption job in this module; a fallback that starts without
  a key.

## Success criteria

1. The unit and e2e tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's
   `checks`, `smoke` and `ci-ok` pass without a stored secret.
2. The built server without a valid key exits non-zero before it listens, and with one serves `/`
   and `/healthz` as before. A key set in the environment reaches the loader through `src/env.ts`
   (the e2e tests prove it, since the smoke test only passes with the generated key loaded).
3. The README's "Master key" section and AGENTS.md's status and structure describe the module, and
   `docs/SPEC.md`'s commands and testing sections are updated.

## Open questions

None for the owner: D26 settles the key format, the checks, changing the key and when the key is
required.
