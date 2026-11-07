import { describe, expect, it } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { formatDateTime, formatNumber } from "./format.ts";

/**
 * Runs `format` inside the middleware for a request that asks for `acceptLanguage`, so the
 * language comes from the request, as in the app, and returns what it formatted.
 */
async function inRequest(acceptLanguage: string, format: () => string): Promise<string> {
	const request = new Request("http://localhost/", {
		headers: { "accept-language": acceptLanguage },
	});
	let text = "";
	await paraglideMiddleware(request, () => {
		text = format();
		return new Response();
	});
	return text;
}

// 22:30 UTC on 5 November 2026 is 23:30 in Copenhagen and 11:30 the next day in Auckland.
const instant = new Date("2026-11-05T22:30:00Z");
const dateAndTime = { dateStyle: "short", timeStyle: "short" } as const;

describe.each([
	{
		language: "en",
		acceptLanguage: "en-US,en;q=0.9",
		number: "1,234,567.5",
		rounded: "1,234,568",
		copenhagen: "05/11/2026, 23:30",
		utc: "05/11/2026, 22:30",
		auckland: "06/11/2026, 11:30",
		month: "November",
		monthBefore: "October",
	},
	{
		language: "da",
		acceptLanguage: "da-DK,da;q=0.9",
		number: "1.234.567,5",
		rounded: "1.234.568",
		copenhagen: "05.11.2026, 23.30",
		utc: "05.11.2026, 22.30",
		auckland: "06.11.2026, 11.30",
		month: "november",
		monthBefore: "oktober",
	},
])("a request in $language", (want) => {
	const format = (fn: () => string) => inRequest(want.acceptLanguage, fn);

	it("formats numbers in its language, with the options it is given", async () => {
		expect(await format(() => formatNumber(1234567.5))).toBe(want.number);
		expect(await format(() => formatNumber(1234567.5, { maximumFractionDigits: 0 }))).toBe(
			want.rounded,
		);
	});

	// English is en-GB whatever the request's region: the day first and a 24-hour clock.
	it("formats dates and times in its language", async () => {
		const text = () => formatDateTime(instant, { ...dateAndTime, timeZone: "Europe/Copenhagen" });
		expect(await format(text)).toBe(want.copenhagen);
	});

	// Two zones other than Copenhagen's, so at most one of the three can be the machine's.
	it("follows the time zone it is given, not the machine's", async () => {
		expect(await format(() => formatDateTime(instant, { ...dateAndTime, timeZone: "UTC" }))).toBe(
			want.utc,
		);
		const auckland = () =>
			formatDateTime(instant, { ...dateAndTime, timeZone: "Pacific/Auckland" });
		expect(await format(auckland)).toBe(want.auckland);
	});

	// A month stored as its first instant in UTC is still the month before in New York.
	it("gives a calendar value its month in UTC, and the month before west of it", async () => {
		const firstOfMonth = new Date("2026-11-01T00:00:00Z");
		const month = (timeZone: string) => () =>
			formatDateTime(firstOfMonth, { month: "long", timeZone });
		expect(await format(month("UTC"))).toBe(want.month);
		expect(await format(month("America/New_York"))).toBe(want.monthBefore);
	});
});

describe("formatDateTime's type", () => {
	it("refuses a call without a time zone", () => {
		// `check` fails if this call type-checks, so it is never run.
		const withoutZone = () =>
			// @ts-expect-error: `timeZone` is required.
			formatDateTime(instant, dateAndTime);
		expect(withoutZone).toBeTypeOf("function");
	});
});
