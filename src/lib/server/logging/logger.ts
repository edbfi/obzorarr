import { redact } from "./redact.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMetadata = Record<string, unknown>;
export type Logger = Record<LogLevel, (message: string, metadata?: LogMetadata) => void>;

let debug = false;

/** Sets what startup read from the configuration; debug entries are dropped until it is on. */
export function configureLogging(options: { debug: boolean }): void {
	debug = options.debug;
}

/** Entries handed to standard output whose write hasn't finished yet. */
let writing = 0;
const whenWritten: (() => void)[] = [];

function write(line: string): void {
	writing++;
	const done = () => {
		writing--;
		if (writing === 0) for (const resolve of whenWritten.splice(0)) resolve();
	};
	// The callback runs once the entry has left the process, or with an error; either way it no
	// longer waits. A write that throws, such as to a closed pipe, never calls it, so it is done
	// at once, and the entry is lost: a count left raised would hold every later flush, and
	// shutdown, forever, and a log call that threw would stop its caller.
	try {
		process.stdout.write(line, done);
	} catch {
		done();
	}
}

/**
 * Resolves once every entry written so far has left the process, so an entry written just before
 * the process exits isn't lost. An empty write's callback isn't enough: on Bun it can run while
 * earlier entries still wait for a slow reader.
 */
export function flushLogs(): Promise<void> {
	if (writing === 0) return Promise.resolve();
	return new Promise((resolve) => whenWritten.push(resolve));
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
			write(`${line}\n`);
		};
	return { debug: entry("debug"), info: entry("info"), warn: entry("warn"), error: entry("error") };
}
