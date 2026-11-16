import { defineConfig } from "drizzle-kit";

// Drizzle Kit only generates migrations; the app applies them at startup (D15). Each aggregate's
// file in `db/` is listed here when it is added.
export default defineConfig({
	dialect: "sqlite",
	schema: [
		"./src/lib/server/db/settings.ts",
		"./src/lib/server/db/owner.ts",
		"./src/lib/server/db/owner-session.ts",
	],
	out: "./drizzle",
});
