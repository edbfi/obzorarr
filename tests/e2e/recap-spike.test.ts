import { expect, type Locator, type Page, test } from "@playwright/test";
import fixtures from "../fixtures/demo-fixtures.json" with { type: "json" };

// The recap spike's story against the built server (SPEC-recap-spike.md, "Story mode" and
// "Testing strategy"). The spike is temporary: the verdict PR deletes this file with it.

const PATH = "/spike/recap";
const { monthlyHours } = fixtures.obzorarr;

/** Collects the page's console errors and uncaught exceptions. */
function consoleErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	return errors;
}

/** Opens the spike and waits until it has hydrated, so its keys and pointers are live. */
async function open(page: Page) {
	const response = await page.goto(PATH);
	await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
	return response;
}

/**
 * Waits out the `story` duration, read from Panda's token in the page, so the throttle never drops
 * a move the test means.
 */
async function settle(page: Page) {
	// Chromium serializes the variable in its own unit ("320ms" comes back as ".32s").
	const time = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--durations-story").trim(),
	);
	const [, value = "", unit] = /^([\d.]+)(ms|s)$/.exec(time) ?? [];
	const ms = Number.parseFloat(value) * (unit === "s" ? 1000 : 1);
	expect(ms).toBeGreaterThan(0);
	await page.waitForTimeout(ms + 80);
}

/** The step showing now, by its name ("2 of 3"). */
const step = (page: Page, name: string) => page.getByRole("group", { name, exact: true });

/** The step's heading. */
const stepHeading = (page: Page, name: string) =>
	step(page, name).getByRole("heading", { level: 2 });

async function expectStep(page: Page, name: string) {
	await expect(step(page, name)).toBeVisible();
	await expect(page.getByRole("group")).toHaveCount(1);
}

/** Presses `key`, then waits out the throttle. */
async function pressKey(page: Page, key: string) {
	await page.keyboard.press(key);
	await settle(page);
}

const previous = (page: Page) => page.getByRole("button", { name: "Previous slide" });
const next = (page: Page) => page.getByRole("button", { name: "Next slide" });

/** The current step's box: taps and drags happen inside it. */
async function box(locator: Locator) {
	const found = await locator.boundingBox();
	if (!found) throw new Error("the step has no box");
	return found;
}

test("answers in English as a carousel of three named slides, the first one showing", async ({
	page,
}) => {
	const errors = consoleErrors(page);
	const response = await open(page);
	expect(response?.status()).toBe(200);

	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page).toHaveTitle("Your 2025 story · Obzorarr");
	await expect(page.getByRole("heading", { level: 1, name: "Your 2025 story" })).toBeVisible();

	const story = page.getByRole("region", { name: "Your 2025 story" });
	await expect(story).toHaveAttribute("aria-roledescription", "carousel");
	await expectStep(page, "1 of 3");
	await expect(step(page, "1 of 3")).toHaveAttribute("aria-roledescription", "slide");
	await expect(stepHeading(page, "1 of 3")).toHaveText(
		"842 hours of everything you played in 2025",
	);
	await expect(step(page, "1 of 3").getByText("Movie Buff", { exact: true })).toBeVisible();
	await expect(page.getByText("Tap to continue")).toBeVisible();
	await expect(page.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/");

	expect(errors).toEqual([]);
});

/** The monthly step's list, named by the step's heading. */
const monthList = (page: Page, name: string) =>
	step(page, name).getByRole("list", {
		name: "Hours of everything you played in 2025, month by month",
	});

test("the monthly step lists the twelve months, each with its hours", async ({ page }) => {
	await open(page);
	await pressKey(page, "ArrowRight");
	const months = monthList(page, "2 of 3").getByRole("listitem");
	await expect(months).toHaveCount(12);
	await expect(months.nth(0)).toHaveText(/^Jan\s*42 hours$/);
	await expect(months.nth(4)).toHaveText(/^May\s*75 hours$/);
	await expect(months.nth(7)).toHaveText(/^Aug\s*96 hours$/);
});

test("the summary shows the figures, the badge, a disabled Share recap and Back to overview", async ({
	page,
}) => {
	const errors = consoleErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await open(page);
	await pressKey(page, "End");
	const summary = step(page, "3 of 3");
	for (const text of [
		"Your recap",
		"127 movies",
		"38 series",
		"Longest streak",
		"21 days",
		"Members only",
	]) {
		await expect(summary.getByText(text, { exact: true })).toBeVisible();
	}

	const share = summary.getByRole("button", { name: "Share recap" });
	await expect(share).toBeDisabled();
	// A press on Share recap, inside the step's left 15% at this width, is the button's: it never
	// goes back.
	await share.click({ force: true, position: { x: 4, y: 4 } });
	await settle(page);
	await expectStep(page, "3 of 3");

	await summary.getByRole("link", { name: "Back to overview" }).click();
	await expect(page).toHaveURL("/");
	expect(errors).toEqual([]);
});

test("a move from a step scrolled to its bottom leaves the page at the top", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 420 });
	await open(page);
	await pressKey(page, "ArrowRight");
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
	await pressKey(page, "ArrowRight");
	await expectStep(page, "3 of 3");
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test.describe("with reduced motion", () => {
	test.use({ contextOptions: { reducedMotion: "reduce" } });

	for (const width of [390, 1280]) {
		test(`at ${width} px, the next step shows its final state at once`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await open(page);
			await page.keyboard.press("ArrowRight");
			await expectStep(page, "2 of 3");
			// Read at once, without waiting out any motion: the bars at their final lengths, measured
			// along each bar's own axis (rows on a phone, columns from a tablet up), and nothing running.
			const { animations, shares } = await page.evaluate(() => ({
				animations: document.getAnimations().length,
				shares: Array.from(document.querySelectorAll<HTMLElement>("[data-bar]"), (bar) => {
					const track = bar.parentElement?.getBoundingClientRect();
					const own = bar.getBoundingClientRect();
					if (!track || track.width === 0 || track.height === 0) return 0;
					return track.width >= track.height ? own.width / track.width : own.height / track.height;
				}),
			}));
			expect(animations).toBe(0);
			const busiest = Math.max(...monthlyHours);
			expect(shares).toHaveLength(12);
			shares.forEach((share, month) => {
				expect(share, `month ${month + 1}`).toBeCloseTo((monthlyHours[month] ?? 0) / busiest, 2);
			});
		});
	}
});

test.describe("a Danish browser", () => {
	test.use({ locale: "da-DK" });

	test("gets the story in Danish", async ({ page }) => {
		const errors = consoleErrors(page);
		const response = await open(page);
		expect(response?.status()).toBe(200);

		await expect(page.locator("html")).toHaveAttribute("lang", "da");
		await expect(page).toHaveTitle("Din 2025-historie · Obzorarr");
		const story = page.getByRole("region", { name: "Din 2025-historie" });
		await expect(story).toHaveAttribute("aria-roledescription", "karrusel");
		await expect(step(page, "1 af 3")).toHaveAttribute("aria-roledescription", "dias");
		await expect(stepHeading(page, "1 af 3")).toHaveText(
			"842 timer af alt, hvad du har afspillet i 2025",
		);
		await expect(step(page, "1 af 3").getByText("Filmelsker", { exact: true })).toBeVisible();
		await expect(page.getByText("Tryk for at fortsætte")).toBeVisible();
		await expect(page.getByRole("link", { name: "Luk" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Næste dias" })).toBeVisible();

		await pressKey(page, "ArrowRight");
		const months = step(page, "2 af 3")
			.getByRole("list", { name: "Timer af alt, hvad du har afspillet i 2025, måned for måned" })
			.getByRole("listitem");
		await expect(months).toHaveCount(12);
		await expect(months.nth(4)).toHaveText(/^maj\s*75 timer$/);

		await pressKey(page, "End");
		await expect(stepHeading(page, "3 af 3")).toHaveText("Alex i 2025");
		await expect(page.getByText("Tryk for at fortsætte")).toHaveCount(0);
		const summary = step(page, "3 af 3");
		for (const text of ["127 film", "38 serier", "21 dage", "Kun for medlemmer"]) {
			await expect(summary.getByText(text, { exact: true })).toBeVisible();
		}
		await expect(summary.getByRole("button", { name: "Del tilbageblik" })).toBeDisabled();
		await expect(summary.getByRole("link", { name: "Tilbage til oversigten" })).toHaveAttribute(
			"href",
			"/",
		);

		expect(errors).toEqual([]);
	});

	test("wraps at 360 px without sideways scroll or hiding a control", async ({ page }) => {
		await expectFitsAt360(page, ["1 af 3", "2 af 3", "3 af 3"], {
			close: "Luk",
			previous: "Forrige dias",
			next: "Næste dias",
		});
	});
});

test("→, Space, Enter, ←, Home and End move the story one step at a time", async ({ page }) => {
	const errors = consoleErrors(page);
	await open(page);

	// The throttle: a second move within the `story` duration is ignored.
	await page.keyboard.press("ArrowRight");
	await pressKey(page, "ArrowRight");
	await expectStep(page, "2 of 3");
	await expect(stepHeading(page, "2 of 3")).toHaveText(
		"Hours of everything you played in 2025, month by month",
	);
	await expect(page.getByText("Tap to continue")).toHaveCount(0);
	await pressKey(page, "ArrowLeft");
	await expectStep(page, "1 of 3");
	await pressKey(page, "Space");
	await expectStep(page, "2 of 3");
	await pressKey(page, "Enter");
	await expectStep(page, "3 of 3");
	await expect(stepHeading(page, "3 of 3")).toHaveText("Alex’s 2025");
	// Nothing loops: past the summary there is nothing.
	await pressKey(page, "ArrowRight");
	await expectStep(page, "3 of 3");
	await pressKey(page, "Home");
	await expectStep(page, "1 of 3");
	await pressKey(page, "ArrowLeft");
	await expectStep(page, "1 of 3");
	await pressKey(page, "End");
	await expectStep(page, "3 of 3");

	expect(errors).toEqual([]);
});

test("keys held with a modifier are left to the browser", async ({ page }) => {
	await open(page);
	await pressKey(page, "Shift+ArrowRight");
	await pressKey(page, "Control+End");
	await expectStep(page, "1 of 3");
});

test("Next and Previous move one step, and do nothing at either end", async ({ page }) => {
	const errors = consoleErrors(page);
	await open(page);

	await expect(previous(page)).toHaveAttribute("aria-disabled", "true");
	// aria-disabled, not disabled, so focus never falls to the page; Playwright waits for an
	// aria-disabled control to be enabled, so the click is forced.
	await expect(previous(page)).not.toHaveAttribute("disabled");
	await previous(page).click({ force: true });
	await settle(page);
	await expectStep(page, "1 of 3");

	await next(page).click();
	await settle(page);
	await expectStep(page, "2 of 3");
	await expect(previous(page)).not.toHaveAttribute("aria-disabled");
	// A control in the bars keeps its focus on the steps before the summary.
	await expect(next(page)).toBeFocused();

	await previous(page).click();
	await settle(page);
	await expectStep(page, "1 of 3");
	await expect(previous(page)).toBeFocused();

	// Enter on the focused Next moves exactly one step.
	await next(page).focus();
	await pressKey(page, "Enter");
	await expectStep(page, "2 of 3");
	// Space on it too.
	await pressKey(page, "Space");
	await expectStep(page, "3 of 3");
	// Arriving at the summary moves focus to its heading, even from a control in the bars.
	await expect(stepHeading(page, "3 of 3")).toBeFocused();

	await expect(next(page)).toHaveAttribute("aria-disabled", "true");
	await next(page).click({ force: true });
	await settle(page);
	await expectStep(page, "3 of 3");
	await next(page).focus();
	await pressKey(page, "Enter");
	await pressKey(page, "Space");
	await expectStep(page, "3 of 3");
	await expect(next(page)).toBeFocused();

	expect(errors).toEqual([]);
});

test("a click in the left 15% goes back, elsewhere forward, and a drag moves", async ({ page }) => {
	const errors = consoleErrors(page);
	await open(page);

	let area = await box(step(page, "1 of 3"));
	const y = area.y + area.height / 2;
	await page.mouse.click(area.x + area.width * 0.5, y);
	await settle(page);
	await expectStep(page, "2 of 3");

	area = await box(step(page, "2 of 3"));
	await page.mouse.click(area.x + area.width * 0.1, y);
	await settle(page);
	await expectStep(page, "1 of 3");

	await page.mouse.click(area.x + area.width * 0.9, y);
	await settle(page);
	await expectStep(page, "2 of 3");

	// A drag leftward of more than 50 px goes forward, rightward goes back.
	const from = area.x + area.width * 0.6;
	await page.mouse.move(from, y);
	await page.mouse.down();
	await page.mouse.move(from - 120, y + 10, { steps: 6 });
	await page.mouse.up();
	await settle(page);
	await expectStep(page, "3 of 3");

	await page.mouse.move(from, y);
	await page.mouse.down();
	await page.mouse.move(from + 120, y - 10, { steps: 6 });
	await page.mouse.up();
	await settle(page);
	await expectStep(page, "2 of 3");

	// A short drag moves nothing.
	await page.mouse.move(from, y);
	await page.mouse.down();
	await page.mouse.move(from - 30, y, { steps: 3 });
	await page.mouse.up();
	await settle(page);
	await expectStep(page, "2 of 3");

	expect(errors).toEqual([]);
});

for (const width of [1280, 1920]) {
	test(`at ${width} px, the back zone is the step's left 15%, not the page's`, async ({ page }) => {
		await page.setViewportSize({ width, height: 800 });
		await open(page);
		await pressKey(page, "ArrowRight");
		const area = await box(step(page, "2 of 3"));
		const y = area.y + area.height / 2;
		await page.mouse.click(area.x + area.width * 0.14, y);
		await settle(page);
		await expectStep(page, "1 of 3");
		await page.mouse.click(area.x + area.width * 0.16, y);
		await settle(page);
		await expectStep(page, "2 of 3");
	});
}

test("focus lands on the summary's heading, and ← takes it into step 2", async ({ page }) => {
	await open(page);
	await pressKey(page, "End");
	await expect(stepHeading(page, "3 of 3")).toBeFocused();
	await pressKey(page, "ArrowLeft");
	await expectStep(page, "2 of 3");
	await expect(stepHeading(page, "2 of 3")).toBeFocused();
});

test("Close goes to /", async ({ page }) => {
	await open(page);
	await page.getByRole("link", { name: "Close" }).click();
	await expect(page).toHaveURL("/");
});

test("Enter on a focused Close follows the link instead of moving", async ({ page }) => {
	await open(page);
	await page.getByRole("link", { name: "Close" }).focus();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL("/");
});

test("Escape goes to /", async ({ page }) => {
	await open(page);
	await pressKey(page, "ArrowRight");
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL("/");
});

/**
 * At 360 px, each step wraps without scrolling sideways, and Close, Previous and Next stay in
 * view: at the top of the step and scrolled to its bottom.
 */
async function expectFitsAt360(
	page: Page,
	steps: string[],
	names: { close: string; previous: string; next: string },
) {
	const errors = consoleErrors(page);
	await page.setViewportSize({ width: 360, height: 740 });
	await open(page);
	for (const name of steps) {
		await expectStep(page, name);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(overflow, `${name} scrolls sideways`).toBe(0);
		for (const end of ["top", "bottom"]) {
			await page.evaluate(
				(top) => window.scrollTo(0, top ? 0 : document.documentElement.scrollHeight),
				end === "top",
			);
			for (const control of [
				page.getByRole("link", { name: names.close }),
				page.getByRole("button", { name: names.previous }),
				page.getByRole("button", { name: names.next }),
			]) {
				await expect(control, `${control} at the ${end} of ${name}`).toBeInViewport();
			}
		}
		await pressKey(page, "ArrowRight");
	}
	expect(errors).toEqual([]);
}

test("nothing scrolls sideways or hides a control at 360 px on any step", async ({ page }) => {
	await expectFitsAt360(page, ["1 of 3", "2 of 3", "3 of 3"], {
		close: "Close",
		previous: "Previous slide",
		next: "Next slide",
	});
});
