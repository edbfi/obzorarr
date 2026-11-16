import { createHash } from "node:crypto";

/** A session's token, which only the cookie holds, and its hash, which only the database holds. */
export type SessionToken = { readonly token: string; readonly hash: string };

/**
 * A new session token: 32 random bytes from WebCrypto, base64url-encoded for the cookie, and its
 * SHA-256 hash, the only form that is stored (D20), so a copy of the database can't be used to
 * sign in. The token is random enough that a fast hash is the right one: there is nothing to
 * guess.
 */
export function newSessionToken(): SessionToken {
	const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
	return { token, hash: hashSessionToken(token) };
}

/** The stored form of a token a cookie holds. */
export function hashSessionToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
