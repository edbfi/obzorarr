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

test("/healthz answers ok", async ({ request }) => {
	const response = await request.get("/healthz");
	expect(response.status()).toBe(200);
	expect(await response.text()).toBe("ok");
});
