<p align="center">
  <img src="src/lib/assets/obzorarr-icon.svg" alt="obzorarr logo" width="160" height="158">
</p>

<h1 align="center">obzorarr</h1>

<p align="center">
  <strong>Year in review for your Plex Media Server</strong>
</p>

<p align="center">
  <a href="https://github.com/edbfi/obzorarr/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg?style=flat" alt="License: AGPL-3.0-or-later"></a>
  <a href="https://github.com/oven-sh/bun" title="Bun source"><img src="https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white" alt="Bun"></a>
  <a href="https://github.com/sveltejs/kit" title="SvelteKit source"><img src="https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white" alt="SvelteKit"></a>
  <a href="https://github.com/microsoft/TypeScript" title="TypeScript source"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://github.com/edbfi/obzorarr/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/edbfi/obzorarr/ci.yml?branch=main&amp;event=push&amp;label=CI&amp;style=flat" alt="CI"></a>
</p>

> [!IMPORTANT]
> **Rewrite in progress.** Obzorarr is being rebuilt from scratch, and `main` is now the
> starting point for the new version. The previous version is preserved on the
> [`legacy-old/v1`](https://github.com/edbfi/obzorarr/tree/legacy-old/v1) branch.
> Published releases up to 0.1.11 and their tags are unchanged.

## Tech stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript 6, strict type checking |
| Framework | Svelte 5 and SvelteKit 3, server rendering on one origin |
| Runtime and packages | Bun for development, CI and production |
| Database | Embedded Turso through Drizzle, on a persistent data volume |
| Styling and primitives | Panda CSS 2 and Ark UI for Svelte |
| HTTP API clients | `@hey-api/openapi-ts`, generated from the app's OpenAPI document |
| Plex | `@ctrl/plex`, with focused `fetch` methods for missing endpoints |
| Deployment | `@sveltejs/adapter-bun`: one container, one process, one HTTP port |

## Master key

Obzorarr encrypts the secrets it stores with a master key you keep, and won't start without a
valid one. Which key you set depends on one question: has Obzorarr run here before?

- **First install:** generate a key with `openssl rand -base64 32`, and keep a copy.
- **Existing install:** set the key it ran with, exactly as you saved it. Never generate a new key
  to get past a key error: Obzorarr would start, but every secret it stored would be unreadable.

Set exactly one of these variables:

| Variable | Holds |
| --- | --- |
| `OBZORARR_SECRET_KEY` | the key itself |
| `OBZORARR_SECRET_KEY_FILE` | the path of a file holding the key, such as a Docker or Compose secret |

In the environment or a `.env` file:

```sh
OBZORARR_SECRET_KEY=paste-your-key-here
```

As a Compose secret, for a first install created with
`(umask 077; openssl rand -base64 32 > obzorarr_key.txt)`:

```yaml
services:
  obzorarr:
    environment:
      OBZORARR_SECRET_KEY_FILE: /run/secrets/obzorarr_key
    secrets:
      - obzorarr_key
secrets:
  obzorarr_key:
    file: ./obzorarr_key.txt
```

- A key is 44 characters ending in `=`, with no quotes or spaces around it. A key file may end in
  one newline.
- An empty variable counts as unset: `OBZORARR_SECRET_KEY=` is the same as leaving it out.

**If Obzorarr won't start,** its error names the variable and what's wrong:
- *No key is set:* on an existing install, the variable went missing in an upgrade or a Compose
  change. Set your key again.
- *The key is refused:* on a first install, generate one as the error says. On an existing install,
  the key changed on its way in. Look for a stray space, a missing character or quotes kept around
  it, and set it exactly as you saved it.

**Changing the key:** Obzorarr can't move stored secrets to a new key. After a change, each stored
secret fails with an error saying it was written under another master key. Enter it again, or set
the old key back, which still reads everything.

**Backups:** keep a copy of the key with your backups, apart from the database, and restore the
same key alongside them. Without it, stored secrets can't be read.

## Database

Obzorarr keeps everything it stores in one database file: `data/obzorarr.db` in its working
directory, or the path `OBZORARR_DATABASE_PATH` names. Obzorarr creates the file's folder if it is
missing, and won't start if it can't create or write to it. Put the folder on a persistent volume.

**Backups:** stop Obzorarr, then copy the whole folder. Recent writes live in files beside the
database (`obzorarr.db-wal`), so a copy of the database file alone can miss them, and a copy taken
while Obzorarr runs can be incomplete. Back up the master key separately
([Master key](#master-key)), and keep its file outside this folder.

| Variable | Holds | Default |
| --- | --- | --- |
| `OBZORARR_DATABASE_PATH` | the database file's path, absolute or against the working directory | `data/obzorarr.db` |

**Running the build yourself:** `bun ./build` needs one package beside `build/`, Turso's native
binding for your platform, as `bun ci` installs it:
`node_modules/@tursodatabase/database-linux-x64-gnu` (or `-linux-arm64-gnu`). Start the server with
`bun --no-install ./build`, so a missing package stops it instead of being downloaded.

## The address browsers use

Obzorarr asks each browser where a form or other change came from, and refuses one sent from
another site with "Access denied". So it needs no address of its own: `ORIGIN` is optional, and
tells Obzorarr the address browsers use, as a bare origin with no path:

| Variable | Holds | Default |
| --- | --- | --- |
| `ORIGIN` | the address browsers use, such as `https://obzorarr.example` or `http://192.168.1.20:3000` | unset |

Obzorarr won't start if `ORIGIN` is empty or holds a path, a query, a fragment or credentials;
leave it out instead. Over HTTPS, when `ORIGIN` is `https` or the browser shows it, pages ask
browsers to keep using HTTPS.

**When Obzorarr refuses its own forms with "Access denied":** behind a reverse proxy that rewrites
the `Host` header, Obzorarr can't match the browser's address to the one it was asked for. Set
`ORIGIN` to the address browsers use, or have the proxy pass the browser's `Host` on: in nginx,
`proxy_set_header Host $http_host;` (not `$host`, which drops a port that isn't the default). Over
plain HTTP this affects every browser; over HTTPS only older ones (Safari before 16.4, Firefox
before 90, Chrome before 76), since current browsers say where a request came from themselves.

### Behind a reverse proxy: the client's address

Obzorarr limits how many requests each visitor's address may make, and makes an address wait
after 10 failed sign-ins in a row: 5 minutes, doubling with each further 10, up to an hour. Behind
a reverse proxy, every request arrives from the proxy, so tell Obzorarr which header the proxy puts
the visitor's address in; otherwise every visitor shares the proxy's address, its limits and its
waits, and one visitor's failed sign-ins make everyone wait. A wait is written to the logs with the
address it applies to; if that is always your proxy's address, set `ADDRESS_HEADER`:

| Variable | Holds | Default |
| --- | --- | --- |
| `ADDRESS_HEADER` | the header with the visitor's address, such as `x-forwarded-for` or `x-real-ip` | unset: the connection's address |
| `XFF_DEPTH` | with `x-forwarded-for`, how many proxies sit in front of Obzorarr, counted from the right | `1` |

With `ADDRESS_HEADER` set, Obzorarr refuses any request that doesn't carry it, or carries fewer
addresses than `XFF_DEPTH` or something that isn't an address, with "Access denied", since that
request didn't come through the proxy (so a `XFF_DEPTH` higher than your number of proxies turns
every visitor away); `/healthz` still answers, so a container health check keeps working. Make the
port reachable only through the proxy: anyone who reaches it directly can put any address in the
header. When `X-Forwarded-For` arrives while `ADDRESS_HEADER` is unset, Obzorarr writes a warning to
its logs.

## First run

A new Obzorarr is claimed by whoever can read its console. Until then, every page sends you to
`/setup`, and Obzorarr prints a setup token to standard output, where your container runtime
collects it (`docker compose logs obzorarr`):

```text
Setup token: xxxx-xxxx-xxxx (valid for 15 minutes). Open /setup to claim this Obzorarr.
```

With `ORIGIN` set, the line gives the full address. At `/setup`, enter the token, with or without
its dashes, and choose the owner's username and password. The password needs 15 to 128 characters,
may not contain "obzorarr", or the username when it has 4 or more characters, and may not be a
common password or, as a whole, a simple pattern such as `abcabcabcabcabc` or `abcdefghijklmno`.

- **Who can claim:** anyone who reaches `/setup` sees the form, but only the token claims it, so
  only someone who can read the console. The token is never stored or written to a log entry.
- **An expired token:** each lasts 15 minutes, and a new one is printed when it expires. Use the
  newest.
- **Once claimed,** no token is printed again and `/setup` is gone, also after a restart.
- **The claim signs you in** and opens the admin's Settings, with an `obzorarr_session` cookie
  that lasts until 7 days pass without use, and 30 days at most. It is marked `Secure` only when
  your browser reaches Obzorarr over HTTPS, so a plain-HTTP install at home works too.
- **Signing in again:** open `/admin/sign-in`, linked from the home page, and use the owner's
  username, in any case, and password. Every admin page sends you there while you're signed out,
  and back to the page afterwards.
- **Signing out:** Sign out, at the foot of the admin's sidebar, asks first, then ends the session.

## Recovery

If you forget the owner's password, set `OBZORARR_RECOVERY=true` and restart Obzorarr. It prints a
recovery token to the console, as it prints the setup token:

```text
Recovery token: xxxx-xxxx-xxxx (valid for 15 minutes). Open /recovery to set a new owner password.
```

Open `/recovery`, enter the token and choose a new password; the username stays as it is. Then
remove `OBZORARR_RECOVERY` and restart: until you do, the logs and the admin's Security tab warn
that recovery is on.

- **The token** lasts 15 minutes, and each restart prints a new one. Once one is used, none is
  printed again while the setting stays on, also after a restart.
- **Before the claim,** the setting is ignored, with a warning: use `/setup`.
- **Who can recover:** anyone who can set the environment and read the console, as anyone who can
  read it can claim a fresh instance.

| Variable | Holds | Default |
| --- | --- | --- |
| `OBZORARR_RECOVERY` | `true` to print a recovery token at startup, or `false` | `false` |

## Logs

Obzorarr writes its log to standard output, one JSON entry per line, where your container runtime
collects it. Credentials are removed before an entry is written: passwords, tokens, cookies and
keys, and the credentials in URLs.

| Variable | Holds | Default |
| --- | --- | --- |
| `OBZORARR_LOG_DEBUG` | `true` to add debug entries, or `false` | `false` |

## Stopping and the server's limits

Obzorarr stops cleanly on `SIGTERM`, `SIGINT` or `SIGHUP`: it lets the requests in progress finish,
for up to `SHUTDOWN_TIMEOUT` seconds, closes the database, and exits. These variables belong to the
Bun server it runs on:

| Variable | Holds | Default |
| --- | --- | --- |
| `SHUTDOWN_TIMEOUT` | seconds to let requests finish when stopping | `30` |
| `CONNECTION_IDLE_TIMEOUT` | seconds before an idle connection closes, at most 255 | `10` |
| `BODY_SIZE_LIMIT` | the largest request body accepted | `512K` |

After the requests finish, Obzorarr takes about 5 more seconds at most to close. Give the container
longer than `SHUTDOWN_TIMEOUT` plus 5 seconds to stop, or it's killed mid-write. Docker's default is
10 seconds, so with the default `SHUTDOWN_TIMEOUT`, set Compose's `stop_grace_period` to `40s`.

## Working on it

The admin's sidebar shows the version Obzorarr was built as: `OBZORARR_VERSION` when it is set
during the build (once the image is packaged, its build will set a release such as `0.2.0`, or a
nightly such as `nightly-1a2b3c4`), and `dev` otherwise. It is fixed at build time, so setting it
on a running container changes nothing.

Start with [AGENTS.md](AGENTS.md): the house rules, the workflow and where each document lives.
The product and design context is in [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) and
[docs/](docs/); the skeleton's scope is [docs/SPEC.md](docs/SPEC.md).

## License

Obzorarr's original code is free software: you may redistribute it and/or modify it under the
terms of the GNU Affero General Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version (`AGPL-3.0-or-later`).
See [LICENSE](LICENSE) for the full license text.

Third-party components, vendored skills and other upstream materials retain their respective
licenses and copyright notices.
