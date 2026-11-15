import type { sveltekit } from "@sveltejs/kit/vite";
import { describe, expect, it } from "vitest";
import { kit } from "./vite.config.ts";

/** The options as SvelteKit reads them, every setting `kit` leaves out included. */
const options: Parameters<typeof sveltekit>[0] = kit;

// The cross-origin check in `handle` replaces SvelteKit's own form check, which compares
// `Origin` with an `event.url` adapter-bun builds as https (SPEC-setup.md, "The cross-origin
// check"). With the form check off and remote functions off, SvelteKit's only remaining check
// before `handle` is the remote-function one, which nothing uses.
describe("SvelteKit's options", () => {
	it("trust every origin, so SvelteKit's own form check is off", () => {
		expect(options.csrf?.trustedOrigins).toEqual(["*"]);
	});

	it("leave remote functions off", () => {
		expect(options.experimental?.remoteFunctions ?? false).toBe(false);
	});
});
