import { error, redirect } from "@sveltejs/kit";
import * as m from "#lib/paraglide/messages.js";
import { browserAddress } from "#lib/server/security/browser-address.ts";
import { SESSION_COOKIE, sessionCookieDeletion } from "#lib/server/security/session-cookie.ts";
import { currentDatabase, currentOrigin } from "#lib/server/services/setup/startup.ts";
import { endSession } from "#lib/server/services/sign-in/sessions.ts";
import type { Actions, PageServerLoad } from "./$types";

/**
 * A GET signs nobody out: it only goes to `/admin`, so an image tag or a prefetch can't sign the
 * owner out (SPEC-sign-in.md, "Signing out").
 */
export const load: PageServerLoad = () => redirect(303, "/admin");

export const actions: Actions = {
	/**
	 * Ends the session and deletes its cookie, or only clears the cookie when there is no session,
	 * then goes to sign in. The deletion's `Secure` follows the browser's address, so a browser
	 * that didn't say which address it is on is refused first.
	 */
	default: async ({ request, cookies }) => {
		const address = browserAddress(request, currentOrigin());
		if (address === undefined) error(403, m.error_no_browser_address());
		const token = cookies.get(SESSION_COOKIE);
		if (token !== undefined) await endSession(currentDatabase(), token);
		cookies.delete(SESSION_COOKIE, sessionCookieDeletion(address));
		redirect(303, "/admin/sign-in");
	},
};
