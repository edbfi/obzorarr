import { expect, type Page, test } from "@playwright/test";

// Each request gets the viewer's language, and the browser keeps it (SPEC-i18n.md, "Choosing the
// language"). Runs against the built adapter-bun server, like the smoke test.

/** Collects the page's console errors and uncaught exceptions. */
function consoleErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	return errors;
}

test.describe("a Danish browser", () => {
	test.use({ locale: "da-DK" });

	test("gets / in Danish, with <html lang> and Vary", async ({ page }) => {
		const errors = consoleErrors(page);

		const response = await page.goto("/");
		expect(response?.status()).toBe(200);
		expect(response?.headers().vary).toBe("Cookie, Accept-Language");

		await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
		await expect(page.locator("html")).toHaveAttribute("lang", "da");
		await expect(
			page.getByRole("heading", { level: 1, name: "Dit år i historier." }),
		).toBeVisible();
		await expect(page.getByText("Login med Plex bliver bygget om.")).toBeVisible();

		expect(errors).toEqual([]);
	});
});

test.describe("a browser whose header and navigator.languages disagree", () => {
	// Playwright's `locale` sets both the header and `navigator.languages`; only the init script can
	// split them, so the browser alone would choose Danish.
	test.use({ locale: "fr-FR" });

	test("gets English, and the browser writes no cookie", async ({ page, context }) => {
		await page.addInitScript(() => {
			Object.defineProperty(Navigator.prototype, "languages", { get: () => ["fr-FR", "da-DK"] });
		});
		const errors = consoleErrors(page);

		const response = await page.goto("/");
		expect(response?.status()).toBe(200);
		expect(await page.evaluate(() => navigator.languages)).toEqual(["fr-FR", "da-DK"]);

		await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(
			page.getByRole("heading", { level: 1, name: "Your year in stories." }),
		).toBeVisible();
		expect(await context.cookies()).toEqual([]);

		expect(errors).toEqual([]);
	});
});
