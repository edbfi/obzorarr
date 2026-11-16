# Spec: `sign-in`

**Status:** approved by the owner (2026-11-16), with D28 and the one Security tab. Module 5 of the
capability map ([docs/SPEC.md](SPEC.md)); it closes the two `sign-in` lines of "Open decisions each
module closes" (D28) and leaves D14 to `sync`. `sign-in` is shared (D20,
[Shared groundwork](../AGENTS.md#shared-groundwork)) and obzorarr is its reference: comradarr,
zondarr, otpravkarr and zimuarr each specify theirs from this spec and obzorarr's code and tests
once it is built.

**Reading the marks.** A bullet or clause marked "(obzorarr)" is this app's own; the rest is the
shared wording. A "(obzorarr)" mark inside a bullet covers the rest of that bullet, and
"(obzorarr: …)" only its own parentheses. Decision numbers are obzorarr's; each app cites its own.
What else may differ is in Shared groundwork: the environment prefix, the app name, routes, the
settings surfaces, the shell and wording.

## Objective

The owner who claimed the instance can sign in, stay signed in for a sensible time, sign out, change
their password and get back in when they have lost it (D20):
1. **At the claim,** the new owner is signed in and lands in the admin panel.
2. **Signing in** at `/admin/sign-in` with the username and password from the claim starts a
   server-side session, kept in an app-named cookie that works over plain HTTP at home and behind
   an HTTPS proxy.
3. **Owner-only pages** (everything under `/admin`) send anyone else to sign in, and come back to
   the page they asked for.
4. **Signing out** is a POST behind a confirmation; "Sign out everywhere else" ends the other
   sessions.
5. **Rate limits** slow every client address, and repeated failed sign-ins slow it further (D28).
6. **The Security tab** of `/admin/settings` changes the password; **recovery** sets a new one from
   a token printed to the console.
7. **Errors** reach the browser as branded pages without stack traces. (obzorarr: the scanner
   filter answers probes quietly.)
8. **The admin shell** frames every owner-only page.

**Left out on purpose:** the two-factor challenge, its offer and its reminder (`two-factor`); the
address hint on the claim and sign-in pages (`public-address`); Plex and OIDC sign-in for the owner
(`plex-sign-in`, `oidc-sign-in`); member sessions (`plex-sign-in`); a list of sessions with their
browsers, and a "keep me signed in" choice (below, "Sessions"); changing the username (below,
"Recovery"); every admin page but the Security tab.

## Configuration

Read once, at startup, as `setup` reads its variables ([SPEC-setup.md](SPEC-setup.md)), and listed
in the README:

| Variable | Default | Read by | Checked |
|---|---|---|---|
| `OBZORARR_RECOVERY` | off | `config/recovery.ts` | `true` or `false`; empty counts as unset |
| `ADDRESS_HEADER` | unset: the connection's address | adapter-bun | by the adapter |
| `XFF_DEPTH` | 1 | adapter-bun | by the adapter |

**The client address** (`security/client-address.ts`) is `event.getClientAddress()`, which
adapter-bun 1.0.1 already reads from `ADDRESS_HEADER` and `XFF_DEPTH` when they are set
(`X-Forwarded-For` counted from the right, so the app trusts as many proxy hops as `XFF_DEPTH` says,
by default 1, the last). The app adds no variable of its own for it.
- **With `ADDRESS_HEADER` set, a request whose header is missing, cut short or not an IP address**
  (the adapter throws, or the value doesn't parse) is refused as "Access denied" (`/healthz`
  excepted), with a warning once a process that names the variable. Setting it says every request
  comes through the proxy, so such a request bypassed it, and the connection's own address can't be
  read instead: Bun knows it only for the request it received, and `handle` sees a copy.
- **The app's port must then be reachable only through the proxy,** which the README says: a client
  that reaches it directly can put any address in the header and so pass every limit but the one
  on hashes at once.
- **Only a request with no address at all,** such as one over a Unix socket, counts as unknown.
- **`X-Forwarded-For` arriving while `ADDRESS_HEADER` is unset** is warned about once a process:
  every visitor then shares the proxy's address, and one stranger's failures make the owner wait.

**Forwarded headers:** the app reads none itself; `sign-in` reads only the adapter's client
address. adapter-bun's `PROTOCOL_HEADER` and `HOST_HEADER` change only `event.url`, which the app
never uses for security (below). Any module that does read them (obzorarr: `public-address`) keeps
this rule: a forwarded protocol must be `http` or `https`, and a forwarded host with whitespace,
control characters or URL-structural characters is rejected; forwarded headers never set the
browser's address or change the strict-transport decision.

**The version** shown in the shell comes from `OBZORARR_VERSION` at build time (the image's build
sets a release such as `0.2.0` or a nightly such as `nightly-1a2b3c4`), and is `dev` when unset. It
is never read at runtime and never shown outside the shell.

## The request stages

`handle` runs, in order: the language (`i18n`), the security headers, the cross-origin check
(`setup`), (obzorarr: the scanner filter,) the rate limits, the session, the setup gate (`setup`),
then the owner check. The headers go on every response, an early return from any stage included,
and every refusal is returned, never thrown ([SPEC-setup.md](SPEC-setup.md#the-request-checks)).

- **The rate limits** stage reads the client address first, refusing a request whose configured
  header is missing or invalid (Configuration), then applies only the general limit (below). The
  limits of the claim, signing in, the password change and recovery, and the waits after failed
  sign-ins, are checked in those actions, so a refusal can show beside the form's button.
- **The session** stage reads the session cookie, looks the session up and puts the owner in
  `event.locals`. It refuses nothing.
- **The owner check** guards every path under `/admin` but `/admin/sign-in` and `/admin/sign-out`.
  It is a `handle` stage rather than a layout `load`, because SvelteKit runs a form action before
  any `load`, so a layout guard wouldn't cover actions.

## The browser's address and cookies

**The browser's address** is `ORIGIN` when it is set, and otherwise the validated `Origin` of the
POST that passed the cross-origin check. It decides every cookie's `Secure` flag (obzorarr: and,
later, OIDC's `redirect_uri` and Plex's forward URL). Every POST that sets or deletes a cookie needs
it: the claim, signing in, recovery, signing out and the password change (`two-factor`,
`oidc-sign-in` and `plex-sign-in` add theirs). When the browser stripped `Origin` and `ORIGIN` is
unset, the POST gets a 403 that says so ("Your browser didn't say which address it is using. Set
`ORIGIN` and restart Obzorarr."), as the "Access denied" page or a JSON error, before it does
anything else. OIDC sign-in (obzorarr: and Plex sign-in) keeps the address in its flow's state, and
the OIDC callback address is saved when the owner configures OIDC and must match.

App code never uses `event.url.origin` or `event.url.protocol` for security, cookies or rendered
URLs; a unit test that searches `src/` enforces it, and redirects stay relative. Links shown on GET
pages for copying, such as the OIDC callback to register (obzorarr: and recap share links), are
built in the browser from the address it is on, or from `ORIGIN` when it is set.

**A wrong address never locks the owner out.** No stored address can stop password sign-in: a
wrong `ORIGIN` is fixed or removed, then the app restarts (PRODUCT.md, principle 5). The OIDC
callback address is stored, so OIDC may need registering again after a move, but password sign-in
always remains (D20).

**The address hint:** when `ORIGIN` is set and doesn't match the address the browser is on, or
when `ORIGIN` is unset and that address's host and port don't match the `Host` header, the claim
and owner sign-in pages suggest setting `ORIGIN=<that address>` (or removing a wrong `ORIGIN`) or
adding the proxy line `proxy_set_header Host $http_host`, so someone without a session can
recover. (obzorarr) `public-address` adds it, with the check behind it.

**Cookies.** The session cookie is named after the app, `obzorarr_session`, because cookies ignore
ports and apps on one address would otherwise sign each other out. It is host-only, `Path=/`,
`HttpOnly` and `SameSite=Lax`, and `Secure` exactly when the browser's address is `https`, so a
plain-HTTP install at home works. Every write and deletion sets `secure` explicitly (SvelteKit's
default is `Secure` on every host but `localhost`); a deletion whose scheme isn't known, such as
clearing an expired session's cookie on a GET, uses `secure: false`, which works over both.

## Sessions

D28 holds the decision and why.
- **The token** is 32 random bytes from WebCrypto, base64url-encoded in the cookie. Only its
  SHA-256 hash is stored (D20), so a copy of the database can't be used to sign in.
- **Length:** a session ends 7 days after it was last used, and never later than 30 days after
  sign-in. "Used" means a request the owner makes with it; the last-used time is written at most
  once an hour. The cookie's `Max-Age` is the time left to the 30-day end, and the server checks
  both limits on every request.
- **A new token at every sign-in,** the claim, recovery and the password change, so a token known
  before can't be carried into a session.
- **Only for the current password:** a session started by a password check is written in one
  transaction with a check that the hash it verified is still the stored one, so a check that
  began before a password change or recovery can't start a session after it ended them all.
- **Expired sessions** are deleted when one is looked up, at every sign-in and at startup. There is
  no background job, so `sync` closes D14.
- **No "keep me signed in" choice:** signing out, and "Sign out everywhere else", cover a shared
  computer.
- **Table** `owner_session` (`db/owner-session.ts`): the token hash (primary key), when it was
  created, last used, and its 30-day end. `two-factor` and `oidc-sign-in` add what they need.

## Signing in

**`/admin/sign-in`** has the username and password fields and one action, and follows its brief,
[`route-admin-sign-in.md`](../.impeccable/surfaces/route-admin-sign-in.md). A signed-in owner who
opens it goes to `/admin`; before the claim, the setup gate sends it to `/setup`.

**The check:** the username is compared trimmed, in NFC and after `toLowerCase()`
([SPEC-setup.md](SPEC-setup.md#first-run)); the password is verified against the stored hash.
- **One answer** for a wrong username and a wrong password, "Username or password is wrong.", and a
  wrong username costs one dummy argon2id verification, so the two take the same time. The
  username is kept in the form; the password isn't.
- **At most 4 password hashes or verifications run at once,** across the claim, sign-in, recovery
  and the password change; a fifth is refused at once as "Too many requests" with `Retry-After: 5`,
  so a spread-out attack can't stall a small server. The claim and recovery take their slot before
  they check and use up a console token, so a refused slot never burns the token.
- **On success,** the session starts (`two-factor` later puts its challenge between the password and
  the session), and the browser goes to the return path, or to `/admin`.
- **Logs:** a success is logged at info and a failure at warn, each with the client address; the
  typed username is never logged, since it may be a password typed into the wrong field.

**The return path** (`?next=`) is a same-origin path only: one leading slash and not two, no
backslashes or control characters, at most 2,048 characters. Only the path is kept, never the query
string or fragment. Anything else is dropped, and the browser goes to `/admin`.

**"Forgot your password?"** on the sign-in page explains recovery in three steps (below), so an
owner who can't sign in finds the way back without the docs.

## Signing in at the claim

The claim ([SPEC-setup.md](SPEC-setup.md#first-run)) now also starts the owner's session: the
session row is written in the claim's transaction, with the owner and the step pointer, and the
response sets the cookie and sends the browser to `/admin`. The claim needs the browser's address,
checked before the fields, so a browser that stripped `Origin` never uses up the token. First run
still ends at the claim, until `two-factor` adds the next step.

## Owner-only pages

When the owner check finds no valid session:
- **A page or a client-side navigation** gets a 303 to `/admin/sign-in?next=<the path>`.
- **A form action or any other non-GET request** gets a 403: the "Access denied" page saying "Your
  session ended. Sign in again." with a link to sign in that returns to the page, the error page
  through SvelteKit for a form enhanced with JavaScript, or a JSON error. What was typed is lost,
  and the action is never replayed after signing in.
- **Where the app has member sessions** (obzorarr: from `plex-sign-in`), a signed-in member who
  opens an owner-only page goes to their dashboard, and a member's form action without a session
  answers "unauthenticated" rather than failing.

Every owner-only response, the sign-in page, the claim and recovery are `Cache-Control: no-store`.

## Rate limits and failed sign-ins

Rate limits apply per client address, with IPv6 addresses counted per `/64` and IPv4-mapped IPv6
as IPv4, so one machine can't spread itself across addresses. (obzorarr) A fixed window, kept in the
process (one process, D17):

| Requests | Limit |
|---|---|
| every request through `handle` but `/healthz` | 60 a minute |
| signing in and the password change, in one shared window | 10 per 5 minutes |
| the claim | 5 per 5 minutes |
| recovery | 5 per 5 minutes |

Later modules apply theirs, which are listed here, their one home (obzorarr: JSON endpoints 30 a
minute, Plex sign-in's polling 60 a minute and its redirect 30 a minute, the landing page 30 a
minute and its lookup 10 a minute, and the public-address check 12 a minute). A request counts
towards the general limit and its own. The general limit runs in `handle`; the others, and the waits
below, in their actions or services.

**Failed sign-ins** (D28), counted per client address, also include a wrong current password at the
password change. After 10 failures in a row the address waits 5 minutes, and each further 10
doubles the wait, up to an hour. A success from that address, or 24 hours without a failure,
resets its count. Each wait is logged at warn with the address, so an owner whose proxy hides
every visitor behind one address can see it, and the form's message says how to fix that (the
README says it too): set `ADDRESS_HEADER`. The waits live in memory, so a restart clears them.

**A refused request** gets `Retry-After` and `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset`. An action's refusal is a form error beside the submit button (`fail(429)`,
with the headers set through `setHeaders`): "Too many attempts. Try again in {minutes} minutes.
Behind a reverse proxy, set ADDRESS_HEADER so each visitor is counted apart." The general limit's
refusal is the branded "Too many requests" page or a JSON error, whichever the caller expects.

**Memory stays bounded:** expired windows and counts are swept as they are passed and every minute,
and each table holds at most 10,000 addresses; when full, the oldest entry goes first.

**When the address is unknown** (Configuration), the limits and the count are skipped, with one
warning a process, favouring availability; the limit on hashes at once still holds.

## Signing out

**Sign out** in the shell's footer opens a confirmation ("Sign out of Obzorarr?", Cancel and Sign
out). Confirming POSTs to `/admin/sign-out`, which deletes the session and the cookie and sends the
browser to `/admin/sign-in`; without a session, it only clears the cookie. A GET to
`/admin/sign-out` redirects to `/admin` and signs nobody out, so an image tag or a prefetch can't.

## The Security tab

`/admin/settings/security`, the first tab of `/admin/settings`, is where the owner secures the
instance: the map's "owner's account settings" are this tab (Changes to the capability map, below).
It follows its brief,
[`route-admin-settings-security.md`](../.impeccable/surfaces/route-admin-settings-security.md),
with these sections:
- **While `OBZORARR_RECOVERY` is on,** a warning at the top: "Recovery is on. Remove
  `OBZORARR_RECOVERY` from the environment and restart Obzorarr."
- **Password:** the current password and a new one, with a control on each that shows what was
  typed. The new one follows `setup`'s rules (`security/password.ts`), against the stored username.
  On success, in one transaction, the hash is replaced, every other session ends and this one gets
  a new token, and the page says "Password changed. Other sessions were signed out."
- **Sessions:** "Signed in on {count} other browsers" with "Sign out everywhere else", which ends
  them and says how many ended; with none, it says so and offers no button. Each browser's details
  aren't stored, so there is no list (D28).

`two-factor` adds its section, `plex-sign-in` and `oidc-sign-in` the links to the owner's account,
and `public-address` the address check.

## Recovery

D20 fixes the mechanism; here is what the owner does.
1. **Turn it on:** set `OBZORARR_RECOVERY=true` and restart.
2. **Startup** then prints a recovery token to standard output, never a log entry, as the bootstrap
   token is printed: "Recovery token: xxxx-xxxx-xxxx (valid for 15 minutes). Open {address}/recovery
   to set a new owner password." It is the same kind of token (`security/console-token.ts`) and
   lasts 15 minutes; a restart prints a new one.
3. **`/recovery`** takes the token and a new password, and follows its brief,
   [`route-recovery.md`](../.impeccable/surfaces/route-recovery.md). The username stays as it is:
   forgetting it doesn't call for a new one, and the shell shows it right after.
4. **On success,** in this order and as the claim does it (the password rules first, then a hash
   slot, then the token, used up with no `await` between checking and using it, then the hash), one
   transaction replaces the hash, ends every session, starts this browser's and records that
   recovery was used (`two-factor` adds turning itself off). The browser lands on the Security tab,
   which shows the warning to turn recovery off.

**Around it:**
- **`/recovery` answers "not found"** while recovery is off, once its token has been used, or while
  the instance is unclaimed; startup ignores the setting on an unclaimed instance, with a warning.
- **Once used,** no new token is printed while the setting stays on, also after a restart: a
  `settings` key records it, and startup clears that key when the setting is off. Startup warns
  whenever the setting is on.
- **Password sign-in keeps working** while recovery is on, for an owner who remembers after all.
- **A wrong or expired token** gets one answer naming the console, as at the claim; tries are
  limited per address (Rate limits).
- **Trust:** anyone who can set the environment and read the console can take over the instance,
  as anyone who can read it can claim a fresh one.

## Errors and error pages

- **An unexpected error** is logged by `setup`'s `handleError` hook, and the user sees "Something
  went wrong. Try again." (the hook returns the translated message); an expected error (`error()`)
  passes its message through. Stack traces never reach the browser. (Providers map network failures
  to fixed phrases when they come: `plex-connection`.)
- **The error page** (`routes/+error.svelte`) is titled "Page not found", "Access denied", "Too many
  requests" or "Something went wrong", each with a one-line description, and Go back and Home
  actions; the not-found page doesn't show the status number. It shows the Obzorarr logo and
  wordmark and the language switcher, in the viewer's language.
- **The pages `handle` builds itself** (the "Access denied" refusals and "Too many requests") look
  the same, under their own fixed, stricter policy
  ([SPEC-setup.md](SPEC-setup.md#security-headers-and-csp)), which allows no script. So their
  actions are plain links: Home, and Sign in where it applies; there is no Go back and no language
  switcher, and the logo is inline SVG. Their text uses the fonts' system fallbacks, since the
  policy loads no font. Their styles are inline: Panda's generated token declarations for the dark
  colour mode, with `class="dark"` on `<html>` as `app.html` has it, so the `token()` references
  resolve, since Panda's colour tokens are CSS variables. A test checks their computed colours. They
  replace `setup`'s unstyled page in `security/refusal-page.ts`.
- **`src/error.html`,** SvelteKit's last resort when even the error page fails, says "Something went
  wrong" in English and Danish, since it can't know the viewer's language.

## The scanner filter

(obzorarr) Before the rate limits, so probes don't use up a real visitor's allowance:
- **Well-known probe paths** get a quiet plain-text "Not found" (404): environment files
  (`/.env*`), version-control folders (`/.git/`, `/.svn/`, `/.hg/`), blog tools (`/wp-admin`,
  `/wp-login.php`, `/xmlrpc.php` and the like), database-admin tools (`/phpmyadmin`, `/adminer`),
  framework consoles (`/actuator`, `/console`, `/_profiler`), script gateways (`/cgi-bin/`, any
  `*.php`) and cloud credentials (`/.aws/`).
- **Known scanner user agents** (such as sqlmap, Nikto, Nuclei, WPScan, masscan, ZGrab) get a plain
  "Forbidden" (403).
- Neither is logged above debug. The lists live in `security/scanner-filter.ts`, with a test for
  each kind, and never match a path the app serves.

## The admin shell

(obzorarr) PRODUCT.md's owner shell, which the Security tab's brief details:
- **The sidebar** (224px; a rail from 1024px down; below 768px a drawer that traps focus, closes on
  Escape and makes the page behind it inert) lists only pages that exist: Settings now. Each later
  module adds its own link in PRODUCT.md's order.
- **The footer:** the owner's username with an initial in place of an avatar (their Plex avatar once
  linked), linking to the Security tab; Sign out behind its confirmation; the language switcher; and
  the version as selectable text (Configuration).
- **`/admin`** redirects to `/admin/settings/security` until `overview` builds it, and
  **`/admin/settings`** to its first tab.
- **The settings tabs** list only tabs that exist: Security now; later modules add theirs.

The placeholder `/` gets an "Owner sign-in" link to `/admin/sign-in` until `landing` replaces it.

## Project structure

```text
src/env.ts                                       + OBZORARR_RECOVERY
src/hooks.server.ts                              handle: + scanner filter, rate limits, session,
                                                 owner check; handleError's message
src/error.html                                   the last-resort page
src/lib/server/config/recovery.ts                OBZORARR_RECOVERY
src/lib/server/db/owner.ts                       + reading the owner, replacing the hash
src/lib/server/db/owner-session.ts               the session table and its operations
src/lib/server/security/console-token.ts         renamed from bootstrap-token.ts: the setup and
                                                 recovery tokens
src/lib/server/security/session-token.ts         drawing a token and hashing it
src/lib/server/security/session-cookie.ts        the cookie's name and options
src/lib/server/security/browser-address.ts       ORIGIN or the validated Origin
src/lib/server/security/client-address.ts        the rate limits' key: IPv6 /64, a missing
                                                 configured header refused, unknown
src/lib/server/security/rate-limit.ts            the fixed windows
src/lib/server/security/failed-sign-ins.ts       the count and the doubling wait
src/lib/server/security/hash-slots.ts            at most 4 hashes at once
src/lib/server/security/return-path.ts           the return-path rule
src/lib/server/security/refusal-page.ts          renamed from access-denied.ts: the pages handle
                                                 builds
src/lib/server/security/scanner-filter.ts        (obzorarr) the probe paths and user agents
src/lib/server/services/sign-in/sessions.ts      start, look up, renew, end, end the others
src/lib/server/services/sign-in/sign-in.ts       the password check and the session
src/lib/server/services/sign-in/password-change.ts
src/lib/server/services/sign-in/recovery.ts      the token at startup and the recovery
src/lib/server/services/setup/claim.ts           + the browser's address, its rate limit, the
                                                 hash slot before the token, and the session in
                                                 its transaction
src/lib/server/services/setup/startup.ts         + recovery and expired sessions at startup
src/routes/+error.svelte                         the error page
src/routes/(public)/+page.svelte                 + the "Owner sign-in" link
src/routes/setup/+page.server.ts                 + the browser's address, the cookie, /admin
src/routes/recovery/                             the recovery form and action
src/routes/(admin)/admin/sign-in/                the sign-in form and action
src/routes/(admin)/admin/sign-out/+page.server.ts
src/routes/(admin)/admin/(shell)/+layout.svelte  the admin shell
src/routes/(admin)/admin/(shell)/+page.server.ts /admin's redirect
src/routes/(admin)/admin/(shell)/settings/       the tabs, /admin/settings's redirect, and
                                                 security/: the Security tab
src/lib/components/layout/                       + the shell's sidebar, drawer, owner footer and
                                                 sign-out confirmation
src/lib/components/credentials/                  the owner's credential fields, shared by the
                                                 claim, sign-in, recovery and Security:
                                                 PasswordField.svelte (with its show control),
                                                 TokenField.svelte and token-format.ts, moved
                                                 from routes/setup/
drizzle/                                         + the owner_session migration
tests/e2e/sign-in.test.ts                        sign-in, sessions, limits and recovery on the
                                                 built server
tests/e2e/                                       + the fixture with each test's own address, used
                                                 by global-setup.ts, smoke.test.ts and
                                                 i18n.test.ts; setup.test.ts's claim expects
                                                 /admin
```

The build also changes `messages/` (`sign_in_…`, `admin_…`, `security_…`, `recovery_…` and
`error_…`), `vite.config.ts` (the version at build time), `playwright.config.ts` (the shared server
with `ADDRESS_HEADER`, and a server of its own for recovery), the README (recovery, `ADDRESS_HEADER`
and `XFF_DEPTH` with the port reachable only through the proxy, the version, cookies over plain
HTTP) and `docs/decisions.md` (D28 already, with this spec). No dependency is added: Ark UI's Dialog
is already installed for the confirmation and the drawer.

## Testing strategy

- **Unit (Vitest, `node`; components with happy-dom), beside their sources:**
  - `session-token`: length, alphabet, the hash; `session-cookie`: the options for `http` and
    `https` addresses and for deletion;
  - `browser-address`: `ORIGIN`, a validated `Origin`, a stripped one;
  - `client-address`: IPv4, IPv6 per `/64`, IPv4-mapped; with `ADDRESS_HEADER` set, a header left
    out, cut short or not an IP refused, with one warning, on a copied `Request` as `handle` sees
    it; `X-Forwarded-For` without `ADDRESS_HEADER` warned about once; no address at all as unknown;
  - `rate-limit`: each window at its edges, the headers; `failed-sign-ins`: the waits 5, 10, 20, 40,
    60 and 60 minutes, reset by a success and after 24 hours; both swept and capped at 10,000
    addresses; `hash-slots`: the fifth refused;
  - `return-path`: each rule at its limits; `scanner-filter`: each kind of path and agent, and no
    route the app serves;
  - `refusal-page`: each page and its JSON form in both languages, with its policy and its links;
  - against a temporary database: `db/owner-session`; `services/sign-in/sessions` (both limits at
    their edges, the hourly write, expired rows deleted, the others ended);
    `services/sign-in/sign-in` (right and wrong credentials, the case of the username, the dummy
    verification, the logs without the username, and a check with the old password that ends after
    a password change or recovery starting no session); `password-change` (a wrong current password
    counted, the rules, the other sessions ended, the new token); `recovery` (the token printed or
    not for each state of the setting and the key, the order of the checks, a wrong and an expired
    token never reaching the hash, a refused hash slot leaving the token unused, every session
    ended); `claim` (the session in its transaction, none on failure, a refused hash slot leaving
    the token unused);
  - `config/recovery`; a test that finds no `url.origin` or `url.protocol` in app code.
- **e2e (Playwright, against the built server),** `sign-in.test.ts`. Every test comes from
  `127.0.0.1`, so the shared server runs with `ADDRESS_HEADER=x-forwarded-for`, and the global setup
  and every test on it send their own `X-Forwarded-For`, through a fixture that gives each test a
  distinct address (`test.use` sets one per file), so no test's requests count against another's.
  The existing `global-setup.ts`, `smoke.test.ts` and `i18n.test.ts` move to that fixture, and
  `setup.test.ts`'s claim expects `/admin`. Recovery starts a server of its own:
  - the claim signs in: the global setup waits for the Security tab after it, and the claim's
    cookie is `HttpOnly`, `SameSite=Lax` and not `Secure` over plain HTTP;
  - `/admin` sends a signed-out browser to sign in and back to the page after; a wrong password is
    refused with the username kept; the right one signs in; an unsafe return path is dropped;
  - a GET to `/admin/sign-out` signs nobody out; Sign out asks first, then ends the session;
  - an owner-only form POST without a session gets 403; a POST with `Origin` stripped gets the 403
    that says so;
  - the 11th sign-in within 5 minutes gets 429 with `Retry-After`, as the form error; a request
    without the configured header gets "Access denied" while `/healthz` still answers;
  - the password change ends a second browser's session and keeps this one; "Sign out everywhere
    else" does the same and says how many;
  - with `OBZORARR_RECOVERY=true` on its own server, the token is printed in no log entry or
    response, `/recovery` sets a new password and signs in, the old password and sessions no longer
    work, and after a restart with the setting still on no new token is printed;
  - a probe path gets a 404 and a scanner agent a 403; an unknown page shows "Page not found"
    without its number; a refusal page `handle` builds shows the tokens' colours; the sign-in page,
    the shell, the Security tab and the error page log no console error and pass the CSP, in
    English and Danish.

## Commands

The ground floor's ([docs/SPEC.md](SPEC.md#commands)); `smoke` also runs `sign-in.test.ts`.

## Boundaries

- **Always:** the session token stored only as its hash; `secure` set explicitly on every cookie
  write and deletion; the browser's address from `ORIGIN` or the validated `Origin`, never
  `event.url`; the owner check in `handle`; the cheap checks before any hash; refusals returned,
  never thrown; one answer for a wrong username or password.
- **Ask first:** any dependency; a session list or anything else stored about the browser; an
  account-wide lockout; a stored address of any kind; changing the username.
- **Never:** a password, token or typed username in a log entry, response or URL; a GET that signs
  out or changes anything; a session that outlives a password change or recovery elsewhere;
  `event.url.origin` or `event.url.protocol` in app code.

## Changes to the capability map

Approved with this spec:
- **One Security tab instead of a separate account page.** Rows 5, 6, 11 and 24 name "the owner's
  account settings"; they become the Security tab of `/admin/settings`. One owner (D20) makes "my
  account" and "the instance's security" one person's concern, under the word they look for, and
  each later module adds a section to one page instead of a second destination.
- **D14 goes to `sync`:** `sign-in` has no background job (Sessions).

## Docs this module changes

**With this spec:** `docs/SPEC.md` (rows 5, 6, 11 and 24, "Where modules live", "Open decisions",
"Surfaces with no brief yet", the Module notes intro, and the `#### sign-in` block, which moves
here); `docs/decisions.md` (D28); `docs/SPEC-setup.md` (its pointers to the `sign-in` notes); and
three new surface briefs, for owner sign-in, the Security tab with the shell, and recovery.

**When built:** `docs/SPEC.md` (the status line, row 5, the testing section, the `smoke` row), the
README (above), AGENTS.md (the status and the structure tree), and the claim's brief
(`route-setup.md`: its too-many-attempts state, and that it lands in the admin).

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke` and `ci-ok` pass.
2. On a fresh built server over plain HTTP, the claim signs the owner in and lands on the Security
   tab; signing out, signing in again, changing the password and recovering all work, in English
   and Danish.
3. The sign-in page, the shell, the Security tab, recovery and the error pages follow their briefs,
   checked at 360, 390, 768 and 1440px, at 200% zoom, by keyboard and with reduced motion, in every
   state their briefs name.
4. The docs listed above say what was built.
