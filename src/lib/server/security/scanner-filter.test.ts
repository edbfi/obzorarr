import { fileURLToPath } from "node:url";
import { Glob } from "bun";
import { describe, expect, it } from "vitest";
import { scannerVerdict } from "./scanner-filter.ts";

describe("scannerVerdict", () => {
	it.each([
		["/.env"],
		["/.env.production"],
		["/app/.env.local"],
		["/.git/config"],
		["/.git"],
		["/.svn/entries"],
		["/.hg/hgrc"],
		["/wp-admin/install.php"],
		["/WP-ADMIN/"],
		["/wp-login.php"],
		["/wp-content/plugins/x"],
		["/xmlrpc.php"],
		["/phpmyadmin/index.php"],
		["/phpMyAdmin/"],
		["/adminer"],
		["/actuator/health"],
		["/console"],
		["/_profiler/phpinfo"],
		["/cgi-bin/luci"],
		["/index.php"],
		["/vendor/phpunit/src/Util/PHP/eval-stdin.php"],
		["/.aws/credentials"],
		// Percent-encoded, as a request's path arrives.
		["/%2Eenv"],
		["/%2egit/config"],
		["/wp%2Dadmin"],
		["/index%2Ephp"],
		["/index.ph%70"],
		// With what servers ignore after the name.
		["/index.php."],
		["/index.php;x"],
		["/index.php%00"],
		["/wp-admin."],
		["/console."],
	])("answers the probe path %s as a probe", (path) => {
		expect(scannerVerdict(path, "Mozilla/5.0")).toBe("probe");
	});

	it.each([
		["sqlmap/1.8#stable (https://sqlmap.org)"],
		["Mozilla/5.00 (Nikto/2.5.0) (Evasions:None) (Test:000001)"],
		["Mozilla/5.0 (compatible; Nuclei - Open-source project (github.com/projectdiscovery/nuclei))"],
		["WPScan v3.8.25 (https://wpscan.com/wordpress-security-scanner)"],
		["masscan/1.3 (https://github.com/robertdavidgraham/masscan)"],
		["Mozilla/5.0 zgrab/0.x"],
		["Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)"],
		["DirBuster-1.0-RC1 (http://www.owasp.org/index.php/Category:OWASP_DirBuster_Project)"],
		["gobuster/3.6"],
	])("answers the scanner agent %j as a scanner", (agent) => {
		expect(scannerVerdict("/", agent)).toBe("scanner");
	});

	it("lets an ordinary browser, a missing agent and lookalike paths through", () => {
		const browser =
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";
		for (const path of [
			"/",
			"/environment",
			"/consoles",
			"/my.php.notes/x",
			"/.well-known/security.txt",
			// Escapes that don't decode are matched as they are, without throwing.
			"/a%ZZb",
			"/%E0%A4%A",
		]) {
			expect(scannerVerdict(path, browser), path).toBeUndefined();
		}
		expect(scannerVerdict("/", null)).toBeUndefined();
	});

	it("matches no path the app serves", () => {
		// The routes folder, found from this file, so the test runs from any directory.
		const root = fileURLToPath(new URL("../../../routes", import.meta.url));
		const routes = [...new Glob("**/+{page.svelte,page.server.ts,server.ts}").scanSync(root)];
		expect(routes.length).toBeGreaterThan(5);
		const paths = routes.map(
			(file) =>
				`/${file
					.replace(/\/?\+[^/]+$/, "")
					.split("/")
					.filter((segment) => !/^\(.*\)$/.test(segment))
					// A route parameter, such as a member's identifier, takes a sample value.
					.map((segment) => (/^\[.*\]$/.test(segment) ? "sample-value" : segment))
					.join("/")}`,
		);
		// The built app's own files, and the data requests SvelteKit makes for each page.
		paths.push("/_app/immutable/entry/start.js", "/_app/version.json", "/admin/__data.json");
		for (const path of paths) expect(scannerVerdict(path, null), path).toBeUndefined();
	});
});
