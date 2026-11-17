import { m } from "#lib/paraglide/messages.js";
import { APP_NAME } from "#lib/shared/app-name.ts";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "#lib/shared/credential-limits.ts";

/**
 * What each of `setup`'s password rules says when a new password breaks it, shared by the claim
 * and the password change.
 */
export const passwordMessages = {
	"too-short": () => m.setup_password_too_short({ count: PASSWORD_MIN_LENGTH }),
	"too-long": () => m.setup_password_too_long({ count: PASSWORD_MAX_LENGTH }),
	pattern: () => m.setup_password_pattern(),
	"app-name": () => m.setup_password_app_name({ name: APP_NAME }),
	username: () => m.setup_password_username(),
	common: () => m.setup_password_common(),
};
