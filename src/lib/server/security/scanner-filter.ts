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
 * What the filter does with a request: a probe path gets "Not found", a known scanner
 * "Forbidden", and anything else passes. The path is matched as sent, ignoring case.
 */
export function scannerVerdict(
	path: string,
	userAgent: string | null,
): "probe" | "scanner" | undefined {
	const segments = path
		.toLowerCase()
		.split("/")
		.filter((segment) => segment !== "");
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
