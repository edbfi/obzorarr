import { paraglideVitePlugin } from "@inlang/paraglide-js";
import pandacss from "@pandacss/vite";
import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

/**
 * SvelteKit's options, all of its configuration. Exported so vite.config.test.ts can check that
 * SvelteKit's own form check and remote functions stay off.
 */
export const kit = {
	compilerOptions: {
		// Runes mode for the app's own components; libraries keep their own mode.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes("node_modules") ? undefined : true),
	},
	adapter: adapter(),
	// A nonce on the app's own scripts, on every page; no page is prerendered, so each
	// gets its own (SPEC-setup.md, "Security headers and CSP"). `style-src` keeps
	// 'unsafe-inline' for style attributes, which SvelteKit then leaves without a nonce.
	csp: {
		mode: "nonce",
		directives: {
			"default-src": ["self"],
			"script-src": ["self"],
			"style-src": ["self", "unsafe-inline"],
			"img-src": ["self", "data:"],
			"font-src": ["self"],
			"connect-src": ["self"],
			"frame-ancestors": ["none"],
			"frame-src": ["none"],
			"object-src": ["none"],
			"base-uri": ["self"],
			"form-action": ["self"],
		},
	},
	// SvelteKit's form check compares `Origin` with an `event.url` adapter-bun builds as https,
	// so it would refuse a form over plain HTTP; the cross-origin check in `handle` replaces it.
	// Remote functions stay off (SPEC-setup.md, "The cross-origin check").
	csrf: { trustedOrigins: ["*"] },
} satisfies Parameters<typeof sveltekit>[0];

/**
 * The version the shell shows: `OBZORARR_VERSION` when the image is built, such as `0.2.0` or
 * `nightly-1a2b3c4`, and `dev` otherwise. It is fixed at build time and never read at runtime
 * (SPEC-sign-in.md, "Configuration").
 */
export function appVersion(env: Record<string, string | undefined>): string {
	return env.OBZORARR_VERSION?.trim() || "dev";
}

export default defineConfig({
	// The version, as a constant the build writes into the code.
	define: { __OBZORARR_VERSION__: JSON.stringify(appVersion(process.env)) },
	plugins: [
		sveltekit(kit),
		// Static css() calls become class strings at build time, so no styling runtime ships.
		pandacss({ transform: true }),
		paraglideVitePlugin({ project: "./project.inlang" }),
	],
	// The dev server serves the generated Panda runtime.
	server: { fs: { allow: ["styled-system"] } },
	test: {
		environment: "node",
		// Vitest empties every CSS import unless told otherwise; the refusal pages read Panda's
		// generated token declarations as text.
		css: { include: [/styled-system\/styles\/tokens\.css/] },
		include: ["src/**/*.test.ts", "vite.config.test.ts"],
		expect: { requireAssertions: true },
	},
});
