import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogging, createLogger } from "./logger.ts";

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		lines.push(String(chunk));
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

	it("keeps a newline inside a message on one line", () => {
		createLogger("startup").error("first\nsecond");
		expect(lines).toHaveLength(1);
		expect(lines[0]?.slice(0, -1)).not.toContain("\n");
	});
});
