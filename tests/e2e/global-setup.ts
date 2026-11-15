import { chromium, type FullConfig } from "@playwright/test";

/**
 * Claims the web server's fresh instance through the form in a browser, with the token its
 * `wait.stdout` pattern captured, so the smoke and language tests run on a claimed instance
 * (docs/SPEC.md, "Testing strategy").
 */
export default async function globalSetup(config: FullConfig) {
	const baseURL = config.projects[0]?.use.baseURL;
	const token = process.env.OBZORARR_E2E_SETUP_TOKEN;
	if (baseURL === undefined || token === undefined) {
		throw new Error("the global setup needs the base URL and the token the web server printed");
	}
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ baseURL });
		await page.goto("/setup");
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		await page.locator("#token").fill(token);
		await page.locator("#username").fill("owner");
		await page.locator("#password").fill("violet harbour lanterns");
		await page.getByRole("button", { name: "Claim and create owner" }).click();
		await page.waitForURL(`${baseURL}/`);
	} finally {
		await browser.close();
	}
}
