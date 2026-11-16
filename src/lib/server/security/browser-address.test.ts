import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { browserAddress } from "./browser-address.ts";

/** A POST carrying `headers`. */
const post = (headers: Record<string, string>) =>
	new Request("http://app.test/setup", { method: "POST", headers });

describe("browserAddress", () => {
	it("is ORIGIN when it is set, whatever the browser sent", () => {
		const origin = "https://obzorarr.example";
		expect(browserAddress(post({ origin: "http://other.test" }), origin)).toBe(origin);
		expect(browserAddress(post({}), origin)).toBe(origin);
	});

	it("is the POST's validated Origin when ORIGIN is unset", () => {
		expect(browserAddress(post({ origin: "http://192.168.1.20:3000" }), undefined)).toBe(
			"http://192.168.1.20:3000",
		);
		expect(browserAddress(post({ origin: "HTTPS://Obzorarr.Example:443" }), undefined)).toBe(
			"https://obzorarr.example",
		);
	});

	it("is unknown when the browser stripped Origin or sent one that isn't a bare origin", () => {
		for (const origin of [undefined, "null", "https://a.test/path", "ftp://a.test", "garbage"]) {
			const headers: Record<string, string> = origin === undefined ? {} : { origin };
			expect(browserAddress(post(headers), undefined)).toBeUndefined();
		}
	});
});

/** Every app source file under `src/`, tests left out. */
async function sourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return entry.name === "paraglide" ? [] : sourceFiles(path);
			const isSource = /\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith(".test.ts");
			return isSource ? [path] : [];
		}),
	);
	return files.flat();
}

/**
 * Reading the request URL's origin or protocol, however it is written: `event.url.origin`,
 * `page.url?.protocol`, `new URL(event.request.url).origin`, or destructured from a `url`. A local
 * variable that happens to be called `url`, such as a parsed upstream address, isn't one.
 */
const REQUEST_URL_ORIGIN = [
	/\.url\??\.(origin|protocol)\b/,
	/request\.url\)\s*\??\.(origin|protocol)\b/,
	/\{[^}]*\b(origin|protocol)\b[^}]*\}\s*=\s*[\w.?]*\burl\b/,
	/\burl\s*:\s*\{[^}]*\b(origin|protocol)\b/,
];
const readsRequestUrlOrigin = (code: string) =>
	REQUEST_URL_ORIGIN.some((pattern) => pattern.test(code));

describe("app code", () => {
	it("is searched for every way of reading the request URL's origin or protocol", () => {
		for (const code of [
			"const at = event.url.origin;",
			"page.url?.protocol",
			"new URL(event.request.url).origin",
			"const { origin } = event.url;",
			"const { protocol, host } = page.url;",
			"load({ url: { origin } })",
		]) {
			expect(readsRequestUrlOrigin(code), code).toBe(true);
		}
		for (const code of ["url.protocol !== 'https:'", "sent.origin === origin", "upstream.origin"]) {
			expect(readsRequestUrlOrigin(code), code).toBe(false);
		}
	});

	it("never takes the browser's address from the request URL's origin or protocol", async () => {
		const src = join(import.meta.dirname, "../../..");
		const files = await sourceFiles(src);
		// The walk reaches app code, so an empty result means something.
		expect(files.map((file) => relative(src, file))).toContain("hooks.server.ts");
		expect(files.length).toBeGreaterThan(30);
		const offenders: string[] = [];
		for (const file of files) {
			if (readsRequestUrlOrigin(await readFile(file, "utf8"))) offenders.push(relative(src, file));
		}
		expect(offenders).toEqual([]);
	});
});
