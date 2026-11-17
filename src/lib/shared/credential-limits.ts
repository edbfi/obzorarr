// The limits the owner's credentials and the console tokens keep: the one place both the server's
// rules and the messages that state them read (SPEC-i18n.md, "Placeholders").

/** The longest username, in code points. */
export const USERNAME_MAX_LENGTH = 64;
/**
 * The shortest password, in code points: NIST SP 800-63B-4's minimum for a password that is the
 * only factor.
 */
export const PASSWORD_MIN_LENGTH = 15;
/** The longest password, in code points. */
export const PASSWORD_MAX_LENGTH = 128;
/** How long a console token lasts from when it was printed, and how often setup's is renewed. */
export const CONSOLE_TOKEN_MINUTES = 15;
