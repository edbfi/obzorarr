/**
 * A variable failed its startup check. The message names the variable and what is wrong, and
 * never holds the variable's value (SPEC-setup.md, "Configuration and startup checks").
 */
export class ConfigError extends Error {
	override readonly name = "ConfigError";

	constructor(
		readonly variable: string,
		message: string,
	) {
		super(message);
	}
}
