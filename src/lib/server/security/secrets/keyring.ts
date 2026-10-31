import {
	readSecretKey,
	type SecretKeyCheck,
	type SecretKeyEnv,
	SecretKeyError,
	type SecretKeyVariable,
} from "#lib/server/config/secret-key.ts";
import { decodeKeyText, type KeyCheck, KeyTextError } from "./key-text.ts";

/** The keys the cipher uses, derived from the master key (SPEC-secrets.md, "Derivation"). */
export type Keyring = { readonly keyId: string; readonly aesKey: CryptoKey };

/** The checks loading the master key can fail: reading its text, then the text itself. */
export type KeyringCheck = SecretKeyCheck | KeyCheck;

/**
 * Loading the master key failed `check`. The message is one line naming the variable and the
 * check, and never holds key text. The error has no other fields, not even a `cause`: Bun prints
 * an uncaught error's own fields and its whole `cause` chain.
 */
export class KeyringError extends Error {
	override readonly name = "KeyringError";

	constructor(
		readonly check: KeyringCheck,
		message: string,
	) {
		super(message);
	}
}

const AES_INFO = "edbfi:secrets:v1:aes-256-gcm";
const KEY_ID_INFO = "edbfi:secrets:v1:key-id";
const NEW_KEY = "generate a new key with: openssl rand -base64 32";
const HINT = `; ${NEW_KEY}`;
const SUBJECT: Record<SecretKeyVariable, string> = {
	OBZORARR_SECRET_KEY: "OBZORARR_SECRET_KEY",
	OBZORARR_SECRET_KEY_FILE: "the key in the file OBZORARR_SECRET_KEY_FILE names",
};

let loaded: Keyring | undefined;
let latestLoad = 0;

/**
 * Reads and checks the master key, then derives the cipher's keys and keeps them for
 * `currentKeyring`. Any failure leaves no keyring loaded; when loads overlap, only the one started
 * last can store its keyring.
 */
export async function loadKeyring(env: SecretKeyEnv): Promise<void> {
	loaded = undefined;
	const load = ++latestLoad;

	let subject = "";
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		const { text, variable } = await readSecretKey(env);
		subject = SUBJECT[variable];
		bytes = decodeKeyText(text);
	} catch (error) {
		// Losing a variable looks like a first install, so the existing key comes first. A key
		// that can't be read may be valid and in use: a new one would lose every stored secret.
		if (error instanceof SecretKeyError) {
			const message =
				error.check === "missing"
					? `${error.message}; set one to your existing key, or ${NEW_KEY}`
					: error.message;
			throw new KeyringError(error.check, message);
		}
		// A malformed or weak key never started the app, so replacing it loses nothing.
		if (error instanceof KeyTextError) {
			throw new KeyringError(error.check, `${subject} ${error.message}${HINT}`);
		}
		throw error;
	}

	// The HKDF key stays here: whoever holds it can derive the AES key's bytes with `deriveBits`.
	const base = await crypto.subtle.importKey("raw", bytes, "HKDF", false, [
		"deriveKey",
		"deriveBits",
	]);
	const [aesKey, keyIdBits] = await Promise.all([
		crypto.subtle.deriveKey(hkdf(AES_INFO), base, { name: "AES-GCM", length: 256 }, false, [
			"encrypt",
			"decrypt",
		]),
		crypto.subtle.deriveBits(hkdf(KEY_ID_INFO), base, 128),
	]);
	const keyId = new Uint8Array(keyIdBits).toBase64({ alphabet: "base64url", omitPadding: true });
	if (load === latestLoad) loaded = Object.freeze({ keyId, aesKey });
}

/** The keyring of the latest successful load; throws if none is loaded. */
export function currentKeyring(): Keyring {
	if (loaded === undefined) {
		throw new Error("no master key is loaded; loadKeyring must succeed first");
	}
	return loaded;
}

/** HKDF-SHA-256 with an empty salt and `info` as its label. */
function hkdf(info: string): HkdfParams {
	return {
		name: "HKDF",
		hash: "SHA-256",
		salt: new Uint8Array(0),
		info: new TextEncoder().encode(info),
	};
}
