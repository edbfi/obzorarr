# Spec: `secrets`

**Status:** built (2026-10-31), module 1 of the capability map ([docs/SPEC.md](SPEC.md)); D20 and
D26 hold the decisions. The design is the same in all five edbfi apps, and obzorarr is the reference
([Shared groundwork](../AGENTS.md#shared-groundwork)): only the environment variable prefix, the app
name in the associated data and the list of stored secrets differ. The sibling apps keep their full
copies. This file keeps what the code and tests can't say. The full text before this cut is
`9bc83fd:docs/SPEC-secrets.md`, and the pull request of the commit that cut it quotes every
amendment made since #272 word for word.

## Objective

Every later module that stores a secret (the Plex server token, members' Plex tokens in their
sessions, the AI key, the artwork signing key, two-factor secrets, the OIDC client secret) encrypts
it with the cipher before it reaches the database, so a stolen database file or backup is unreadable
without the master key (D20).

## The master key

The key comes from `OBZORARR_SECRET_KEY` or from the file `OBZORARR_SECRET_KEY_FILE` names, and the
README's "Master key" section tells users how to set it. Why the reading rules are as they are:
- Both set is an error, even when they hold the same key: precedence would hide a stale setting.
- **Set means non-empty.** An empty variable counts as unset, because Compose writes `VAR=` for a
  `${VAR}` that isn't defined, and an empty string can never be a key or a path.
- A file that can't be read is an error naming the variable and the system's error code, never the
  path: a key set as the path by mistake would otherwise be echoed, and a base64 key can't be told
  from a path.

**Weak-key checks:**

| Check | Refuses | A random key trips it |
|---|---|---|
| Shannon entropy of the 32 bytes at most 4.0 bits per byte (with a 10⁻⁹ tolerance for rounding) | a repeated byte, 16 or fewer distinct values, a 16-byte key written twice, a short secret padded out | about 1 in 62 billion (1.62 × 10⁻¹¹) |
| every byte one constant step (mod 256) from the one before | counters such as `00 01 02 …` and `ff fe fd …` | about 2⁻²⁴⁰ |
| every byte printable ASCII (0x20–0x7E) | a passphrase or other text encoded to base64 | about 1.7 × 10⁻¹⁴ |

There is no denylist: no doc, example or test in the repo holds a decodable key, and docs use a
placeholder that fails as malformed.

**Failing.** Every key error stops startup with an error whose message is one line naming the
variable and the check that failed; Bun prints its stack around it. A missing, malformed or weak
key's message ends with one fix that puts the existing key first: `if Obzorarr has run before,
set the key it ran with; otherwise generate one with: openssl rand -base64 32`. A key already in
use reaches these checks too, through a variable lost from Compose or a typo (a stray space, a
cut-off paste, quotes kept around it), and a new key would make every stored secret unreadable.
The fix can't depend on whether anything is stored: the key loads before any database is open.
Both variables set, an unreadable file and a file over 4 KiB keep their own fix and never
mention a new key: a new key fixes none of them. No message, error or test output ever contains
a key or part of one.

**Derivation.** The 32 bytes are used only as HKDF input: each use derives its own key with
HKDF-SHA-256, an empty salt and its own `info` label, so a later use never touches the cipher's key.
The labels are a contract the five apps share:

| `info` | Gives |
|---|---|
| `edbfi:secrets:v1:aes-256-gcm` | the non-extractable AES-256-GCM key |
| `edbfi:secrets:v1:key-id` | 16 bytes, written as 22 characters of unpadded base64url: the key ID |

The keyring keeps the derived keys and never the HKDF key: whoever holds that can derive the AES
key's bytes with `deriveBits`, undoing its non-extractability. A later use adds its own label in
`keyring.ts`.

The key ID is derived, so nobody assigns it, and it reveals nothing about the key. Its one job is a
clear error: a value written under another key says so, instead of failing as tampered.

## Startup

The key loads in SvelteKit's `init` hook, so every way of running the app needs one, while a build
never needs or embeds one. The built server exits with the key error before it listens; `dev` keeps
running and fails every request, with the key error in the terminal. `setup` later adds its own
startup checks after this one.

**Declaring the variables.** `src/env.ts` declares the two variables with schemas that return the
value unchanged and never throw, so SvelteKit's own validation can't print a key; every check stays
in `secrets`.

**Tests never see a developer's key.** Bun loads `.env` into every `bun` process started in the
repo, Playwright's workers included. So every server an e2e test starts runs as
`bun --no-env-file ./build` with an environment built from scratch, holding neither variable unless
the case adds it, and `playwright.config.ts` deletes both variables and passes the key it generates
only to its web server. Every later e2e test that starts a server follows this rule.

## The cipher

**The stored value** is one text value in a nullable text column,
`v1.<key id>.<nonce>.<ciphertext and tag>`. Each segment after `v1` is canonical unpadded
base64url: the key ID is 16 bytes, the nonce 12 fresh random bytes from WebCrypto for every
encryption, and the ciphertext ends in GCM's 16-byte tag.
- **A stored secret is never `NULL` or empty; `NULL` means none.** Encrypting an empty secret is an
  error, so an empty string never means "nothing stored". Any stored text that isn't exactly this
  shape is corruption and an error, never a silent empty value. The version is checked first, so a
  later version with another shape is reported as unknown, not corrupt. The ciphertext is at least
  17 bytes (one byte and the tag), since an empty secret is never stored.
- One self-describing column: its parts can't drift apart, and it works on any database engine.

**The binding.** The associated data is the UTF-8 bytes of the JSON array
`["v1", <key id>, "obzorarr", <table>, <field>, <row id>]`, written compactly, as `JSON.stringify`
writes it (no spaces; lone surrogates are escaped, so every binding has exactly one encoding). The
array can't be read two ways (unlike joined strings), and it also binds the version and the key ID.
The caller always passes the binding of the place it reads from or writes to, never one stored
beside the value, so a value copied to another row, field or app fails to decrypt. Table, field and
row ID must be non-empty.

A rule for the modules that store secrets: **every row holding an encrypted field has a stable ID
the app generates before the insert** (an autoincrement ID doesn't exist yet when the value is
encrypted), which never changes for the row's life; names and URLs, which do change, are never part
of it. A table with one row uses a fixed ID.

**Errors.** Each is its own error class, and none carries the plaintext, the key or the stored
value, as a field, a `cause` or in its message (Bun prints an uncaught error's own fields and its
`cause` chain):
- `SecretFormatError`: the stored text isn't the format above, or names an unknown version.
- `SecretKeyMismatchError`: the value's key ID isn't the loaded key's: it was written under another
  master key. It names the table, field and row ID, and says to set the key it was written with, or
  enter the secret again.
- `SecretDecryptError`: the tag doesn't verify: the value was changed, or read under another
  binding.

**The limit:** with random 12-byte nonces, one master key may encrypt at most 2³² values (NIST SP
800-38D); obzorarr encrypts one Plex token per member session and a few settings, so this is never
near.

## The secret wrapper

`reveal()` is the only way to read a `Secret`'s plaintext, so `grep reveal\(` lists every place a
secret is used, for review to check. Services pass a `Secret` to each other, never the bare string:
`encryptSecret` takes one and `decryptSecret` returns one. Tests compare `reveal()` values, never
`Secret`s: `toEqual` and `Bun.deepEquals` treat any two `Secret`s as equal.

## Boundaries

- **Always:** fresh random nonces from WebCrypto; non-extractable keys; the binding from the
  caller's place, never from stored data; typed errors that never carry a secret; keys generated at
  test time.
- **Ask first:** any dependency (none is planned: WebCrypto and Bun cover it); any change to the
  stored format or the `info` labels once a value is stored, since the five apps share them.
- **Never:** a key or a decodable example key in the repo, logs or test output; deriving a key from
  a password; a database, schema or re-encryption job in this module; a fallback that starts without
  a key.
