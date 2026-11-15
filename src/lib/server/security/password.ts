import commonPasswordList from "./common-passwords.txt?raw";

/**
 * The bundled list of common passwords, from SecLists' (MIT licence)
 * `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt` at commit
 * 180c2d55afa7aab8b18b7552f82dd0c92cc4ede5. To rebuild it, take each line, normalise it to NFC
 * and lower-case it, keep it if it has 15 to 128 code points and no control characters, then
 * remove duplicates and sort: 10,898 entries. Shorter ones need no list, since the length rule
 * refuses them already.
 */
const COMMON_PASSWORDS = new Set(commonPasswordList.split("\n").filter((entry) => entry !== ""));

const APP_NAME = "obzorarr";

export type UsernameError = "empty" | "too-long" | "control";
export type PasswordError = "too-short" | "too-long" | "app-name" | "username" | "common";

/** Unicode code points, which is what the length limits count. */
const codePoints = (text: string) => [...text].length;

/**
 * The owner's username as it is stored: trimmed and normalised to NFC, case kept, 1–64 code
 * points, with no control characters (SPEC-setup.md, "Owner credentials").
 */
export function checkUsername(
	raw: string,
): { ok: true; username: string } | { ok: false; error: UsernameError } {
	const username = raw.trim().normalize("NFC");
	if (username === "") return { ok: false, error: "empty" };
	if (codePoints(username) > 64) return { ok: false, error: "too-long" };
	if (/\p{Cc}/u.test(username)) return { ok: false, error: "control" };
	return { ok: true, username };
}

/**
 * The owner's password, normalised to NFC: 15–128 code points of any characters, with no
 * composition rules. It may not contain, ignoring case, the app's name, or the username when it
 * has 4 or more characters, and it may not be on the bundled list. 15 is NIST SP 800-63B-4's
 * minimum for a password that is the only factor.
 */
export function checkPassword(
	raw: string,
	username: string,
): { ok: true; password: string } | { ok: false; error: PasswordError } {
	const password = raw.normalize("NFC");
	const length = codePoints(password);
	if (length < 15) return { ok: false, error: "too-short" };
	if (length > 128) return { ok: false, error: "too-long" };
	const lower = password.toLowerCase();
	if (lower.includes(APP_NAME)) return { ok: false, error: "app-name" };
	const name = username.normalize("NFC").toLowerCase();
	if (codePoints(name) >= 4 && lower.includes(name)) return { ok: false, error: "username" };
	if (COMMON_PASSWORDS.has(lower)) return { ok: false, error: "common" };
	return { ok: true, password };
}

/** Hashes the NFC form with argon2id and Bun's defaults, so `verifyPassword` checks the same. */
export function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password.normalize("NFC"), { algorithm: "argon2id" });
}

/** Whether `password`, in its NFC form, is the one `hash` was made from. */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
	return Bun.password.verify(password.normalize("NFC"), hash);
}
