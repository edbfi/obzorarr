import { expect, type Page, test } from "@playwright/test";

// Each request gets the viewer's language, the browser keeps it, and the switcher changes it
// (SPEC-i18n.md, "Choosing the language" and "The language switcher"). Runs against the built
// adapter-bun server, like the smoke test.

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

	test("switches to English, keeps it in the cookie, and stays in English", async ({
		page,
		context,
	}) => {
		const errors = consoleErrors(page);
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");

		const switcher = page.getByRole("group", { name: "Sprog" });
		await expect(switcher.getByRole("button", { name: "Dansk" })).toHaveAttribute(
			"aria-current",
			"true",
		);
		await expect(switcher.getByRole("button", { name: "Dansk" })).toHaveAttribute("lang", "da");
		await expect(switcher.getByRole("button", { name: "English" })).not.toHaveAttribute(
			"aria-current",
		);
		await switcher.getByRole("button", { name: "English" }).click();

		// Only the server writes <html lang>, so it changes only when the page has reloaded.
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
		await expect(
			page.getByRole("heading", { level: 1, name: "Your year in stories." }),
		).toBeVisible();
		await expect(
			page.getByRole("group", { name: "Language" }).getByRole("button", { name: "English" }),
		).toHaveAttribute("aria-current", "true");

		const cookies = await context.cookies();
		expect(cookies).toHaveLength(1);
		expect(cookies[0]).toMatchObject({
			name: "PARAGLIDE_LOCALE",
			value: "en",
			path: "/",
			sameSite: "Lax",
			secure: false,
		});

		// The next visit, from the same Danish browser, stays in English.
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(
			page.getByRole("heading", { level: 1, name: "Your year in stories." }),
		).toBeVisible();

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

		// After hydration the switcher still marks the server's choice, not the browser's.
		const english = page
			.getByRole("group", { name: "Language" })
			.getByRole("button", { name: "English" });
		await expect(english).toHaveAttribute("aria-current", "true");

		// Pressing the current language does nothing: no reload and no cookie.
		await page.evaluate(() => {
			(window as Window & { samePage?: boolean }).samePage = true;
		});
		await english.click();
		expect(await page.evaluate(() => (window as Window & { samePage?: boolean }).samePage)).toBe(
			true,
		);
		expect(await context.cookies()).toEqual([]);

		expect(errors).toEqual([]);
	});
});
