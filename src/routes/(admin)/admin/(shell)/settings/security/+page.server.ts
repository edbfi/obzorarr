import { type Cookies, error, fail } from "@sveltejs/kit";
import * as m from "#lib/paraglide/messages.js";
import { browserAddress } from "#lib/server/security/browser-address.ts";
import type { PasswordError } from "#lib/server/security/password.ts";
import {
	SESSION_COOKIE,
	SESSION_COOKIE_DELETION,
	sessionCookieDeletion,
	sessionCookieOptions,
} from "#lib/server/security/session-cookie.ts";
import { currentDatabase, currentOrigin } from "#lib/server/services/setup/startup.ts";
import { changePassword } from "#lib/server/services/sign-in/password-change.ts";
import { countOtherSessions, endOtherSessions } from "#lib/server/services/sign-in/sessions.ts";
import type { Actions, PageServerLoad } from "./$types";

/** What the password change sends back: whether it was changed, or what went wrong. */
export type PasswordAnswer = {
	changed?: boolean;
	wrongCurrent?: boolean;
	/** The new password broke one of `setup`'s rules. */
	error?: PasswordError;
	/** Every hash slot was busy: try again in a few seconds. */
	busy?: boolean;
	/** Too many attempts from this address, or its wait after failed sign-ins: how long it lasts. */
	retryAfterSeconds?: number;
};

/**
 * The Security tab (SPEC-sign-in.md, "The Security tab"). The owner check let only a request with
 * the owner's live session in, so the session cookie is there.
 */
export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	return {
		otherSessions:
			token === undefined ? 0 : await countOtherSessions(currentDatabase(), token, new Date()),
	};
};

/** The password change's answer, under its own key, apart from the sessions action's. */
const password = (answer: PasswordAnswer) => ({ password: answer });

/**
 * "Your session ended", as the owner check answers a request whose session is gone: here, one
 * that ended while the action ran, or a request without the cookie, which the owner check lets
 * through only in a test. The cookie is cleared; its `Secure` follows the browser's address when
 * it is known, and is off otherwise, which clears it over both schemes.
 */
function sessionEnded(cookies: Cookies, address: string | undefined): never {
	cookies.delete(
		SESSION_COOKIE,
		address === undefined ? SESSION_COOKIE_DELETION : sessionCookieDeletion(address),
	);
	error(403, m.error_session_ended_description());
}

/** A form field as text; anything else counts as empty, since form fields are external input. */
const field = (form: FormData, name: string) => {
	const value = form.get(name);
	return typeof value === "string" ? value : "";
};

export const actions: Actions = {
	/**
	 * Changes the password, keeping this browser signed in with a new session token. The new
	 * cookie's Secure flag follows the browser's address, so a browser that didn't say which
	 * address it is on is refused before anything is checked.
	 */
	password: async ({ request, locals, setHeaders, cookies }) => {
		const address = browserAddress(request, currentOrigin());
		if (address === undefined) error(403, m.error_no_browser_address());
		const sessionToken = cookies.get(SESSION_COOKIE);
		if (sessionToken === undefined) sessionEnded(cookies, address);
		const form = await request.formData();
		const result = await changePassword(currentDatabase(), {
			sessionToken,
			current: field(form, "current"),
			next: field(form, "next"),
			clientAddress: locals.clientAddress,
		});
		switch (result.status) {
			case "changed":
				cookies.set(
					SESSION_COOKIE,
					result.session.token,
					sessionCookieOptions(address, result.session.expiresAt, new Date()),
				);
				return password({ changed: true });
			case "wrong-current":
				return fail(400, password({ wrongCurrent: true }));
			case "invalid":
				return fail(400, password({ error: result.error }));
			case "too-many":
				setHeaders(result.headers);
				return fail(
					429,
					password(
						result.reason === "busy"
							? { busy: true }
							: { retryAfterSeconds: result.retryAfterSeconds },
					),
				);
			case "signed-out":
				// Without JavaScript, a second click sends the old cookie too: it loses this race, and
				// clears the cookie the first set, so the owner signs in again with the new password.
				sessionEnded(cookies, address);
		}
	},

	/**
	 * "Sign out everywhere else": ends every other session and says how many, only while this
	 * browser's own session is live. It sets no cookie, so it doesn't need the browser's address.
	 */
	sessions: async ({ request, cookies }) => {
		const address = browserAddress(request, currentOrigin());
		const token = cookies.get(SESSION_COOKIE);
		if (token === undefined) sessionEnded(cookies, address);
		const ended = await endOtherSessions(currentDatabase(), token, new Date());
		if (ended === undefined) sessionEnded(cookies, address);
		return { sessions: { ended } };
	},
};
