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
	// The raw text is checked as well: the parser drops an empty `@`, `?` or `#`, and removes dot
	// segments, so `https://host/app/..` would parse to a bare origin.
	const rest = value.slice(value.indexOf("//") + 2);
	const authority = rest.split(/[/?#]/, 1)[0] ?? "";
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
