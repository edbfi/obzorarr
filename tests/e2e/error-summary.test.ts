import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixture.ts";
import { type Server, startServer } from "./server.ts";

// A failed submit on the pages shown before sign-in (D29): the "Error: " title, the error summary
// first in the form, focused only by the enhanced form after a failure, and nothing focused without
// JavaScript or by a late script. The sign-in page runs on the shared, claimed server; the claim on
// fresh servers of its own. Recovery's are in recovery.test.ts.

const summaryOf = (page: Page) => page.getByRole("region", { name: "There is a problem" });

/** Whatever has focus, as its id, or `body` when nothing does. */
const focused = (page: Page) =>
	page.evaluate(() =>
		document.activeElement === document.body ? "body" : (document.activeElement?.id ?? "?"),
	);

async function signInWrong(page: Page) {
	await page.locator("#username").fill("owner");
	await page.locator("#password").fill("not the right password");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("sign-in: a first visit has no summary and focuses nothing; a refusal titles the page and lists it", async ({
		page,
	}) => {
		await page.goto("/admin/sign-in");
		await expect(page).toHaveTitle("Sign in");
		await expect(summaryOf(page)).toHaveCount(0);
		await expect(page.locator("[autofocus]")).toHaveCount(0);

		await signInWrong(page);
		await expect(page).toHaveTitle("Error: Sign in");
		const summary = summaryOf(page);
		await expect(summary).toBeVisible();
		await expect(summary.getByRole("listitem")).toHaveText(["Username or password is wrong."]);
		// A page-level problem is text, not a link, and marks no field.
		await expect(summary.getByRole("link")).toHaveCount(0);
		await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);
		await expect(page.locator("[autofocus]")).toHaveCount(0);
		expect(await focused(page)).toBe("body");
	});

	test.describe("the claim", () => {
		let root: string;
		let server: Server;

		test.beforeEach(async () => {
			root = await mkdtemp(join(tmpdir(), "obzorarr-e2e-summary-"));
			server = await startServer(root, { OBZORARR_DATABASE_PATH: join(root, "obzorarr.db") });
		});

		test.afterEach(async () => {
			await server.stop();
			await rm(root, { recursive: true, force: true });
		});

		test("lists each field's problem in order as a link, and Tab then Enter reaches the field", async ({
			page,
		}) => {
			await page.goto(`${server.url}/setup`);
			await expect(page).toHaveTitle("Claim this Obzorarr");
			await expect(summaryOf(page)).toHaveCount(0);
			await expect(page.locator("[autofocus]")).toHaveCount(0);

			// An empty username and a short password: field problems, checked before the token.
			await page.locator("#token").fill("aaaa-bbbb-cccc");
			await page.locator("#password").fill("short");
			await page.getByRole("button", { name: "Claim and create owner" }).click();

			await expect(page).toHaveTitle("Error: Claim this Obzorarr");
			const links = summaryOf(page).getByRole("link");
			await expect(links).toHaveText(["Enter a username.", "Use at least 15 characters."]);
			expect(
				await links.evaluateAll((all) => all.map((link) => link.getAttribute("href"))),
			).toEqual(["#username", "#password"]);
			await expect(page.locator("#username")).toHaveAttribute("aria-invalid", "true");
			await expect(page.locator("[autofocus]")).toHaveCount(0);
			expect(await focused(page)).toBe("body");

			// The keyboard reaches the first link, and following it puts focus in its field.
			for (
				let i = 0;
				i < 10 && !(await links.first().evaluate((link) => link === document.activeElement));
				i++
			) {
				await page.keyboard.press("Tab");
			}
			await expect(links.first()).toBeFocused();
			await page.keyboard.press("Enter");
			await expect(page.locator("#username")).toBeFocused();
		});
	});
});

test.describe("with JavaScript", () => {
	let root: string;
	let server: Server;

	test.beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "obzorarr-e2e-summary-"));
		server = await startServer(root, { OBZORARR_DATABASE_PATH: join(root, "obzorarr.db") });
	});

	test.afterEach(async () => {
		await server.stop();
		await rm(root, { recursive: true, force: true });
	});

	test("the claim focuses the summary after a failure and an identical repeat, and a link reaches its field", async ({
		page,
	}) => {
		await page.goto(`${server.url}/setup`);
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		expect(await focused(page)).toBe("body");

		const claimShort = async () => {
			await page.locator("#token").fill("aaaa-bbbb-cccc");
			await page.locator("#username").fill("Owner");
			await page.locator("#password").fill("short");
			await page.getByRole("button", { name: "Claim and create owner" }).click();
		};
		await claimShort();
		const summary = summaryOf(page);
		await expect(summary).toBeFocused();
		await expect(page).toHaveTitle("Error: Claim this Obzorarr");
		await expect(summary.getByRole("link")).toHaveText(["Use at least 15 characters."]);
		// The field keeps its message and helper as its description.
		await expect(page.locator("#password")).toHaveAttribute("aria-invalid", "true");
		await expect(page.locator("#password")).toHaveAccessibleDescription(
			"Use at least 15 characters.",
		);

		// Focus announces the heading, with the problems as the summary's description.
		await expect(summary).toHaveAccessibleDescription("Use at least 15 characters.");

		// While the next claim is sent, the summary and title stay as they are, so the button just
		// pressed doesn't move; the answer then focuses the summary again.
		// `held` resolves with the release once the route handler holds the claim.
		let holding = (_release: () => void) => {};
		const held = new Promise<() => void>((resolve) => {
			holding = resolve;
		});
		await page.route(`${server.url}/setup`, async (route) => {
			if (route.request().method() === "POST") {
				await new Promise<void>((resolve) => holding(resolve));
			}
			await route.continue();
		});
		await claimShort();
		const answer = await held;
		await expect(page.getByRole("button", { name: "Claiming…" })).toBeDisabled();
		await expect(summary).toBeVisible();
		await expect(page).toHaveTitle("Error: Claim this Obzorarr");
		answer();
		await expect(page.getByRole("button", { name: "Claim and create owner" })).toBeEnabled();
		await expect(summary).toBeFocused();

		await summary.getByRole("link").click();
		await expect(page.locator("#password")).toBeFocused();
	});

	test("editing a field clears its own message, but the summary and title keep the last answer", async ({
		page,
	}) => {
		await page.goto(`${server.url}/setup`);
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		await page.locator("#token").fill("aaaa-bbbb-cccc");
		await page.locator("#password").fill("short");
		await page.getByRole("button", { name: "Claim and create owner" }).click();
		const summary = summaryOf(page);
		await expect(summary).toBeFocused();
		const top = await page.locator("#username").boundingBox();
		expect(top).not.toBeNull();

		// Fixing both fields leaves the summary where it is, so nothing moves under the caret.
		await page.locator("#username").fill("Owner");
		await page.locator("#password").fill("violet harbour lanterns");
		await expect(page.locator("#username-error")).toHaveCount(0);
		await expect(page.locator("#password")).not.toHaveAttribute("aria-invalid", "true");
		await expect(summary.getByRole("link")).toHaveText([
			"Enter a username.",
			"Use at least 15 characters.",
		]);
		await expect(page).toHaveTitle("Error: Claim this Obzorarr");
		expect((await page.locator("#username").boundingBox())?.y).toBe(top?.y);
	});

	test("a server failure is listed as text and marks no field", async ({ page }) => {
		// The claim's own failure can't be caused from outside, so the answer is the one it gives.
		await page.route(`${server.url}/setup`, (route) =>
			route.request().method() === "POST"
				? route.fulfill({
						contentType: "application/json",
						body: JSON.stringify({
							type: "failure",
							status: 500,
							data: JSON.stringify([{ failed: 1 }, true]),
						}),
					})
				: route.continue(),
		);
		await page.goto(`${server.url}/setup`);
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		await page.locator("#token").fill("aaaa-bbbb-cccc");
		await page.locator("#username").fill("Owner");
		await page.locator("#password").fill("violet harbour lanterns");
		await page.getByRole("button", { name: "Claim and create owner" }).click();
		const summary = summaryOf(page);
		await expect(summary).toBeFocused();
		await expect(summary.getByRole("listitem")).toHaveText([/^Obzorarr couldn't create the owner/]);
		await expect(summary.getByRole("link")).toHaveCount(0);
		await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);
	});

	for (const width of [360, 180]) {
		test(`in Danish at ${width}px (${width === 180 ? "360px at 200% zoom" : "a phone"}), the summary fits`, async ({
			browser,
		}) => {
			const context = await browser.newContext({
				locale: "da-DK",
				viewport: { width, height: 800 },
			});
			try {
				const page = await context.newPage();
				await page.goto(`${server.url}/setup`);
				await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
				await page.locator("#token").fill("aaaa-bbbb-cccc");
				await page.locator("#password").fill("short");
				await page.getByRole("button", { name: "Tag i brug og opret ejer" }).click();
				const summary = page.getByRole("region", { name: "Der er et problem" });
				await expect(summary).toBeFocused();
				await expect(page).toHaveTitle("Fejl: Tag Obzorarr i brug");
				await expect(summary.getByRole("link")).toHaveCount(2);
				const overflow = () =>
					page.evaluate(
						() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
					);
				expect(await overflow()).toBe(0);

				// The token's refusal starts with a long word, "Opsætningskoden", that must wrap too.
				await page.locator("#token").fill("aaaa-bbbb-cccc");
				await page.locator("#username").fill("Ejer");
				await page.locator("#password").fill("violet harbour lanterns");
				await page.getByRole("button", { name: "Tag i brug og opret ejer" }).click();
				await expect(summary.getByRole("link")).toHaveText([/^Opsætningskoden/]);
				// The field shows the same words below itself, so both must fit.
				await expect(page.locator("#token-error")).toBeVisible();
				expect(await overflow()).toBe(0);
			} finally {
				await context.close();
			}
		});
	}
});

test("a late script: a submit before hydration posts natively, and hydration takes no focus", async ({
	page,
}) => {
	let release = () => {};
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	// Only the scripts are held back: the page and its styles arrive as usual.
	await page.route("**/_app/immutable/**/*.js", async (route) => {
		await released;
		await route.continue();
	});
	await page.goto("/admin/sign-in", { waitUntil: "commit" });
	await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
	await signInWrong(page);
	// The browser posted the form itself and shows the server's answer.
	await expect(page).toHaveTitle("Error: Sign in");
	await expect(summaryOf(page).getByRole("listitem")).toHaveText([
		"Username or password is wrong.",
	]);

	release();
	await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
	expect(await focused(page)).toBe("body");
	await expect(page.locator("[autofocus]")).toHaveCount(0);
});
