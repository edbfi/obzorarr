import { paraglideVitePlugin } from "@inlang/paraglide-js";
import pandacss from "@pandacss/vite";
import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes mode for the app's own components; libraries keep their own mode.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
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
		}),
		// Static css() calls become class strings at build time, so no styling runtime ships.
		pandacss({ transform: true }),
		paraglideVitePlugin({ project: "./project.inlang" }),
	],
	// The dev server serves the generated Panda runtime.
	server: { fs: { allow: ["styled-system"] } },
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		expect: { requireAssertions: true },
	},
});
