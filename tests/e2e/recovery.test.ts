import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
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
