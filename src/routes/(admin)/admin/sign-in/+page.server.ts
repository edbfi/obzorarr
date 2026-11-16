import { error, fail, redirect } from "@sveltejs/kit";
import * as m from "#lib/paraglide/messages.js";
import { browserAddress } from "#lib/server/security/browser-address.ts";
import { returnPath } from "#lib/server/security/return-path.ts";
import { SESSION_COOKIE, sessionCookieOptions } from "#lib/server/security/session-cookie.ts";
import { currentDatabase, currentOrigin } from "#lib/server/services/setup/startup.ts";
import { signIn } from "#lib/server/services/sign-in/sign-in.ts";
import type { Actions, PageServerLoad } from "./$types";

/** What a failed sign-in sends back: the typed username and what went wrong, nothing else. */
export type SignInFailure = {
	username: string;
	/** A wrong username or password: one answer for both. */
	wrong?: boolean;
	/** Every hash slot was busy: try again in a few seconds. */
	busy?: boolean;
};

/** The sign-in page and its answers are never cached (SPEC-sign-in.md, "Owner-only pages"). */
const NO_STORE = { "cache-control": "no-store" };

export const load: PageServerLoad = ({ request, setHeaders }) => {
	// The action sets it on every POST, and SvelteKit runs the load after the action on a native
	// form post; setting a header twice throws.
	if (request.method !== "POST") setHeaders(NO_STORE);
};

export const actions: Actions = {
	default: async ({ request, url, locals, setHeaders, cookies }) => {
		setHeaders(NO_STORE);
		// Signing in sets a cookie, whose Secure flag follows the browser's address, so a browser
		// that didn't say which address it is on is refused before anything is checked.
		const address = browserAddress(request, currentOrigin());
		if (address === undefined) error(403, m.error_no_browser_address());
		const form = await request.formData();
		// Form fields are external input: anything but text counts as empty.
		const field = (name: string) => {
			const value = form.get(name);
			return typeof value === "string" ? value : "";
		};
		const username = field("username");
		const result = await signIn(currentDatabase(), {
			username,
			password: field("password"),
			clientAddress: locals.clientAddress,
		});
		switch (result.status) {
			case "signed-in":
				cookies.set(
					SESSION_COOKIE,
					result.session.token,
					sessionCookieOptions(address, result.session.expiresAt, new Date()),
				);
				return redirect(303, returnPath(url.searchParams.get("next")) ?? "/admin");
			case "wrong":
				return fail<SignInFailure>(400, { username, wrong: true });
			case "too-many":
				setHeaders(result.headers);
				return fail<SignInFailure>(429, { username, busy: true });
		}
	},
};
