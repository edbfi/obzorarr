const REDACTED = "[redacted]";

/**
 * Parts that make a name sensitive wherever they appear in it, so `plextoken`, `APIToken` and
 * `X-Plex-Token` all match.
 */
const SENSITIVE_PARTS = [
	"token",
	"secret",
	"password",
	"passwd",
	"cookie",
	"session",
	"credential",
	"authorization",
	"authorisation",
	"apikey",
	"passphrase",
	"oauth",
];

/**
 * Short words that only count as whole words, so `monkey`, `keyboard`, `author` and `passage`
 * don't match, while `authHeader`, `basicAuth` and `{ user, pass }` do.
 */
const SENSITIVE_WORDS = new Set(["key", "keys", "pwd", "jwt", "auth", "pass"]);

/**
 * Names that match the rules above but hold no credential, matched exactly (the owner's
 * allowlist, 2026-11-16): Plex's item ids, the keyring's key fingerprint, an AI request's token
 * limit and an authentication error's message. Their values are still cleaned like any other.
 * Add a name only when no value it can hold is a credential.
 */
const SAFE_NAMES = new Set([
	"ratingKey",
	"parentRatingKey",
	"grandparentRatingKey",
	"keyId",
	"maxTokens",
	"authError",
]);

/** Whether a key or parameter name looks like it holds a credential. */
function sensitive(name: string): boolean {
	if (SAFE_NAMES.has(name)) return false;
	const words = name
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== "");
	const joined = words.join("");
	return (
		SENSITIVE_PARTS.some((part) => joined.includes(part)) ||
		words.some((word) => SENSITIVE_WORDS.has(word))
	);
}

/**
 * A URL's credentials, from `://` through the last `@` before its path, query, fragment or a
 * space, as URL parsers read them, so a raw `@` or a quote in the password doesn't end the match.
 * Anchoring on `://` rather than the scheme keeps the match linear and catches `x_db://`.
 */
const URL_CREDENTIALS = /:\/\/[^\s/?#]*@/g;

/**
 * The start of a query, fragment or path parameter: its separator and its name. This and
 * VALUE_END are shared `/g` patterns whose `lastIndex` the synchronous scan below resets.
 */
const PARAMETER = /([?&#;])([^=&#;?\s"'<>]+)=/g;

/**
 * What ends a parameter's value: the next `&`, `#` or space, as URL parsers read it, so a
 * semicolon or a quote can't end a sensitive value early.
 */
const VALUE_END = /[&#\s]/g;

function cleanText(text: string): string {
	return cleanParameters(text.replace(URL_CREDENTIALS, `://${REDACTED}@`));
}

/**
 * Redacts each sensitive parameter's whole value. An ordinary value is searched too, because
 * `?a=1;token=x` hides a second parameter behind the semicolon; one pass, without recursion.
 */
function cleanParameters(text: string): string {
	let out = "";
	let kept = 0;
	PARAMETER.lastIndex = 0;
	for (let match = PARAMETER.exec(text); match !== null; match = PARAMETER.exec(text)) {
		const [whole, , name = ""] = match;
		const valueStart = match.index + whole.length;
		if (!sensitive(decodeName(name))) continue; // `;token=` may hide in its value
		VALUE_END.lastIndex = valueStart;
		const valueEnd = VALUE_END.exec(text)?.index ?? text.length;
		out += `${text.slice(kept, valueStart)}${REDACTED}`;
		kept = valueEnd;
		PARAMETER.lastIndex = valueEnd;
	}
	return out + text.slice(kept);
}

function decodeName(name: string): string {
	try {
		return decodeURIComponent(name);
	} catch {
		return name;
	}
}

/**
 * Returns a copy of `value` that is safe to log (SPEC-setup.md, "Logging"): URLs lose their
 * credentials and token-like query parameters, any key that looks like a credential is replaced
 * at any depth, headers included, and a value with `toJSON` (a `Secret`, a date) is logged as its
 * JSON form. Errors keep their name, message, stack, own fields, cause and errors, each redacted;
 * a circular reference becomes a marker.
 */
export function redact(value: unknown): unknown {
	return walk(value, new Set());
}

function walk(value: unknown, path: Set<object>): unknown {
	if (typeof value === "string") return cleanText(value);
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "function" || typeof value === "symbol") return String(value);
	if (value === null || typeof value !== "object") return value;
	if (path.has(value)) return "[circular]";
	path.add(value);
	try {
		if (value instanceof Error) return walkError(value, path);
		if (value instanceof Headers) return walkEntries([...value.entries()], path);
		if ("toJSON" in value && typeof value.toJSON === "function") {
			return walk(value.toJSON(), path);
		}
		if (Array.isArray(value)) return value.map((item) => walk(item, path));
		return walkEntries(Object.entries(value), path);
	} finally {
		path.delete(value);
	}
}

function walkEntries(entries: [string, unknown][], path: Set<object>): Record<string, unknown> {
	return Object.fromEntries(
		entries.map(([key, item]) => [key, sensitive(key) ? REDACTED : walk(item, path)]),
	);
}

/**
 * An error's name, message and stack, which are its own but not enumerable, then its own fields
 * (such as `code`), its cause and an `AggregateError`'s errors, each redacted like any value.
 */
function walkError(error: Error, path: Set<object>): Record<string, unknown> {
	return {
		name: error.name,
		message: cleanText(error.message),
		stack: error.stack === undefined ? undefined : cleanText(error.stack),
		...walkEntries(Object.entries(error), path),
		...(error.cause === undefined ? {} : { cause: walk(error.cause, path) }),
		...(error instanceof AggregateError ? { errors: walk(error.errors, path) } : {}),
	};
}
