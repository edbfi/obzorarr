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

describe("app code", () => {
	it("never takes the browser's address from the request URL's origin or protocol", async () => {
		const src = join(import.meta.dirname, "../../..");
		// `config/origin.ts` validates ORIGIN itself, and may read its parsed URL's parts.
		const allowed = new Set(["lib/server/config/origin.ts"]);
		const offenders: string[] = [];
		for (const file of await sourceFiles(src)) {
			const name = relative(src, file);
			if (allowed.has(name)) continue;
			if (/\burl\.(origin|protocol)\b/.test(await readFile(file, "utf8"))) offenders.push(name);
		}
		expect(offenders).toEqual([]);
	});
});
