<p align="center">
  <img src="src/lib/assets/obzorarr-icon.svg" alt="Obzorarr Logo" width="256" height="256">
</p>

<h1 align="center">Obzorarr</h1>

<p align="center">
  <strong>Year in Review for Plex Media Server</strong>
</p>

<p align="center">
  <a href="https://github.com/edbfi/obzorarr/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/bun-%23000000.svg?logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/SvelteKit-FF3E00?logo=svelte&logoColor=white" alt="SvelteKit">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <a href="https://deepwiki.com/edbfi/obzorarr"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

---

## What is Obzorarr?

Obzorarr is a **"Wrapped for Plex"** application that syncs viewing history from your Plex Media Server and generates yearly statistics with an animated slideshow presentation - similar to Spotify Wrapped. It doesn't require Tautulli; it only relies on the [Plex API](https://developer.plex.tv/pms/).

## Features

<p align="center">
  <picture>
    <source srcset="public/readme/motion/wrapped-demo.webp" type="image/webp">
    <img src="public/readme/motion/wrapped-demo.gif" alt="Obzorarr Wrapped story mode" width="800">
  </picture>
</p>

- **Yearly Statistics** — Total watch time, top movies, shows, and genres
- **19 Slide Types** — From watch streaks and binge sessions to decade breakdowns and series completion
- **Two Ways to Watch** — An animated story-mode slideshow, or a scrollable single-page recap
- **Watch Patterns** — Monthly, hourly, and weekday distribution charts
- **Percentile Rankings** — See how you compare to other users on your server
- **Server Wrapped** — A server-wide recap with a top-viewers leaderboard
- **Privacy Modes** — Real, hybrid, or fully anonymous names, with one-click privacy presets
- **Five Themes** — UI and Wrapped themes are chosen independently
- **Slide Editor** — Reorder, enable, or disable slides and add your own custom ones
- **Plex OAuth** — Secure authentication with your Plex account
- **Automatic Sync** — Scheduled background sync of viewing history, with live progress
- **Reverse-Proxy Diagnostic** — Compares what your browser sees, what the proxy forwards, and what Obzorarr uses
- **AI Fun Facts** — Optional AI-written fun facts, with the built-in templates as the fallback

## Issues & Support

Found a bug or have a feature request? Please submit issues and feature requests to the **[obzorarr-docker repository](https://github.com/edbfi/obzorarr-docker/issues)** rather than this repository. This ensures your report reaches the maintainers monitoring issue tracking across the project.

## Screenshots

Every screenshot below is captured from a running instance. Usernames are rendered by
Obzorarr's own anonymisation mode, and server addresses are demo values.

<details>
<summary><strong>Onboarding</strong></summary>
<br>

First run walks through seven steps: **Claim → Security → Reverse proxy → Connect → Sync → Configure → Done**.

<p align="center">
  <picture>
    <source srcset="public/readme/motion/onboarding-demo.webp" type="image/webp">
    <img src="public/readme/motion/onboarding-demo.gif" alt="Obzorarr onboarding wizard" width="800">
  </picture>
</p>

|                                        Claim setup                                         |                                       CSRF origin                                       |
| :----------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/onboarding/01-claim.webp" width="400" alt="Claim setup step"> | <img src="public/readme/stills/onboarding/02-csrf.webp" width="400" alt="CSRF origin step"> |

|                                            Public address                                            |                                            Address diagnostic                                             |
| :-----------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/onboarding/03-proxy-trust.webp" width="400" alt="Public address step"> | <img src="public/readme/stills/onboarding/03b-proxy-trust-diagnostic.webp" width="400" alt="Address diagnostic evidence"> |

|                                          Server picker                                          |                                            Connection choice                                            |
| :-----------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/onboarding/04-plex-picker.webp" width="400" alt="Plex server picker"> | <img src="public/readme/stills/onboarding/04b-plex-connections.webp" width="400" alt="Plex connection choice"> |

|                                            Connected                                             |                                          Sync in progress                                           |
| :-------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/onboarding/04c-plex-connected.webp" width="400" alt="Plex server connected"> | <img src="public/readme/stills/onboarding/05b-sync-progress.webp" width="400" alt="First sync running"> |

|                                          Sync complete                                           |                                         Choose slides                                          |
| :------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/onboarding/05c-sync-complete.webp" width="400" alt="First sync complete"> | <img src="public/readme/stills/onboarding/06-configure-3-slides.webp" width="400" alt="Slide selection"> |

|                                         Pick a theme                                          |                                        Setup complete                                        |
| :---------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/onboarding/06-configure-1-appearance.webp" width="400" alt="Theme selection"> | <img src="public/readme/stills/onboarding/07-complete.webp" width="400" alt="Setup complete"> |

</details>

<details>
<summary><strong>Admin</strong></summary>
<br>

<p align="center">
  <picture>
    <source srcset="public/readme/motion/admin-demo.webp" type="image/webp">
    <img src="public/readme/motion/admin-demo.gif" alt="Obzorarr admin panel" width="800">
  </picture>
</p>

|                                    Dashboard                                     |                                   Wrapped overview                                    |                                   Slide editor                                   |
| :--------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------: |
| <img src="public/readme/stills/admin/01-dashboard.webp" width="270" alt="Admin dashboard"> | <img src="public/readme/stills/admin/02-wrapped.webp" width="270" alt="Wrapped overview"> | <img src="public/readme/stills/admin/03-slides.webp" width="270" alt="Slide order editor"> |

|                                   Sync (idle)                                    |                                   Sync running                                    |                                     Users                                     |
| :---------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------: |
| <img src="public/readme/stills/admin/04-sync.webp" width="270" alt="Sync command centre"> | <img src="public/readme/stills/admin/04b-sync-running.webp" width="270" alt="Sync running with live progress"> | <img src="public/readme/stills/admin/05-users.webp" width="270" alt="User management"> |

|                                    Live logs                                     |                                     Settings                                      |                                    Connections                                    |
| :---------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------: |
| <img src="public/readme/stills/admin/06-logs.webp" width="270" alt="Live log stream"> | <img src="public/readme/stills/admin/07-settings.webp" width="270" alt="Settings index"> | <img src="public/readme/stills/admin/08-settings-connections.webp" width="270" alt="Plex connection settings"> |

|                                    Appearance                                     |                                     Privacy                                     |                                     Security                                      |
| :-----------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------: |
| <img src="public/readme/stills/admin/09-settings-appearance.webp" width="270" alt="Appearance settings"> | <img src="public/readme/stills/admin/10-settings-privacy.webp" width="270" alt="Privacy settings"> | <img src="public/readme/stills/admin/11-settings-security.webp" width="270" alt="Security settings"> |

|                                      Data                                       |                                     System                                      |
| :---------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------: |
| <img src="public/readme/stills/admin/12-settings-data.webp" width="270" alt="Data settings"> | <img src="public/readme/stills/admin/13-settings-system.webp" width="270" alt="System settings"> |

</details>

<details>
<summary><strong>Your Wrapped</strong></summary>
<br>

Story mode plays the slides one at a time; scroll mode puts the whole recap on a single page.

|                                    Total time                                     |                                    Top movies                                     |                                     Top shows                                      |
| :-----------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped/01-total-time.webp" width="270" alt="Total watch time"> | <img src="public/readme/stills/wrapped/02-top-movies.webp" width="270" alt="Top movies"> | <img src="public/readme/stills/wrapped/03-top-shows.webp" width="270" alt="Top shows"> |

|                                      Genres                                       |                                    Viewing patterns                                    |                                   Weekday patterns                                   |
| :-----------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped/05-genres.webp" width="270" alt="Favourite genres"> | <img src="public/readme/stills/wrapped/06-distribution.webp" width="270" alt="Monthly and hourly distribution"> | <img src="public/readme/stills/wrapped/07-weekday-patterns.webp" width="270" alt="Weekday patterns"> |

|                                   Movies vs shows                                    |                                     By decade                                      |                                  Series completion                                   |
| :---------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped/09-content-type.webp" width="270" alt="Content type split"> | <img src="public/readme/stills/wrapped/10-decade.webp" width="270" alt="Release decade breakdown"> | <img src="public/readme/stills/wrapped/11-series-completion.webp" width="270" alt="Series completion"> |

|                                     Rewatches                                      |                                     Marathon day                                     |                                   Longest streak                                    |
| :-------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped/13-rewatch.webp" width="270" alt="Most rewatched"> | <img src="public/readme/stills/wrapped/14-marathon.webp" width="270" alt="Biggest marathon day"> | <img src="public/readme/stills/wrapped/15-streak.webp" width="270" alt="Longest watch streak"> |

|                                   Year comparison                                    |                                     Percentile                                      |                                   Binge sessions                                    |
| :---------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped/17-year-comparison.webp" width="270" alt="Year-over-year comparison"> | <img src="public/readme/stills/wrapped/18-percentile.webp" width="270" alt="Percentile ranking"> | <img src="public/readme/stills/wrapped/19-binge.webp" width="270" alt="Binge sessions"> |

|                                    First and last                                     |                                      Fun fact                                      |                                       Summary                                       |
| :---------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped/20-first-last.webp" width="270" alt="First and last watch of the year"> | <img src="public/readme/stills/wrapped/04-fun-fact.webp" width="270" alt="Fun fact slide"> | <img src="public/readme/stills/wrapped/21-summary.webp" width="270" alt="Wrapped summary"> |

**Scroll mode** — the same recap as one continuous page:

|                                     Scroll mode (top)                                      |                                    Scroll mode (further down)                                    |
| :--------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped-modes/01-scroll-top.webp" width="400" alt="Scroll mode top"> | <img src="public/readme/stills/wrapped-modes/02-scroll-mid.webp" width="400" alt="Scroll mode further down"> |

**On a phone** — the Wrapped experience is built portrait-first:

<p align="center">
  <img src="public/readme/stills/mobile/01-slide.webp" width="200" alt="Mobile Wrapped slide">
  <img src="public/readme/stills/mobile/02-slide.webp" width="200" alt="Mobile Wrapped slide">
  <img src="public/readme/stills/mobile/03-slide.webp" width="200" alt="Mobile Wrapped slide">
</p>

</details>

<details>
<summary><strong>Themes</strong></summary>
<br>

Five presets ship with Obzorarr. The **admin UI theme** and the **Wrapped theme** are set
independently under **Admin → Settings → Appearance**, so the panel you work in and the recap your
users see do not have to match.

**UI themes** — the admin dashboard in each preset:

<p align="center">
  <img src="public/readme/stills/themes/ui-themes-montage.webp" alt="Admin UI in all five themes" width="900">
</p>

**Wrapped themes** — the same slide in each preset:

<p align="center">
  <img src="public/readme/stills/themes/wrapped-themes-montage.webp" alt="Wrapped slide in all five themes" width="900">
</p>

</details>

<details>
<summary><strong>Sharing &amp; privacy</strong></summary>
<br>

Names shown below come from Obzorarr's **anonymous** privacy mode, which renders every user as
`User #1`, `User #2`, and so on. **Real** and **hybrid** (you see your own name, everyone else is
anonymised) are the other options — see **Admin → Settings → Privacy**.

|                                       Share modal                                       |                                     Public Wrapped                                     |
| :-----------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped-public/01-share-modal.webp" width="400" alt="Share modal with share link"> | <img src="public/readme/stills/wrapped-public/02-public-wrapped.webp" width="400" alt="Public Wrapped seen by a visitor"> |

|                                     Server Wrapped                                      |                                      Top viewers                                       |
| :-----------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/wrapped-public/03-server-wrapped.webp" width="400" alt="Server-wide Wrapped"> | <img src="public/readme/stills/wrapped-server/18-top-viewers.webp" width="400" alt="Top viewers leaderboard, anonymised"> |

</details>

<details>
<summary><strong>For your users</strong></summary>
<br>

|                                     Landing page                                      |                                       Dashboard                                       |                                  Sharing preferences                                   |
| :---------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/user/01-landing.webp" width="270" alt="Landing page"> | <img src="public/readme/stills/user/02-dashboard.webp" width="270" alt="User dashboard"> | <img src="public/readme/stills/user/03-dashboard-settings.webp" width="270" alt="User sharing preferences"> |

</details>

## Tech Stack

| Component | Technology             |
| --------- | ---------------------- |
| Runtime   | Bun                    |
| Framework | SvelteKit + Svelte 5   |
| Database  | SQLite (Drizzle ORM)   |
| Styling   | UnoCSS + shadcn-svelte |
| Animation | GSAP + Motion          |

## Quick Start

### Docker (Recommended) — [Image Repo](https://github.com/edbfi/obzorarr-docker)

```yaml
services:
  obzorarr:
    container_name: obzorarr
    image: ghcr.io/edbfi/obzorarr-docker
    ports:
      - 3000:3000
    environment:
      - PUID=1000
      - PGID=1000
      - UMASK=002
      - TZ=Etc/UTC
      # The address in your browser's address bar. Required when you open Obzorarr over plain
      # HTTP (e.g. http://192.168.1.10:3000); leave it unset only behind an HTTPS reverse proxy
      # that preserves the Host header. See "Running Behind a Reverse Proxy".
      - ORIGIN=http://<host-or-ip>:3000
      # Optional: lock Plex connection at the env layer. You can also leave
      # these unset and configure the server from the admin UI after onboarding.
      # - PLEX_SERVER_URL=http://plex-url-here:32400
      # - PLEX_TOKEN=your-plex-token-here
    volumes:
      - /<host_folder_config>:/config
```

Replace `/<host_folder_config>` with your desired config path and `<host-or-ip>` with the address you
open Obzorarr at, then open that address (`http://localhost:3000` on the Docker host itself) to
complete setup.

### From Source

```bash
git clone https://github.com/edbfi/obzorarr.git
cd obzorarr
cp .env.example .env
bun install
bun run dev
```

> **Note on `.env` in local dev.** `bun run dev` does **not** auto-load `.env`, so any
> `PLEX_SERVER_URL` / `OPENAI_*` values you put there are ignored — local dev configures the
> server through onboarding and the admin UI (values stored in the SQLite DB). Environment-variable
> precedence (and the "Locked by environment variable" UI) applies to **Docker/production**, where
> the container passes the vars into the process. To exercise env-precedence locally (e.g. to see an
> env-locked field render its `ENV` badge), run `bun run dev:env`, which loads `.env` via
> `--env-file`.

When `PLEX_SERVER_URL` and `PLEX_TOKEN` come from the environment, onboarding and
**Admin → Settings → Connections** show them as read-only with an `ENV` badge — the value is owned
by your container config, not the database:

<p align="center">
  <img src="public/readme/stills/onboarding/04-plex-env-locked.webp" width="500" alt="Connect step with server URL and token locked by environment variables">
</p>

## First-Time Setup

The first time you open the web UI, Obzorarr runs a short onboarding wizard:
**Claim → Security → Reverse proxy → Connect → Sync → Configure**.

### The claim token

So nobody can grab your fresh install before you do, the first step asks for a one-time
**bootstrap token**. Obzorarr prints it to the server console — on a fresh install it is never
shown in the browser:

```
Obzorarr initial setup requires a bootstrap claim.
Setup URL: http://localhost:3000/onboarding/claim
Bootstrap token: xxxx-xxxx-xxxx
```

With Docker, read it from the container logs:

```bash
docker logs obzorarr
```

The token expires after 15 minutes and only one browser can hold the claim at a time. If it lapses,
restart Obzorarr to print a new one.

<p align="center">
  <img src="public/readme/stills/onboarding/01-claim.webp" width="500" alt="Claim setup step asking for the bootstrap token">
</p>

The remaining steps connect your Plex server (or confirm the values you set via `PLEX_SERVER_URL` /
`PLEX_TOKEN`), run the first history sync, and let you choose which slides users see. Anything set
here can be changed later under **Admin → Settings**.

### Starting over

**Admin → Settings → Data** has a *Danger zone* with **Reset instance**, which deletes everything
Obzorarr has stored and drops you back at the claim screen, signed out. Before wiping, it shows you
a fresh claim token to paste on the next screen — that one lasts 60 minutes, since you have to sign
in to Plex, reconfigure, and sync again. It is also printed to the console as usual, so losing the
tab is recoverable.

Your watch statistics come back: they re-sync from Plex. Everything else does not. That covers all
settings, every per-user share setting, and **every share link you have already handed out stops
working**, along with any manual curation and the log history. Anything configured through
environment variables (Plex, OpenAI, `ORIGIN`, `TZ`) is not in the database, so it
survives and the new setup arrives partly pre-filled. Obzorarr refuses to reset while a sync is
running.

## Scheduled Syncs and Time Zones

**Admin → Sync** holds the automatic sync schedule as a cron expression. The schedule survives
restarts: Obzorarr stores the expression and whether you left the scheduler running, paused, or
stopped, and rebuilds the job on the next boot.

Cron expressions are interpreted in the configured timezone, which also drives the nightly log
retention cleanup. Obzorarr resolves it in this order:

1. the `TZ` environment variable, when it names a zone the runtime knows (`TZ=Europe/Copenhagen`);
2. the timezone saved under **Admin → Settings → System**;
3. `UTC`.

As with every other environment-backed setting, `TZ` wins: the field renders read-only with an `ENV`
badge, and a database value it shadows is dropped at startup. A `TZ` the runtime cannot resolve is
ignored rather than applied, so a typo leaves the admin field editable instead of scheduling syncs
in an unknown zone. Fixed offsets such as `+02:00` are rejected for the same reason a DST-aware zone
is wanted here: `0 0 * * *` should mean local midnight all year.

## Running Behind a Reverse Proxy

Obzorarr needs to know the address **your browser** uses, not the internal one it listens on.
Otherwise login redirects, share links, and CSRF checks get built from the wrong hostname.

Set `ORIGIN` to the address people open in the browser, including the port if it isn't 80 or 443:

```env
ORIGIN=https://obzorarr.example.com
```

That covers most setups, and it is **required for plain-HTTP deployments** (no TLS anywhere, e.g.
`ORIGIN=http://192.168.1.10:3000`). Leave it unset only behind an HTTPS reverse proxy that passes
the original `Host` header: without `ORIGIN`, Obzorarr assumes `https://` plus that `Host`. Over
plain HTTP it would build sign-in redirects for `https://…` and mark the sign-in and session cookies
`Secure`, which browsers refuse over plain HTTP, so signing in fails. Obzorarr logs one warning at
startup when neither `ORIGIN` nor `PROTOCOL_HEADER` is set. It never takes its origin from the `Host`
header when `ORIGIN` is set.

`ORIGIN` must be a bare origin: a scheme (`http` or `https`), a host and an optional port. A trailing
`/`, uppercase letters and a default port (`:80`, `:443`) are fine and are normalized; a path, query,
fragment or user name and password stop Obzorarr at startup with an error that names the expected
form (it never prints the value).

With `ORIGIN` set, `bun start` (`scripts/serve.ts`) listens on `HOST`/`PORT` and passes requests to the
SvelteKit server over a private Unix socket, supplying `ORIGIN` itself; headers a client sends cannot
change it. Start Obzorarr through `bun start` (or the container's command): `build/index.js` started on
its own checks `ORIGIN` and uses it as the CSRF origin, but cannot make it the address links and
cookies are built from. `IDLE_TIMEOUT` keeps working as the client idle timeout in seconds (it maps to
`CONNECTION_IDLE_TIMEOUT`, which also works); event streams are exempt from it.

**Client addresses behind a proxy.** Behind a reverse proxy, every request comes from the proxy's
address unless you tell Obzorarr where the client's address is, so the per-client rate limits would
treat all your users as one client. Set `ADDRESS_HEADER=x-forwarded-for`, with `XFF_DEPTH` set to the
number of proxies in front of Obzorarr (default `1`), and only when every request goes through those
proxies: a request that arrives without the header has no client address, and a visitor who can reach
Obzorarr directly could send a forged one. Without a proxy, leave `ADDRESS_HEADER` unset; Obzorarr then
uses the connection's own address.

**Without `ORIGIN`, behind a trusted proxy.** If you cannot set `ORIGIN` (one instance served under
several addresses, say), the Bun adapter can take the protocol and host from headers your proxy sets:
`PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`. They apply only without
`ORIGIN` (the front supplies the origin itself and ignores them), and only when **both** of these are
true:

- Obzorarr can only be reached through the proxy — nothing can hit it directly.
- Your proxy sets both headers itself, replacing whatever a visitor sends with a single value.

If either is false, a visitor can forge those headers and make Obzorarr build links pointing at a
domain they control. When in doubt, set `ORIGIN`.

`TRUST_PROXY` is no longer read: `ORIGIN` replaces it, or the two headers above where `ORIGIN` cannot
be used. If it is still set, in the environment or by the old switch in setup or on the Security
page, Obzorarr ignores it, removes the stored switch, and logs one warning at startup that names the
replacement.

The CSRF origin you confirm in onboarding (stored in the database) only decides which browser
`Origin` may submit changes; it does not change the address Obzorarr builds links from.

Onboarding and **Admin → Settings → Security** include a diagnostic that compares the address your
browser opened with the origin Obzorarr actually uses and, when they differ, tells you the `ORIGIN`
to set. Its technical details also show what the proxy forwards, with header recipes for Caddy,
Nginx, Nginx Proxy Manager, and Apache for the header route above. Changing any of these variables
requires a restart.

|                                       Reverse-proxy step                                        |                                     Technical evidence                                      |
| :-------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------: |
| <img src="public/readme/stills/onboarding/03-proxy-trust.webp" width="400" alt="Public address step"> | <img src="public/readme/stills/onboarding/03b-proxy-trust-diagnostic.webp" width="400" alt="Address diagnostic evidence and proxy guides"> |

## How Plex Users Are Matched

Plex watch history records a *server-local* account ID rather than a global Plex identity, so on
every sync Obzorarr rebuilds the mapping between those local IDs and real Plex users by comparing
your server's account list with the users you've shared the server with. In practice:

- **You, the server owner, are always local account `1`.** Never edit account IDs by hand.
- **A user only gets a Wrapped once their share is confirmed.** If the check comes back incomplete
  (Plex unreachable, partial response), Obzorarr keeps the previous mapping instead of guessing.
- **Un-sharing removes access** — that user's public Wrapped link stops resolving. Re-share and run
  a sync to restore it.
- **Mappings go stale after 24 hours** and are re-proved by the next sync. They also reset whenever
  the Plex URL or token changes — back up your database before changing either, then restart and
  run a normal sync.

Public Wrapped links deliberately return the same "not found" response for an unknown user, a
private profile, and a stale mapping, so the page can't be used to discover who has an account on
your server.

Whether real usernames appear at all is a separate setting. **Admin → Settings → Privacy** offers
five presets — from *Maximum Privacy* (members-only, anonymous names) to *Public Showcase* (public
recap, real names) — plus a *Custom* card that lights up once you change anything underneath, and a
*Names in stats* control with **Real**, **Anonymous** (`User #1`, `User #2`, …), and **Hybrid** (you
see your own name, everyone else is anonymised).

<p align="center">
  <img src="public/readme/stills/admin/10-settings-privacy.webp" width="600" alt="Privacy settings with presets and a before/after preview">
</p>

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Local development and production startup

Use the Bun version pinned in `package.json` (`packageManager`) for development, CI,
builds and production. Install dependencies with `bun install --frozen-lockfile`,
then use `bun run dev` for development.

For production, run `bun run build` followed by `bun run start`. The start script
sets `NODE_ENV=production` and runs `scripts/serve.ts` with Bun, which starts the generated
`build/index.js` (directly without `ORIGIN`, behind the front with it; see "Running Behind a
Reverse Proxy"). Keep `build/`, `scripts/serve.ts`, production `node_modules/`, `package.json`
and `drizzle/` together, and retain the configured persistent database path.

Two more server settings, with their defaults:

- `SHUTDOWN_TIMEOUT=30`: on stop (`SIGTERM` or `SIGINT`), Obzorarr stops accepting connections and
  lets open requests finish for up to this many seconds, open live-update streams included, then
  closes what is left. With `ORIGIN` set, the process exits at that deadline even if Obzorarr is
  still waiting on Plex for a request. In a container, keep it below the stop timeout (Docker's
  default is 10 seconds) or raise both; otherwise the container is killed before Obzorarr has shut
  down cleanly. A second signal stops it at once.
- `BODY_SIZE_LIMIT=512K`: the largest request body accepted (`K`, `M` and `G` suffixes; `Infinity`
  turns the limit off). Obzorarr has no uploads, so the default is enough; larger requests get
  `413`.
