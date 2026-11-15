import { defineConfig } from "drizzle-kit";

// Drizzle Kit only generates migrations; the app applies them at startup (SPEC-setup.md,
// "Migrations"). Each aggregate's file in `db/` is listed here when it is added.
export default defineConfig({
	dialect: "sqlite",
	schema: ["./src/lib/server/db/settings.ts", "./src/lib/server/db/owner.ts"],
	out: "./drizzle",
});
