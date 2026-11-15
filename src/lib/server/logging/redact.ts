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
];

/** Short words that only count as whole words, so `monkey`, `keyboard` and `author` don't match. */
const SENSITIVE_WORDS = new Set(["key", "keys", "pwd", "jwt"]);

/** Whether a key or parameter name looks like it holds a credential. */
function sensitive(name: string): boolean {
	const words = name
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== "");
	const joined = words.join("");
	return (
		SENSITIVE_PARTS.some((part) => joined.includes(part)) ||
		words.some((word) => SENSITIVE_WORDS.has(word)) ||
		// `auth` and `basicAuth` hold credentials; `authError` and `authMethod` don't.
		words.at(-1) === "auth"
	);
}

/**
 * A URL's credentials, through the last `@` before its path, query, fragment or a space, as URL
 * parsers read them, so a raw `@` or a quote in the password doesn't end the match.
 */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi;

/** A query or fragment parameter, in an absolute URL, a relative path or any other text. */
const PARAMETER = /([?&#;])([^=&#;?\s"'<>]+)=([^&#;\s"'<>]*)/g;

function cleanText(text: string): string {
	return text
		.replace(URL_CREDENTIALS, `$1${REDACTED}@`)
		.replace(PARAMETER, (match, separator: string, name: string) =>
			sensitive(decodeName(name)) ? `${separator}${name}=${REDACTED}` : match,
		);
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
 * JSON form. Errors keep their name, message and stack; a circular reference becomes a marker.
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
