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
		// A capital that starts a word after other capitals ("APIToken"); a lookahead, since
		// `([A-Z]+)([A-Z][a-z])` backtracks through a long run of capitals in quadratic time.
		.replace(/([A-Z])(?=[A-Z][a-z])/g, "$1 ")
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
 * VALUE_END are `/g` patterns that each scan copies, since checking a value scans again.
 */
const PARAMETER = /([?&#;])([^=&#;?\s"'<>]+)=/g;

/**
 * What ends a parameter's value: the next `&`, `#` or space, as URL parsers read it, so a
 * semicolon or a quote can't end a sensitive value early.
 */
const VALUE_END = /[&#\s]/g;

/**
 * How many rounds of percent-decoding a value gets in the search for a credential encoded inside
 * it, such as the `X-Plex-Token` in the `url` that Plex's photo transcoder takes. A fixed number,
 * so the scan stays linear.
 */
const DECODE_ROUNDS = 3;

/** A run of `%XX` escapes, decoded run by run so a stray `%` doesn't stop the rest. */
const ESCAPES = /(%[0-9A-Fa-f]{2})+/g;

/** An argon2 password hash in its PHC form: `$argon2id$v=19$m=…,t=…,p=…$salt$hash`. */
const ARGON2_HASH =
	/\$argon2(?:id|i|d)(?:\$v=\d+)?\$m=\d+,t=\d+,p=\d+(?:\$(?:\\\/|[A-Za-z0-9+/=._-])*){1,2}/g;

/**
 * What a failed query's message adds after its text when it carries the values bound to it
 * (Drizzle's `DrizzleQueryError`): `params:` and everything after it, since a value can hold line
 * breaks, even ones that look like a stack frame. It applies to every string an entry logs, so
 * any text with a line that starts with `params: ` loses the rest of that line and everything
 * after it. An error's stack keeps its frames when they can be told apart (`cleanStack`).
 */
const QUERY_PARAMS = /(\nparams: )[\s\S]*/g;

function cleanText(text: string, lookInside = true): string {
	const cleaned = text
		.replace(ARGON2_HASH, REDACTED)
		.replace(QUERY_PARAMS, `$1${REDACTED}`)
		.replace(URL_CREDENTIALS, `://${REDACTED}@`);
	return cleanParameters(cleaned, lookInside);
}

/**
 * Redacts each sensitive parameter's whole value, and with `lookInside` each value that hides a
 * credential once percent-decoded. An ordinary value is searched too, because `?a=1;token=x`
 * hides a second parameter behind the semicolon; one pass, without recursion.
 */
function cleanParameters(text: string, lookInside: boolean): string {
	const parameter = new RegExp(PARAMETER);
	const end = new RegExp(VALUE_END);
	let out = "";
	let kept = 0;
	// The parameters inside one value (`?a=1;b=2`) all end where it ends, so each value's end is
	// found, and its inside checked, once.
	let valueEnd = -1;
	for (let match = parameter.exec(text); match !== null; match = parameter.exec(text)) {
		const [whole, , name = ""] = match;
		const valueStart = match.index + whole.length;
		let hide = sensitive(decodeName(name));
		if (valueStart > valueEnd) {
			end.lastIndex = valueStart;
			valueEnd = end.exec(text)?.index ?? text.length;
			hide ||= lookInside && hidesCredential(text.slice(valueStart, valueEnd));
		}
		if (!hide) continue; // `;token=` may hide in its value
		out += `${text.slice(kept, valueStart)}${REDACTED}`;
		kept = valueEnd;
		parameter.lastIndex = valueEnd;
	}
	return out + text.slice(kept);
}

/** Whether `value`, percent-decoded up to DECODE_ROUNDS times, holds something to redact. */
function hidesCredential(value: string): boolean {
	let text = value;
	for (let round = 0; round < DECODE_ROUNDS; round++) {
		const decoded = text.replace(ESCAPES, decodeEscapes);
		if (decoded === text) return false;
		text = decoded;
		// Read as a query of its own, so its first parameter (`token%3Dabc`) is found too.
		const query = `?${text}`;
		if (cleanText(query, false) !== query) return true;
		// And once more for parameters alone, with each value read as a query too, so a parameter
		// at the start of a value is found (`1;u=token%3Dabc`, `u=v%3Dtoken%3Dabc`). Only this
		// copy is marked: the `?` would cut a hash or a URL's password short of its own rule.
		const marked = query.replaceAll("=", "=?");
		if (cleanParameters(marked, false) !== marked) return true;
	}
	return false;
}

/** A run of escapes as text; where it isn't valid UTF-8, only its ASCII escapes are decoded. */
function decodeEscapes(run: string): string {
	try {
		return decodeURIComponent(run);
	} catch {
		return run.replace(/%([0-7][0-9A-Fa-f])/g, (_, hex: string) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);
	}
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
 * a failed query's bound values (`params`) and anything shaped like an argon2 password hash are
 * hidden too, wherever the error came from. A circular reference becomes a marker.
 */
export function redact(value: unknown): unknown {
	return walk(value, new Set(), 0);
}

/** What a value that throws while it is read becomes: a getter, `toJSON` or proxy trap. */
const UNREADABLE = "[unreadable]";
/** How deep a value is walked; deeper, such as a runaway chain of causes, is left out. */
const MAX_DEPTH = 32;

/** The value `get` reads, or the unreadable marker when reading it throws. */
function read(get: () => unknown): unknown {
	try {
		return get();
	} catch {
		return UNREADABLE;
	}
}

/**
 * One value, redacted. It never throws: an object that can't be read becomes the unreadable
 * marker, and one nested deeper than MAX_DEPTH a marker too, so a log entry is always written.
 */
function walk(value: unknown, path: Set<object>, depth: number): unknown {
	if (typeof value === "string") return cleanText(value);
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "function" || typeof value === "symbol") return String(value);
	if (value === null || typeof value !== "object") return value;
	if (path.has(value)) return "[circular]";
	if (depth >= MAX_DEPTH) return "[too deep]";
	path.add(value);
	try {
		if (value instanceof Error) return walkError(value, path, depth);
		if (value instanceof Headers) return walkEntries([...value.entries()], path, depth);
		if ("toJSON" in value && typeof value.toJSON === "function") {
			return walk(value.toJSON(), path, depth + 1);
		}
		if (Array.isArray(value)) return value.map((item) => walk(item, path, depth + 1));
		return walkFields(value, Object.keys(value), path, depth);
	} catch {
		return UNREADABLE;
	} finally {
		path.delete(value);
	}
}

function walkEntries(
	entries: [string, unknown][],
	path: Set<object>,
	depth: number,
): Record<string, unknown> {
	return Object.fromEntries(
		entries.map(([key, item]) => [key, sensitive(key) ? REDACTED : walk(item, path, depth + 1)]),
	);
}

/** An object's `keys`, each read on its own, so one that throws loses only its own value. */
function walkFields(
	value: object,
	keys: string[],
	path: Set<object>,
	depth: number,
): Record<string, unknown> {
	const entries = keys.map((key): [string, unknown] => [
		key,
		read(() => (value as Record<string, unknown>)[key]),
	]);
	return walkEntries(entries, path, depth);
}

/**
 * An error's name, message and stack, which are its own but not enumerable, then its own fields
 * (such as `code`), its cause and an `AggregateError`'s errors, each redacted like any value and
 * each read on its own, so a hostile getter loses only its own part.
 */
function walkError(error: Error, path: Set<object>, depth: number): Record<string, unknown> {
	// A failed query's values can be a password's hash or a username: only its text is kept.
	const keys = Object.keys(error).filter((key) => !(key === "params" && "query" in error));
	const hidesParams = Object.keys(error).length !== keys.length;
	const cause = read(() => error.cause);
	const errors = error instanceof AggregateError ? read(() => error.errors) : undefined;
	return {
		name: read(() => String(error.name)),
		message: read(() => cleanText(String(error.message))),
		stack: read(() => (error.stack === undefined ? undefined : cleanStack(error))),
		...walkFields(error, keys, path, depth),
		...(hidesParams ? { params: REDACTED } : {}),
		...(cause === undefined ? {} : { cause: walk(cause, path, depth + 1) }),
		...(errors === undefined ? {} : { errors: walk(errors, path, depth + 1) }),
	};
}

/** The rest of a stack after its header, when it is stack frames and nothing else. */
const ONLY_FRAMES = /^(?:\n[ \t]*at [^\n]*)*\n?$/;

/**
 * An error's stack, its header (`Name: message`) cleaned as the message is and its frames after
 * it on their own, so a value in the message can't pass for a frame. A stack in any other shape,
 * such as one made before its message changed, is cleaned as text, which hides everything after a
 * `params:` line, its frames included.
 */
function cleanStack(error: Error): string {
	const stack = error.stack ?? "";
	const header = `${error.name}: ${error.message}`;
	const frames = stack.slice(header.length);
	if (!stack.startsWith(header) || !ONLY_FRAMES.test(frames)) return cleanText(stack);
	return `${error.name}: ${cleanText(error.message)}${cleanText(frames)}`;
}
