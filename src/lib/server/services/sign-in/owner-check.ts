const SIGN_IN = "/admin/sign-in";
/** The paths under `/admin` that anyone may open: signing in, and signing out. */
const OPEN = new Set([SIGN_IN, "/admin/sign-out"]);

export type OwnerCheckDecision =
	/** Go on; an owner-only response is kept out of every cache. */
	| { action: "pass"; noStore: boolean }
	| { action: "redirect"; location: string }
	/** "Your session ended. Sign in again.", with a way back to `returnTo` once signed in. */
	| { action: "refuse"; returnTo: string };

/**
 * The owner check's decision for a request (SPEC-sign-in.md, "Owner-only pages"): every path
 * under `/admin` but signing in and signing out needs the owner's session. Without one, a page or
 * data request goes to sign in and back, and any other method is refused, never replayed. A
 * signed-in owner who opens the sign-in page goes to `/admin`. The path is decoded as SvelteKit
 * decodes it to match a route, so an encoded letter can't reach an owner-only route unchecked; a
 * path that can't be decoded counts as owner-only.
 */
export function ownerCheck({
	path,
	method,
	signedIn,
}: {
	path: string;
	method: string;
	signedIn: boolean;
}): OwnerCheckDecision {
	const route = routePath(path);
	const reading = method === "GET" || method === "HEAD";
	const open = route !== undefined && OPEN.has(withoutTrailingSlash(route));
	if (open) {
		return signedIn && reading && withoutTrailingSlash(route) === SIGN_IN
			? { action: "redirect", location: "/admin" }
			: { action: "pass", noStore: false };
	}
	const ownerOnly = route === undefined || route === "/admin" || route.startsWith("/admin/");
	if (!ownerOnly) return { action: "pass", noStore: false };
	if (signedIn) return { action: "pass", noStore: true };
	return reading
		? { action: "redirect", location: `${SIGN_IN}?next=${encodeURIComponent(path)}` }
		: { action: "refuse", returnTo: path };
}

/** The path as SvelteKit matches routes against it (its `decode_pathname`), or undefined. */
function routePath(path: string): string | undefined {
	try {
		return path.split("%25").map(decodeURI).join("%25");
	} catch {
		return undefined;
	}
}

const withoutTrailingSlash = (path: string) =>
	path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
