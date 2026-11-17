# Spec: `sign-in`

**Status:** built (2026-11-17), module 5 of the capability map ([docs/SPEC.md](SPEC.md)); D20 and
D28 hold the decisions, and D14 went to `sync`. `sign-in` is shared (D20,
[Shared groundwork](../AGENTS.md#shared-groundwork)) and obzorarr is its reference: comradarr,
zondarr, otpravkarr and zimuarr each specify theirs from this spec and obzorarr's code and tests.
This file keeps what the code and tests can't say. The full text before this cut is
`ea7774a:docs/SPEC-sign-in.md`.

**Reading the marks.** A bullet or clause marked "(obzorarr)" is this app's own; the rest is the
shared wording. A "(obzorarr)" mark inside a bullet covers the rest of that bullet, and
"(obzorarr: …)" only its own parentheses. Decision numbers are obzorarr's; each app cites its own.
What else may differ is in Shared groundwork: the environment prefix, the app name, routes, the
settings surfaces, the shell and wording.

## Objective

The owner who claimed the instance can sign in, stay signed in for a sensible time, sign out, change
their password and get back in when they have lost it (D20). The claim signs the new owner in;
every page under `/admin` but sign-in and sign-out needs the owner's session; rate limits slow every
client address, and failed sign-ins slow it further without ever locking the account (D28); errors
reach the browser as branded pages without stack traces; and the admin shell frames every
owner-only page. (obzorarr: the scanner filter answers probes quietly.)

**Left out on purpose:** the two-factor challenge, its offer and its reminder (`two-factor`); the
address hint on the claim and sign-in pages (`public-address`); Plex and OIDC sign-in for the owner
(`plex-sign-in`, `oidc-sign-in`); member sessions (`plex-sign-in`); a list of sessions with their
browsers, and a "keep me signed in" choice (D28); changing the username (Recovery); every admin page
but the Security tab.

## Configuration

`OBZORARR_RECOVERY`, `ADDRESS_HEADER` and `XFF_DEPTH` are read once, at startup, and listed in the
README. **The client address** is adapter-bun's `event.getClientAddress()`, which reads
`ADDRESS_HEADER` and `XFF_DEPTH` itself; the app declares `ADDRESS_HEADER` only to know whether it
is set, since SvelteKit exposes only declared variables, and adds no variable of its own.
- **With `ADDRESS_HEADER` set, a request whose header is missing, cut short or not an IP address**
  is refused as "Access denied" (`/healthz` excepted). Setting it says every request comes through
  the proxy, so such a request bypassed it, and the connection's own address can't be read instead:
  Bun knows it only for the request it received, and `handle` sees a copy.
- **The app's port must then be reachable only through the proxy,** which the README says: a client
  that reaches it directly can put any address in the header and so pass every limit but the one
  on hashes at once.
- **`X-Forwarded-For` arriving while `ADDRESS_HEADER` is unset** is warned about once a process:
  every visitor then shares the proxy's address, and one stranger's failures make the owner wait.

**Forwarded headers:** the app reads none itself. adapter-bun's `PROTOCOL_HEADER` and `HOST_HEADER`
change only `event.url`, which the app never uses for security (below). Any module that does read
them (obzorarr: `public-address`) keeps this rule: a forwarded protocol must be `http` or `https`,
and a forwarded host with whitespace, control characters or URL-structural characters is rejected;
forwarded headers never set the browser's address or change the strict-transport decision.

**The version** shown in the shell comes from `OBZORARR_VERSION` at build time and is `dev` when
unset. It is never read at runtime and never shown outside the shell.

## The request stages

`handle` runs, in order: the language (`i18n`), the security headers, the cross-origin check
(`setup`), (obzorarr: the scanner filter,) the rate limits, the session, the setup gate (`setup`),
then the owner check. The headers go on every response, an early return from any stage included,
and every refusal is returned, never thrown ([SPEC-setup.md](SPEC-setup.md#the-request-checks)).
- **Only the general limit runs in `handle`.** The limits of the claim, signing in, the password
  change and recovery, and the waits after failed sign-ins, are checked in their actions, so a
  refusal can show beside the form's button.
- **The session** stage refuses nothing; it only puts the owner in `event.locals`.
- **The owner check is a `handle` stage, not a layout `load`,** because SvelteKit runs a form action
  before any `load`, so a layout guard wouldn't cover actions. Every later owner-only page is under
  `/admin` and inherits it.

## The browser's address and cookies

**The browser's address** is `ORIGIN` when it is set, and otherwise the validated `Origin` of the
POST that passed the cross-origin check. It decides every cookie's `Secure` flag (obzorarr: and,
later, OIDC's `redirect_uri` and Plex's forward URL), so every POST that sets or deletes a cookie
needs it (`two-factor`, `oidc-sign-in` and `plex-sign-in` add theirs), and a POST whose browser
stripped `Origin` while `ORIGIN` is unset gets a 403 that says so before it does anything else, a
console token included. OIDC sign-in (obzorarr: and Plex sign-in) keeps the address in its flow's
state, and the OIDC callback address is saved when the owner configures OIDC and must match.

App code never uses `event.url.origin` or `event.url.protocol` for security, cookies or rendered
URLs; a unit test that searches `src/` enforces it, and redirects stay relative. Links shown on GET
pages for copying, such as the OIDC callback to register (obzorarr: and recap share links), are
built in the browser from the address it is on, or from `ORIGIN` when it is set.

**A wrong address never locks the owner out.** No stored address can stop password sign-in: a
wrong `ORIGIN` is fixed or removed, then the app restarts (PRODUCT.md, principle 5). The OIDC
callback address is stored, so OIDC may need registering again after a move, but password sign-in
always remains (D20).

**The address hint:** when `ORIGIN` doesn't match the address the browser is on, or, unset, that
address's host and port don't match the `Host` header, the claim and owner sign-in pages suggest the
fix (`ORIGIN=<that address>`, removing a wrong `ORIGIN`, or `proxy_set_header Host $http_host`), so
someone without a session can recover. (obzorarr) `public-address` adds it, with the check behind
it.

**Cookies.** The session cookie is named after the app, `obzorarr_session`, because cookies ignore
ports and apps on one address would otherwise sign each other out. It is `Secure` exactly when the
browser's address is `https`, so a plain-HTTP install at home works; every write and deletion sets
`secure` explicitly, since SvelteKit's default is `Secure` on every host but `localhost`, and a
deletion whose scheme isn't known uses `secure: false`, which works over both.

## Sessions

D28 holds the lengths and why; the last use is written at most once an hour, and the cookie lasts
to the 30-day end. The token's hash, never the token, is stored (D20), so a copy of the
database can't be used to sign in.
- **A new token at every sign-in,** the claim, recovery and the password change, so a token known
  before can't be carried into a session.
- **Only for the current password:** a session started by a password check is written in one
  statement with a check that the hash it verified is still the stored one, so a check that began
  before a password change or recovery can't start a session after it ended them all. Every later
  way of starting a session after a password check keeps this.
- **No background job:** expired sessions are deleted when one is looked up, at every sign-in and at
  startup, so `sync` closes D14.
- `two-factor` and `oidc-sign-in` add what they need to `owner_session`.

## Signing in

- **One answer** for a wrong username and a wrong password, and a wrong username costs one dummy
  argon2id verification, so the two take the same time. No answer anywhere tells someone without
  the password or a console token whether a string is the owner's username (Recovery).
- **At most 4 password hashes or verifications run at once,** across every form that checks a
  password, so a spread-out attack can't stall a small server. A refusal says the server is busy,
  not that the person made too many attempts, since they made none. A form that uses up a console
  token takes its slot first, so a refused slot never burns the token.
- **The typed username is never logged,** since it may be a password typed into the wrong field.
- **The return path** is a same-origin path only, checked again after its dot segments are
  resolved, so `/.//evil.test` can't become `//evil.test`; anything else goes to `/admin`.
- `two-factor` puts its challenge between the password and the session.
- **The claim** signs the new owner in: its transaction writes the session with the owner and the
  step pointer, and it needs the browser's address before its fields, so a browser that stripped
  `Origin` never uses up the token.

## Owner-only pages

When the owner check finds no valid session, a page or a client-side navigation goes to sign in
and back; a form action or any other non-GET request gets "Your session ended. Sign in again." as a
403. What was typed is lost, and the action is never replayed after signing in.
- **Where the app has member sessions** (obzorarr: from `plex-sign-in`), a signed-in member who
  opens an owner-only page goes to their dashboard, and a member's form action without a session
  answers "unauthenticated" rather than failing.
- Every owner-only response, the sign-in page, the claim and recovery are `Cache-Control: no-store`.

## Rate limits and failed sign-ins

Rate limits apply per client address, with IPv6 addresses counted per `/64` and IPv4-mapped IPv6
as IPv4, so one machine can't spread itself across addresses. (obzorarr) A fixed window, kept in the
process (one process, D17). This table is every limit's one home; later modules add theirs here.

| Requests | Limit |
|---|---|
| every request through `handle` but `/healthz` | 60 a minute |
| signing in and the password change, in one shared window | 10 per 5 minutes |
| the claim | 5 per 5 minutes |
| recovery | 5 per 5 minutes |
| (obzorarr, later) JSON endpoints | 30 a minute |
| (obzorarr, later) Plex sign-in's polling; its redirect | 60 a minute; 30 a minute |
| (obzorarr, later) the landing page; its lookup | 30 a minute; 10 a minute |
| (obzorarr, later) the public-address check | 12 a minute |

A request counts towards the general limit and its own.

**Failed sign-ins** (D28), counted per address, also include a wrong current password at the
password change. After 10 failures in a row the address waits 5 minutes, each further 10 doubling
the wait up to an hour, until a success or 24 hours without a failure. Only a request whose password
was checked can fail: one the limit, a wait or a busy hash slot refuses never counts, so retrying
during a wait can't make it longer. When the limit and a wait both refuse, the answer is whichever
ends later, so it never says to try again before the address may. Each wait is logged at warn with
the address, so an owner whose proxy hides every visitor behind one address can see it, and the
form's message says how to fix that: set `ADDRESS_HEADER`. The waits live in memory, so a restart
clears them.

**Memory stays bounded** with no timer: expired entries are swept on a later request, and each table
holds at most 10,000 addresses, dropping the oldest first. **When the address is unknown** (a Unix
socket), the limits and the count are skipped, favouring availability; the limit on hashes at once
still holds.

## Signing out

Signing out is a POST behind a confirmation. A GET to `/admin/sign-out` signs nobody out, so an
image tag or a prefetch can't.

## The Security tab

`/admin/settings/security` is where the owner secures the instance: the capability map's "owner's
account settings" are this tab, under the word they look for, so each later module adds a section
here instead of a second destination (`two-factor` its section, `plex-sign-in` and `oidc-sign-in`
the links to the owner's account, `public-address` the address check).
- **The password change** follows `setup`'s rules against the stored username, and in one
  transaction replaces the hash, ends every other session and gives this one a new token.
- **Sessions:** how many other browsers are signed in, and "Sign out everywhere else". Nothing about
  each browser is stored, so there is no list (D28). Ending the others happens only while this
  browser's own session is live, so a request that waited while a password change replaced its
  session can't end the replacement.

## Recovery

D20 fixes the mechanism; here is what the owner does.
1. **Turn it on:** set `OBZORARR_RECOVERY=true` and restart.
2. **Startup** prints a recovery token to standard output, never a log entry, as the bootstrap token
   is printed. It lasts 15 minutes; a restart prints a new one.
3. **`/recovery`** takes the token and a new password. The username stays as it is: forgetting it
   doesn't call for a new one, and the shell shows it right after.
4. **On success,** in the claim's order (`setup`'s password rules, then a hash slot, then the token,
   used up with no `await` between checking and using it, then the hash), one transaction replaces
   the hash, ends every session, starts this browser's and records that recovery was used
   (`two-factor` adds turning itself off). The rule against the stored username alone waits for the
   token, still before it is used up, so a broken rule leaves the token usable and someone without
   it can't learn whether a string is the owner's username. The browser lands on the Security tab,
   which warns until the setting is off.

**Around it:**
- **`/recovery` answers "not found"** while recovery is off, once its token has been used, or while
  the instance is unclaimed; startup ignores the setting on an unclaimed instance, with a warning.
- **Once used,** no new token is printed while the setting stays on, also after a restart, and
  startup clears that record when the setting is off. Startup warns whenever the setting is on.
- **A failure after the token was used** changes nothing and says to restart for a new token, also
  without JavaScript.
- **Password sign-in keeps working** while recovery is on, for an owner who remembers after all.
- **Trust:** anyone who can set the environment and read the console can take over the instance,
  as anyone who can read it can claim a fresh one.

## Errors and error pages

- **A failed submit** on the claim, sign-in and recovery, and on every later form, answers with the
  "Error: " title and the error summary first in the form (D29): its field problems link to their
  fields, its page-level ones (a wrong username or password, busy, too many attempts, a server
  failure) mark no field. With JavaScript it takes focus after each failure; without, nothing is
  focused.

- **Stack traces never reach the browser:** an unexpected error says "Something went wrong. Try
  again." in the viewer's language, and an expected error (`error()`) passes its own message
  through. (Providers map network failures to fixed phrases when they come: `plex-connection`.)
- **The error page is titled by status,** for a form enhanced with JavaScript too: SvelteKit's
  client drops the response's status from an action error, so the error carries its own, as
  SvelteKit's `error()` and `handle`'s refusals give it.
- **The pages `handle` builds itself** look like the error page under their own, stricter policy
  ([SPEC-setup.md](SPEC-setup.md#security-headers-and-csp)), which allows no script, no font and no
  external stylesheet: their actions are plain links, their text uses the fonts' system fallbacks,
  and their styles are Panda's token declarations inline, so the `token()` references resolve.
- **`src/error.html`,** SvelteKit's last resort when even the error page fails, is in English and
  Danish, since it can't know the viewer's language.

## The scanner filter

(obzorarr) Before the rate limits, so probes don't use up a real visitor's allowance: well-known
probe paths get a quiet plain-text "Not found", and known scanner user agents a plain "Forbidden";
neither is logged above debug. The lists, in `security/scanner-filter.ts`, never match a path the
app serves, which its test checks against every route. A path is matched as a server reads it, so
an encoded or padded name is caught too. A later module whose paths carry an identifier
(`sharing`'s recap links) keeps it from ending in `.php` or starting with `.env`.

## The admin shell

(obzorarr) PRODUCT.md's owner shell, which the Security tab's brief details. The sidebar and the
settings tabs list only pages that exist: each later module adds its own link in PRODUCT.md's order,
and its own tab. `/admin` redirects to the Security tab until `overview` builds it, and the
placeholder `/` links to owner sign-in until `landing` replaces it.

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
