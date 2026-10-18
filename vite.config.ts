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
		}),
		// Static css() calls become class strings at build time, so no styling runtime ships.
		pandacss({ transform: true }),
	],
	// The dev server serves the generated Panda runtime.
	server: { fs: { allow: ["styled-system"] } },
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		expect: { requireAssertions: true },
	},
});
