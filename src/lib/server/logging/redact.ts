const REDACTED = "[redacted]";

/** Words that make a key or query parameter sensitive, singular, after splitting the name. */
const SENSITIVE_WORDS = new Set([
	"token",
	"secret",
	"password",
	"passwd",
	"cookie",
	"session",
	"key",
	"apikey",
	"authorization",
	"authorisation",
	"auth",
	"credential",
]);

/**
 * Whether a name looks like it holds a credential: `accessToken`, `client_secret`, `X-Plex-Token`,
 * `sessionId` and `cookies` do; `monkey` and `keyboard` don't, because the name is split into words.
 */
function sensitive(name: string): boolean {
	const words = name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/);
	return words.some(
		(word) =>
			SENSITIVE_WORDS.has(word) || (word.endsWith("s") && SENSITIVE_WORDS.has(word.slice(0, -1))),
	);
}

const URLS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;

/** Removes a URL's credentials and the values of its sensitive query parameters. */
function cleanUrl(url: string): string {
	const out = url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/?#]*@/i, `$1${REDACTED}@`);
	const query = out.indexOf("?");
	if (query === -1) return out;
	const hash = out.indexOf("#", query);
	const end = hash === -1 ? out.length : hash;
	const params = out
		.slice(query + 1, end)
		.split("&")
		.map((part) => {
			const equals = part.indexOf("=");
			if (equals === -1) return part;
			const name = part.slice(0, equals);
			return sensitive(decodeName(name)) ? `${name}=${REDACTED}` : part;
		});
	return `${out.slice(0, query + 1)}${params.join("&")}${out.slice(end)}`;
}

function decodeName(name: string): string {
	try {
		return decodeURIComponent(name);
	} catch {
		return name;
	}
}

const cleanText = (text: string) => text.replace(URLS, cleanUrl);

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
		if (value instanceof Error) {
			return {
				name: value.name,
				message: cleanText(value.message),
				stack: value.stack === undefined ? undefined : cleanText(value.stack),
			};
		}
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
