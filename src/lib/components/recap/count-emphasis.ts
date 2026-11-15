// A large figure keeps its whole sentence (SPEC-recap-spike.md, "The three slides"): the slide
// formats the plural message and the count, and this splits the message around the count so the
// count alone can be styled large. Pure, so it runs alike on the server and in the browser.

/** A message split around its count; `before + count + after` is the message. */
export interface CountSplit {
	before: string;
	count: string;
	after: string;
}

const digit = /\p{Nd}/u;
/** Group and decimal separators `Intl.NumberFormat` puts between digits. */
const separator = /[.,'\u00A0\u202F\u2019]/u;

/**
 * Whether the text runs on from the count's edge as part of a larger number: a digit, or a
 * separator followed by a digit ("1,234" holds no "1" and no "234", and "2025" no "20").
 */
function continuesNumber(next: string | undefined, afterNext: string | undefined): boolean {
	if (next === undefined) return false;
	if (digit.test(next)) return true;
	return separator.test(next) && afterNext !== undefined && digit.test(afterNext);
}

/**
 * Splits `message` around the first place `count` stands on its own, or returns `undefined` when
 * it never does, and the message then shows unstyled.
 */
export function splitAroundCount(message: string, count: string): CountSplit | undefined {
	if (count === "") return undefined;
	for (
		let start = message.indexOf(count);
		start !== -1;
		start = message.indexOf(count, start + 1)
	) {
		const end = start + count.length;
		if (continuesNumber(message[start - 1], message[start - 2])) continue;
		if (continuesNumber(message[end], message[end + 1])) continue;
		return { before: message.slice(0, start), count, after: message.slice(end) };
	}
	return undefined;
}
