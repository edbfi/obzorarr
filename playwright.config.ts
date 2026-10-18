import { defineConfig, devices } from "@playwright/test";

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
		command: "bun ./build",
		url: `${baseURL}/healthz`,
		env: { HOST: "127.0.0.1", PORT: String(port) },
		reuseExistingServer: false,
		gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
	},
});
