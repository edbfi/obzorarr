import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// A developer's own key never reaches a test: only the web server gets a key, generated per run
// (SPEC-secrets.md, "Startup").
delete process.env.OBZORARR_SECRET_KEY;
delete process.env.OBZORARR_SECRET_KEY_FILE;
const key = crypto.getRandomValues(new Uint8Array(32)).toBase64();

// Each run's web server gets a new database in a temporary folder. Playwright loads this file
// again in every worker, where `TEST_WORKER_INDEX` is set, so only the runner process creates
// the folder; it removes it on exit, once the web server has stopped.
const dataDir =
	process.env.TEST_WORKER_INDEX === undefined ? mkdtempSync(join(tmpdir(), "obzorarr-e2e-")) : "";
if (dataDir !== "") process.on("exit", () => rmSync(dataDir, { recursive: true, force: true }));

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

// The smoke test runs against the built adapter-bun server: `bun run --bun build` first.
export default defineConfig({
	testDir: "tests/e2e",
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? "github" : "list",
	use: { baseURL },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "bun --no-env-file ./build",
		url: `${baseURL}/healthz`,
		env: {
			HOST: "127.0.0.1",
			PORT: String(port),
			OBZORARR_SECRET_KEY: key,
			OBZORARR_DATABASE_PATH: join(dataDir, "obzorarr.db"),
		},
		reuseExistingServer: false,
		gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
	},
});
