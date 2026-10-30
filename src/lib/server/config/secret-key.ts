import { open } from "node:fs/promises";

/** The two variables a master key can come from (SPEC-secrets.md, "The master key"). */
export type SecretKeyEnv = {
	readonly OBZORARR_SECRET_KEY?: string | undefined;
	readonly OBZORARR_SECRET_KEY_FILE?: string | undefined;
};

export type SecretKeyVariable = keyof SecretKeyEnv;

/** The ways reading the key's text can fail. */
export type SecretKeyCheck = "missing" | "both-set" | "unreadable" | "too-large";

/**
 * Reading the key's text failed `check`. The message names the variable(s) and never holds a
 * variable's value, so a key set as the file's path by mistake is never echoed.
 */
export class SecretKeyError extends Error {
	override readonly name = "SecretKeyError";

	constructor(
		readonly check: SecretKeyCheck,
		message: string,
	) {
		super(message);
	}
}

const MAX_BYTES = 4096;

/**
 * Returns the master key's text and the variable it came from. Exactly one variable must be
 * set, and an empty one counts as unset. A file is read once, must be at most 4 KiB, and loses
 * one trailing LF or CRLF; checking the text is left to `decodeKeyText`.
 */
export async function readSecretKey(
	env: SecretKeyEnv,
): Promise<{ text: string; variable: SecretKeyVariable }> {
	const key = env.OBZORARR_SECRET_KEY || undefined;
	const path = env.OBZORARR_SECRET_KEY_FILE || undefined;
	if (key !== undefined && path !== undefined) {
		throw new SecretKeyError(
			"both-set",
			"OBZORARR_SECRET_KEY and OBZORARR_SECRET_KEY_FILE are both set; set only one",
		);
	}
	if (key !== undefined) return { text: key, variable: "OBZORARR_SECRET_KEY" };
	if (path === undefined) {
		throw new SecretKeyError(
			"missing",
			"neither OBZORARR_SECRET_KEY nor OBZORARR_SECRET_KEY_FILE is set",
		);
	}
	const bytes = await readAtMost(path);
	// A leading BOM and invalid bytes stay in the text, so the format check refuses them.
	const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
	return { text: text.replace(/\r?\n$/, ""), variable: "OBZORARR_SECRET_KEY_FILE" };
}

/** Reads the file at `path`, refusing one over `MAX_BYTES` without reading the rest. */
async function readAtMost(path: string): Promise<Uint8Array> {
	// One byte more than the limit, so a full buffer means the file is too large. Size checks
	// can't be trusted here: devices, pipes and procfs report none, and a directory passes.
	const buffer = new Uint8Array(MAX_BYTES + 1);
	let length = 0;
	try {
		// A named pipe with no writer blocks here until one opens it; a non-blocking open would
		// instead fail a pipe whose writer is slow, so that limit is accepted.
		const file = await open(path, "r");
		try {
			// A short read isn't the end of the file: pipes return their data in chunks.
			while (length < buffer.length) {
				const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
				if (bytesRead === 0) break;
				length += bytesRead;
			}
		} finally {
			await file.close();
		}
	} catch (error) {
		throw new SecretKeyError(
			"unreadable",
			`OBZORARR_SECRET_KEY_FILE names a file that can't be read (${codeOf(error)})`,
		);
	}
	if (length > MAX_BYTES) {
		throw new SecretKeyError("too-large", "OBZORARR_SECRET_KEY_FILE names a file over 4 KiB");
	}
	return buffer.subarray(0, length);
}

/** A system error's code, such as `ENOENT`; its message can hold the path, so it's never used. */
function codeOf(error: unknown): string {
	const code = error instanceof Error && "code" in error ? error.code : undefined;
	return typeof code === "string" && /^E[A-Z0-9]+$/.test(code) ? code : "unknown error";
}
