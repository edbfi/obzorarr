import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

/** A counter for this worker's addresses. */
let issued = 0;

/**
 * A new client address for a test in `workerIndex`, unique across the run's workers. The shared
 * server runs with `ADDRESS_HEADER=x-forwarded-for`, so each test's requests count under its own
 * address, and no test's requests count against another's (SPEC-sign-in.md, "Rate limits and
 * failed sign-ins").
 */
function nextAddress(workerIndex: number): string {
	issued++;
	return `10.${workerIndex % 250}.${(issued >> 8) & 255}.${issued & 255}`;
}

/**
 * Playwright's `test`, with `clientHeaders`, the header that carries the test's own address, sent
 * on every request of the test's `page` and `request`. A test that opens a context of its own
 * passes `clientHeaders` as its `extraHTTPHeaders`.
 */
export const test = base.extend<{ clientHeaders: Record<string, string> }>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's needs from this pattern.
	clientHeaders: async ({}, use, testInfo) => {
		await use({ "x-forwarded-for": nextAddress(testInfo.workerIndex) });
	},
	extraHTTPHeaders: async ({ clientHeaders }, use) => {
		await use(clientHeaders);
	},
});
