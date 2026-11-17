import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { claim, startServer } from "./server.ts";

// Recovery's startup work on the built server (SPEC-sign-in.md, "Recovery"). Each test starts its
// own servers (`server.ts`), with a database in its own temporary folder.
let root: string;

test.beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-e2e-recovery-"));
});

test.afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

/** The JSON log entries in a server's output: every line that isn't a console line. */
const logEntries = (output: string) =>
	output
		.split("\n")
		.filter((line) => line.startsWith("{"))
		.map((line) => JSON.parse(line) as { level: string; message: string });

test("a claimed server restarted with recovery on prints the token only to the console, and the Security tab warns", async ({
	page,
}) => {
	const env = { OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db") };
	const first = await startServer(root, env);
	const claimed = await claim(first);
	const cookie = (claimed.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
	await first.stop();

	const server = await startServer(root, { ...env, OBZORARR_RECOVERY: "true" });
	try {
		const output = server.output();
		const lines = output.split("\n").filter((line) => line.startsWith("Recovery token: "));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(/Open \/recovery to set a new owner password\.$/);
		const token = /Recovery token: (\S+)/.exec(lines[0] ?? "")?.[1] ?? "";
		const entries = logEntries(output);
		expect(JSON.stringify(entries)).not.toContain(token);
		expect(entries).toContainEqual(
			expect.objectContaining({
				level: "warn",
				message: expect.stringContaining("recovery is on"),
			}),
		);

		const tab = await fetch(`${server.url}/admin/settings/security`, { headers: { cookie } });
		expect(tab.status).toBe(200);
		const html = await tab.text();
		expect(html).not.toContain(token);
		await page
			.context()
			.addCookies([
				{ name: "obzorarr_session", value: cookie.split("=")[1] ?? "", url: server.url },
			]);
		await page.goto(`${server.url}/admin/settings/security`);
		await expect(
			page.getByText(
				"Recovery is on. Remove OBZORARR_RECOVERY from the environment and restart Obzorarr.",
			),
		).toBeVisible();
		// Nothing printed after startup carries the token either.
		expect(server.output().split(token).length - 1).toBe(1);
	} finally {
		await server.stop();
	}
});

test("an unclaimed server with recovery on prints no recovery token, and warns", async () => {
	const server = await startServer(root, {
		OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		OBZORARR_RECOVERY: "true",
	});
	try {
		const output = server.output();
		expect(output).not.toContain("Recovery token: ");
		expect(output).toContain("Setup token: ");
		expect(logEntries(output)).toContainEqual(
			expect.objectContaining({
				level: "warn",
				message: "recovery is ignored until the instance is claimed; remove OBZORARR_RECOVERY",
			}),
		);
	} finally {
		await server.stop();
	}
});

const PASSWORD = "violet harbour lanterns";
const NEW_PASSWORD = "copper meadow tidewater";

/**
 * A claimed server, restarted with recovery on: the server, the claim's session cookie, the
 * recovery token it printed, and how to restart it.
 */
async function recovering() {
	const env = { OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db") };
	const first = await startServer(root, env);
	const claimed = await claim(first);
	const cookie = (claimed.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
	await first.stop();
	const server = await startServer(root, { ...env, OBZORARR_RECOVERY: "true" });
	const token = /Recovery token: (\S+)/.exec(server.output())?.[1] ?? "";
	const restart = async () => {
		await server.stop();
		return startServer(root, { ...env, OBZORARR_RECOVERY: "true" });
	};
	return { server, cookie, token, restart };
}

/**
 * Collects the page's console errors, uncaught exceptions and CSP violations, leaving out
 * Chromium's report of a refused answer from the page's own address.
 */
async function watchForProblems(page: Page): Promise<string[]> {
	const problems: string[] = [];
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		if (message.location().url === page.url() && message.text().startsWith("Failed to load"))
			return;
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

test("/recovery sets a new password and lands on the Security tab; the old password and sessions end, and a restart opens no new recovery", async ({
	page,
}) => {
	const { server, cookie, token, restart } = await recovering();
	let restarted: Awaited<ReturnType<typeof restart>> | undefined;
	try {
		const problems = await watchForProblems(page);
		const opened = await page.goto(`${server.url}/recovery`);
		expect(opened?.headers()["cache-control"]).toBe("no-store");
		await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
		await expect(page.locator("#token")).toHaveAttribute("autocorrect", "off");
		// A wrong token first: one answer naming the console, and neither field kept.
		await page.locator("#token").fill("aaaabbbbcccc");
		await page.locator("#password").fill(NEW_PASSWORD);
		await page.getByRole("button", { name: "Set new password" }).click();
		await expect(page.locator("#token-error")).toContainText("server console");
		await expect(page.locator("#token")).toHaveValue("");
		await expect(page.locator("#password")).toHaveValue("");
		await expect(page.locator("#token")).toBeFocused();

		await page.locator("#token").fill(token.toUpperCase());
		await page.locator("#password").fill(NEW_PASSWORD);
		await page.getByRole("button", { name: "Set new password" }).click();
		await page.waitForURL(`${server.url}/admin/settings/security`);
		await expect(page.getByRole("link", { name: "owner" })).toBeVisible();
		expect(problems).toEqual([]);

		// The claim's session ended, and the old password no longer signs in.
		const old = await fetch(`${server.url}/admin/settings/security`, {
			headers: { cookie },
			redirect: "manual",
		});
		expect(old.status).toBe(303);
		const signIn = (password: string) =>
			fetch(`${server.url}/admin/sign-in`, {
				method: "POST",
				headers: {
					origin: server.url,
					accept: "text/html",
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ username: "owner", password }),
				redirect: "manual",
			});
		expect((await signIn(PASSWORD)).status).toBe(400);
		expect((await signIn(NEW_PASSWORD)).status).toBe(303);
		// The token is used up: `/recovery` is gone, also after a restart, which prints none.
		expect((await fetch(`${server.url}/recovery`)).status).toBe(404);
		restarted = await restart();
		expect(restarted.output()).not.toContain("Recovery token: ");
		expect((await fetch(`${restarted.url}/recovery`)).status).toBe(404);
	} finally {
		await (restarted ?? server).stop();
	}
});

test("a recovery POST with Origin stripped gets the 403 that says so, leaving the token usable", async () => {
	const { server } = await recovering();
	try {
		const stripped = await fetch(`${server.url}/recovery`, {
			method: "POST",
			headers: {
				"sec-fetch-site": "same-origin",
				accept: "text/html",
				"content-type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ token: "aaaabbbbcccc", password: NEW_PASSWORD }),
			redirect: "manual",
		});
		expect(stripped.status).toBe(403);
		expect((await stripped.text()).replace(/&#(39|x27);/g, "'")).toContain(
			"Your browser didn't say which address it is using. Set ORIGIN and restart Obzorarr.",
		);
		expect((await fetch(`${server.url}/recovery`)).status).toBe(200);
	} finally {
		await server.stop();
	}
});

for (const [locale, heading, button] of [
	["en-GB", "Recover the owner account", "Set new password"],
	["da-DK", "Gendan ejerkontoen", "Vælg ny adgangskode"],
] as const) {
	test(`/recovery shows in ${locale} with no console error or CSP violation`, async ({
		browser,
	}) => {
		const { server } = await recovering();
		const context = await browser.newContext({ locale });
		try {
			const page = await context.newPage();
			const problems = await watchForProblems(page);
			await page.goto(`${server.url}/recovery`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
			await expect(page.getByRole("button", { name: button })).toBeVisible();
			await expect(page.locator("#token")).toHaveAttribute("type", "text");
			await expect(page.locator("#password")).toHaveAttribute("autocomplete", "new-password");
			expect(problems).toEqual([]);
		} finally {
			await context.close();
			await server.stop();
		}
	});
}
