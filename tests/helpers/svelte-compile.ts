import type { BunPlugin } from 'bun';
import { compile, compileModule } from 'svelte/compiler';

/**
 * Compiles `.svelte` components and `.svelte.{js,ts}` rune modules for component
 * tests. `bun test` has no Svelte transform of its own, so a test registers this
 * plugin (`Bun.plugin(...)`) before importing components for a server render, or
 * passes it to `Bun.build` to bundle a client build with the browser condition.
 *
 * Rune modules are compiled only inside node_modules (bits-ui and its helpers ship
 * `.svelte.js` files). A runtime `Bun.plugin` applies to every later import in the
 * test process, and app modules such as `src/lib/stores/*.svelte.ts` are loaded raw
 * by other tests with their own `$state` shim.
 */
export function svelteCompilerPlugin(generate: 'server' | 'client'): BunPlugin {
	const transpiler = new Bun.Transpiler({ loader: 'ts' });

	return {
		name: `obzorarr-test-svelte-${generate}`,
		setup(build) {
			build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
				const source = await Bun.file(path).text();
				const { js } = compile(source, { filename: path, generate, css: 'external', dev: false });
				return { contents: js.code, loader: 'js' };
			});

			build.onLoad({ filter: /\/node_modules\/.*\.svelte\.(js|ts)$/ }, async ({ path }) => {
				const raw = await Bun.file(path).text();
				const source = path.endsWith('.ts') ? transpiler.transformSync(raw) : raw;
				const { js } = compileModule(source, { filename: path, generate, dev: false });
				return { contents: js.code, loader: 'js' };
			});
		}
	};
}

const RUNE_GLOBALS = ['$state', '$effect', '$derived', '$inspect', '$props', '$bindable'];

/**
 * Svelte's client entry (`svelte/src/index-client.js`) defines throwing getters for
 * the rune names on `globalThis` when esm-env reports a development build, which it
 * does under `NODE_ENV=test`. It loads during a server render too, through
 * `svelte/attachments` (bits-ui -> svelte-toolbelt). Take a snapshot before loading
 * components and call the returned function in `afterAll`, so later test files that
 * shim `$state` themselves (tests/unit/sync/status.test.ts) see a clean global scope.
 */
export function snapshotRuneGlobals(): () => void {
	const before = new Set(RUNE_GLOBALS.filter((rune) => rune in globalThis));
	return () => {
		for (const rune of RUNE_GLOBALS) {
			if (!before.has(rune)) delete (globalThis as Record<string, unknown>)[rune];
		}
	};
}
