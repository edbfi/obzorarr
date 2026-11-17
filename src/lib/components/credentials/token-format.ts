/** The token field's text and caret after an edit. */
export type TokenField = { value: string; caret: number };

const LENGTH = 12;

/**
 * Formats what is in the token field as `xxxx-xxxx-xxxx` while the person types or pastes:
 * lower-case letters and digits only, at most 12, with the dashes inserted. The caret stays after
 * the same character it followed, so editing in the middle works.
 */
export function formatTokenInput(value: string, caret: number): TokenField {
	const before = value
		.slice(0, caret)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "").length;
	const characters = value
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
		.slice(0, LENGTH);
	const formatted = characters.match(/.{1,4}/g)?.join("-") ?? "";
	return { value: formatted, caret: caretAfter(formatted, Math.min(before, characters.length)) };
}

/**
 * Backspace or Delete next to a dash removes the character beyond it, since the dash itself
 * would only come back; undefined when the caret isn't next to a dash.
 */
export function deleteAcrossDash(
	value: string,
	caret: number,
	direction: "backward" | "forward",
): TokenField | undefined {
	if (direction === "backward" && value[caret - 1] === "-" && caret >= 2) {
		return formatTokenInput(value.slice(0, caret - 2) + value.slice(caret), caret - 2);
	}
	if (direction === "forward" && value[caret] === "-") {
		return formatTokenInput(value.slice(0, caret + 1) + value.slice(caret + 2), caret);
	}
	return undefined;
}

/** The position just after the `count`th letter or digit of `formatted`. */
function caretAfter(formatted: string, count: number): number {
	if (count === 0) return 0;
	let seen = 0;
	for (let index = 0; index < formatted.length; index++) {
		if (formatted[index] !== "-") seen++;
		if (seen === count) return index + 1;
	}
	return formatted.length;
}
