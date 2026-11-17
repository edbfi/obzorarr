import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

// Fresh built servers for the tests that need one of their own: unclaimed, restarted, or with an
// environment of its own (SPEC.md, "Testing strategy").
const BUILD = fileURLToPath(new URL("../../build", import.meta.url));

const randomKey = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** A built server that started: its address, everything it printed so far, and how to stop it. */
export type Server = {
	url: string;
	output: () => string;
	stop: (signal?: "SIGTERM" | "SIGHUP") => Promise<number | null>;
};

/**
 * Spawns the built server in `cwd` with a generated key, a free port and `env`, and nothing else
 * from the test's environment.
 */
const spawnServer = (cwd: string, env: Record<string, string>) =>
	Bun.spawn([process.execPath, "--no-env-file", BUILD], {
		cwd,
		env: { HOST: "127.0.0.1", PORT: "0", OBZORARR_SECRET_KEY: randomKey(), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});

/**
 * Starts the built server with `env` and resolves once it listens, or rejects with its output if
 * it exits or is still starting after 10 s.
 */
export async function startServer(cwd: string, env: Record<string, string>): Promise<Server> {
	const server = spawnServer(cwd, env);
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
				stop: async (signal = "SIGTERM") => {
					server.kill(signal);
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
export async function runToExit(cwd: string, env: Record<string, string>) {
	const server = spawnServer(cwd, env);
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

/**
 * Claims a fresh server through its form action, with the token it printed, as a browser's native
 * form post: asking for HTML, since SvelteKit answers an action in JSON to `Accept: *\/*`. A
 * server started with `ADDRESS_HEADER` needs the claim's address in `headers`.
 */
export async function claim(
	server: Server,
	headers: Record<string, string> = {},
): Promise<Response> {
	const token = /Setup token: ([a-z0-9-]{14}) /.exec(server.output())?.[1] ?? "";
	const response = await fetch(`${server.url}/setup`, {
		method: "POST",
		headers: {
			origin: server.url,
			accept: "text/html",
			"content-type": "application/x-www-form-urlencoded",
			...headers,
		},
		body: new URLSearchParams({ token, username: "owner", password: "violet harbour lanterns" }),
		redirect: "manual",
	});
	expect(response.status, "the claim").toBe(303);
	expect(response.headers.get("location")).toBe("/admin");
	return response;
}
