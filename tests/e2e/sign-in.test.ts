import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
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
			await page.waitForURL(`${appUrl}/`);
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
