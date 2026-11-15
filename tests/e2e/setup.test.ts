import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { connect } from "@tursodatabase/database";

// First run and the request checks on the built server (SPEC-setup.md, "Testing strategy"). Each
// test starts its own server, with a generated key and a database in its own temporary folder.
const BUILD = fileURLToPath(new URL("../../build", import.meta.url));

const randomKey = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** A built server that started: its address, everything it printed so far, and how to stop it. */
type Server = { url: string; output: () => string; stop: () => Promise<number | null> };

/**
 * Starts the built server with `env` and resolves once it listens, or rejects with its output if
 * it exits or is still starting after 10 s.
 */
async function startServer(cwd: string, env: Record<string, string>): Promise<Server> {
	const server = Bun.spawn([process.execPath, "--no-env-file", BUILD], {
		cwd,
		env: { HOST: "127.0.0.1", PORT: "0", OBZORARR_SECRET_KEY: randomKey(), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	let output = "";
	const collect = async (stream: ReadableStream<Uint8Array>) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) output += decoder.decode(chunk, { stream: true });
	};
	const collected = Promise.all([collect(server.stdout), collect(server.stderr)]);
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const url = /Listening on (http:\/\/\S+?)\/?\s/.exec(output)?.[1];
		if (url !== undefined) {
			return {
				url,
				output: () => output,
				stop: async () => {
					server.kill("SIGTERM");
					await collected;
					return server.exited;
				},
			};
		}
		if (server.exitCode !== null) break;
		await Bun.sleep(50);
	}
	server.kill("SIGKILL");
	await collected;
	throw new Error(`the server didn't start:\n${output}`);
}

/** Runs the built server with `env` until it exits by itself, killing it after 10 s. */
async function runToExit(cwd: string, env: Record<string, string>) {
	const server = Bun.spawn([process.execPath, "--no-env-file", BUILD], {
		cwd,
		env: { HOST: "127.0.0.1", PORT: "0", OBZORARR_SECRET_KEY: randomKey(), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const timer = setTimeout(() => server.kill("SIGKILL"), 10_000);
	try {
		const [stdout, stderr] = await Promise.all([
			new Response(server.stdout).text(),
			new Response(server.stderr).text(),
		]);
		await server.exited;
		return { exitCode: server.exitCode, output: `${stdout}\n${stderr}` };
	} finally {
		clearTimeout(timer);
	}
}

let root: string;

test.beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "obzorarr-e2e-setup-"));
});

test.afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test.describe("the database", () => {
	test("is migrated on a new file, and a second start on it applies nothing", async () => {
		const path = join(root, "data", "obzorarr.db");
		const env = { OBZORARR_DATABASE_PATH: path };

		for (const start of ["first", "second"]) {
			const server = await startServer(root, env);
			const response = await fetch(`${server.url}/healthz`);
			expect(await response.text(), `${start} start`).toBe("ok");
			await server.stop();
		}

		const db = await connect(path);
		try {
			const rows = await (await db.prepare("SELECT name FROM __drizzle_migrations")).all();
			const tables = await (
				await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			).all();
			expect(rows).toHaveLength(1);
			expect(tables.map((row: { name: string }) => row.name)).toEqual(
				expect.arrayContaining(["owner", "settings"]),
			);
		} finally {
			db.close();
		}
	});

	test("defaults to data/obzorarr.db in the working directory", async () => {
		const server = await startServer(root, {});
		await server.stop();
		const db = await connect(join(root, "data", "obzorarr.db"));
		try {
			expect(await (await db.prepare("SELECT 1 FROM owner")).all()).toEqual([]);
		} finally {
			db.close();
		}
	});

	test("the built server refuses a database folder it can't create, without echoing it", async () => {
		const file = join(root, "a-file");
		await writeFile(file, "");
		const { exitCode, output } = await runToExit(root, {
			OBZORARR_DATABASE_PATH: join(file, "data", "obzorarr.db"),
		});

		expect(output.includes(root), "output holds the path").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
		expect(lines).toEqual([
			"ConfigError: OBZORARR_DATABASE_PATH names a folder that can't be created (ENOTDIR)",
		]);
	});
});
