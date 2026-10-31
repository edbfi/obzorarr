import { currentKeyring } from "./keyring.ts";
import { Secret } from "./secret.ts";

/** The place a secret is stored: it decrypts only there (SPEC-secrets.md, "The cipher"). */
export type SecretBinding = {
	readonly table: string;
	readonly field: string;
	readonly rowId: string;
};

// Each error owns nothing beyond a plain `Error`'s fields and its `name`: Bun prints an uncaught
// error's own fields and its `cause` chain, so none takes a `cause` or holds a value.

/** The stored text isn't the v1 format, or names a version this app doesn't know. */
export class SecretFormatError extends Error {
	override readonly name = "SecretFormatError";
}

/** The stored value was written under another master key. */
export class SecretKeyMismatchError extends Error {
	override readonly name = "SecretKeyMismatchError";
}

/** The tag doesn't verify: the value was changed, or is read at another place. */
export class SecretDecryptError extends Error {
	override readonly name = "SecretDecryptError";
}

const VERSION = "v1";
const APP = "obzorarr";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_BYTES = 16;

const NOT_V1 = "the stored secret isn't in the v1 format";

/**
 * Encrypts `secret` for the place `binding` names, as `v1.<key id>.<nonce>.<ciphertext and tag>`.
 * An empty secret is never stored: `NULL` means none.
 */
export async function encryptSecret(secret: Secret, binding: SecretBinding): Promise<string> {
	checkBinding(binding);
	const value = secret.reveal();
	if (value === "") throw new Error("an empty secret can't be encrypted");
	const { keyId, aesKey } = currentKeyring();

	const iv = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: associatedData(keyId, binding), tagLength: 128 },
		aesKey,
		new TextEncoder().encode(value),
	);
	return `${VERSION}.${keyId}.${base64url(iv)}.${base64url(new Uint8Array(sealed))}`;
}

/**
 * Decrypts `stored` read from the place `binding` names. Each check's error wins over every
 * later one: the version, the shape, the key ID, then the tag.
 */
export async function decryptSecret(stored: string, binding: SecretBinding): Promise<Secret> {
	checkBinding(binding);
	const { keyId, aesKey } = currentKeyring();

	const parts = stored.split(".");
	if (parts[0] !== VERSION) {
		// A later version may have another shape, so it's reported as unknown, not corrupt.
		const unknown = parts.length >= 2 && /^v[0-9]+$/.test(parts[0] ?? "");
		throw new SecretFormatError(
			unknown ? "the stored secret uses a version this app doesn't know" : NOT_V1,
		);
	}
	const [, id = "", nonce = "", sealed = ""] = parts;
	const idBytes = decodeSegment(id);
	const iv = decodeSegment(nonce);
	const data = decodeSegment(sealed);
	// At least one byte and the tag: an empty secret is never stored.
	if (
		parts.length !== 4 ||
		idBytes?.length !== KEY_ID_BYTES ||
		iv?.length !== NONCE_BYTES ||
		data === undefined ||
		data.length < TAG_BYTES + 1
	) {
		throw new SecretFormatError(NOT_V1);
	}

	// The key ID is public, so a plain comparison is fine.
	if (id !== keyId) {
		const { table, field, rowId } = binding;
		throw new SecretKeyMismatchError(
			`the secret in ${table}.${field} of row ${rowId} was written under another master key; set the key it was written with, or enter this secret again`,
		);
	}

	let plaintext: ArrayBuffer;
	try {
		plaintext = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv, additionalData: associatedData(keyId, binding), tagLength: 128 },
			aesKey,
			data,
		);
	} catch (error) {
		if (error instanceof DOMException && error.name === "OperationError") {
			throw new SecretDecryptError(
				"the stored secret can't be decrypted: it was changed, or is read with another table, field or row ID",
			);
		}
		throw error;
	}

	let text: string;
	try {
		// `ignoreBOM` keeps a leading U+FEFF, so the round trip is exact.
		text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(plaintext);
	} catch {
		throw new SecretFormatError(NOT_V1);
	}
	return new Secret(text);
}

/** Programming errors, like a missing keyring: a binding names a real place. */
function checkBinding({ table, field, rowId }: SecretBinding): void {
	if (table === "" || field === "" || rowId === "") {
		throw new Error("a secret's binding needs a non-empty table, field and row ID");
	}
}

/**
 * The bytes AES-GCM authenticates: compact JSON, which escapes quotes, backslashes, control
 * characters and lone surrogates, so every binding has exactly one encoding. Always the caller's
 * binding, never anything read from the stored value.
 */
function associatedData(
	keyId: string,
	{ table, field, rowId }: SecretBinding,
): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(JSON.stringify([VERSION, keyId, APP, table, field, rowId]));
}

function base64url(bytes: Uint8Array): string {
	return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}

/**
 * A segment's bytes, or `undefined` unless it is canonical unpadded base64url. Encoding back to
 * the same text refuses padding, whitespace (which decoding skips), `+` and `/`, and non-zero
 * trailing bits; a `4n+1` length can't be decoded at all.
 */
function decodeSegment(text: string): Uint8Array<ArrayBuffer> | undefined {
	try {
		const bytes = Uint8Array.fromBase64(text, {
			alphabet: "base64url",
			lastChunkHandling: "loose",
		});
		return base64url(bytes) === text ? bytes : undefined;
	} catch {
		return undefined;
	}
}
