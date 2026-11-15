import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogging, createLogger, flushLogs } from "./logger.ts";

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		// `flushLogs` waits for each entry's write callback, so the mock calls it.
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	configureLogging({ debug: false });
});

const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe("createLogger", () => {
	it("writes one JSON line per entry with its level, message, source, metadata and time", () => {
		const before = Date.now();
		createLogger("startup").info("database migrated", { migrations: 1 });
		expect(lines).toHaveLength(1);
		expect(lines[0]?.endsWith("\n")).toBe(true);
		expect(lines[0]?.slice(0, -1)).not.toContain("\n");
		const [entry] = entries();
		expect(entry).toEqual({
			time: expect.any(String),
			level: "info",
			source: "startup",
			message: "database migrated",
			metadata: { migrations: 1 },
		});
		const time = Date.parse(String(entry?.time));
		expect(String(entry?.time)).toMatch(/\.\d{3}Z$/);
		expect(time).toBeGreaterThanOrEqual(before);
	});

	it("writes warn and error, and an empty metadata object when none is given", () => {
		const log = createLogger("startup");
		log.warn("slow");
		log.error("failed");
		expect(entries().map((entry) => [entry.level, entry.metadata])).toEqual([
			["warn", {}],
			["error", {}],
		]);
	});

	it("drops debug entries unless debug is on", () => {
		const log = createLogger("startup");
		log.debug("hidden");
		expect(lines).toHaveLength(0);
		configureLogging({ debug: true });
		log.debug("shown");
		expect(entries().map((entry) => entry.message)).toEqual(["shown"]);
	});

	it("redacts the message and the metadata before writing", () => {
		createLogger("plex").warn("GET http://u:p@plex.local/ failed", {
			headers: { authorization: "Bearer secret-value" },
		});
		expect(lines[0]).not.toContain("u:p@");
		expect(lines[0]).not.toContain("secret-value");
	});

	it("flushLogs resolves at once when nothing is waiting, and writes nothing itself", async () => {
		createLogger("startup").info("before the flush");
		await flushLogs();
		expect(entries().map((entry) => entry.message)).toEqual(["before the flush"]);
		expect(process.stdout.write).toHaveBeenCalledTimes(1);
	});

	it("keeps a newline inside a message on one line", () => {
		createLogger("startup").error("first\nsecond");
		expect(lines).toHaveLength(1);
		expect(lines[0]?.slice(0, -1)).not.toContain("\n");
	});
});

describe("flushLogs against a slow reader", () => {
	// A real child process writing into a real shell pipe whose reader waits a second: Bun's own
	// spawn pipes are read eagerly, and the stdout mock above can't show a queued write either.
	it("waits until every entry has reached the pipe, so exiting right after loses none", async () => {
		const code = `const { createLogger, flushLogs } = await import(${JSON.stringify(
			new URL("./logger.ts", import.meta.url).pathname,
		)});
			const log = createLogger("flush");
			for (let i = 0; i < 2000; i++) log.info("entry " + i, { padding: "x".repeat(200) });
			await flushLogs();
			process.exit(0);`;
		const shell = Bun.spawn(["sh", "-c", '"$BUN" -e "$CODE" | (sleep 1; grep -c "^{")'], {
			env: { ...process.env, BUN: process.execPath, CODE: code },
			stdout: "pipe",
		});
		const count = (await new Response(shell.stdout).text()).trim();
		await shell.exited;
		expect(count).toBe("2000");
	}, 15_000);
});
