import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Page, test } from "@playwright/test";
import { connect } from "@tursodatabase/database";
import { claim, runToExit, type Server, startServer } from "./server.ts";

// First run and the request checks on the built server (docs/SPEC.md, "Testing strategy"). Each
// test starts its own server (`server.ts`), with a generated key and a database in its own
// temporary folder.
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** A GET, or a request with `init`, that doesn't follow a redirect. */
const request = (url: string, init: RequestInit = {}) =>
	fetch(url, { ...init, redirect: "manual" });

let root: string;

test.beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-e2e-setup-"));
});

test.afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test.describe("the database", () => {
	test("is migrated on a new file, and a second start on it applies nothing", async () => {
		const path = join(root, "data", "obzorarr.db");
		const env = { OBZORARR_DATABASE_PATH: path };

		for (const start of ["first", "second"]) {
			const server = await startServer(root, env);
			const response = await fetch(`${server.url}/healthz`);
			expect(await response.text(), `${start} start`).toBe("ok");
			await server.stop();
		}

		const db = await connect(path);
		try {
			const rows = await (await db.prepare("SELECT name FROM __drizzle_migrations")).all();
			const tables = await (
				await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			).all();
			const folders = (await readdir(MIGRATIONS, { withFileTypes: true })).filter((entry) =>
				entry.isDirectory(),
			);
			expect(rows).toHaveLength(folders.length);
			expect(tables.map((row: { name: string }) => row.name)).toEqual(
				expect.arrayContaining(["owner", "settings"]),
			);
		} finally {
			db.close();
		}
	});

	test("defaults to data/obzorarr.db in the working directory", async () => {
		const server = await startServer(root, {});
		await server.stop();
		const db = await connect(join(root, "data", "obzorarr.db"));
		try {
			expect(await (await db.prepare("SELECT 1 FROM owner")).all()).toEqual([]);
		} finally {
			db.close();
		}
	});

	test("the built server refuses a database folder it can't create, without echoing it", async () => {
		const file = join(root, "a-file");
		await writeFile(file, "");
		const { exitCode, output } = await runToExit(root, {
			OBZORARR_DATABASE_PATH: join(file, "data", "obzorarr.db"),
		});

		expect(output.includes(root), "output holds the path").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
		expect(lines).toEqual([
			"ConfigError: OBZORARR_DATABASE_PATH names a folder that can't be created (ENOTDIR)",
		]);
	});

	test("names the default path, not the variable, when the default can't be opened", async () => {
		await mkdir(join(root, "data", "obzorarr.db"), { recursive: true });
		const { exitCode, output } = await runToExit(root, {});

		expect(output.includes(root), "output holds the path").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
		expect(lines).toEqual([
			"ConfigError: OBZORARR_DATABASE_PATH is unset, and the default data/obzorarr.db names a file that can't be opened as a database (I/O error (open): is a directory)",
		]);
	});

	test("the built server refuses a path it can't open as a database, without echoing it", async () => {
		const path = join(root, "a-directory");
		await mkdir(path);
		const { exitCode, output } = await runToExit(root, { OBZORARR_DATABASE_PATH: path });

		expect(output.includes(root), "output holds the path").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
		expect(lines).toEqual([
			"ConfigError: OBZORARR_DATABASE_PATH names a file that can't be opened as a database (I/O error (open): is a directory)",
		]);
	});
});

test.describe("logging", () => {
	test("a failed startup is one JSON log entry, and the bad value is never echoed", async () => {
		const value = "verbose-please";
		const { exitCode, output } = await runToExit(root, { OBZORARR_LOG_DEBUG: value });

		expect(output.includes(value), "output holds the value").toBe(false);
		expect(exitCode).toBe(1);
		const entries = output
			.split("\n")
			.filter((line) => line.startsWith("{"))
			.map((line) => JSON.parse(line));
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			level: "error",
			source: "startup",
			message: "startup failed",
			metadata: {
				error: { name: "ConfigError", message: "OBZORARR_LOG_DEBUG must be true or false" },
			},
		});
	});
});

test.describe("shutdown", () => {
	for (const signal of ["SIGTERM", "SIGHUP"] as const) {
		test(`${signal} shuts the built server down with exit code 0`, async () => {
			const server = await startServer(root, {
				OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
			});
			expect(await (await fetch(`${server.url}/healthz`)).text()).toBe("ok");

			expect(await server.stop(signal)).toBe(0);
			const stopping = server
				.output()
				.split("\n")
				.filter((line) => line.startsWith("{"))
				.map((line) => JSON.parse(line))
				.filter((entry) => entry.message === "stopping");
			// SIGHUP arrives as itself, then the app passes it on as SIGTERM.
			expect(stopping.map((entry) => entry.metadata.signal)).toEqual(["SIGTERM"]);
		});
	}
});

test.describe("security headers and the CSP", () => {
	const ALWAYS = {
		"x-frame-options": "DENY",
		"x-content-type-options": "nosniff",
		"referrer-policy": "same-origin",
		"permissions-policy": "camera=(), microphone=(), geolocation=()",
	};

	test("every response that passes through handle carries them, the gate's redirect too, and no HSTS over plain HTTP", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		const check = (response: Response, what: string) => {
			for (const [name, value] of Object.entries(ALWAYS)) {
				expect(response.headers.get(name), `${name} on ${what}`).toBe(value);
			}
			expect(response.headers.get("strict-transport-security"), what).toBeNull();
		};
		try {
			const statuses: Record<string, number> = {};
			for (const path of ["/setup", "/healthz", "/"]) {
				const response = await request(`${server.url}${path}`);
				check(response, path);
				statuses[path] = response.status;
			}
			// Unclaimed, `/` is the gate's redirect.
			expect(statuses).toEqual({ "/setup": 200, "/healthz": 200, "/": 303 });

			await claim(server);
			const missing = await request(`${server.url}/no-such-page`);
			check(missing, "a 404");
			expect(missing.status).toBe(404);
		} finally {
			await server.stop();
		}
	});

	test("a page's scripts carry its policy's nonce, and the browser reports no violation", async ({
		page,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			// `/setup`: the page an unclaimed instance serves.
			const response = await fetch(`${server.url}/setup`);
			const policy = response.headers.get("content-security-policy") ?? "";
			const html = await response.text();
			const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
			expect(nonce).toBeDefined();
			// The spec's policy, directive for directive, with the nonce only on scripts.
			const directives = Object.fromEntries(
				policy.split(";").map((directive) => {
					const [name = "", ...sources] = directive.trim().split(/\s+/);
					return [name, sources.sort()];
				}),
			);
			expect(directives).toEqual({
				"default-src": ["'self'"],
				"script-src": [`'nonce-${nonce}'`, "'self'"].sort(),
				"style-src": ["'self'", "'unsafe-inline'"],
				"img-src": ["'self'", "data:"],
				"font-src": ["'self'"],
				"connect-src": ["'self'"],
				"frame-ancestors": ["'none'"],
				"frame-src": ["'none'"],
				"object-src": ["'none'"],
				"base-uri": ["'self'"],
				"form-action": ["'self'"],
			});
			const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
			expect(scripts.length).toBeGreaterThan(0);
			for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);

			const violations: string[] = [];
			page.on("console", (message) => {
				if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
			});
			await page.addInitScript(() => {
				document.addEventListener("securitypolicyviolation", (event) => {
					console.error(`Content Security Policy violation: ${event.violatedDirective}`);
				});
			});
			const visit = await page.goto(`${server.url}/setup`);
			await expect(page.locator("html[data-hydrated]")).toBeAttached();
			expect(violations).toEqual([]);
			// Chromium sends Sec-Fetch-Site to this loopback address over plain HTTP, so this checks
			// the loopback exemption: no HSTS.
			expect(visit?.headers()["strict-transport-security"]).toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	for (const [value, message] of [
		["https://u:p@obzorarr.example", "ORIGIN must not hold credentials"],
		["https://obzorarr.example/app", "ORIGIN must not have a path"],
	] as const) {
		test(`the built server refuses ORIGIN=${value}, without echoing it`, async () => {
			const { exitCode, output } = await runToExit(root, { ORIGIN: value });
			expect(output.includes(value), "output holds the value").toBe(false);
			expect(output.includes("u:p@"), "output holds the credentials").toBe(false);
			expect(exitCode).toBe(1);
			expect(output).not.toContain("Listening on");
			const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
			expect(lines).toEqual([`ConfigError: ${message}`]);
		});
	}
});

test.describe("the cross-origin check", () => {
	const REFUSAL_POLICY =
		"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

	/** Serves a page as `http://evil.test/` that posts a form to `target` as soon as it loads. */
	async function postFromAnotherSite(page: Page, target: string) {
		await page.route("http://evil.test/", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: `<form method="post" action="${target}"><input name="a" value="1"></form>
					<script>document.forms[0].submit()</script>`,
			}),
		);
		const answer = page.waitForResponse((response) => response.url() === target);
		await page.goto("http://evil.test/");
		return answer;
	}

	test("a cross-site form POST gets the Access denied page, with the headers, its own policy and the viewer's language", async ({
		browser,
	}) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		const context = await browser.newContext({ locale: "da-DK" });
		try {
			const page = await context.newPage();
			const response = await postFromAnotherSite(page, `${server.url}/`);
			expect(response.status()).toBe(403);
			const headers = response.headers();
			expect(headers["content-security-policy"]).toBe(REFUSAL_POLICY);
			expect(headers["x-frame-options"]).toBe("DENY");
			expect(headers["referrer-policy"]).toBe("same-origin");
			await expect(page.locator("html")).toHaveAttribute("lang", "da");
			await expect(page.locator("h1")).toHaveText("Adgang nægtet");
			await expect(page).toHaveTitle("Adgang nægtet");
		} finally {
			await context.close();
			await server.stop();
		}
	});

	test("on localhost, a same-origin POST without Sec-Fetch headers passes, and a JSON caller from another site gets JSON", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const url = server.url.replace("127.0.0.1", "localhost");
			const post = () =>
				request(`${url}/`, {
					method: "POST",
					headers: { origin: url, "content-type": "application/x-www-form-urlencoded" },
					body: "a=1",
				});
			// Past the check, an unclaimed instance's gate sends it to `/setup`.
			const unclaimed = await post();
			expect(unclaimed.status).toBe(303);
			expect(unclaimed.headers.get("location")).toBe("/setup");
			await claim(server);
			// Once claimed, SvelteKit answers that `/` has no form actions.
			expect((await post()).status).toBe(405);

			const other = await fetch(`${url}/`, {
				method: "POST",
				headers: { origin: "http://evil.test", accept: "application/json" },
				body: "{}",
			});
			expect(other.status).toBe(403);
			expect(await other.json()).toEqual({
				message: "The request was refused because it didn't come from this site.",
			});
			expect(other.headers.get("x-frame-options")).toBe("DENY");
		} finally {
			await server.stop();
		}
	});

	test("on a plain-HTTP host name that isn't loopback, the app's own form passes and another site's is refused", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		await claim(server);
		// Chromium sends no Sec-Fetch headers to app.test over plain HTTP, so the check compares
		// Origin with Host there.
		const browser = await chromium.launch({
			args: ["--host-resolver-rules=MAP app.test 127.0.0.1"],
		});
		try {
			const page = await browser.newPage();
			const appUrl = server.url.replace("127.0.0.1", "app.test");
			await page.goto(`${appUrl}/`);
			const own = page.waitForResponse(
				(response) => response.url() === `${appUrl}/` && response.request().method() === "POST",
			);
			await page.evaluate(() => {
				const form = document.createElement("form");
				form.method = "post";
				form.action = "/";
				document.body.append(form);
				form.submit();
			});
			const ownResponse = await own;
			// `headerValue` reads what Chromium sent; `headers()` leaves out the Sec-Fetch headers.
			expect(await ownResponse.request().headerValue("sec-fetch-site")).toBeNull();
			expect(ownResponse.status()).toBe(405);

			const other = await postFromAnotherSite(page, `${appUrl}/`);
			expect(await other.request().headerValue("sec-fetch-site")).toBeNull();
			expect(other.status()).toBe(403);
		} finally {
			await browser.close();
			await server.stop();
		}
	});
});

test.describe("the setup gate", () => {
	test("every page sends a fresh instance to /setup, and /healthz answers ok", async ({ page }) => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const own = { origin: server.url, "content-type": "application/x-www-form-urlencoded" };
			for (const [what, init] of [
				["/", {}],
				["/no-such-page", {}],
				["/healthz/more", {}],
				["/", { method: "POST", headers: own, body: "a=1" }],
			] as const) {
				const response = await request(`${server.url}${what}`, init);
				const label = `${init.method ?? "GET"} ${what}`;
				expect(response.status, label).toBe(303);
				expect(response.headers.get("location"), label).toBe("/setup");
			}
			expect((await request(`${server.url}/setup`)).status).toBe(200);
			const health = await request(`${server.url}/healthz`);
			expect(health.status).toBe(200);
			expect(await health.text()).toBe("ok");

			// A browser asking for `/` lands on the claim.
			await page.goto(`${server.url}/`);
			expect(new URL(page.url()).pathname).toBe("/setup");
			await expect(page.getByRole("button", { name: "Claim and create owner" })).toBeVisible();
		} finally {
			await server.stop();
		}
	});
});

test.describe("the bootstrap token", () => {
	test("a fresh built server prints it before it listens, in no log entry or response", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const read = async (path: string) => (await fetch(`${server.url}${path}`)).text();
			const pages = await Promise.all(["/setup", "/healthz"].map(read));
			// A 404 page too, which only a claimed instance serves.
			await claim(server);
			pages.push(await read("/no-such-page"));
			const output = server.output();
			const line = output.split("\n").find((text) => text.startsWith("Setup token: ")) ?? "";
			const token = /Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) /.exec(line)?.[1];
			expect(token).toBeDefined();
			expect(line).toContain(" /setup ");
			expect(output.indexOf("Setup token: ")).toBeLessThan(output.indexOf("Listening on"));

			// Neither form of the token, with or without its dashes, appears anywhere else.
			const forms = [token ?? "", (token ?? "").replaceAll("-", "")];
			const entries = output.split("\n").filter((text) => text.startsWith("{"));
			for (const form of forms) {
				expect(
					entries.some((entry) => entry.includes(form)),
					"a log entry holds it",
				).toBe(false);
				expect(
					pages.some((page) => page.includes(form)),
					"a response holds it",
				).toBe(false);
				expect(output.split(form).length - 1, "printed more than once").toBe(
					form === forms[0] ? 1 : 0,
				);
			}
		} finally {
			await server.stop();
		}
	});
});

test.describe("the claim", () => {
	test("refuses a browser that stripped Origin with a 403 that says so, leaving the token usable", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const token = /Setup token: ([a-z0-9-]{14}) /.exec(server.output())?.[1] ?? "";
			const page = await request(`${server.url}/setup`);
			expect(page.headers.get("cache-control")).toBe("no-store");
			// A browser that strips Origin still says the request came from the app itself.
			const stripped = await request(`${server.url}/setup`, {
				method: "POST",
				headers: {
					"sec-fetch-site": "same-origin",
					accept: "text/html",
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					token,
					username: "owner",
					password: "violet harbour lanterns",
				}),
			});
			expect(stripped.status).toBe(403);
			expect(stripped.headers.get("cache-control")).toBe("no-store");
			// The page escapes the apostrophe one way or another.
			const refusal = (await stripped.text()).replace(/&#(39|x27);/g, "'");
			expect(refusal).toContain("Access denied");
			expect(refusal).toContain(
				"Your browser didn't say which address it is using. Set ORIGIN and restart Obzorarr.",
			);
			// The token wasn't touched: the same one claims.
			await claim(server);
		} finally {
			await server.stop();
		}
	});

	test("allows 5 tries per 5 minutes from one address, then shows the wait beside the button", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			const tryToClaim = () =>
				request(`${server.url}/setup`, {
					method: "POST",
					headers: {
						origin: server.url,
						accept: "text/html",
						"content-type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						token: "aaaa-bbbb-cccc",
						username: "owner",
						password: "violet harbour lanterns",
					}),
				});
			for (let i = 0; i < 5; i++) {
				const refused = await tryToClaim();
				expect(refused.status).toBe(400);
				// The action and the page's load both run on a native form post; the header is set once.
				expect(refused.headers.get("cache-control")).toBe("no-store");
			}
			const refused = await tryToClaim();
			expect(refused.status).toBe(429);
			expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
			expect(refused.headers.get("x-ratelimit-limit")).toBe("5");
			const page = await refused.text();
			expect(page).toContain("Too many attempts. Try again in 5 minutes.");
			expect(page).toContain("set ADDRESS_HEADER");
		} finally {
			await server.stop();
		}
	});

	const PASSWORD = "violet harbour lanterns";

	test("a wrong token is refused, the right one claims, and /setup is then gone, also after a restart", async ({
		page,
	}) => {
		const database = join(root, "data", "obzorarr.db");
		const first = await startServer(root, { OBZORARR_DATABASE_PATH: database });
		// Every response's body, read in full before the check below.
		const reads: Promise<string>[] = [];
		page.on("response", (response) => {
			reads.push(response.text().catch(() => ""));
		});
		let token = "";
		try {
			token = /Setup token: ([a-z0-9-]{14}) /.exec(first.output())?.[1] ?? "";
			await page.goto(`${first.url}/setup`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

			await page.locator("#token").fill("aaaa-bbbb-cccc");
			await page.locator("#username").fill("Owner");
			await page.locator("#password").fill(PASSWORD);
			await page.getByRole("button", { name: "Claim and create owner" }).click();
			await expect(page.locator("#token-error")).toHaveText(
				"That setup token isn't valid. Use the newest one printed in the server console.",
			);
			await expect(page.locator("#token")).toHaveAttribute("aria-invalid", "true");
			await expect(page.locator("#username")).toHaveValue("Owner");
			await expect(page.locator("#token")).toHaveValue("");
			await expect(page.locator("#password")).toHaveValue("");

			await page.locator("#token").fill(token.toUpperCase().replaceAll("-", ""));
			await page.locator("#password").fill(PASSWORD);
			await page.getByRole("button", { name: "Claim and create owner" }).click();
			await page.waitForURL(`${first.url}/`);
			expect((await fetch(`${first.url}/setup`)).status).toBe(404);
			const own = await fetch(`${first.url}/setup`, {
				method: "POST",
				headers: { origin: first.url, "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ token, username: "second", password: PASSWORD }),
			});
			expect(own.status).toBe(404);
		} finally {
			await first.stop();
		}

		const bodies = await Promise.all(reads);
		expect(
			bodies.some((body) => body.includes("That setup token isn")),
			"the refusal was read",
		).toBe(true);
		const output = first.output();
		const entries = output.split("\n").filter((line) => line.startsWith("{"));
		for (const secret of [token, token.replaceAll("-", ""), PASSWORD]) {
			expect(
				entries.some((entry) => entry.includes(secret)),
				"a log entry holds it",
			).toBe(false);
			expect(
				bodies.some((body) => body.includes(secret)),
				"a response holds it",
			).toBe(false);
		}

		const second = await startServer(root, { OBZORARR_DATABASE_PATH: database });
		try {
			expect(second.output()).not.toContain("Setup token:");
			expect((await fetch(`${second.url}/setup`)).status).toBe(404);
			// The gate stays open: `/` is served, not sent to `/setup`.
			expect((await request(`${second.url}/`)).status).toBe(200);
		} finally {
			await second.stop();
		}
	});
});
