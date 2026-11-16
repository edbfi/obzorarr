import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { readSetting, settings, writeSetting } from "#lib/server/db/settings.ts";
import { isRecoveryOn, RECOVERY_USED_KEY, startRecovery } from "./recovery.ts";

let root: string;
let db: Database;
let printed: string[];
let logged: string[];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-recovery-"));
	db = await openDatabase(join(root, "app.db"));
	await migrateDatabase(db);
});

beforeEach(async () => {
	printed = [];
	logged = [];
	await db.delete(settings);
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		logged.push(String(chunk));
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	await db.$client.close();
	await rm(root, { recursive: true, force: true });
});

const start = (enabled: boolean, claimed: boolean, origin?: string) =>
	startRecovery({ db, enabled, claimed, origin, print: (line) => printed.push(line) });
const warnings = () =>
	logged
		.map((line) => JSON.parse(line) as { level: string; message: string })
		.filter((entry) => entry.level === "warn")
		.map((entry) => entry.message);

describe("recovery at startup", () => {
	it("prints a recovery token naming /recovery while the setting is on, the instance claimed and the token unused", async () => {
		await start(true, true);
		expect(printed).toHaveLength(1);
		expect(printed[0]).toMatch(
			/^Recovery token: [a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4} \(valid for 15 minutes\)\. Open \/recovery to set a new owner password\.$/,
		);
		expect(isRecoveryOn()).toBe(true);
		expect(warnings()).toEqual([
			"recovery is on: a recovery token is printed to standard output; remove OBZORARR_RECOVERY and restart once it is used",
		]);
		// The token is printed, never logged.
		const token = /Recovery token: (\S+)/.exec(printed[0] ?? "")?.[1] ?? "";
		expect(logged.join("")).not.toContain(token);
	});

	it("names the full address when ORIGIN is set, and a restart prints a new token", async () => {
		await start(true, true, "https://obzorarr.example");
		await start(true, true, "https://obzorarr.example");
		expect(printed[0]).toContain(" https://obzorarr.example/recovery ");
		expect(printed[1]).not.toBe(printed[0]);
	});

	it("prints none once the token was used, also after a restart, and warns", async () => {
		await writeSetting(db, RECOVERY_USED_KEY, "true", new Date());
		await start(true, true);
		expect(printed).toEqual([]);
		expect(isRecoveryOn()).toBe(true);
		expect(warnings()).toEqual([
			"recovery is on, but its token was used; remove OBZORARR_RECOVERY and restart",
		]);
	});

	it("is ignored on an unclaimed instance, with a warning", async () => {
		await start(true, false);
		expect(printed).toEqual([]);
		expect(warnings()).toEqual([
			"recovery is ignored until the instance is claimed; remove OBZORARR_RECOVERY",
		]);
	});

	it("does nothing while the setting is off, clearing that the token was used", async () => {
		await writeSetting(db, RECOVERY_USED_KEY, "true", new Date());
		await start(false, true);
		expect(printed).toEqual([]);
		expect(warnings()).toEqual([]);
		expect(isRecoveryOn()).toBe(false);
		expect(await readSetting(db, RECOVERY_USED_KEY)).toBeUndefined();
		// So turning it on again prints a new token.
		await start(true, true);
		expect(printed).toHaveLength(1);
	});
});
