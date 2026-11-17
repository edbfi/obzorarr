import type { Page } from "@playwright/test";
import { expect, test } from "./fixture.ts";

// The one-task pages outside the admin shell (`PanelPage.svelte`) start with a skip link to their
// main content, shown only while it has focus. The sign-in page stands for all of them; it runs on
// the shared, claimed server.

/** Tabs once from the top of the page, then follows the skip link with Enter. */
async function skip(page: Page, name: string) {
	await page.keyboard.press("Tab");
	const link = page.getByRole("link", { name });
	await expect(link).toBeFocused();
	await expect(link).toBeVisible();
	await page.keyboard.press("Enter");
	// Focus lands on the main content, so the next Tab reaches its first field.
	await expect(page.getByRole("main")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.locator("#username")).toBeFocused();
}

test("the first Tab shows the skip link, and following it moves focus into the main content", async ({
	page,
}) => {
	await page.goto("/admin/sign-in");
	await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
	const link = page.getByRole("link", { name: "Skip to main content" });
	// Hidden until it has focus: in the page for the keyboard, but taking no room.
	expect(
		await link.evaluate((element) => element.getBoundingClientRect().width),
	).toBeLessThanOrEqual(1);
	await skip(page, "Skip to main content");
});

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("the skip link works the same", async ({ page }) => {
		await page.goto("/admin/sign-in");
		await skip(page, "Skip to main content");
	});
});

test.describe("in Danish", () => {
	test.use({ locale: "da-DK" });

	test("the skip link is named in Danish", async ({ page }) => {
		await page.goto("/admin/sign-in");
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		await skip(page, "Gå til hovedindholdet");
	});
});
