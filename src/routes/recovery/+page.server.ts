import { error, fail, redirect } from "@sveltejs/kit";
import * as m from "#lib/paraglide/messages.js";
import { browserAddress } from "#lib/server/security/browser-address.ts";
import type { PasswordError } from "#lib/server/security/password.ts";
import { SESSION_COOKIE, sessionCookieOptions } from "#lib/server/security/session-cookie.ts";
import { currentDatabase, currentOrigin } from "#lib/server/services/setup/startup.ts";
import { isRecoveryWaiting, recover } from "#lib/server/services/sign-in/recovery.ts";
import { APP_NAME } from "#lib/shared/app-name.ts";
import type { Actions, PageServerLoad } from "./$types";

/** What a failed recovery sends back: what went wrong, never the token or the password. */
export type RecoveryFailure = {
	passwordError?: PasswordError;
	tokenRefused?: boolean;
	failed?: boolean;
	/** Too many attempts from this address: how long to wait before trying again. */
	retryAfterSeconds?: number;
	/** Every hash slot was busy: try again in a few seconds. */
	busy?: boolean;
};

/** Recovery and its answers are never cached (SPEC-sign-in.md, "Owner-only pages"). */
const NO_STORE = { "cache-control": "no-store" };

/**
 * `/recovery` exists only while a recovery token is waiting: recovery is on, the instance claimed
 * and the token unused (SPEC-sign-in.md, "Recovery").
 */
export const load: PageServerLoad = ({ request, setHeaders }) => {
	// The action sets it on every POST, and SvelteKit runs the load after the action on a native
	// form post; setting a header twice throws.
	if (request.method !== "POST") setHeaders(NO_STORE);
	// Without JavaScript, SvelteKit runs this after the action: a try that used the token and
	// failed must still show its answer, so only a GET is sent away once no token waits.
	if (request.method !== "POST" && !isRecoveryWaiting()) error(404);
};

export const actions: Actions = {
	default: async ({ request, locals, setHeaders, cookies }) => {
		setHeaders(NO_STORE);
		if (!isRecoveryWaiting()) error(404);
		// Recovery signs the owner in, setting a cookie whose Secure flag follows the browser's
		// address, so that comes next, before the limit counts the try or the token can be used up.
		const address = browserAddress(request, currentOrigin());
		if (address === undefined) error(403, m.error_no_browser_address({ name: APP_NAME }));
		const form = await request.formData();
		// Form fields are external input: anything but text counts as empty.
		const field = (name: string) => {
			const value = form.get(name);
			return typeof value === "string" ? value : "";
		};
		const result = await recover(currentDatabase(), {
			token: field("token"),
			password: field("password"),
			clientAddress: locals.clientAddress,
		});
		switch (result.status) {
			case "recovered":
				cookies.set(
					SESSION_COOKIE,
					result.session.token,
					sessionCookieOptions(address, result.session.expiresAt, new Date()),
				);
				return redirect(303, "/admin/settings/security");
			case "not-found":
				return error(404);
			case "invalid":
				return fail<RecoveryFailure>(400, { passwordError: result.error });
			case "token":
				return fail<RecoveryFailure>(400, { tokenRefused: true });
			case "failed":
				return fail<RecoveryFailure>(500, { failed: true });
			case "too-many":
				setHeaders(result.headers);
				return fail<RecoveryFailure>(
					429,
					result.reason === "busy"
						? { busy: true }
						: { retryAfterSeconds: result.retryAfterSeconds },
				);
		}
	},
};
