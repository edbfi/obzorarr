import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// The built server refuses to start without a valid key (SPEC-secrets.md, "Startup"). Every key
// here is generated from bytes when the test runs; none is written in the repo.
const BUILD = fileURLToPath(new URL("../../build", import.meta.url));

const randomKey = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** A test's temporary root, and the key texts and key-file paths its output must never hold. */
type Run = { root: string; keys: string[]; paths: string[] };

/** Writes `key` to a new file in the run's root and returns its path. */
async function keyFile(run: Run, key: string): Promise<string> {
	const path = join(run.root, `key-${run.paths.length}`);
	await writeFile(path, key);
	run.keys.push(key);
	run.paths.push(path);
	return path;
}

/** The startup cases: the server's environment, and a phrase of the error's message. */
const CASES: { label: string; env: (run: Run) => Promise<Record<string, string>>; says: string }[] =
	[
		{
			label: "no key",
			env: async () => ({}),
			says: "neither OBZORARR_SECRET_KEY nor OBZORARR_SECRET_KEY_FILE is set",
		},
		{
			label: "malformed key",
			env: async (run) => {
				const key = randomKey().slice(0, -1);
				run.keys.push(key);
				return { OBZORARR_SECRET_KEY: key };
			},
			says: "OBZORARR_SECRET_KEY is not 32 bytes in canonical standard base64",
		},
		{
			// Through the file variable, so the test also proves it reaches the loader.
			label: "weak key file",
			env: async (run) => {
				const half = crypto.getRandomValues(new Uint8Array(16));
				const weak = new Uint8Array([...half, ...half]).toBase64();
				return { OBZORARR_SECRET_KEY_FILE: await keyFile(run, weak) };
			},
			says: "the key in the file OBZORARR_SECRET_KEY_FILE names is weak",
		},
	];

/** A `.env` holding a valid key. */
function dotenvWithKey(run: Run): string {
	const key = randomKey();
	run.keys.push(key);
	return `OBZORARR_SECRET_KEY=${key}\n`;
}

/** A developer's `.env` in the server's working directory, which must change nothing. */
const DOTENVS: { label: string; content: (run: Run) => Promise<string | undefined> }[] = [
	{ label: "no .env", content: async () => undefined },
	{ label: ".env with a key", content: async (run) => dotenvWithKey(run) },
	{
		label: ".env with a key file",
		content: async (run) => `OBZORARR_SECRET_KEY_FILE=${await keyFile(run, randomKey())}\n`,
	},
];

/**
 * Starts the built server in `cwd` with only `env` and the address, and returns how it ended.
 * The environment is built from scratch, so nothing exported reaches it; a server that listens
 * by mistake takes a free port, and is killed after 10 s.
 */
async function runServer(cwd: string, env: Record<string, string>, flags = ["--no-env-file"]) {
	const server = Bun.spawn([process.execPath, ...flags, BUILD], {
		cwd,
		env: { HOST: "127.0.0.1", PORT: "0", ...env },
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
		return { exitCode: server.exitCode, signal: server.signalCode, output: `${stdout}\n${stderr}` };
	} finally {
		clearTimeout(timer);
	}
}

/** Whether `output` holds 6 characters of `value` in a row, as a boolean so no key is printed. */
function leaks(output: string, value: string): boolean {
	for (let start = 0; start + 6 <= value.length; start++) {
		if (output.includes(value.slice(start, start + 6))) return true;
	}
	return false;
}

/** Runs the server for one case and checks it refused to start, saying `says`. */
async function expectRefused(
	setup: (run: Run) => Promise<{ env: Record<string, string>; dotenv?: string | undefined }>,
	says: string,
	flags?: string[],
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "obzorarr-e2e-"));
	try {
		const run: Run = { root, keys: [], paths: [] };
		const cwd = join(root, "cwd");
		await mkdir(cwd);
		const { env, dotenv } = await setup(run);
		if (dotenv !== undefined) await writeFile(join(cwd, ".env"), dotenv);

		const { exitCode, signal, output } = await runServer(cwd, env, flags);

		// Never print the output: it is checked only through booleans and its error line.
		for (const key of run.keys) expect(leaks(output, key), "output holds key text").toBe(false);
		// Windows of a path match the paths in stack frames, so a path is checked whole.
		for (const path of run.paths) expect(output.includes(path), "output holds a path").toBe(false);
		expect(exitCode).toBe(1);
		expect(signal).toBeNull();
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("KeyringError: "));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(says);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

for (const dotenv of DOTENVS) {
	for (const { label, env, says } of CASES) {
		test(`the built server refuses to start: ${label}, ${dotenv.label}`, async () => {
			await expectRefused(
				async (run) => ({ env: await env(run), dotenv: await dotenv.content(run) }),
				says,
			);
		});
	}
}

test("without --no-env-file, the built server reads the .env in its working directory", async () => {
	// The control for the cases above: their `.env` would be read, so it could change a result.
	await expectRefused(
		async (run) => ({
			env: { OBZORARR_SECRET_KEY_FILE: await keyFile(run, randomKey()) },
			dotenv: dotenvWithKey(run),
		}),
		"are both set",
		[],
	);
});
