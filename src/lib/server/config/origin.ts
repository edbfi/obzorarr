import { ConfigError } from "./config-error.ts";

export type OriginEnv = { readonly ORIGIN?: string | undefined };

/**
 * The browser's address from `ORIGIN`, as a parsed origin such as `https://obzorarr.example`, or
 * undefined when it is unset. adapter-bun reads it first and trims a path, query, fragment or
 * credentials quietly, so those are refused here (SPEC-setup.md, "`ORIGIN`"). An empty value is
 * refused too: the adapter stops on one before startup runs. No message holds the value.
 */
export function readOrigin(env: OriginEnv): string | undefined {
	const value = env.ORIGIN;
	if (value === undefined) return undefined;
	if (value === "") {
		throw refusal("ORIGIN is empty; leave it out or set it to an http or https origin");
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw refusal("ORIGIN is not a URL; set it to an origin such as https://obzorarr.example");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw refusal("ORIGIN must use http or https");
	}
	// The raw text is checked as well: the parser drops an empty `@`, `?` or `#`, reads a backslash
	// as a slash, and removes dot segments, so `https://host/app/..` and `https://host\app\..` would
	// parse to a bare origin.
	// The parser also reads a host after a scheme with no "//" (`https:host`, `https:\\host`), so
	// the raw text must start with it before the authority can be found after it.
	const scheme = /^https?:\/\//i.exec(value);
	if (scheme === null) {
		throw refusal("ORIGIN is not a URL; set it to an origin such as https://obzorarr.example");
	}
	const rest = value.slice(scheme[0].length);
	const authority = rest.split(/[/\\?#]/, 1)[0] ?? "";
	const rawPath = rest.slice(authority.length).split(/[?#]/, 1)[0] ?? "";
	if (url.username !== "" || url.password !== "" || authority.includes("@")) {
		throw refusal("ORIGIN must not hold credentials");
	}
	if (url.search !== "" || value.includes("?")) throw refusal("ORIGIN must not have a query");
	if (url.hash !== "" || value.includes("#")) throw refusal("ORIGIN must not have a fragment");
	if (url.pathname !== "/" || (rawPath !== "" && rawPath !== "/")) {
		throw refusal("ORIGIN must not have a path");
	}
	return url.origin;
}

const refusal = (message: string) => new ConfigError("ORIGIN", message);
