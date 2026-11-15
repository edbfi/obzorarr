import { timingSafeEqual } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 12;

/** The largest multiple of the alphabet's size that fits in a byte: bytes from here up bias. */
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

/** How long a bootstrap token can claim the instance, from when it was printed. */
export const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

/** A token, when it was issued and how long it lasts. Held only in memory (SPEC-setup.md). */
export type BootstrapToken = {
	readonly value: string;
	readonly issuedAt: number;
	readonly lifetimeMs: number;
};

/**
 * Draws 12 lowercase letters and digits from WebCrypto, without bias: a byte the alphabet
 * doesn't divide evenly is drawn again, so every character is as likely as the others.
 */
export function drawToken(): string {
	let token = "";
	while (token.length < LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH))) {
			if (byte < UNBIASED_LIMIT && token.length < LENGTH) token += ALPHABET[byte % ALPHABET.length];
		}
	}
	return token;
}

/** A new token issued at `now`, lasting 15 minutes unless `lifetimeMs` says otherwise. */
export function issueToken(now: number, lifetimeMs = TOKEN_LIFETIME_MS): BootstrapToken {
	return { value: drawToken(), issuedAt: now, lifetimeMs };
}

/** Whether `token` can still claim the instance at `now`. */
export function isTokenValid(token: BootstrapToken, now: number): boolean {
	return now - token.issuedAt < token.lifetimeMs;
}

/** The token as it is shown: `xxxx-xxxx-xxxx`. */
export function formatToken(token: string): string {
	return `${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8)}`;
}

/**
 * Whether what someone typed is `token`: with or without the dashes, in any case, with spaces
 * around it trimmed, compared in constant time.
 */
export function tokenMatches(token: string, entry: string): boolean {
	const typed = entry.trim().toLowerCase().replaceAll("-", "");
	if (!/^[a-z0-9]{12}$/.test(typed)) return false;
	return timingSafeEqual(Buffer.from(typed), Buffer.from(token));
}
