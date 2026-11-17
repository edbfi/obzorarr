// The scanner filter (SPEC-sign-in.md, "The scanner filter"): requests that only probes and
// known scanners make, answered before the rate limits so they don't use up a real visitor's
// allowance. The lists never match a path the app serves; a test checks every route.

/** First path segments that only blog tools, database-admin tools and framework consoles use. */
const PROBE_ROOTS = new Set([
	"wp-admin",
	"wp-content",
	"wp-includes",
	"wp-json",
	"wp-login.php",
	"xmlrpc.php",
	"phpmyadmin",
	"adminer",
	"actuator",
	"console",
	"_profiler",
	"cgi-bin",
]);

/** Segments anywhere in a path that hold secrets or version control, which the app never serves. */
const PROBE_FOLDERS = new Set([".git", ".svn", ".hg", ".aws"]);

/** Parts of a user agent that only known scanners send, matched ignoring case. */
const SCANNER_AGENTS = [
	"sqlmap",
	"nikto",
	"nuclei",
	"wpscan",
	"masscan",
	"zgrab",
	"nmap scripting engine",
	"dirbuster",
	"gobuster",
];

/**
 * A path segment as a server would read it: percent-decoded once, keeping the raw text when its
 * escapes don't decode; cut at a `;` parameter or a NUL; without trailing dots; in lower case.
 */
function segmentAsRead(raw: string): string {
	let segment: string;
	try {
		segment = decodeURIComponent(raw);
	} catch {
		segment = raw;
	}
	return segment
		.replace(/[;\0].*$/s, "")
		.replace(/\.+$/, "")
		.toLowerCase();
}

/**
 * What the filter does with a request: a probe path gets "Not found", a known scanner
 * "Forbidden", and anything else passes. The path is matched segment by segment, as a server
 * would read it, so an encoded or padded name is caught too.
 */
export function scannerVerdict(
	path: string,
	userAgent: string | null,
): "probe" | "scanner" | undefined {
	const segments = path
		.split("/")
		.filter((segment) => segment !== "")
		.map(segmentAsRead);
	const first = segments[0] ?? "";
	const last = segments.at(-1) ?? "";
	if (
		PROBE_ROOTS.has(first) ||
		segments.some((segment) => PROBE_FOLDERS.has(segment) || segment.startsWith(".env")) ||
		last.endsWith(".php")
	) {
		return "probe";
	}
	const agent = userAgent?.toLowerCase() ?? "";
	if (SCANNER_AGENTS.some((scanner) => agent.includes(scanner))) return "scanner";
	return undefined;
}
