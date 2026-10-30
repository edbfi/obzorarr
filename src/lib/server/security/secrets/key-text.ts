/** The checks a key's text goes through, in the order they run. */
export type KeyCheck = "format" | "entropy" | "constant-step" | "printable-ascii";

/** A key's text failed `check`. The message names the check and never holds any of the text. */
export class KeyTextError extends Error {
	override readonly name = "KeyTextError";

	constructor(
		readonly check: KeyCheck,
		message: string,
	) {
		super(message);
	}
}

const CANONICAL = /^[A-Za-z0-9+/]{43}=$/;
const HEX = /^[0-9a-fA-F]{64}$/;
const FORMAT = "is not 32 bytes in canonical standard base64 (44 characters ending in one =)";

/**
 * Decodes a master key's text to its 32 bytes, refusing malformed and weak keys with a
 * `KeyTextError` for the first check that fails (SPEC-secrets.md, "Weak-key checks").
 */
export function decodeKeyText(text: string): Uint8Array<ArrayBuffer> {
	if (!CANONICAL.test(text)) {
		const hint = HEX.test(text) ? "; it looks like hex, which isn't accepted" : "";
		throw new KeyTextError("format", FORMAT + hint);
	}
	const bytes = Uint8Array.fromBase64(text);
	// Only zero trailing bits encode back to the same text.
	if (bytes.toBase64() !== text) throw new KeyTextError("format", FORMAT);

	if (entropy(bytes) <= 4 + 1e-9) {
		throw new KeyTextError("entropy", "is weak: at most 4 bits of entropy per byte");
	}
	if (hasConstantStep(bytes)) {
		throw new KeyTextError("constant-step", "is weak: its bytes count up or down in one step");
	}
	if (bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) {
		throw new KeyTextError("printable-ascii", "is weak: every byte is printable ASCII, like text");
	}
	return bytes;
}

/** Shannon entropy in bits per byte. */
function entropy(bytes: Uint8Array): number {
	const counts = new Map<number, number>();
	for (const byte of bytes) counts.set(byte, (counts.get(byte) ?? 0) + 1);
	let bits = 0;
	for (const count of counts.values()) {
		const p = count / bytes.length;
		bits -= p * Math.log2(p);
	}
	return bits;
}

/** Whether every byte is one constant step (mod 256) from the one before. */
function hasConstantStep(bytes: Uint8Array): boolean {
	// A Uint8Array's map stores each step as a byte, which takes it mod 256.
	const steps = new Set(bytes.subarray(1).map((byte, i) => byte - bytes[i]));
	return steps.size === 1;
}
