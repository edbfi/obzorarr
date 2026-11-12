import { expect, test } from "@playwright/test";

test("/ serves the placeholder page, hydrated and styled, without console errors", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));

	const response = await page.goto("/");
	expect(response?.status()).toBe(200);

	const heading = page.getByRole("heading", { level: 1, name: "Your year in stories." });
	await expect(heading).toBeVisible();
	// Set by the root layout once the client has hydrated: server HTML alone doesn't pass.
	await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
	// Panda tokens: the dark-mode background and the display text style.
	await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 24, 40)");
	await expect(heading).toHaveCSS("font-size", "56px");

	expect(errors).toEqual([]);
});

test("the bundled fonts load under the names Panda's font tokens give them", async ({ page }) => {
	await page.goto("/");
	// Each token's first family, loaded alone: `load()` returns its bundled faces, and none for a
	// name the bundled CSS doesn't register, where `document.fonts.check()` would pass it. Loading
	// the whole stack could match a bundled fallback instead (docs/SPEC.md, "Testing strategy").
	const faces = await page.evaluate(async () => {
		const root = getComputedStyle(document.documentElement);
		const counts: Record<string, number> = {};
		for (const name of ["display", "body", "mono"]) {
			const family = root.getPropertyValue(`--fonts-${name}`).split(",")[0]?.trim() ?? "";
			counts[name] = (await document.fonts.load(`16px ${family}`)).length;
		}
		return counts;
	});
	expect(faces.display).toBeGreaterThan(0);
	expect(faces.body).toBeGreaterThan(0);
	expect(faces.mono).toBeGreaterThan(0);
});

test("/healthz answers ok", async ({ request }) => {
	const response = await request.get("/healthz");
	expect(response.status()).toBe(200);
	expect(await response.text()).toBe("ok");
});
