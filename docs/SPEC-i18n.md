# Spec: `i18n`

**Status:** draft, awaiting the owner's approval. Module 2 of the capability map
([docs/SPEC.md](SPEC.md)). D21 and D22 hold the decisions. The owner settled the switcher, who
writes the Danish text, the message check and how D22's validations run on 2026-10-29. obzorarr is
the reference app for `i18n` ([Shared groundwork](../AGENTS.md#shared-groundwork)), and its
siblings port this spec once it is built.

## Objective

Every later module writes its user-facing text as messages in English and Danish, and shows numbers
and dates in the viewer's locale (D21). `i18n` builds that groundwork, and no product text beyond the
placeholder page:
1. **Messages** in `messages/en.json` and `messages/da.json`, which Paraglide JS compiles into typed
   message functions (D22).
2. **Choosing the language:** each request uses the viewer's choice, then the browser's preferred
   languages, then English. The browser keeps the language the server chose for the page.
3. **The language switcher.**
4. **Formatting** numbers, dates and times for the viewer's locale.
5. **The message check:** every message exists in both languages, with the same placeholders and
   the plural forms each language needs.

It also runs the validations D22 lists.

## Versions

`@inlang/paraglide-js` 3.2.0 and `@inlang/plugin-i18next` 6.5.3, exact-pinned dev dependencies
(the owner approved both packages on 2026-10-29). Paraglide JS 3.0.0 shipped on 2026-11-03, after D22
named version 2. D2's rule applies (the latest stable release, locked), so D22 now names 3. Its
breaking changes touch nothing here: the `additionalFiles` option and the middleware's locale
splitting are gone, and Vite builds default to a new output layout, which the config below sets
explicitly. TypeScript stays on 6.x (D2). Paraglide 3 writes its declarations itself and needs no
TypeScript.

## Messages

**The files** are i18next JSON v4 (D22): one flat object per language, formatted by Biome like the
rest of the repo.

**Keys** are flat, in snake_case (lowercase letters, digits and underscores), and start with the
module or surface that owns them (`landing_title`, `error_not_found_title`). So each key is a
JavaScript name, `m.landing_title()`, and Paraglide's escaped names and the `m["a.b"]()` form of
nested keys never appear. A key that ends in a CLDR plural category (`_zero`, `_one`, `_two`,
`_few`, `_many`, `_other`) is a plural form, and no other key ends in one. Once Weblate is connected,
keys aren't renamed, because translations are tied to them.

**Placeholders** are `{{name}}`.
- A number is written `{{name, number}}`, which Paraglide formats with `Intl.NumberFormat` in the
  message's language ("1,234 plays", "1.234 afspilninger"). A bare `{{count}}` would print "1234".
- No other format is allowed. In particular, Paraglide compiles `{{name, datetime}}` to
  `Intl.DateTimeFormat` with no time zone, which formats in the zone of whatever machine runs it.
  Dates are formatted with `formatDateTime` (below) and passed in as text.
- A number in a message that states how the app behaves (a limit, a duration, a count) is passed in
  from the constant the logic uses, never written into the text, so the copy can't drift from the
  behaviour.

**Plurals** are `<key>_one` and `<key>_other`, chosen by `count`. English and Danish both have
exactly these two categories (`Intl.PluralRules`), and Danish uses `other` for 0.

**Messages are plain text.** They are rendered as text, never with `{@html}`, so a placeholder
filled with a name can't inject markup. Markup inside a message, such as a link in a sentence, is
left to the first module that needs it.

**Not translated through the messages:**
- the name Obzorarr;
- text the owner writes (D21);
- log entries and console output, which are for operators and stay in English;
- the switcher's language names (below).

**Who writes them:** agents write the English and the Danish. The owner may spot-check the Danish
but doesn't approve it, and Weblate corrects it later.

**The inlang project** is `project.inlang/settings.json`:

```json
{
	"$schema": "https://inlang.com/schema/project-settings",
	"baseLocale": "en",
	"locales": ["en", "da"],
	"modules": ["./node_modules/@inlang/plugin-i18next/dist/index.js"],
	"plugin.inlang.i18next": { "pathPattern": "./messages/{locale}.json", "contextValues": [] }
}
```

- **The plugin loads from disk,** so nothing is fetched at build time or in CI. With the network
  off, the probe compiled and built.
- `"contextValues": []` turns off the plugin's guess at i18next contexts, which would read a key
  such as `title_short` next to `title` as a variant of `title`.

**Paraglide's options** are in `project.inlang/paraglide.config.ts`, which both the CLI and the Vite
plugin read, so they are kept in one place:

```ts
import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
	outdir: "./src/lib/paraglide",
	strategy: ["cookie", "preferredLanguage", "baseLocale"],
	cookieSameSite: "lax",
	cookieSecure: "auto",
	emitTsDeclarations: true,
	outputStructure: "message-modules",
});
```

- `outputStructure` is set because the CLI and the Vite plugin would otherwise write different
  layouts into the same folder: the Vite plugin's default (`virtual-modules`) is one the CLI can't
  write. Running `check` beside `dev` would then rewrite the folder under the dev server.
- The plugin is added to `vite.config.ts` as `paraglideVitePlugin({ project: "./project.inlang" })`,
  with nothing else.

**The compiled output** is `src/lib/paraglide/`, imported as `#lib/paraglide/messages.js` and
`#lib/paraglide/runtime.js`.
- It is gitignored: a root `.gitignore` line, besides the one Paraglide writes into the folder,
  which Biome also honours. Panda's `exclude` skips it.
- It compiles in `prepare` and in `check` (the CLI, before `svelte-check`), and through the Vite
  plugin in dev, build and Vitest.
- It is generated code that imports nothing from the app, and it is browser-safe. So any layer may
  import it, `lib/shared/` and browser code included, without breaking the import rules.
- A message that doesn't exist is a type error that `check` reports.

## Choosing the language

**On the server,** `handle` in `src/hooks.server.ts` runs every request through
`paraglideMiddleware`:
- **The order:** the `PARAGLIDE_LOCALE` cookie when it holds `en` or `da`; any other value is
  ignored. Then the best match in `Accept-Language` (`da-DK` gives `da`). Then English. There are no
  URL prefixes.
- **One request, one language:** the language is held in AsyncLocalStorage for that request, so
  concurrent requests can't mix. In the probe, 200 concurrent requests in both languages, each
  awaiting a random delay inside its `load`, all rendered in their own language.
- **The request:** the middleware's copy of the request is passed on a copy of the event, because
  `event.request` is read-only in SvelteKit 3. The event is a plain object, so the copy keeps every
  field, and form actions read their body from it.
- **`<html lang>`:** `transformPageChunk` writes the language into `src/app.html`'s
  `<html lang="%lang%">`. That attribute needs a Biome suppression comment
  (`lint/a11y/useValidLang`) just above it. The comment must not contain the `%lang%` token itself:
  `replace` swaps only the first occurrence, so the token in the comment would be filled in and the
  attribute left as it was (the probe hit this).
- **Caching:** the middleware adds `Vary: Cookie, Accept-Language` to every response. No page is
  prerendered, since a prerendered page would have one language for everyone.
- **First in `handle`:** the language handle refuses nothing and never reads the body. Later modules
  add their stages after it with `sequence`, so every response is in the viewer's language,
  `sign-in`'s refusals and error pages included.

**In the browser,** `src/hooks.client.ts` makes Paraglide's `getLocale()` return the page's
`<html lang>`. The server's choice holds for the whole page, until it reloads. Without this,
Paraglide's browser runtime would choose again from `navigator.languages`, and those needn't match
the `Accept-Language` header the server saw. On its first call it would also store whatever it chose
in the cookie: the browser's language would become a stored choice the viewer never made, and a
later change of browser language would no longer count (D21's order). The probe showed both: a
browser that sent `Accept-Language: fr-FR` but listed Danish second in `navigator.languages` got
English from the server, Danish after a client-side navigation, and `PARAGLIDE_LOCALE=da` without
choosing. With the hook it stayed in English, and no cookie was written.

**An accepted limit:** a tab keeps its language until it reloads. If the viewer switches language in
another tab, text that a server `load` or action returns to the first tab follows the new cookie
until that tab reloads.

## The language switcher

`src/lib/components/layout/LanguageSwitcher.svelte` is a labelled native `<select>` styled only with
tokens. Its label is a message.
- **The options:** each names its language in that language ("English", "Dansk"), with `lang` on
  the option. The names come from `Intl.DisplayNames`, with the first letter upper-cased in that
  language, through a helper private to the component. They are the same in every language, so they
  aren't messages, and a viewer who can't read the current language still finds their own.
- **Choosing a language** calls Paraglide's `setLocale`, which writes `PARAGLIDE_LOCALE` and reloads
  the page in the new language. The cookie has path `/`, lasts about 400 days and is
  `SameSite=Lax`. It is `Secure` exactly when the page is on `https` (`cookieSecure: "auto"`), as
  `sign-in`'s cookie rule asks.
- **Who writes the cookie:** only the browser, so it is readable by scripts, and it holds only a
  language. The server only reads it.
- **Sharing the cookie:** it keeps Paraglide's default name. Cookies ignore ports, so every app on
  the same host shares it. A choice made in one edbfi app carries over to the others there. A value
  another app wrote that isn't `en` or `da` is ignored.
- **Without JavaScript** the switcher does nothing, and the browser's preferred languages still
  apply.
- **Where it shows:** on the placeholder `/`; each shell places it when that shell is built. This
  module's build adds it to the landing brief's (`.impeccable/surfaces/route.md`) signed-out
  navigation. It needs no brief of its own.

## Formatting

`src/lib/shared/i18n/format.ts` is browser-safe and formats in the current language
(`getLocale()`), on the server and in the browser alike:
- `formatNumber(value, options?)`: `Intl.NumberFormat`.
- `formatDateTime(value, options)`: `Intl.DateTimeFormat`. The type requires `options.timeZone`, so
  nothing is formatted in the server's or the browser's own zone, which differ from each other and
  from the instance zone (D24). Callers pass the instance zone, or `"UTC"` for a calendar value such
  as a month's name.

Numbers inside a message use `{{name, number}}` instead. Other formatters (relative times, lists)
come with the first module that needs one.

## The message check

`src/lib/shared/i18n/messages.test.ts` reads `messages/*.json`. It sits in `src/` only because
Vitest runs `src/**`. It checks that:
- every value is a non-empty string, so the files stay flat;
- every key fits the key rule above;
- English and Danish have the same messages, with plural forms grouped under their message;
- each message has the same placeholders, names and formats, in both languages;
- placeholders have no format or `number`;
- each plural message has exactly the forms `Intl.PluralRules(locale)` gives for each language.

It runs in the existing `tests` hook and in CI, so no new hook is needed.

## Validation

The build runs D22's three validations, and a concurrency check, with the pinned versions:
- **The pinned versions with SvelteKit 3, TypeScript 6 and Bun:** `check`, `test`, `build`,
  `smoke` and prek pass with no Node on `PATH`.
- **Building and serving through adapter-bun:** `tests/e2e/i18n.test.ts`, against the built server
  started as the secrets spec requires (`bun --no-env-file ./build`, with the generated key only).
  It also closes D16's "browser interaction with a real component". It checks that:
  - a Danish browser (Playwright locale `da-DK`) gets `/` in Danish with `<html lang="da">`;
  - choosing English in the switcher reloads `/` in English, writes `PARAGLIDE_LOCALE=en` with
    `SameSite=Lax` and without `Secure` over plain HTTP, and the next visit stays in English;
  - a browser whose `navigator.languages` would choose Danish while its `Accept-Language` doesn't
    gets English, the switcher shows English after hydration, and no cookie is written;
  - none of these logs a console error.

  The existing smoke test keeps passing in English, Playwright's default locale.
- **A Weblate round trip:** a one-off `uv run --script` with translate-toolkit's `I18NextV4File`
  reads `messages/da.json`, changes a plural message, and writes it back with tab indentation (what
  Weblate's `json_indent_style: tabs` writes). It passes when:
  - the file parses to the same JSON before the edit;
  - Biome finds nothing to reformat;
  - Paraglide compiles the result;
  - both plural forms render.

  The script and its output go in the PR body; the script isn't committed.
- **Concurrency:** the probe's 200 concurrent requests are repeated once against the built server,
  with a temporary route that awaits in its `load`, and the result goes in the PR body.

The probe behind this spec already passed all four with these versions; its evidence is in this
spec's PR body.

## Weblate

Connecting Weblate is later work (D21). The round trip fixes what the component needs:
- format `i18nextv4`, monolingual;
- file mask `messages/*.json`, with `messages/en.json` as the base file;
- file format parameters `json_indent: 1` and `json_indent_style: tabs`, with keys left unsorted,
  so its commits pass Biome.

## Project structure

```text
messages/en.json  messages/da.json            the messages (repo root, where Weblate reads them)
project.inlang/settings.json                   locales and the i18next plugin
project.inlang/paraglide.config.ts             Paraglide's options, for the CLI and the Vite plugin
src/app.html                                   <html lang="%lang%">, with the Biome suppression
src/hooks.server.ts                            gains `handle`: the language handle
src/hooks.client.ts                            the browser keeps the page's language
src/lib/shared/i18n/format.ts                  formatNumber, formatDateTime (+ format.test.ts)
src/lib/shared/i18n/messages.test.ts           the message check
src/lib/components/layout/LanguageSwitcher.svelte
src/routes/(public)/+page.svelte               the placeholder's text as messages, and the switcher
tests/e2e/i18n.test.ts                         serving both languages, the switcher
```

The build also changes:
- `package.json`: the two packages, and the Paraglide compile in `prepare` and `check`;
- `vite.config.ts`: the plugin;
- `panda.config.ts`: `exclude`;
- `.gitignore`: the compiled output.

## Code style

As in [docs/SPEC.md](SPEC.md#code-style). The hooks stay thin:

```ts
// src/hooks.server.ts (the `init` hook stays as it is)
export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace("%lang%", locale) },
		),
	);
```

```ts
// src/hooks.client.ts
import { assertIsLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

// The page keeps the language the server chose for it (SPEC-i18n.md, "Choosing the language").
overwriteGetLocale(() => assertIsLocale(document.documentElement.lang));
```

## Testing strategy

- **Unit (Vitest):** the message check, and `format.test.ts`, which runs both languages through
  Paraglide's `locale` option and checks that `formatDateTime` follows the time zone it is given,
  not the machine's.
- **e2e (Playwright, against the built server):** `i18n.test.ts` as listed under
  [Validation](#validation); `smoke.test.ts` unchanged.
- **One-off evidence in the PR body:** the Weblate round trip and the concurrency check.

## Commands

The ground floor's commands ([docs/SPEC.md](SPEC.md#commands)). `prepare` and `check` also compile
the messages, so a fresh clone type-checks without a dev server having run.

## Boundaries

- **Always:** every user-facing string as a message in both languages (titles, labels, alt text and
  accessible names included); numbers in messages as `{{name, number}}`; dates through
  `formatDateTime` with an explicit zone; messages rendered as text.
- **Ask first:** another language; another message format or Paraglide's URL strategy; markup inside
  messages; any dependency beyond the two packages.
- **Never:** text written into a component or service; `{{name, datetime}}` in a message; a
  prerendered page with translated text; the server writing the language cookie; connecting Weblate
  in this module.

## Docs this module changes when built

- `docs/SPEC.md`: the tech-stack table gains both packages; the testing section gains the new tests.
- `docs/decisions.md`: D22's "Still to validate" paragraph goes, with the outcome in the PR body;
  D16 drops browser interaction with a real component.
- AGENTS.md: the status and the structure tree.
- The landing brief: the switcher in its signed-out navigation.

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke` and `ci-ok` pass.
2. The built server serves `/` in Danish to a Danish browser and in English otherwise, and the
   switcher changes it. `/healthz` is unchanged.
3. The validations have passed, with their evidence in the build PR's body.
4. The docs listed above say what was built.

## Open questions

None for the owner. Two choices were the agents' to make, under D22's "the owner left the choice to
the agents": Paraglide JS 3 rather than 2, and the browser keeping the server's language instead of
choosing again.
