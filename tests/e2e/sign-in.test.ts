import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, type Page, test } from "@playwright/test";
import { claim, startServer } from "./server.ts";

// Signing in on the built server (SPEC-sign-in.md, "Testing strategy"). Each test starts its own
// server (`server.ts`), with a generated key and a database in its own temporary folder.
let root: string;

test.beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-e2e-sign-in-"));
});

test.afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const THIRTY_DAYS = 30 * 24 * 60 * 60;

test.describe("the claim's session", () => {
	test("lands the new owner on the Security tab, signed in", async ({ page }) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const token = /Setup token: ([a-z0-9-]{14}) /.exec(server.output())?.[1] ?? "";
			await page.goto(`${server.url}/setup`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await page.locator("#token").fill(token);
			await page.locator("#username").fill("owner");
			await page.locator("#password").fill("violet harbour lanterns");
			await page.getByRole("button", { name: "Claim and create owner" }).click();
			await page.waitForURL(`${server.url}/admin/settings/security`);
			await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
			await expect(page).toHaveTitle("Settings");
			const cookies = await page.context().cookies();
			expect(cookies.map((cookie) => cookie.name)).toContain("obzorarr_session");
		} finally {
			await server.stop();
		}
	});

	test("signs the new owner in with obzorarr_session: HttpOnly, SameSite=Lax, 30 days, not Secure over plain HTTP", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const response = await claim(server);
			const cookie = response.headers.get("set-cookie") ?? "";
			expect(cookie).toMatch(/^obzorarr_session=[A-Za-z0-9_-]{43};/);
			const attributes = cookie.split(";").map((part) => part.trim().toLowerCase());
			expect(attributes).toContain("path=/");
			expect(attributes).toContain("httponly");
			expect(attributes).toContain("samesite=lax");
			// The time left to the session's 30-day end, less the moment the claim took.
			const maxAge = Number(attributes.find((part) => part.startsWith("max-age="))?.slice(8));
			expect(maxAge).toBeLessThanOrEqual(THIRTY_DAYS);
			expect(maxAge).toBeGreaterThan(THIRTY_DAYS - 5);
			expect(attributes).not.toContain("secure");
			expect(attributes.some((part) => part.startsWith("domain="))).toBe(false);
		} finally {
			await server.stop();
		}
	});

	test("clears a cookie whose session doesn't exist, without Secure", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			const response = await fetch(`${server.url}/`, {
				headers: { cookie: "obzorarr_session=made-up" },
			});
			expect(response.status).toBe(200);
			const attributes = (response.headers.get("set-cookie") ?? "")
				.split(";")
				.map((part) => part.trim().toLowerCase());
			expect(attributes[0]).toBe("obzorarr_session=");
			expect(attributes).toContain("max-age=0");
			expect(attributes).toContain("path=/");
			expect(attributes).not.toContain("secure");
		} finally {
			await server.stop();
		}
	});

	test("is not Secure on a plain-HTTP host name that isn't loopback either", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		const browser = await chromium.launch({
			args: ["--host-resolver-rules=MAP app.test 127.0.0.1"],
		});
		try {
			const appUrl = server.url.replace("127.0.0.1", "app.test");
			const token = /Setup token: ([a-z0-9-]{14}) /.exec(server.output())?.[1] ?? "";
			const context = await browser.newContext();
			const page = await context.newPage();
			await page.goto(`${appUrl}/setup`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await page.locator("#token").fill(token);
			await page.locator("#username").fill("owner");
			await page.locator("#password").fill("violet harbour lanterns");
			await page.getByRole("button", { name: "Claim and create owner" }).click();
			await page.waitForURL(`${appUrl}/admin/settings/security`);
			const [cookie] = (await context.cookies()).filter((each) => each.name === "obzorarr_session");
			expect(cookie).toMatchObject({
				domain: "app.test",
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
				secure: false,
			});
		} finally {
			await browser.close();
			await server.stop();
		}
	});
});

const PASSWORD = "violet harbour lanterns";

/**
 * Collects the page's console errors, uncaught exceptions and CSP violations. Chromium also
 * reports the status of a refused sign-in, an answer from the page's own address, so only that
 * report is left out; a failed script, style or font still counts.
 */
async function watchForProblems(page: Page): Promise<string[]> {
	const problems: string[] = [];
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		const forPage = message.location().url === page.url();
		if (forPage && message.text().startsWith("Failed to load resource")) return;
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

/** Fills the sign-in form on the page that is open, and submits it. */
async function signIn(page: Page, username: string, password: string) {
	await page.locator("#username").fill(username);
	await page.locator("#password").fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("owner sign-in", () => {
	test("refuses a wrong password keeping the username, then signs in and returns to next", async ({
		page,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			const problems = await watchForProblems(page);
			const visit = await page.goto(`${server.url}/admin/sign-in?next=%2F%3Fafter%3Dsign-in`);
			expect(visit?.headers()["cache-control"]).toBe("no-store");
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await expect(page).toHaveTitle("Sign in");
			await expect(page.locator("#password")).toHaveAttribute("autocomplete", "current-password");

			await signIn(page, "owner", "not the right password");
			await expect(page.getByRole("alert")).toHaveText("Username or password is wrong.");
			await expect(page.locator("#username")).toHaveValue("owner");
			await expect(page.locator("#password")).toHaveValue("");
			await expect(page.locator("#password")).toBeFocused();

			// A second refusal puts a new alert in the page, so a screen reader announces it again.
			await page.getByRole("alert").evaluate((alert) => alert.setAttribute("data-seen", ""));
			await page.locator("#password").fill("still not the right password");
			await page.getByRole("button", { name: "Sign in", exact: true }).click();
			await expect(page.getByRole("alert")).toHaveText("Username or password is wrong.");
			await expect(page.locator("[role=alert][data-seen]")).toHaveCount(0);

			// The username's case and the spaces around it don't matter; the query string is dropped.
			await signIn(page, "  OWNER ", PASSWORD);
			await page.waitForURL(`${server.url}/`);
			const cookies = await page.context().cookies();
			expect(cookies.map((cookie) => cookie.name)).toContain("obzorarr_session");
			expect(problems).toEqual([]);
		} finally {
			await server.stop();
		}
	});

	test("keeps what was typed while signing in, with the button saying so", async ({ page }) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			// The answer is held back, so the page can be seen while it waits.
			let answer = () => {};
			await page.route("**/admin/sign-in", async (route) => {
				if (route.request().method() === "POST") {
					await new Promise<void>((resolve) => {
						answer = resolve;
					});
				}
				await route.continue();
			});
			await page.goto(`${server.url}/admin/sign-in`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await signIn(page, "owner", "not the right password");
			const button = page.getByRole("button", { name: "Signing in…" });
			await expect(button).toBeDisabled();
			await expect(page.locator("#username")).toHaveValue("owner");
			answer();
			await expect(page.getByRole("alert")).toHaveText("Username or password is wrong.");
		} finally {
			await server.stop();
		}
	});

	test("keeps the password when the server was only busy, since nothing was checked", async ({
		page,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			// Every hash slot busy, as SvelteKit answers an enhanced form when the action fails.
			await page.route("**/admin/sign-in", (route) =>
				route.request().method() === "POST"
					? route.fulfill({
							status: 429,
							contentType: "application/json",
							headers: { "retry-after": "5" },
							body: JSON.stringify({
								type: "failure",
								status: 429,
								data: JSON.stringify([{ username: 1, busy: 2 }, "owner", true]),
							}),
						})
					: route.continue(),
			);
			await page.goto(`${server.url}/admin/sign-in`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await signIn(page, "owner", PASSWORD);
			await expect(page.getByRole("alert")).toHaveText(
				"Obzorarr is busy checking other passwords. Try again in a few seconds.",
			);
			await expect(page.locator("#password")).toHaveValue(PASSWORD);
		} finally {
			await server.stop();
		}
	});

	test("drops an unsafe next and goes to the admin", async ({ page }) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			await page.goto(`${server.url}/admin/sign-in?next=%2F%2Fevil.test%2Fadmin`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await signIn(page, "owner", PASSWORD);
			await page.waitForURL(`${server.url}/admin/settings/security`);
			// Without JavaScript: a path a Location header can't carry as typed is percent-encoded,
			// and dot segments that would resolve to two leading slashes are dropped.
			const signInNatively = (next: string) =>
				fetch(`${server.url}/admin/sign-in?next=${encodeURIComponent(next)}`, {
					method: "POST",
					headers: {
						origin: server.url,
						accept: "text/html",
						"content-type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({ username: "owner", password: PASSWORD }),
					redirect: "manual",
				});
			for (const [next, location] of [
				["/✓", "/%E2%9C%93"],
				["/.//evil.test", "/admin"],
			] as const) {
				const native = await signInNatively(next);
				expect(native.status, next).toBe(303);
				expect(native.headers.get("location"), next).toBe(location);
			}
		} finally {
			await server.stop();
		}
	});

	test("refuses a browser that stripped Origin with the 403 that says so", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			// A browser that strips Origin still says the request came from the app itself.
			const stripped = await fetch(`${server.url}/admin/sign-in`, {
				method: "POST",
				headers: {
					"sec-fetch-site": "same-origin",
					accept: "text/html",
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ username: "owner", password: PASSWORD }),
				redirect: "manual",
			});
			expect(stripped.status).toBe(403);
			expect(stripped.headers.get("set-cookie")).toBeNull();
			const refusal = (await stripped.text()).replace(/&#(39|x27);/g, "'");
			expect(refusal).toContain(
				"Your browser didn't say which address it is using. Set ORIGIN and restart Obzorarr.",
			);
		} finally {
			await server.stop();
		}
	});

	test("checks at most 4 passwords at once, answering the rest busy with Retry-After: 5", async () => {
		// Each sign-in from an address of its own, so only the hash slots refuse any.
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
			ADDRESS_HEADER: "x-forwarded-for",
		});
		try {
			await claim(server, { "x-forwarded-for": "198.51.100.200" });
			const answers = await Promise.all(
				Array.from({ length: 20 }, (_, i) =>
					fetch(`${server.url}/admin/sign-in`, {
						method: "POST",
						headers: {
							origin: server.url,
							accept: "text/html",
							"content-type": "application/x-www-form-urlencoded",
							"x-forwarded-for": `198.51.100.${i + 1}`,
						},
						body: new URLSearchParams({ username: "owner", password: "not the right password" }),
						redirect: "manual",
					}).then(async (response) => ({
						status: response.status,
						retryAfter: response.headers.get("retry-after"),
						body: await response.text(),
					})),
				),
			);
			const busy = answers.filter((answer) => answer.status === 429);
			const checked = answers.filter((answer) => answer.status === 400);
			expect(busy.length + checked.length, "every answer is busy or wrong").toBe(20);
			expect(busy.length, "some were refused as busy").toBeGreaterThan(0);
			expect(checked.length, "some were checked").toBeGreaterThan(0);
			for (const answer of busy) {
				expect(answer.retryAfter).toBe("5");
				expect(answer.body).toContain("Obzorarr is busy checking other passwords.");
			}
		} finally {
			await server.stop();
		}
	});

	test("allows 10 sign-ins per 5 minutes from one address, then shows the wait beside the button", async ({
		page,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			// Ten that succeed, so they leave no failures behind: only the limit refuses the 11th.
			for (let i = 0; i < 10; i++) {
				const signedIn = await fetch(`${server.url}/admin/sign-in`, {
					method: "POST",
					headers: {
						origin: server.url,
						accept: "text/html",
						"content-type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({ username: "owner", password: PASSWORD }),
					redirect: "manual",
				});
				expect(signedIn.status, `sign-in ${i + 1}`).toBe(303);
			}
			await page.goto(`${server.url}/admin/sign-in`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			const answer = page.waitForResponse(
				(response) =>
					response.request().method() === "POST" && response.url().includes("/admin/sign-in"),
			);
			await signIn(page, "owner", PASSWORD);
			const refused = await answer;
			expect(refused.status()).toBe(429);
			expect(Number(refused.headers()["retry-after"])).toBeGreaterThan(0);
			expect(refused.headers()["x-ratelimit-limit"]).toBe("10");
			await expect(page.getByRole("alert")).toHaveText(
				"Too many attempts. Try again in 5 minutes. Behind a reverse proxy, set ADDRESS_HEADER so each visitor is counted apart.",
			);
			// Nothing was checked, so the password stays, and the button can be pressed again.
			await expect(page.locator("#password")).toHaveValue(PASSWORD);
			await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
		} finally {
			await server.stop();
		}
	});

	for (const [locale, heading, forgot] of [
		["en-GB", "Sign in to Obzorarr", "Forgot your password?"],
		["da-DK", "Log ind på Obzorarr", "Har du glemt din adgangskode?"],
	] as const) {
		test(`shows the page and its recovery steps in ${locale}, with no console error or CSP violation`, async ({
			browser,
		}) => {
			const server = await startServer(root, {
				OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
			});
			const context = await browser.newContext({ locale });
			try {
				await claim(server);
				const page = await context.newPage();
				const problems = await watchForProblems(page);
				await page.goto(`${server.url}/admin/sign-in`);
				await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
				await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
				const steps = page.locator("details ol li");
				await expect(steps.first()).toBeHidden();
				await page.getByText(forgot).click();
				await expect(steps).toHaveCount(3);
				await expect(steps.first().locator("code")).toHaveText("OBZORARR_RECOVERY=true");
				await expect(steps.last().locator("code")).toHaveText("/recovery");
				expect(problems).toEqual([]);
			} finally {
				await context.close();
				await server.stop();
			}
		});
	}
});

/** The session cookie a claim's response set, as a `cookie` header. */
const sessionCookie = (response: Response) =>
	(response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

test.describe("the owner check", () => {
	test("sends a signed-out browser to sign in and back, and a data request gets SvelteKit's JSON redirect", async ({
		page,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			const signedOutPage = await fetch(`${server.url}/admin/settings/security`, {
				redirect: "manual",
			});
			expect(signedOutPage.status).toBe(303);
			expect(signedOutPage.headers.get("location")).toBe(
				"/admin/sign-in?next=%2Fadmin%2Fsettings%2Fsecurity",
			);
			expect(signedOutPage.headers.get("cache-control")).toBe("no-store");
			const data = await fetch(`${server.url}/admin/settings/security/__data.json`, {
				redirect: "manual",
			});
			expect(await data.json()).toMatchObject({
				type: "redirect",
				location: "/admin/sign-in?next=%2Fadmin%2Fsettings%2Fsecurity",
			});

			await page.goto(`${server.url}/admin/settings`);
			await page.waitForURL(`${server.url}/admin/sign-in?next=%2Fadmin%2Fsettings`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await signIn(page, "owner", PASSWORD);
			await page.waitForURL(`${server.url}/admin/settings/security`);
			await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
		} finally {
			await server.stop();
		}
	});

	test("refuses an owner-only POST without a session, as a page, as SvelteKit's error and as JSON", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			const post = (headers: Record<string, string>) =>
				fetch(`${server.url}/admin/settings/security`, {
					method: "POST",
					headers: {
						origin: server.url,
						"content-type": "application/x-www-form-urlencoded",
						...headers,
					},
					body: "a=1",
					redirect: "manual",
				});
			const message = "Your session ended. Sign in again.";
			const asPage = await post({ accept: "text/html" });
			expect(asPage.status).toBe(403);
			const html = await asPage.text();
			expect(html).toContain(message);
			expect(html).toContain('href="/admin/sign-in?next=%2Fadmin%2Fsettings%2Fsecurity"');
			const enhanced = await post({ accept: "application/json", "x-sveltekit-action": "true" });
			expect(enhanced.status).toBe(403);
			expect(await enhanced.json()).toEqual({ type: "error", error: { message } });
			const asJson = await post({ accept: "application/json" });
			expect(asJson.status).toBe(403);
			expect(await asJson.json()).toEqual({ message });
		} finally {
			await server.stop();
		}
	});

	test("lets the signed-in owner in, out of every cache, past /admin's redirects and away from sign-in", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const cookie = sessionCookie(await claim(server));
			const get = (path: string) =>
				fetch(`${server.url}${path}`, { headers: { cookie }, redirect: "manual" });
			for (const path of ["/admin", "/admin/settings"]) {
				const response = await get(path);
				expect(response.status, path).toBe(307);
				expect(response.headers.get("location"), path).toBe("/admin/settings/security");
				expect(response.headers.get("cache-control"), path).toBe("no-store");
			}
			const tab = await get("/admin/settings/security");
			expect(tab.status).toBe(200);
			expect(tab.headers.get("cache-control")).toBe("no-store");
			const signInPage = await get("/admin/sign-in");
			expect(signInPage.status).toBe(303);
			expect(signInPage.headers.get("location")).toBe("/admin");
		} finally {
			await server.stop();
		}
	});

	test("its own answers keep the security headers and clear a stale cookie, data requests too", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			const stale = { cookie: "obzorarr_session=made-up" };
			const answers = {
				page: await fetch(`${server.url}/admin/settings/security`, {
					headers: stale,
					redirect: "manual",
				}),
				data: await fetch(`${server.url}/admin/settings/security/__data.json`, {
					headers: stale,
					redirect: "manual",
				}),
				post: await fetch(`${server.url}/admin/settings/security`, {
					method: "POST",
					headers: {
						...stale,
						origin: server.url,
						accept: "text/html",
						"content-type": "application/x-www-form-urlencoded",
					},
					body: "a=1",
					redirect: "manual",
				}),
			};
			expect(answers.page.status).toBe(303);
			expect(answers.data.status).toBe(200);
			expect(answers.data.headers.get("cache-control")).toBe("private, no-store");
			expect(await answers.data.json()).toMatchObject({ type: "redirect" });
			expect(answers.post.status).toBe(403);
			for (const [name, answer] of Object.entries(answers)) {
				expect(answer.headers.get("x-frame-options"), name).toBe("DENY");
				expect(answer.headers.get("x-content-type-options"), name).toBe("nosniff");
				const cleared = (answer.headers.get("set-cookie") ?? "").toLowerCase();
				expect(cleared, name).toMatch(/^obzorarr_session=;/);
				expect(cleared, name).toContain("max-age=0");
				expect(cleared, name).not.toContain("secure");
			}
			// Signing in over a stale cookie keeps the new session: nothing clears it after.
			const signedIn = await fetch(`${server.url}/admin/sign-in`, {
				method: "POST",
				headers: {
					...stale,
					origin: server.url,
					accept: "text/html",
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ username: "owner", password: PASSWORD }),
				redirect: "manual",
			});
			expect(signedIn.status).toBe(303);
			const set = signedIn.headers.getSetCookie();
			expect(set).toHaveLength(1);
			expect(set[0]).toMatch(/^obzorarr_session=[A-Za-z0-9_-]{43};/);
		} finally {
			await server.stop();
		}
	});

	test("/ links to the owner's sign-in", async ({ page }) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			await page.goto(`${server.url}/`);
			await expect(page.getByRole("link", { name: "Owner sign-in" })).toHaveAttribute(
				"href",
				"/admin/sign-in",
			);
		} finally {
			await server.stop();
		}
	});
});

/** Claims a fresh server in a browser, which the claim signs in and leaves on the Security tab. */
async function claimInBrowser(page: Page, server: { url: string; output: () => string }) {
	const token = /Setup token: ([a-z0-9-]{14}) /.exec(server.output())?.[1] ?? "";
	await page.goto(`${server.url}/setup`);
	await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
	await page.locator("#token").fill(token);
	await page.locator("#username").fill("owner");
	await page.locator("#password").fill(PASSWORD);
	// The claim's one submit button, in whichever language the page is in.
	await page.locator("form button[type=submit]").click();
	await page.waitForURL(`${server.url}/admin/settings/security`);
	await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

test.describe("the admin shell and signing out", () => {
	test("a GET to /admin/sign-out signs nobody out; Sign out asks first, then ends the session", async ({
		page,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const problems = await watchForProblems(page);
			await claimInBrowser(page, server);
			await page.goto(`${server.url}/admin/sign-out`);
			await page.waitForURL(`${server.url}/admin/settings/security`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

			const signOut = page.getByRole("button", { name: "Sign out" });
			await signOut.click();
			const dialog = page.getByRole("alertdialog", { name: "Sign out of Obzorarr?" });
			await expect(dialog).toBeVisible();
			// The page and the sidebar behind the confirmation are inert while it is open.
			await expect(page.locator("#admin-page")).toHaveAttribute("inert", "");
			await expect(page.locator("#admin-sidebar")).toHaveAttribute("inert", "");
			await page.keyboard.press("Escape");
			await expect(dialog).toBeHidden();
			await expect(signOut).toBeFocused();
			await expect(page.locator("#admin-page")).not.toHaveAttribute("inert", "");
			await expect(page).toHaveURL(`${server.url}/admin/settings/security`);

			await signOut.click();
			await dialog.getByRole("button", { name: "Sign out" }).click();
			await page.waitForURL(`${server.url}/admin/sign-in`);
			const cookies = await page.context().cookies();
			expect(cookies.map((cookie) => cookie.name)).not.toContain("obzorarr_session");
			await page.goto(`${server.url}/admin/settings/security`);
			await page.waitForURL(/\/admin\/sign-in\?next=/);
			expect(problems).toEqual([]);
		} finally {
			await server.stop();
		}
	});

	test("a sign-out POST without a session only clears the cookie; one with Origin stripped gets the 403", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			await claim(server);
			const signOut = (headers: Record<string, string>) =>
				fetch(`${server.url}/admin/sign-out`, {
					method: "POST",
					headers: {
						accept: "text/html",
						"content-type": "application/x-www-form-urlencoded",
						...headers,
					},
					body: "",
					redirect: "manual",
				});
			const cleared = await signOut({ origin: server.url, cookie: "obzorarr_session=made-up" });
			expect(cleared.status).toBe(303);
			expect(cleared.headers.get("location")).toBe("/admin/sign-in");
			expect(cleared.headers.get("set-cookie") ?? "").toMatch(/^obzorarr_session=;/);
			const stripped = await signOut({ "sec-fetch-site": "same-origin" });
			expect(stripped.status).toBe(403);
			expect((await stripped.text()).replace(/&#(39|x27);/g, "'")).toContain(
				"Your browser didn't say which address it is using. Set ORIGIN and restart Obzorarr.",
			);
		} finally {
			await server.stop();
		}
	});

	test("below 768 px the menu opens a drawer that traps focus, makes the page inert and closes on Escape", async ({
		browser,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
		try {
			const page = await context.newPage();
			await claimInBrowser(page, server);
			const menu = page.getByRole("button", { name: "Menu" });
			await menu.click();
			const drawer = page.getByRole("dialog", { name: "Menu" });
			await expect(drawer).toBeVisible();
			await expect(page.locator("#admin-page")).toHaveAttribute("inert", "");
			// Focus stays inside the drawer however far Tab goes.
			for (let i = 0; i < 12; i++) {
				await page.keyboard.press("Tab");
				expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
			}
			await expect(drawer.getByRole("link", { name: "Settings" })).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(drawer).toBeHidden();
			await expect(page.locator("#admin-page")).not.toHaveAttribute("inert", "");
			await expect(menu).toBeFocused();

			// Signing out from the drawer: the confirmation opens over it, and the drawer is inert.
			await menu.click();
			await drawer.getByRole("button", { name: "Sign out" }).click();
			const confirmation = page.getByRole("alertdialog", { name: "Sign out of Obzorarr?" });
			await expect(confirmation).toBeVisible();
			await expect(page.locator("#admin-drawer")).toHaveAttribute("inert", "");
			await confirmation.getByRole("button", { name: "Sign out" }).click();
			await page.waitForURL(`${server.url}/admin/sign-in`);
		} finally {
			await context.close();
			await server.stop();
		}
	});

	test("the drawer closes when the window widens past 768 px, freeing the page", async ({
		browser,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
		try {
			const page = await context.newPage();
			await claimInBrowser(page, server);
			await page.getByRole("button", { name: "Menu" }).click();
			await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
			await page.setViewportSize({ width: 1024, height: 844 });
			await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
			await expect(page.locator("#admin-page")).not.toHaveAttribute("inert", "");
		} finally {
			await context.close();
			await server.stop();
		}
	});

	test("the rail from 768 px keeps every control's name", async ({ browser }) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		const context = await browser.newContext({ viewport: { width: 800, height: 900 } });
		try {
			const page = await context.newPage();
			await claimInBrowser(page, server);
			const sidebar = page.locator("#admin-sidebar");
			await expect(sidebar).toBeVisible();
			await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();
			await expect(sidebar.getByRole("link", { name: "owner" })).toBeVisible();
			await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();
			await expect(sidebar.getByRole("button", { name: "Dansk" })).toBeVisible();
			// The labels are kept for screen readers only.
			expect(await sidebar.getByText("Settings").evaluate((node) => node.clientWidth)).toBeLessThan(
				2,
			);
		} finally {
			await context.close();
			await server.stop();
		}
	});

	test("without JavaScript, the sidebar is shown on a phone and Sign out still signs out", async ({
		browser,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		const cookie = sessionCookie(await claim(server));
		const context = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 390, height: 844 },
		});
		try {
			const [name, value] = cookie.split("=");
			await context.addCookies([{ name: name ?? "", value: value ?? "", url: server.url }]);
			const page = await context.newPage();
			await page.goto(`${server.url}/admin/settings/security`);
			await expect(
				page.locator("#admin-sidebar").getByRole("link", { name: "Settings" }),
			).toBeVisible();
			await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
			await page.locator("#admin-sidebar").getByRole("button", { name: "Sign out" }).click();
			await page.waitForURL(`${server.url}/admin/sign-in`);
			expect((await context.cookies()).map((each) => each.name)).not.toContain("obzorarr_session");
		} finally {
			await context.close();
			await server.stop();
		}
	});

	for (const [locale, settings, signOut, version] of [
		["en-GB", "Settings", "Sign out", "Version dev"],
		["da-DK", "Indstillinger", "Log ud", "Version dev"],
	] as const) {
		test(`the shell shows in ${locale} with no console error or CSP violation`, async ({
			browser,
		}) => {
			const server = await startServer(root, {
				OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
			});
			const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
			try {
				const page = await context.newPage();
				const problems = await watchForProblems(page);
				await claimInBrowser(page, server);
				await expect(page.getByRole("heading", { level: 1 })).toHaveText(settings);
				await expect(page.getByRole("link", { name: "owner" })).toHaveAttribute(
					"href",
					"/admin/settings/security",
				);
				await expect(page.getByRole("button", { name: signOut })).toBeVisible();
				await expect(page.getByText(version)).toBeVisible();
				expect(problems).toEqual([]);
			} finally {
				await context.close();
				await server.stop();
			}
		});
	}
});
