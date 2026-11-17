/**
 * The owner's session cookie, named after the app: cookies ignore ports, so apps on one address
 * would otherwise sign each other out (SPEC-sign-in.md, "The browser's address and cookies").
 */
export const SESSION_COOKIE = "obzorarr_session";

/** What `cookies.set` and `cookies.delete` take for the session cookie. */
export type SessionCookieOptions = {
	readonly path: "/";
	readonly httpOnly: true;
	readonly sameSite: "lax";
	readonly secure: boolean;
	readonly maxAge?: number;
};

/**
 * The cookie's options for a session ending at `expiresAt`: host-only, `HttpOnly`, `SameSite=Lax`,
 * and `Secure` exactly when the browser's address is https, so a plain-HTTP install at home works.
 * `secure` is always set, since SvelteKit's default is `Secure` on every host but `localhost`.
 */
export function sessionCookieOptions(
	browserAddress: string,
	expiresAt: Date,
	now: Date,
): SessionCookieOptions {
	return {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure: isHttps(browserAddress),
		maxAge: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
	};
}

/**
 * Deleting the cookie where the browser's address isn't known, as when a stale session is
 * cleared on a GET: `secure: false` works over HTTP and HTTPS alike.
 */
export const SESSION_COOKIE_DELETION: SessionCookieOptions = {
	path: "/",
	httpOnly: true,
	sameSite: "lax",
	secure: false,
};

/** Deleting the cookie where the browser's address is known, as at sign-out. */
export function sessionCookieDeletion(browserAddress: string): SessionCookieOptions {
	return { ...SESSION_COOKIE_DELETION, secure: isHttps(browserAddress) };
}

/** Whether the browser's address is https: the one rule for every write and deletion's `Secure`. */
function isHttps(browserAddress: string): boolean {
	return browserAddress.startsWith("https:");
}
