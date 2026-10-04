---
type: "agent_requested"
description: "Bun + SvelteKit 3 + Svelte 5 + UnoCSS + shadcn-svelte coding guidelines"
---
# Bun + SvelteKit 3 / Svelte 5 Production Reference (UnoCSS · shadcn-svelte · Biome)

This stack pairs Bun as the package manager, production build runtime and production server (through the official `@sveltejs/adapter-bun`) with a Vite-powered SvelteKit 3 app running Svelte 5's signal-based runes, styled by UnoCSS in global mode with shadcn-svelte components themed through `unocss-preset-shadcn`, and kept clean by Biome. It is exceptional at fast cold installs, fine-grained reactivity with almost no runtime overhead, and a single-language full-stack story where server and client code share types automatically. Optimize for: explicit reactivity with runes, server/client boundaries that never leak state, declared environment variables, a correct public origin, UnoCSS in **global** mode (not `svelte-scoped`) so shadcn's CSS-variable theming works, and letting Bun own install, the production build and serving (the dev server may stay on Node).

The biggest ways an agent writes wrong-but-plausible code here come from importing habits from adjacent ecosystems and from SvelteKit 2: reaching for `$effect` to sync derived values (that is React's `useEffect` muscle memory — use `$derived`), writing `on:click` / `export let` / `$$props` / stores as if this were Svelte 4, reaching for `$app/stores` or `svelte.config.js` (both gone in Kit 3), reading an environment variable that `src/env.ts` never declared (it is silently `undefined`), declaring module-level mutable state in server files (a cross-request leak, not a convenience), assuming `bun test` runs Svelte components (it does not — the Svelte compiler runs through Vite/Vitest), serving plain HTTP without a runtime origin (every form action answers 403), and wiring UnoCSS with Tailwind's config file or `svelte-scoped` mode (shadcn needs global CSS variables and a Tailwind-style reset).

## Toolchain, runtime, and the Bun/Vite split

Bun is the package manager, the **production build** runtime and the **production** server. `@sveltejs/adapter-bun` calls Bun's build API, so the production build must run in Bun: `bun run --bun build`, with a `build` script of `bun --bun vite build` (`--bun` overrides Vite's Node shebang). Dev may stay on Node.

- `bun install` writes `bun.lock` — a text-based JSONC lockfile that has been the default since Bun 1.2, with `lockfileVersion` 2 on the 1.4 line. Commit it. Older Bun versions cannot read v2 lockfiles.
- `bun run dev` executes the `dev` script; Vite's dev server still uses Node unless you pass `--bun` (`bun --bun run dev`).
- `bunx <pkg>` runs a package binary (under Node if its shebang names `node`; `bunx --bun` forces Bun); `bun run <script>` runs a `package.json` script. Use `bunx shadcn-svelte@latest add …` for the component CLI. Never use npm, npx, yarn or pnpm commands.
- In production you run the adapter output under Bun: `bun ./build`, or the app's own front (see Deployment).

`package.json` scripts (the coherent command set):

```json
{
  "name": "app",
  "type": "module",
  "imports": { "#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*" },
  "scripts": {
    "dev": "vite dev",
    "build": "bun --bun vite build",
    "start": "bun ./build",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "format": "biome format --write .",
    "lint": "biome lint .",
    "fix": "biome check --write .",
    "test:unit": "vitest",
    "test:e2e": "playwright test"
  }
}
```

No `preview` script: `vite preview` runs on Node without the adapter, so E2E and smoke tests run against the adapter output instead. Day-to-day: `bun install`, `bun run dev`, `bun run fix` (Biome format+lint+safe fixes), `bun run check` (types), `bun run test:unit`, `bun run build`, then `bun ./build`.

## Project configuration

Kit 3 reads its configuration **only** from the `sveltekit()` plugin in `vite.config.ts`; `svelte.config.*` is unsupported, so delete it. Former `kit: {…}` options are top-level plugin options next to `preprocess` and `compilerOptions`; vite-plugin-svelte options go straight to the plugin (`vitePlugin` is gone).

```ts
// vite.config.ts
import adapter from '@sveltejs/adapter-bun';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    UnoCSS(), // must come before sveltekit()
    sveltekit({
      preprocess: vitePreprocess(),
      compilerOptions: { runes: true },
      adapter: adapter({ out: 'build', precompress: true }) // adapter default is false: set it explicitly
    })
  ]
});
```

Removed options: `csrf.checkOrigin` (CSRF is always on; only `csrf.trustedOrigins` remains), `files.lib`, `preloadStrategy`, `prerender.origin` (now `paths.origin`, build-time), `experimental.handleRenderingErrors`, `experimental.instrumentation`; `experimental.tracing` is now top-level `tracing`. Kit's `alias` option is deprecated: never use it. `version.pollInterval` now defaults to one hour.

**`$lib` is no longer generated.** Choose one per repo: (1) the documented default, `#lib` subpath imports (the `imports` map above) with explicit extensions, `import { db } from '#lib/server/db.js'`; `$app/tsconfig` derives TypeScript `paths` from that map; or (2) an explicit `$lib` alias in Vite `resolve.alias` plus tsconfig `paths` (smaller diff). Your own `paths` replace the derived ones (`svelte-kit sync` warns `"paths" was overwritten` on a mismatch). Keep shadcn-svelte's `components.json` aliases consistent with the choice.

`tsconfig.json` extends `$app/tsconfig`, which already sets `verbatimModuleSyntax`, `isolatedModules`, `moduleResolution: "bundler"` and `skipLibCheck`, but not `include`/`exclude`:

```jsonc
{
  "extends": "$app/tsconfig",
  "compilerOptions": { "strict": true, "types": ["bun", "$app/types"] }, // types must keep "$app/types"
  "include": ["src", "test", "*"],
  "exclude": ["src/service-worker"]
}
```

A service worker is its own TS project (`src/service-worker/tsconfig.json` extending `$app/tsconfig/service-worker`), registers as `type: 'module'`, takes `version` from `$app/env` and `assets`/`immutable`/`prerendered` from `$app/manifest`, and its cache skips `no-store` responses.

`svelte-check` is the type-checker for `.svelte` files — `tsc` alone cannot see inside components. `svelte-kit sync` still ships in Kit 3 (it writes `$app/tsconfig` into `node_modules`, the `$types` and the env declarations), so the `check` script keeps running it first.

## Migrating from SvelteKit 2

Codemod (runs under Node ≥22.17): `bunx sv migrate sveltekit-3`, one task at a time (`--tasks <id>`, commit after each, `--install bun` or `--no-install`). It runs your `format` script (expect reformatted files). Resolve every `@migration-task` marker; never commit `MIGRATION_TASKS.md`. `package-json` and `tsconfig` are implicit tasks. Known quirks: it can narrow tsconfig `include` to `src` (restore it) and write floors below Kit's peers (raise them); test mocks keyed on module specifiers must follow every rename; `external-redirects` only catches static redirects (see Redirects).

- **`$app/stores` is removed** (throws at runtime, no types): use `$app/state`, which already works on Kit 2. `$app/environment` is a deprecated untyped alias: use `$app/env`. `$service-worker` is removed (see above).
- `$app/paths` keeps only `asset`, `match` and `resolve` (`base`, `assets`, `resolveRoute` are gone); paths lose the leading `/` (`asset('foo.png')`, `resolve('blog/hello')`); `Pathname`/`Asset` are now `Path`/`AssetPath`; `preloadCode` takes a route ID. `src/params/*` becomes one `src/params.ts` built with `defineParams` from `@sveltejs/kit/params`.
- Types: `RequestEvent` (readonly), `Cookies`, `RequestHandler`, `Load`, `Action`/`Actions`, `error`, `redirect`, `fail`, `isHttpError` stay in `@sveltejs/kit`. `ActionResult`/`SubmitFunction` → `$app/forms`; `Page`, `ReadonlyURL`, `ReadonlyURLSearchParams` → `$app/state` (`page.url` is readonly: `new URL(page.url.href)` before mutating); `Handle`, `HandleServerError`, `HandleFetch` → `@sveltejs/kit/hooks`; `BeforeNavigate`, `AfterNavigate`, `OnNavigate`, `Navigation*`, `GotoOptions` → `$app/navigation`; env types and `defineEnvVars` → `@sveltejs/kit/env`; `getRequestEvent`, `read` and remote-function types → `$app/server`; `CookieSerializeOptions`/`CookieParseOptions` → `SerializeOptions`/`ParseOptions`.
- Also: cross-origin form submissions without a `Content-Type` are rejected; cookie names must be ASCII and `path` defaults to `/`; query parameters starting `x-sveltekit-` are rejected; universal route `config` beats server `config`; preloads are `<link>` elements (`output.linkHeaderPreload` is opt-in); a `204` from `+server.ts` has no body.

## Svelte 5 runes — the reactive core

Runes are compiler keywords (prefixed `$`), not imports. They work in `.svelte`, `.svelte.js`, and `.svelte.ts` files only. You cannot alias them, store them in variables, or call them conditionally.

**`$state` / `$derived` / `$effect` — pick the right one.** `$state` holds a value, `$derived` computes one purely, `$effect` runs a side effect after the DOM updates (browser only, never during SSR). Reach for `$derived` before `$effect`; using an effect to copy one reactive value into another is the classic React-transplant bug.

```svelte
<script lang="ts">
  let quantity = $state(1);
  let unitPrice = $state(9.99);

  // Derived: pure, memoised, recomputed on dependency change. NOT an effect.
  let subtotal = $derived(quantity * unitPrice);

  // $derived.by for multi-statement derivations
  let label = $derived.by(() => {
    if (subtotal === 0) return 'Free';
    return `$${subtotal.toFixed(2)}`;
  });

  // Effect: genuine side effect + cleanup. Runs only in the browser.
  $effect(() => {
    const id = setInterval(() => (quantity += 1), 1000);
    return () => clearInterval(id); // teardown on re-run/unmount
  });
</script>

<button onclick={() => quantity++}>{quantity} × ${unitPrice} = {label}</button>
```

Key behaviours to respect as contracts:
- `$state` objects/arrays are **deep proxies** — nested mutation is reactive. `$state.raw(...)` opts out for large immutable structures you replace wholesale.
- `$state.snapshot(value)` produces a plain (non-proxy) clone — use it before handing state to non-Svelte APIs (`structuredClone`, external libs that choke on proxies).
- `SvelteMap` / `SvelteSet` from `svelte/reactivity` track membership and iteration, but values stored inside are **not** made deeply reactive — wrap an inner object in `$state` if you need to mutate its fields reactively.
- `$effect.pre(...)` runs before DOM updates; `untrack(() => …)` reads state without creating a dependency.

**`$props` and `$bindable`.** `export let` is gone. Destructure props, type them, and mark two-way props explicitly:

```svelte
<script lang="ts">
  interface Props {
    value: string;
    placeholder?: string;
    oninput?: (v: string) => void;
  }
  let { value = $bindable(''), placeholder = '', oninput }: Props = $props();
</script>

<input {placeholder} bind:value oninput={() => oninput?.(value)} />
```

Only `$bindable` props may be driven by `bind:` from a parent; plain props are read-only in the child.

**Snippets replace slots.** Use `{#snippet}` / `{@render}` and the implicit `children` snippet:

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { header, children }: { header?: Snippet; children: Snippet } = $props();
</script>

<section class="rounded-lg border bg-card text-card-foreground shadow-sm">
  {#if header}<div class="border-b p-4 font-semibold">{@render header()}</div>{/if}
  <div class="p-4">{@render children()}</div>
</section>
```

```svelte
<!-- usage -->
<Card>
  {#snippet header()}Invoices{/snippet}
  <p>Body content here</p>
</Card>
```

**Event attributes, not directives.** `onclick`, `oninput`, `onsubmit` — never `on:click`. There is no event-modifier syntax; call `event.preventDefault()` in the handler. Component events are just callback props (see `oninput` above), replacing `createEventDispatcher`.

**Shared state lives in `.svelte.ts` modules**, exposed through getters so reactivity survives the import boundary. Never export a bare reactive `let` and mutate it elsewhere.

```ts
// src/lib/state/cart.svelte.ts
export class Cart {
  items = $state<{ id: string; qty: number }[]>([]);
  get count() {
    return this.items.reduce((n, i) => n + i.qty, 0);
  }
  add(id: string) {
    const existing = this.items.find((i) => i.id === id);
    if (existing) existing.qty += 1;
    else this.items.push({ id, qty: 1 });
  }
}
// A module-level `export const cart = new Cart()` is ONE object for every SSR request:
// safe only if nothing using it renders on the server. Otherwise use context (below).
```

## SSR, server boundaries, and state safety

**Never keep request- or user-specific data in mutable module-level state in server code** (`+page.server.ts`, `+layout.server.ts`, `hooks.server.ts`, server-only modules) or in a shared `.svelte.ts` singleton rendered during SSR. The server is shared by every user, so a top-level `let user` leaks one visitor's data to the next. Per-request data goes in `event.locals`. Deliberate process-wide resources (a database handle, a scheduler, a rate limiter) may stay at module level; name them as such. `load` has no side effects. Share per-request state with context and a getter: `setContext('user', () => data.user)` in a layout. Components are reused across navigations, so values computed from `data` use `$derived`. `$effect` never runs during SSR, so anything that must appear in server-rendered HTML goes in a `load` function or a `$derived`. Keep filter, sort and pagination state in URL search params (recommended). Code that must not run during the build (DB init, migrations, secret checks) guards on `building` from `$app/env`: route server files and hooks load during the build.

Read navigation state from `$app/state` (`$app/stores` is removed):

```svelte
<script lang="ts">
  import { page } from '$app/state'; // reactive object, no $ prefix
</script>
<p>Current path: {page.url.pathname}</p>
```

**Server-only modules widened:** any file with a `server` name segment (`db.server.ts`, plain `server.ts`) and any `server` directory outside `src/routes` and `static` is server-only, so client imports that passed on Kit 2 can fail. Detection is off while `TEST=true`; only a clean `bun run build` proves it.

## Environment variables

Kit 3 exposes only **declared** variables. Declare every variable the app reads in `src/env.ts`:

```ts
// src/env.ts
import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

export const variables = defineEnvVars({
  DATABASE_URL: { schema: building ? v.optional(v.string()) : v.string() }, // required at startup, absent at image build
  LOG_LEVEL: { schema: v.optional(v.string()) }, // optional: unset stays undefined
  SITE_NAME: { public: true } // no validator: required (may be empty); $app/env/public and %sveltekit.env.SITE_NAME%
});
```

- Server code reads `$app/env/private` (`import * as env from '$app/env/private'` where code passes the env object around). `$env/*` is deprecated and untyped; `$env/dynamic/private` is a shim that exposes declared variables only.
- **An undeclared variable silently reads as `undefined`** (an undeclared optional one silently switches its feature off). Add a test that compares the declared names with the names the code reads.
- **A declared variable without a `schema` is required:** unset fails startup or the build ("Value is missing"); an empty string passes. Give every optional variable a validator that accepts `undefined`, such as `v.optional(v.string())` or a function (`(value) => value`; returning `undefined` is valid), never `{}`. Keep "unset" as `undefined`; no `?? ''` fallbacks that change semantics.
- Variables are dynamic unless `static: true` (inlined at build). Public ones need `public: true`, including every `%sveltekit.env.NAME%` in `app.html`. An invalid value fails startup or the build. `browser`, `building`, `dev`, `version` come from `$app/env`.

## Routing and the data layer

The stable data-flow model is **`load` functions + form actions**. Load runs on server and/or client; `+page.server.ts` load runs only on the server (use it for secrets and direct DB access).

```ts
// src/routes/invoices/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { invoices: await db.invoices.findMany({ userId: locals.user.id }) };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Sign in first' }); // load guards don't cover actions
    const data = await request.formData();
    const amount = Number(data.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0)
      return fail(400, { error: 'Amount must be positive' });
    await db.invoices.create({ userId: locals.user.id, amount });
    return { success: true };
  }
};
```

```svelte
<!-- src/routes/invoices/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>

<ul>{#each data.invoices as inv (inv.id)}<li>${inv.amount}</li>{/each}</ul>

<form method="POST" action="?/create" use:enhance>
  <input name="amount" type="number" step="0.01" required />
  <button>Add</button>
  {#if form?.error}<p class="text-destructive">{form.error}</p>{/if}
</form>
```

`$types` (`PageProps`, `PageServerLoad`, `Actions`) are generated by SvelteKit from your load/action signatures — never hand-write those types. Use `+server.ts` route handlers for public APIs, webhooks, and anything needing a stable URL contract; return `Response.json(...)`/`new Response(...)` (`json`/`text` are deprecated).

Kit 3 form actions: enhanced responses carry the status passed to `fail` (not 200), and an action returning nothing answers 204 with no body; update tests and logging. `use:enhance` posting to an action on **another page** now navigates there; `await update({ navigate: false })` restores Kit 2 behaviour. `form.error` is `App.Error | undefined`.

**Remote functions stay experimental — not for production edbfi apps yet.** `.remote.ts` files need `experimental.remoteFunctions` plus `compilerOptions.experimental.async`, sit outside semver, and superforms has no integration. Default to `load` + form actions; if you opt in knowingly, treat each remote function as a public endpoint and validate input with a Standard Schema validator.

## Navigation and redirects

- `goto(url, { replace, reset, refreshAll, shallow, state })`. `replaceState`/`invalidateAll` options, `invalidateAll()` and `pushState`/`replaceState` are deprecated (use `replace`, `refreshAll`, `goto(..., { shallow: true, state })`); `keepFocus`/`noScroll` are gone.
- `reset` (default `true`) resets scroll **and** focus; `reset: false` keeps both. There is no keep-focus-reset-scroll or keep-scroll-reset-focus mode: where old code kept focus and reset scroll, use `reset: false` and scroll yourself after `await goto(...)`. After `reset: false` the focused element must still exist.
- `data-sveltekit-noscroll`/`keepfocus` became `data-sveltekit-reset="false"`; `"off"` values are now `false`. Keep the `data-sveltekit-preload-*` options on `<body>`.
- `goto` rejects a same-app URL that matches no route: use `window.location.href`. Clicking a link to the current page calls `refreshAll()`; `invalidate` no longer aborts an in-flight navigation; `delta` exists only on popstate; `preloadData` can return `type: 'error'`.
- Every page has a unique `<title>` (the route announcer reads it); `<html lang>` is correct (per request via `transformPageChunk` if multilingual). SSR stays on and a migration leaves `trailingSlash` and page options unchanged.
- **External redirects** need a narrow origin allowlist, never `true`: `redirect(303, url, { external: ['https://accounts.example.com'] })`. The codemod finds only static ones; audit every computed `redirect(` target.

## Auth pattern (hooks + locals)

Authentication belongs in `hooks.server.ts`, populating `event.locals` for every request. Type `locals` in `src/app.d.ts`.

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit/hooks';
import { verifySession } from '#lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');
  event.locals.user = token ? await verifySession(token) : null;
  return resolve(event);
};
```

```ts
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string } | null;
    }
  }
}
export {};
```

Every form action and endpoint runs its own guard; layouts do not protect actions, and client-side checks protect nothing. Keep `resolve(event, { transformPageChunk, preload })` options intact when `handle` customises rendering.

**Cookies follow the public scheme.** Pass `secure` from the request to every `cookies.set`, `cookies.delete` and `cookies.serialize`: `const secure = event.url.protocol === 'https:'; event.cookies.set('session', token, { path: '/', httpOnly: true, secure, sameSite: 'lax' })`. Never derive it from `dev`/`NODE_ENV` or rely on Kit's default (`secure: true` except in dev and on `http://localhost`): browsers refuse `Secure` cookies and deletions over plain HTTP off loopback, so plain-HTTP logins and logouts silently fail. Behind a front or trusted proxy, `event.url` already carries the public scheme. Test plain-HTTP login from a non-loopback origin (browsers treat loopback as secure). A frontend that relays a backend's `Set-Cookie` sets `Secure` from `event.url` too, and strips the headers its front sets and any client `X-Forwarded-*` from requests it passes to the backend.

## Errors

`handleError` (server and client) receives **every** error as `{ kind, error, event }`, `kind` being `app` (your `error()`), `framework` (404, 405, 413, …), `validation` (remote-function input) or `unknown`:

```ts
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit/hooks';

export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== 'unknown') return error; // safe bodies pass through; don't log framework errors
  console.error(event.route.id, error);
  return { message: 'Internal Error' }; // never leak details
};
```

It must never throw. An async client `handleError` needs `compilerOptions.experimental.async`. `App.Error` always has `status`. Use `error(404, 'Not found')`, with extra properties as a third argument (`error(403, 'Forbidden', { code })`); the object form `error(status, {...})` is deprecated and warns in dev. Use `isHttpError`/`isRedirect`, never `instanceof`.

## Forms: Superforms 3

Formsnap is no longer used (`formsnap@2.0.1` peers superforms `^2.19.0`, excluding 3.x; no release since April 2025): build field components in-house. Superforms 2.x peers Kit ≤2; use 3.0.x (stable). Import paths and the store API (`$form`, `$errors`, `$message`) are unchanged; `/server` is server-only.

- Every `load`/action path that **returns** includes the form (`{ form }`, or `{ loginForm, registerForm }` for several). Thrown `redirect()`/`error()` stay. Invalid input returns `fail(400, { form })`, never `error()`.
- Schemas and adapters (`valibot(schema)`) live at module top level (adapter cache). One `superForm(untrack(() => data.form))` per form; inputs have `name` unless `dataType: 'json'` (needs JS; disabled fields are still posted).
- Use superForm's `enhance`, not `use:enhance`; `applyAction`, `invalidateAll`, `resetForm` default to `true`. With `applyAction: false`, redirect yourself. Without `onError`, errors throw in the browser; `onError` reads `result.error.message` (and `status`).
- Forms sharing a schema on one page, and multi-step forms switching schemas, set an `id` (plus a hidden `__superform_id` without JS). `valibotClient` needs the server's schema; per-step schemas use the full `valibot()` adapter client-side.
- `message()`/`setError()` return `fail` when invalid or status ≥400; prefer status messages to `error()`. Files: `enctype="multipart/form-data"` and return with `withFiles`.
- Read the body once: pass `request`/`event` to `superValidate` only if unread, else `const formData = await request.formData()` once and pass `formData`. Endpoints answer with `actionResult()`.
- Rate-limit on the server (`multipleSubmits` is not enough); the server always validates (client checks can be tampered with; `defaults()` does not validate). Move off the deprecated `flashMessage` option.
- Kit 3: action responses carry the `fail()` status, not 200 (fix tests). superForm calls `applyAction` itself, never Kit's `update()`, so (inference) a cross-route superForm stays on the current page, unlike `use:enhance`: test it.

## Styling: UnoCSS (global mode) + shadcn-svelte + unocss-preset-shadcn

This is where agents most often produce broken setups. The rules:

1. **Use UnoCSS in global mode (`unocss/vite`), not `@unocss/svelte-scoped`.** Svelte-scoped rewrites utility class names per component and distributes styles into component `<style>` blocks — that is designed for shippable component *libraries*, and it breaks shadcn-svelte, which depends on globally-scoped CSS custom properties (`--background`, `--primary`, …) and a Tailwind-style reset.
2. **`unocss-preset-shadcn` generates the shadcn CSS variables and theme.** Pair it with `presetWind3` and `unocss-preset-animations`.
3. **`presetWind4` is the package's default (since preset v1.0), but pin to the `presetWind3` path for reliability.** `presetWind4` switches colors to the `oklch` model with `color-mix()`, which has documented open bugs with this preset and, per UnoCSS's own docs, does not play well with `transformerDirectives` or `presetLegacyCompat`. Import the stable v3 entry: `unocss-preset-shadcn/v3`.
4. **`.ts`/`.js` files are not extracted by default** — you must add them to the content pipeline, or shadcn-svelte's `index.ts` barrel components lose their classes.

```bash
bun add -D unocss @unocss/preset-wind3 @unocss/extractor-svelte \
  unocss-preset-animations unocss-preset-shadcn
bun add -D @unocss/reset
```

```ts
// uno.config.ts
import { defineConfig } from 'unocss';
import { presetWind } from '@unocss/preset-wind3';
import extractorSvelte from '@unocss/extractor-svelte';
import presetAnimations from 'unocss-preset-animations';
import { presetShadcn } from 'unocss-preset-shadcn/v3';

export default defineConfig({
  extractors: [extractorSvelte()],
  presets: [
    presetWind(),
    presetAnimations(),
    presetShadcn({ color: 'zinc' }) // default darkSelector is `.dark` — correct for Svelte/bits-ui
  ],
  content: {
    pipeline: {
      include: [
        // default globs …
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // …plus JS/TS so shadcn-svelte barrels are scanned
        'src/**/*.{js,ts}'
      ]
    }
  }
});
```

Do **not** set `darkSelector: '[data-kb-theme="dark"]'` — that is the SolidUI/Kobalte default. shadcn-svelte uses the `.dark` class strategy, which is `presetShadcn`'s default. For a runtime color-swap UI, pass an array of themes (`presetShadcn(builtinColors.map((c) => ({ color: c })))`) and toggle the generated `theme-<color>` class on `document.body`; the preset ships no `updateTheme` helper.

Root layout wires the reset, generated utilities, and dark-mode manager. `mode-watcher` is still required — it sets the `.dark` class on `<html>` before paint, avoiding the light→dark flash that `onMount`-based toggles cause:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '@unocss/reset/tailwind.css'; // shadcn assumes the Tailwind reset
  import 'uno.css';
  import '../app.css'; // your theme vars / globals
  import { ModeWatcher } from 'mode-watcher';
  let { children } = $props();
</script>

<ModeWatcher />
{@render children?.()}
```

Icons: CSS icons through Iconify's UnoCSS integration avoid per-icon components (recommended). With `@lucide/svelte` (the old `lucide-svelte` is deprecated and points users to `@lucide/svelte` for Svelte 5), import per icon by subpath and **never mix umbrella and subpath imports**: one-`.svelte`-file-per-icon libraries slow Vite's dependency optimization, pathologically when both styles meet.

```svelte
<script lang="ts">
  import SunIcon from '@lucide/svelte/icons/sun';
  import MoonIcon from '@lucide/svelte/icons/moon';
  import { toggleMode } from 'mode-watcher';
  import { Button } from '#lib/components/ui/button/index.js';
</script>

<Button onclick={toggleMode} variant="outline" size="icon">
  <SunIcon class="h-[1.2rem] w-[1.2rem] scale-100 dark:scale-0" />
  <MoonIcon class="absolute h-[1.2rem] w-[1.2rem] scale-0 dark:scale-100" />
  <span class="sr-only">Toggle theme</span>
</Button>
```

**shadcn-svelte CLI with UnoCSS.** Because you are not using Tailwind, do **not** run `shadcn-svelte init`. Instead set up manually, then use `add`:

- Install the runtime deps the components import: `bun add bits-ui tailwind-variants clsx tailwind-merge @lucide/svelte mode-watcher`.
- Add `src/lib/utils.ts` with the `cn` helper:

```ts
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- Create `components.json` and an **empty `tailwind.config.js`** in the project root (the CLI expects both even though styling runs through UnoCSS). Its aliases must match the repo's `#lib`/`$lib` choice (shown: the explicit `$lib` alias):

```json
{
  "$schema": "https://shadcn-svelte.com/schema.json",
  "style": "default",
  "tailwind": { "config": "tailwind.config.js", "css": "src/app.css", "baseColor": "zinc" },
  "aliases": { "components": "$lib/components", "utils": "$lib/utils" }
}
```

- Then `bunx shadcn-svelte@latest add button card dialog` copies component source into `src/lib/components/ui`. These files are **yours** — edit them directly; `bun update` never touches them. Re-run `add <name>` to pull upstream changes and reconcile.

shadcn-svelte components are runes-native (`$props`, snippets, `onclick`), built on **bits-ui** primitives (accessible, unstyled behaviour) with the styling layered on top. Compose them; for a sortable table use TanStack Table, and for validated forms use Superforms 3 with in-house field components (no Formsnap).

## Testing

`bun test` is **not** appropriate for Svelte components — it does not run the Svelte compiler or Vite transforms, and runes only work when compiled. Use **Vitest** through `@sveltejs/vite-plugin-svelte`. The modern component approach is **`vitest-browser-svelte`** (Browser Mode, real browser via Playwright) rather than `@testing-library/svelte` + jsdom, which mocked browser APIs; browser mode also correctly exercises runes that need a real DOM. Split into two Vitest projects, and **never render components in the server project**: in Kit 3 a server `redirect()` resolves through `#internal` with the `browser` condition, so a config that also renders components fails server tests with `window is not defined`.

```ts
// vite.config.ts — `test` block added to the config above (defineConfig from 'vitest/config');
// requires vitest 4.x, vitest-browser-svelte 3.x
test: {
  projects: [
    {
      extends: true,
      test: {
        name: 'client',
        browser: { enabled: true, provider: 'playwright', instances: [{ browser: 'chromium' }] },
        include: ['src/**/*.svelte.{test,spec}.ts']
      }
    },
    {
      extends: true,
      test: {
        name: 'server',
        environment: 'node',
        include: ['src/**/*.{test,spec}.ts'],
        exclude: ['src/**/*.svelte.{test,spec}.ts']
      }
    }
  ]
}
```

```ts
// src/lib/components/counter.svelte.test.ts
import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import Counter from './counter.svelte';

test('increments', async () => {
  const screen = render(Counter, { initialCount: 1 });
  await screen.getByRole('button', { name: 'Increment' }).click();
  // Locators auto-retry until the assertion passes — no manual act()/tick()
  await expect.element(screen.getByText('Count is 2')).toBeVisible();
});
```

Use **Playwright** for end-to-end flows (`test:e2e`), against the built adapter output (`bun ./build` or the front), never `vite preview`. Do not use `act()` or `fireEvent` patterns from testing-library — `vitest-browser-svelte` exposes retrying locators and `expect.element` instead.

## Biome — format, lint, organize

Biome replaces ESLint + Prettier for this stack. It is a fast formatter and linter for JS/TS/JSX, JSON(C), and CSS. Its **`.svelte` support is experimental**, hidden behind `html.experimentalFullSupportEnabled`: it can lint and format the JS/TS in `<script>` and the CSS in `<style>`, and since 2.4 it parses Svelte control-flow (`{#if}` … `{/if}`), but markup formatting and some cross-language rules still have gaps and occasional false positives. Treat Biome as the source of truth for all non-`.svelte` files and for `<script>` linting; treat **`svelte-check` as the source of truth for `.svelte` type correctness**.

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true },
  "formatter": { "enabled": true, "indentStyle": "tab", "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "html": { "experimentalFullSupportEnabled": true },
  "overrides": [
    {
      "includes": ["**/*.svelte"],
      "linter": {
        "rules": {
          // trim false positives on framework files if they surface
          "style": { "useConst": "off" }
        }
      }
    }
  ]
}
```

Commands: `biome check --write .` (format + lint + organize imports + safe fixes), `biome format --write .`, `biome lint .`. Run via `bunx biome …` or the `package.json` scripts. Biome does not type-check — that is `svelte-check`'s job, kept separate. If Biome's experimental markup formatting mangles a component, disable formatting for `.svelte` in the override and add `prettier-plugin-svelte` solely for `.svelte` formatting; that is the one legitimate complementary tool, for that specific gap.

## Deployment (`@sveltejs/adapter-bun`)

Use the official **`@sveltejs/adapter-bun`** (Bun ≥1.4.0). Not `@sveltejs/adapter-node` under Bun, and not the community `svelte-adapter-bun` (peers Kit 2 and `typescript ^5`) or its forks.

**Single-page apps** are the exception: an SPA (no `+page.server`, `+layout.server` or `+server` files) uses `@sveltejs/adapter-static` with a `fallback` page (such as `200.html`, not `index.html`) and `ssr = false` in the root `+layout.ts`, served by its backend on the same origin as its API. Its public variables are fixed at build (adapter-static writes them into `_app/env.js`). The adapter-bun, front, and server-side cookie and origin sections then do not apply: the backend owns origin checks, cookies and proxy trust.

```bash
bun run build   # bun --bun vite build -> ./build
bun ./build     # Bun.serve server, or the app's front
```

- **Runtime needs** the output directory, `package.json` and production `node_modules` (`bun install --production --frozen-lockfile`); Docker images copy `package.json` too. `dependencies` stay external; `devDependencies` (and Svelte libraries in `ssr.noExternal`) are bundled, so `@sveltejs/kit`, `svelte` and `vite` are `devDependencies` and runtime-only packages are `dependencies`. Bun auto-loads `.env` at runtime: no stray `.env` in any image or working directory.
- **Options:** `out` (`build`), `precompress` (default `false`: set it explicitly), `envPrefix` (an unknown prefixed variable then fails startup), `serverOptions` (env vars win).
- **Env:** `HOST`/`PORT` (`3000`); `SOCKET_PATH` (ignores TCP options); `BODY_SIZE_LIMIT` (`512K`, K/M/G, `Infinity`): size it from the app's real maximum (uploads) and let an operator value win; `CONNECTION_IDLE_TIMEOUT` (0–255 s, replaces `IDLE_TIMEOUT`; `text/event-stream` exempt, gets `X-Accel-Buffering: no`); `SHUTDOWN_TIMEOUT` (`30` s drain, then `sveltekit:shutdown`; a second signal exits 1; in a container the default must fit the stop budget, Docker's 10 s unless the image or Compose sets more, so `docker stop` drains event streams instead of killing them); `PROTOCOL_HEADER` (`http`/`https` else 400), `HOST_HEADER`, `PORT_HEADER` (numeric else 400); `ADDRESS_HEADER` + `XFF_DEPTH` (`1`, from the right). Empty headers are ignored. `getClientAddress()` **throws** if `ADDRESS_HEADER` is set but absent or short of `XFF_DEPTH` hops: leave it unset where no proxy supplies it.
- **Static assets** are native Bun routes (`GET`/`HEAD`, ETags, ranges, immutable caching); a literal `*` in a filename fails the build; test URL-encoded asset paths (until sveltejs/kit#17123 lands they 404 or fall through to the app; do not patch the server for it). No WebSocket hook.

**Public origin.** Runtime `ORIGIN` is gone in Kit 3 (adapter-node 6 too), `paths.origin` is build-time, and Kit's form CSRF check runs **before** `handle`, so no hook can rescue form actions or uploads. adapter-bun uses `paths.origin`, else the configured `PROTOCOL_HEADER`/`HOST_HEADER`/`PORT_HEADER`, else `Host` with an **assumed `https`**. Its docs: "Configure `paths.origin` or `PROTOCOL_HEADER` if that assumption is wrong, for example when serving plain HTTP directly", and "Only trust forwarded headers when requests can reach the server through a proxy you control. A direct client can spoof these headers."
- **`ORIGIN` is the one public-origin setting:** the address people open in the browser. Plain HTTP needs it (without it same-origin writes get 403); it enables a network app's front. Leave it unset only behind an HTTPS reverse proxy that passes the original `Host`, where the adapter default is correct.
- **Parse it the same way in every network front:** trim (empty means unset); `new URL()` must give `http:` or `https:`; reject credentials, a pathname other than `/` and any `?` or `#` in the raw value, before binding, with a startup error that never echoes the value: `ORIGIN must be a bare http(s) origin such as http://192.168.1.10:3000 (no path, query, fragment or credentials).` The canonical value is `url.origin` (lowercase scheme and host, no default port, no trailing `/`); set `process.env.ORIGIN` to it before the app loads, so the app and the front compare one string.
- **App-level origin settings derive from `ORIGIN`** when it is set (allowed-origin lists, a CSRF origin, a stored public URL): stored or extra values may add origins, never replace it. Compare canonical origins, never raw strings.
- **Never** derive the origin from the request's `Host` header (DNS rebinding; a network-facing app has no single listener origin). With neither `ORIGIN` nor `PROTOCOL_HEADER` set, log **one** startup warning (not an error) naming the user-visible failure, in the same words in every app (one parenthetical may follow "saving changes"): `ORIGIN is not set: <App> assumes it is served over HTTPS behind a proxy that preserves the Host header. Over plain HTTP, signing in and saving changes will fail. Set ORIGIN to the address users open, for example ORIGIN=http://192.168.1.10:3000.`
- **Exception:** an app whose own configuration needs its public address (links or QR codes it prints) exits in production before binding when no origin is set, with or without `PROTOCOL_HEADER`, with one message naming `ORIGIN` that never echoes a value, and logs no warning. Its front then always runs.
- Behind a proxy, set `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH` (the number of trusted proxies, default 1) only when every request passes through them; `PROTOCOL_HEADER`/`HOST_HEADER` only without `ORIGIN`, behind a trusted proxy. Document them, `ORIGIN`, `SHUTDOWN_TIMEOUT` and `BODY_SIZE_LIMIT` (effective defaults) in the README, `.env.example` and image docs.
- **Never** add a `Content-Type` to bodyless writes (or any client-side trick) to get past the origin check; it hides the wrong `https` origin. Do not weaken CSRF, widen `trustedOrigins` or accepted hostnames to pass tests, monkeypatch `Bun.serve`, or edit build output.
- An app that sets `Referrer-Policy` uses `same-origin`, not `no-referrer`: under `no-referrer`, Chromium and WebKit send `Origin: null` on form posts without JavaScript, which Kit's CSRF check refuses. `same-origin` still sends no referrer to other origins.

**The app-owned front** (each app owns its own; no shared module) is the docs' "proxy you control" made runtime-configurable:
- The adapter listens on `SOCKET_PATH` in a fresh `mkdtemp` directory; the front binds the public `HOST`/`PORT` (loopback only for a loopback app) and is the socket's only client.
- On **every** request it **overwrites** the headers the adapter reads as `PROTOCOL_HEADER`/`HOST_HEADER` and deletes `PORT_HEADER` input. It deletes any client-sent copy of its own address header and sets it to the peer from `server.requestIP()`, unless the operator of a network front set `ADDRESS_HEADER` (then passed through). A loopback front owns `ADDRESS_HEADER` outright: it ignores an operator value and unsets `XFF_DEPTH` (no working proxy can sit in front of it).
- A network front runs only when `ORIGIN` is set (else the adapter listens directly), validates it alone and never compares it with its bind address (proxies and Docker port mapping differ legitimately). Only a **loopback** front may reject an `ORIGIN` that differs from its listener.
- Forwarding: the raw path and query, sliced from `request.url` after any authority, never `new URL(request.url)` (it throws on some `Host` values); `redirect: 'manual'`, `decompress: false`, abort signal passed through, no body for GET/HEAD, 503 on a socket connection failure. When the adapter force-closes a proxied event stream (its shutdown drain expired), end the public stream normally instead of passing the error on, which browsers see as a connection reset.
- Idle timer: Bun 1.4.2 keeps the public listener's idle timer running while the front awaits the in-process app, so slow answers are cut, some long before the window ends. Call `server.timeout(request, 0)` once the request has fully arrived (at once without a body, else in the `flush` of a `TransformStream` the body is piped through, so a stalled upload still times out) and re-arm the client idle timeout in a `finally` when the app answers or fails, before the event-stream exemption. This also keeps an event stream whose first event is late (adapter-bun sends its headers with that event).
- Shutdown: on the first SIGTERM/SIGINT fix a deadline from `SHUTDOWN_TIMEOUT` and start `listener.stop()` (keep the promise); the adapter drains its side and emits `sveltekit:shutdown`; await the public drain until the deadline and `listener.stop(true)` only when it expires (force-closing on `sveltekit:shutdown` truncates slow downloads). Then, still in the `sveltekit:shutdown` handler, arm the exit at the deadline: `setTimeout(() => process.exit(), Math.max(0, deadline - Date.now())).unref()` (unreferenced, so a process with nothing left exits sooner). Without it, an app request still awaiting an upstream keeps the process alive past the deadline, and `docker stop` kills it. Remove the socket directory on `exit` too, not only after a drain. A front that binds before loading the adapter re-delivers a signal received during the load once the adapter has loaded (else `sveltekit:shutdown` never fires and the process hangs); a second signal before then exits 1.
- Observed (Bun 1.4.2, macOS and linux/arm64; consistent with oven-sh/bun#43816): on `SOCKET_PATH`, idle `text/event-stream` responses close after about 12 s despite the exemption. Fronts set `CONNECTION_IDLE_TIMEOUT=0` on the socket side, enforce the client idle timeout, and call `server.timeout(req, 0)` for event streams on their public TCP listener (it is inert on unix listeners).

Optional: `tracing.server` with `src/instrumentation.server.ts` (adapter-bun's docs don't cover it; verify first; leave `@opentelemetry/api` uninstalled).

## Anti-patterns to avoid

| Wrong | Why | Right |
| --- | --- | --- |
| `$effect(() => { double = count * 2 })` | Effect used to derive a value — extra render pass, stale-value bugs; a React `useEffect` habit | `let double = $derived(count * 2)` |
| `on:click={…}`, `export let x`, `$$props`, `createEventDispatcher` | Svelte 4 syntax; invalid or non-reactive in runes mode | `onclick={…}`, `let { x } = $props()`, callback props |
| Module-level `let user` in server code, or an SSR-rendered `.svelte.ts` singleton | Shared across all requests — cross-user data leak | Per-request `event.locals`; context with a getter |
| `bun test` for components | No Svelte compiler / Vite transform; runes don't run | `vitest` with `vitest-browser-svelte` in Browser Mode |
| `@unocss/svelte-scoped` mode | Rewrites class names & scopes styles; breaks shadcn's global CSS variables + reset | `unocss/vite` (global) + `unocss-preset-shadcn` |
| `presetWind4` with `unocss-preset-shadcn` | oklch/`color-mix` bugs + `transformerDirectives` incompatibility | `presetWind3` via `unocss-preset-shadcn/v3` |
| Running `shadcn-svelte init` on a UnoCSS project | Scaffolds a Tailwind pipeline that conflicts with UnoCSS | Manual `cn` util + `components.json` + empty `tailwind.config.js`, then `add` |
| Forgetting `'src/**/*.{js,ts}'` in UnoCSS content | shadcn barrel `index.ts` files aren't scanned; classes vanish in prod | Add JS/TS to `content.pipeline.include` |
| `import { page } from '$app/stores'` | Removed in Kit 3; throws at runtime | `import { page } from '$app/state'` |
| Undeclared env var | Silently `undefined`; feature switches off | Declare it in `src/env.ts` |
| Dark-mode toggle in `onMount` | Runs after hydration — flash of wrong theme | `mode-watcher` `<ModeWatcher />` in root layout |
| `lucide-svelte`, or mixed umbrella/subpath icon imports | Deprecated; pathological dep optimization | `@lucide/svelte/icons/…` only, or CSS icons |
| `adapter-node` or `svelte-adapter-bun` | Runtime workarounds / peers Kit 2 + TS 5 | `@sveltejs/adapter-bun`, built with `--bun` |
| Plain HTTP without `ORIGIN`, or a `Content-Type` hack | 403 on writes; the hack hides the wrong origin | App-owned front with `ORIGIN`, or a trusted proxy |
| `secure: !dev` on cookies | Plain-HTTP login fails off loopback | `secure: event.url.protocol === 'https:'` |
| Relying on remote functions in production | Experimental, outside semver — can break on any release | `load` + form actions; opt in only knowingly |

## Version & compatibility

| Component | Targeted line | Notes / floor |
| --- | --- | --- |
| Bun | 1.4.x | ≥1.4.0 (adapter-bun); package manager, production build (`--bun`) and runtime; text `bun.lock` default since 1.2, `lockfileVersion` 2 on the 1.4 line |
| SvelteKit (`@sveltejs/kit`) | 3.0.x | Config only in `sveltekit({...})` in `vite.config.ts`; migrate with `bunx sv migrate sveltekit-3` (`sv` 1.1.x) |
| `@sveltejs/adapter-bun` | 1.0.x | Official; no TypeScript peer; set `precompress` explicitly |
| `@sveltejs/adapter-static` | 4.0.x | SPAs only; peers Kit `^3.0.0-next.0` |
| Svelte | 5.57.x | ≥5.57.1 (Kit 3 peer); runes stable since the Svelte 5 release (Oct 2024) |
| TypeScript | 6.0.x | Never below 6; Kit 3's `^6.0.0` peer is optional. `verbatimModuleSyntax` required (set by `$app/tsconfig`). TS 7 native compiler excluded — Svelte language tools not yet ready |
| Vite | 8.x | ≥8.0.12 (Kit 3 peer) |
| `@sveltejs/vite-plugin-svelte` | 7.x | `^7.0.0` (Kit 3 peer); requires Vite 8 |
| `sveltekit-superforms` | 3.0.x | Peers Kit 2.12+ and 3; 2.x is Kit ≤2 only; no Formsnap |
| UnoCSS (`unocss`, `@unocss/vite`, `@unocss/preset-wind3`) | 66.x | Global mode; `extractorSvelte` for `class:` directives |
| `unocss-preset-shadcn` | 1.0.1 | Use `unocss-preset-shadcn/v3` (presetWind3); package default is presetWind4 (oklch/transformer issues) |
| `unocss-preset-animations` | current | Replaces `tailwindcss-animate` |
| shadcn-svelte (CLI) | latest | Runes-native; on bits-ui; no `init` with UnoCSS |
| Biome (`@biomejs/biome`) | 2.5.x | `.svelte` support experimental (opt-in flag); JS/TS/JSON/CSS stable |
| Vitest | 4.x | Browser Mode via Playwright; separate component and server projects |
| `vitest-browser-svelte` | 3.x | Requires Vitest 4+ |
| svelte-check | 4.5.x | Type-checker for `.svelte` |
| Node (toolchain floor) | 22.17+ | Kit 3 engines and the `sv` codemod; runs dev, Vitest and Playwright (the Node on `PATH`); production builds and serves on Bun |

- **Research date:** October 4, 2026
