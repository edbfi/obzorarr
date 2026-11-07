import { baseLocale, isLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

// The page keeps the language the server chose for it (SPEC-i18n.md, "Choosing the language").
const lang = document.documentElement.lang;
const locale = isLocale(lang) ? lang : baseLocale;
overwriteGetLocale(() => locale);
