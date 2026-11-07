import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { baseLocale } from "#lib/paraglide/runtime.js";

// The message check (SPEC-i18n.md, "Messages"). It sits in `src/` only because Vitest runs
// `src/**`, and it runs in prek's `tests` hook and in CI.

/** CLDR's plural categories, in CLDR's order. A key that ends in one is a plural form. */
const pluralCategories = ["zero", "one", "two", "few", "many", "other"];
const pluralSuffix = new RegExp(`_(${pluralCategories.join("|")})$`);
const messageName = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
/** What the plugin reads as markup (`<b>`, `</b>`, `<br/>`), and tags with attributes too. */
const tagShape = /<\/?[A-Za-z0-9][\w.-]*(\s[^<>]*)?\/?>/;

/** One key of one file; `text` is missing when the value isn't a string. */
interface Form {
	locale: string;
	key: string;
	text?: string;
}

/** A message in one language: one key, or plural forms by category, or (wrongly) both. */
interface Message {
	forms: Form[];
	single?: Form;
	plural: Map<string, Form>;
}

interface Placeholder {
	name: string;
	format: string;
}

/** The `{{name}}` and `{{name, format}}` placeholders in `text`, read as the plugin reads them. */
function placeholdersIn(text: string): Placeholder[] {
	const found: Placeholder[] = [];
	for (let start = text.indexOf("{{"); start !== -1; ) {
		const end = text.indexOf("}}", start + 2);
		if (end === -1) break;
		const [name = "", ...format] = text.slice(start + 2, end).split(",");
		found.push({ name: name.trim(), format: format.join(",").trim() });
		start = text.indexOf("{{", end + 2);
	}
	return found;
}

const show = ({ name, format }: Placeholder) => (format ? `{{${name}, ${format}}}` : `{{${name}}}`);

const inCldrOrder = (categories: string[]) =>
	[...categories].sort((a, b) => pluralCategories.indexOf(a) - pluralCategories.indexOf(b));

/** Every problem in a set of message files, keyed by their language. */
function checkMessages(files: Record<string, unknown>, base: string): string[] {
	const problems: string[] = [];
	// Language → message name → message. A file that isn't an object is reported and left out.
	const languages = new Map<string, Map<string, Message>>();

	for (const locale of [base, ...Object.keys(files).filter((locale) => locale !== base)]) {
		const file = files[locale];
		if (typeof file !== "object" || file === null || Array.isArray(file)) {
			problems.push(`${locale}: the file isn't one JSON object of messages`);
			continue;
		}
		const entries = Object.entries(file);
		const messages = new Map<string, Message>();
		const forms: Form[] = [];

		for (const [key, value] of entries) {
			if (typeof value !== "string") problems.push(`${locale}: ${key} isn't a string`);
			else if (value.trim() === "") problems.push(`${locale}: ${key} is empty`);

			const form: Form = { locale, key, text: typeof value === "string" ? value : undefined };
			const category = pluralSuffix.exec(key)?.[1];
			const name = category ? key.slice(0, -category.length - 1) : key;
			const message: Message = messages.get(name) ?? { forms: [], plural: new Map() };
			message.forms.push(form);
			if (category) message.plural.set(category, form);
			else message.single = form;
			messages.set(name, message);
			forms.push(form);
		}

		for (const name of messages.keys()) {
			if (!messageName.test(name)) {
				problems.push(
					`${locale}: ${name} isn't a valid message name (snake_case, starting with its owner)`,
				);
			}
		}
		for (const [key] of entries) {
			if (key.includes("_ordinal_")) {
				problems.push(
					`${locale}: ${key} contains _ordinal_, which the plugin reads as an ordinal plural`,
				);
			}
		}
		for (const [name, message] of messages) {
			if (message.single && message.plural.size > 0) {
				problems.push(`${locale}: ${name} is both one key and plural forms`);
			}
		}
		for (const { key, text } of forms) {
			for (const { name, format } of placeholdersIn(text ?? "")) {
				if (format && format !== "number") {
					problems.push(
						`${locale}: ${key} formats {{${name}}} with ${format}; only number is allowed`,
					);
				}
			}
		}
		for (const message of messages.values()) {
			for (const { key, text } of message.plural.values()) {
				if (text === undefined) continue;
				const counts = placeholdersIn(text).some(
					(p) => p.name === "count" && p.format === "number",
				);
				if (!counts) problems.push(`${locale}: ${key} has no {{count, number}}`);
			}
		}
		for (const { key, text } of forms) {
			const tag = tagShape.exec(text ?? "")?.[0];
			if (tag) problems.push(`${locale}: ${key} holds something shaped like a tag: ${tag}`);
		}

		languages.set(locale, messages);
	}

	// English and Danish have the same messages.
	const baseMessages = languages.get(base);
	for (const [locale, messages] of languages) {
		if (!baseMessages || locale === base) continue;
		for (const name of baseMessages.keys()) {
			if (!messages.has(name)) problems.push(`${locale}: ${name} is missing, but ${base} has it`);
		}
		for (const name of messages.keys()) {
			if (!baseMessages.has(name)) problems.push(`${locale}: ${name} isn't in ${base}`);
		}
	}

	// A message with plural forms in any language has exactly that language's forms in each.
	const all = [...languages.values()];
	const isPlural = (name: string) => all.some((messages) => messages.get(name)?.plural.size);
	for (const [locale, messages] of languages) {
		const needs = inCldrOrder(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
		for (const [name, message] of messages) {
			if (!isPlural(name)) continue;
			const has = inCldrOrder([...message.plural.keys()]);
			if (has.join() === needs.join()) continue;
			const forms = has.length > 0 ? `the plural forms ${has.join(", ")}` : "no plural forms";
			problems.push(
				`${locale}: ${name} has ${forms}, but ${locale} needs exactly ${needs.join(", ")}`,
			);
		}
	}

	// Every form of a message, in every language, has the same placeholders, names and formats.
	for (const name of new Set(all.flatMap((messages) => [...messages.keys()]))) {
		const formsBySignature = new Map<string, string[]>();
		for (const messages of all) {
			for (const { locale, key, text } of messages.get(name)?.forms ?? []) {
				if (text === undefined) continue;
				const shown = [...new Set(placeholdersIn(text).map(show))].sort();
				const signature = shown.length > 0 ? shown.join(", ") : "no placeholders";
				formsBySignature.set(signature, [
					...(formsBySignature.get(signature) ?? []),
					`${locale} ${key}`,
				]);
			}
		}
		if (formsBySignature.size < 2) continue;
		const groups = [...formsBySignature].map(
			([signature, forms]) =>
				`${forms.join(", ")} ${forms.length === 1 ? "has" : "have"} ${signature}`,
		);
		problems.push(`${name}: its forms differ in their placeholders: ${groups.join("; ")}`);
	}

	return problems;
}

const messagesFolder = new URL("../../../../messages/", import.meta.url);

/** `messages/*.json`, keyed by their language. */
function readMessageFiles(): Record<string, unknown> {
	const files: Record<string, unknown> = {};
	for (const name of readdirSync(messagesFolder).filter((name) => name.endsWith(".json"))) {
		files[name.slice(0, -".json".length)] = JSON.parse(
			readFileSync(new URL(name, messagesFolder), "utf8"),
		);
	}
	return files;
}

describe("messages/*.json", () => {
	it("has no problems", () => {
		const files = readMessageFiles();
		expect(Object.keys(files)).toContain(baseLocale);
		expect(checkMessages(files, baseLocale)).toEqual([]);
	});
});

// A small pair with no problems: one plain message, one with a bare placeholder, one plural.
const valid = {
	en: {
		landing_title: "Your year in stories.",
		recap_year_title: "Your {{year}}",
		recap_plays_one: "{{count, number}} play of {{title}}",
		recap_plays_other: "{{count, number}} plays of {{title}}",
	},
	da: {
		landing_title: "Dit år i historier.",
		recap_year_title: "Dit {{year}}",
		recap_plays_one: "{{count, number}} afspilning af {{title}}",
		recap_plays_other: "{{count, number}} afspilninger af {{title}}",
	},
};

type Changes = Partial<Record<keyof typeof valid, Record<string, unknown>>>;

/** `valid` with `changes` applied; a key set to `undefined` is removed. */
function broken(changes: Changes): Record<string, unknown> {
	const files: Record<string, Record<string, unknown>> = {};
	for (const [locale, messages] of Object.entries(valid)) {
		const file: Record<string, unknown> = { ...messages };
		for (const [key, value] of Object.entries(changes[locale as keyof Changes] ?? {})) {
			if (value === undefined) delete file[key];
			else file[key] = value;
		}
		files[locale] = file;
	}
	return files;
}

const both = (messages: Record<string, unknown>): Changes => ({ en: messages, da: messages });

describe("the check", () => {
	it("finds nothing in a valid pair", () => {
		expect(checkMessages(valid, "en")).toEqual([]);
	});

	// Each case breaks one clause of one rule and nothing else, so it reports only that clause.
	it.each<{ clause: string; files: Record<string, unknown>; problems: string[] }>([
		// Every value is a non-empty string, so the files stay flat.
		{
			clause: "a file that isn't one object",
			files: { ...valid, da: ["Dit år i historier."] },
			problems: ["da: the file isn't one JSON object of messages"],
		},
		{
			clause: "a nested value",
			files: broken({ en: { landing_title: { text: "Your year in stories." } } }),
			problems: ["en: landing_title isn't a string"],
		},
		{
			clause: "a value that is a number",
			files: broken({ da: { recap_year_title: 2026 } }),
			problems: ["da: recap_year_title isn't a string"],
		},
		{
			clause: "an empty value",
			files: broken({ da: { landing_title: "" } }),
			problems: ["da: landing_title is empty"],
		},
		{
			clause: "a value of only whitespace",
			files: broken({ en: { landing_title: " \t" } }),
			problems: ["en: landing_title is empty"],
		},

		// Every message name fits the rule.
		...[
			"Landing_hint",
			"landing",
			"landing-hint",
			"landing.hint",
			"landing__hint",
			"2025_hint",
		].map((name) => ({
			clause: `the name ${name}`,
			files: broken(both({ [name]: "Hint" })),
			problems: [
				`en: ${name} isn't a valid message name (snake_case, starting with its owner)`,
				`da: ${name} isn't a valid message name (snake_case, starting with its owner)`,
			],
		})),
		{
			clause: "a plural message whose name doesn't fit",
			files: broken(
				both({ plays_one: "{{count, number}} play", plays_other: "{{count, number}} plays" }),
			),
			problems: [
				"en: plays isn't a valid message name (snake_case, starting with its owner)",
				"da: plays isn't a valid message name (snake_case, starting with its owner)",
			],
		},

		// No key contains `_ordinal_`.
		{
			clause: "a key with _ordinal_",
			files: broken(
				both({
					recap_place_ordinal_one: "{{count, number}}st",
					recap_place_ordinal_other: "{{count, number}}th",
				}),
			),
			problems: [
				"en: recap_place_ordinal_one contains _ordinal_, which the plugin reads as an ordinal plural",
				"en: recap_place_ordinal_other contains _ordinal_, which the plugin reads as an ordinal plural",
				"da: recap_place_ordinal_one contains _ordinal_, which the plugin reads as an ordinal plural",
				"da: recap_place_ordinal_other contains _ordinal_, which the plugin reads as an ordinal plural",
			],
		},

		// No message is both one key and plural forms.
		{
			clause: "a message that is one key and plural forms",
			files: broken({ en: { recap_plays: "{{count, number}} plays of {{title}}" } }),
			problems: ["en: recap_plays is both one key and plural forms"],
		},

		// English and Danish have the same messages.
		{
			clause: "a message missing from Danish",
			files: broken({ da: { landing_title: undefined } }),
			problems: ["da: landing_title is missing, but en has it"],
		},
		{
			clause: "a plural message missing from Danish",
			files: broken({ da: { recap_plays_one: undefined, recap_plays_other: undefined } }),
			problems: ["da: recap_plays is missing, but en has it"],
		},
		{
			clause: "a message only Danish has",
			files: broken({ da: { landing_hint: "Tip" } }),
			problems: ["da: landing_hint isn't in en"],
		},

		// Every form of a message, in both languages, has the same placeholders, names and formats.
		{
			clause: "a placeholder renamed in Danish",
			files: broken({ da: { recap_plays_other: "{{count, number}} afspilninger af {{name}}" } }),
			problems: [
				"recap_plays: its forms differ in their placeholders: en recap_plays_one, en recap_plays_other, da recap_plays_one have {{count, number}}, {{title}}; da recap_plays_other has {{count, number}}, {{name}}",
			],
		},
		{
			clause: "a placeholder formatted in Danish only",
			files: broken({ da: { recap_year_title: "Dit {{year, number}}" } }),
			problems: [
				"recap_year_title: its forms differ in their placeholders: en recap_year_title has {{year}}; da recap_year_title has {{year, number}}",
			],
		},
		{
			clause: "a placeholder missing in Danish",
			files: broken({ da: { recap_year_title: "Dit år" } }),
			problems: [
				"recap_year_title: its forms differ in their placeholders: en recap_year_title has {{year}}; da recap_year_title has no placeholders",
			],
		},
		{
			clause: "a placeholder only Danish has",
			files: broken({ da: { landing_title: "Dit år i {{place}}." } }),
			problems: [
				"landing_title: its forms differ in their placeholders: en landing_title has no placeholders; da landing_title has {{place}}",
			],
		},
		{
			clause: "two forms of one language that differ",
			files: broken({ en: { recap_plays_one: "{{count, number}} play" } }),
			problems: [
				"recap_plays: its forms differ in their placeholders: en recap_plays_one has {{count, number}}; en recap_plays_other, da recap_plays_one, da recap_plays_other have {{count, number}}, {{title}}",
			],
		},

		// No placeholder has a format other than `number`.
		...["datetime", "currency", "number(minimumFractionDigits: 2)", "number, compact"].map(
			(format) => ({
				clause: `the format ${format}`,
				files: broken(both({ recap_year_title: `{{year, ${format}}}` })),
				problems: [
					`en: recap_year_title formats {{year}} with ${format}; only number is allowed`,
					`da: recap_year_title formats {{year}} with ${format}; only number is allowed`,
				],
			}),
		),

		// Each plural message has exactly the forms Intl.PluralRules gives for each language.
		{
			clause: "a plural form missing in Danish",
			files: broken({ da: { recap_plays_other: undefined } }),
			problems: ["da: recap_plays has the plural forms one, but da needs exactly one, other"],
		},
		{
			clause: "a plural form English doesn't have",
			files: broken({ en: { recap_plays_zero: "{{count, number}} plays of {{title}}" } }),
			problems: [
				"en: recap_plays has the plural forms zero, one, other, but en needs exactly one, other",
			],
		},
		{
			clause: "a plural message that is one key in Danish",
			files: broken({
				da: {
					recap_plays_one: undefined,
					recap_plays_other: undefined,
					recap_plays: "{{count, number}} afspilninger af {{title}}",
				},
			}),
			problems: ["da: recap_plays has no plural forms, but da needs exactly one, other"],
		},

		// Every plural form contains `{{count, number}}`.
		{
			clause: "plural forms with a bare count",
			files: broken({
				en: {
					recap_plays_one: "{{count}} play of {{title}}",
					recap_plays_other: "{{count}} plays of {{title}}",
				},
				da: {
					recap_plays_one: "{{count}} afspilning af {{title}}",
					recap_plays_other: "{{count}} afspilninger af {{title}}",
				},
			}),
			problems: [
				"en: recap_plays_one has no {{count, number}}",
				"en: recap_plays_other has no {{count, number}}",
				"da: recap_plays_one has no {{count, number}}",
				"da: recap_plays_other has no {{count, number}}",
			],
		},

		// No value holds anything shaped like a tag.
		...["<address>", "<br/>", "<br />", "</b>", '<a href="/help">', "<0>"].map((tag) => ({
			clause: `the tag ${tag}`,
			files: broken(both({ landing_title: `ORIGIN=${tag}` })),
			problems: [
				`en: landing_title holds something shaped like a tag: ${tag}`,
				`da: landing_title holds something shaped like a tag: ${tag}`,
			],
		})),
	])("reports $clause", ({ files, problems }) => {
		expect(checkMessages(files, "en")).toEqual(problems);
	});

	it("doesn't take angle brackets that aren't a tag for one", () => {
		expect(
			checkMessages(broken(both({ landing_title: "1 < 2 and 3 > 2, <- back" })), "en"),
		).toEqual([]);
	});

	it("reports every problem in a file with several", () => {
		const files = broken({
			en: {
				landing_title: "",
				Landing_hint: "Hint",
				recap_year_title: "Your {{year, datetime}}",
				recap_rank_ordinal_title: "Your rank",
				recap_plays_one: "{{count}} play of {{title}}",
			},
			da: {
				Landing_hint: "Tip",
				recap_year_title: "Dit {{year, datetime}}",
				recap_plays_other: undefined,
				recap_plays_one: "{{count, number}} afspilning af <b>{{title}}</b>",
				recap_months_one: "{{count, number}} måned",
				recap_months_other: "{{count, number}} måneder",
				recap_months: "{{count, number}} måneder",
				landing_title: { text: "Dit år i historier." },
			},
		});
		expect(checkMessages(files, "en")).toEqual([
			"en: landing_title is empty",
			"en: Landing_hint isn't a valid message name (snake_case, starting with its owner)",
			"en: recap_rank_ordinal_title contains _ordinal_, which the plugin reads as an ordinal plural",
			"en: recap_year_title formats {{year}} with datetime; only number is allowed",
			"en: recap_plays_one has no {{count, number}}",
			"da: landing_title isn't a string",
			"da: Landing_hint isn't a valid message name (snake_case, starting with its owner)",
			"da: recap_months is both one key and plural forms",
			"da: recap_year_title formats {{year}} with datetime; only number is allowed",
			"da: recap_plays_one holds something shaped like a tag: <b>",
			"da: recap_rank_ordinal_title is missing, but en has it",
			"da: recap_months isn't in en",
			"da: recap_plays has the plural forms one, but da needs exactly one, other",
			"recap_plays: its forms differ in their placeholders: en recap_plays_one has {{count}}, {{title}}; en recap_plays_other, da recap_plays_one have {{count, number}}, {{title}}",
		]);
	});
});
