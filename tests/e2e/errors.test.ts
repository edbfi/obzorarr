import { expect, type Page, test } from "@playwright/test";

/**
 * Collects console errors and CSP violations, which no error page may cause. Chromium also
 * reports the error status of the document itself, which is the point of the page, so only
 * that one report is left out; a failed script, style or font still counts.
 */
async function watchForProblems(page: Page): Promise<string[]> {
	const problems: string[] = [];
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		const forDocument = message.location().url === page.url();
		if (forDocument && message.text().startsWith("Failed to load resource")) return;
		problems.push(message.text());
	});
	page.on("pageerror", (error) => problems.push(error.message));
	await page.addInitScript(() => {
		document.addEventListener("securitypolicyviolation", (event) => {
			console.error(`CSP violation: ${event.violatedDirective}`);
		});
	});
	return problems;
}

test.describe("the error page", () => {
	for (const [locale, title, description] of [
		["en-GB", "Page not found", "This page doesn't exist, or it has moved."],
		["da-DK", "Siden blev ikke fundet", "Siden findes ikke, eller den er flyttet."],
	] as const) {
		test(`an unknown page is "${title}" without its number, styled and hydrated (${locale})`, async ({
			browser,
		}) => {
			const context = await browser.newContext({ locale });
			try {
				const page = await context.newPage();
				const problems = await watchForProblems(page);
				const response = await page.goto("/no-such-page");
				expect(response?.status()).toBe(404);
				await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
				await expect(page).toHaveTitle(title);
				await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
				await expect(page.getByText(description)).toBeVisible();
				await expect(page.locator("main")).not.toContainText("404");
				await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 24, 40)");
				// Home is a link; Go back needs script, so it is a button once the page has it.
				await expect(page.locator('main a[href="/"]')).toBeVisible();
				await expect(page.locator("main button")).toBeVisible();
				expect(problems).toEqual([]);
			} finally {
				await context.close();
			}
		});
	}

	test("Go back returns to the page before", async ({ page }) => {
		await page.goto("/");
		await page.goto("/no-such-page");
		await page.locator("main button").click();
		await expect(page).toHaveURL(/\/$/);
	});
});

test.describe("the pages handle builds itself", () => {
	test("Access denied shows the tokens' colours, with no console error or CSP violation", async ({
		page,
		baseURL,
	}) => {
		const target = `${baseURL}/`;
		const problems = await watchForProblems(page);
		await page.route("http://evil.test/", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: `<form method="post" action="${target}"><input name="a" value="1"></form>
					<script>document.forms[0].submit()</script>`,
			}),
		);
		const answer = page.waitForResponse((response) => response.url() === target);
		await page.goto("http://evil.test/");
		expect((await answer).status()).toBe(403);
		const heading = page.getByRole("heading", { level: 1 });
		await expect(heading).toHaveText("Access denied");
		// The tokens' values, inline: the page loads no stylesheet.
		await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 24, 40)");
		await expect(heading).toHaveCSS("color", "rgb(242, 248, 255)");
		await expect(page.locator("main")).toHaveCSS("background-color", "rgb(20, 45, 69)");
		await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
		expect(problems).toEqual([]);
	});
});
