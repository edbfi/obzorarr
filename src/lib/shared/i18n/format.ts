import { getLocale, type Locale } from "#lib/paraglide/runtime.js";

/**
 * The `Intl` locale for each language. The language alone picks it, never the browser's region,
 * so the server and the browser format alike; English is `en-GB`, with the day first and a 24-hour
 * clock (SPEC-i18n.md, "Formatting").
 */
const intlLocales: Record<Locale, string> = { en: "en-GB", da: "da" };

/** Formats `value` for the current language. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(intlLocales[getLocale()], options).format(value);
}

/**
 * Formats `value` for the current language, in the zone it is given: the instance zone, or `"UTC"`
 * for a calendar value such as a month's name. The zone is required, so nothing is formatted in
 * the zone of the server or the browser.
 */
export function formatDateTime(
	value: Date,
	options: Intl.DateTimeFormatOptions & { timeZone: string },
): string {
	return new Intl.DateTimeFormat(intlLocales[getLocale()], options).format(value);
}
