import { redact } from "./redact.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMetadata = Record<string, unknown>;
export type Logger = Record<LogLevel, (message: string, metadata?: LogMetadata) => void>;

let debug = false;

/** Sets what startup read from the configuration; debug entries are dropped until it is on. */
export function configureLogging(options: { debug: boolean }): void {
	debug = options.debug;
}

/**
 * Resolves once standard output has taken everything written so far, so an entry written just
 * before the process exits isn't lost.
 */
export function flushLogs(): Promise<void> {
	return new Promise((resolve) => process.stdout.write("", () => resolve()));
}

/**
 * A logger for `source`. Each entry is one JSON line on standard output (D11), redacted before
 * it is written (SPEC-setup.md, "Logging").
 */
export function createLogger(source: string): Logger {
	const entry =
		(level: LogLevel) =>
		(message: string, metadata: LogMetadata = {}): void => {
			if (level === "debug" && !debug) return;
			const line = JSON.stringify({
				time: new Date().toISOString(),
				level,
				source,
				message: redact(message),
				metadata: redact(metadata),
			});
			process.stdout.write(`${line}\n`);
		};
	return { debug: entry("debug"), info: entry("info"), warn: entry("warn"), error: entry("error") };
}
