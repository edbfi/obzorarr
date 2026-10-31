import { defineConfig, devices } from "@playwright/test";

// A developer's own key never reaches a test: only the web server gets a key, generated per run
// (SPEC-secrets.md, "Startup").
delete process.env.OBZORARR_SECRET_KEY;
delete process.env.OBZORARR_SECRET_KEY_FILE;
const key = crypto.getRandomValues(new Uint8Array(32)).toBase64();

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
		env: { HOST: "127.0.0.1", PORT: String(port), OBZORARR_SECRET_KEY: key },
		reuseExistingServer: false,
		gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
	},
});
