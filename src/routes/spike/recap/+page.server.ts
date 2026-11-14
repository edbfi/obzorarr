// The fixture is the canonical demo data (DESIGN.md), imported statically so Vite bundles it into
// the build and nothing reads `tests/` at runtime (SPEC-recap-spike.md, "The route and its data").
import fixtures from "../../../../tests/fixtures/demo-fixtures.json" with { type: "json" };
import type { PageServerLoad } from "./$types";

/** Only the member's figures, so the slides take them as props and never see the fixture. */
export const load: PageServerLoad = () => {
	const { year, member, hours, movies, series, longestStreakDays, monthlyHours } =
		fixtures.obzorarr;
	return { year, member, hours, movies, series, longestStreakDays, monthlyHours };
};
