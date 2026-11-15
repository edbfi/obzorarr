import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Page, test } from "@playwright/test";
import { connect } from "@tursodatabase/database";

// First run and the request checks on the built server (SPEC-setup.md, "Testing strategy"). Each
// test starts its own server, with a generated key and a database in its own temporary folder.
const BUILD = fileURLToPath(new URL("../../build", import.meta.url));
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

const randomKey = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** A built server that started: its address, everything it printed so far, and how to stop it. */
type Server = {
	url: string;
	output: () => string;
	stop: (signal?: "SIGTERM" | "SIGHUP") => Promise<number | null>;
};

/**
 * Spawns the built server in `cwd` with a generated key, a free port and `env`, and nothing else
 * from the test's environment.
 */
const spawnServer = (cwd: string, env: Record<string, string>) =>
	Bun.spawn([process.execPath, "--no-env-file", BUILD], {
		cwd,
		env: { HOST: "127.0.0.1", PORT: "0", OBZORARR_SECRET_KEY: randomKey(), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});

/**
 * Starts the built server with `env` and resolves once it listens, or rejects with its output if
 * it exits or is still starting after 10 s.
 */
async function startServer(cwd: string, env: Record<string, string>): Promise<Server> {
	const server = spawnServer(cwd, env);
	let output = "";
	const collect = async (stream: ReadableStream<Uint8Array>) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) output += decoder.decode(chunk, { stream: true });
	};
	const collected = Promise.all([collect(server.stdout), collect(server.stderr)]);
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const url = /Listening on (http:\/\/\S+?)\/?\s/.exec(output)?.[1];
		if (url !== undefined) {
			return {
				url,
				output: () => output,
				stop: async (signal = "SIGTERM") => {
					server.kill(signal);
					await collected;
					return server.exited;
				},
			};
		}
		if (server.exitCode !== null) break;
		await Bun.sleep(50);
	}
	server.kill("SIGKILL");
	await collected;
	throw new Error(`the server didn't start:\n${output}`);
}

/** Runs the built server with `env` until it exits by itself, killing it after 10 s. */
async function runToExit(cwd: string, env: Record<string, string>) {
	const server = spawnServer(cwd, env);
	const timer = setTimeout(() => server.kill("SIGKILL"), 10_000);
	try {
		const [stdout, stderr] = await Promise.all([
			new Response(server.stdout).text(),
			new Response(server.stderr).text(),
		]);
		await server.exited;
		return { exitCode: server.exitCode, output: `${stdout}\n${stderr}` };
	} finally {
		clearTimeout(timer);
	}
}

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

	test("every response that passes through handle carries them, and no HSTS over plain HTTP", async () => {
		const server = await startServer(root, {
			OBZORARR_DATABASE_PATH: join(root, "data", "obzorarr.db"),
		});
		try {
			for (const path of ["/", "/healthz", "/no-such-page"]) {
				const response = await fetch(`${server.url}${path}`);
				for (const [name, value] of Object.entries(ALWAYS)) {
					expect(response.headers.get(name), `${name} on ${path}`).toBe(value);
				}
				expect(response.headers.get("strict-transport-security"), path).toBeNull();
				if (path === "/no-such-page") expect(response.status).toBe(404);
			}
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
			const response = await fetch(`${server.url}/`);
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
			const visit = await page.goto(`${server.url}/`);
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
			const own = await fetch(`${url}/`, {
				method: "POST",
				headers: { origin: url, "content-type": "application/x-www-form-urlencoded" },
				body: "a=1",
			});
			// Past the check, SvelteKit answers that `/` has no form actions.
			expect(own.status).toBe(405);

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
