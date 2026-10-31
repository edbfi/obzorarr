const REDACTED = "[redacted]";

/**
 * Holds one plaintext that only `reveal()` returns. It prints as `[redacted]` everywhere else:
 * strings, `+`, JSON, `console.log` and inspect (SPEC-secrets.md, "The secret wrapper").
 */
export class Secret {
	readonly #value: string;

	constructor(value: string) {
		this.#value = value;
	}

	/** The plaintext. Every use is a `reveal(` call, so review can list them with a grep. */
	reveal(): string {
		return this.#value;
	}

	toString(): string {
		return REDACTED;
	}

	toJSON(): string {
		return REDACTED;
	}

	[Symbol.toPrimitive](): string {
		return REDACTED;
	}

	// `Bun.inspect.custom` and `util.inspect.custom` are this same symbol.
	[Symbol.for("nodejs.util.inspect.custom")](): string {
		return REDACTED;
	}
}
