import { m } from "#lib/paraglide/messages.js";

/**
 * What each of `setup`'s password rules says when a new password breaks it, shared by the claim
 * and the password change.
 */
export const passwordMessages = {
	"too-short": m.setup_password_too_short,
	"too-long": m.setup_password_too_long,
	pattern: m.setup_password_pattern,
	"app-name": m.setup_password_app_name,
	username: m.setup_password_username,
	common: m.setup_password_common,
};
