// scripts/serve.ts, the production entry. Pure parts (parseOrigin, prepare) run in-process;
// the network behaviour is exercised by spawning `bun scripts/serve.ts` in a temporary
// directory whose build/index.js is a stand-in adapter (fixtures/standin-adapter.js) that
// reads the same environment variables as @sveltejs/adapter-bun and drains the same way.
import { afterEach, describe, expect, it } from 'bun:test';
import { type ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { connect, createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	FRONT_ORIGIN_MARKER,
	HOST_HEADER,
	MISSING_ORIGIN_WARNING,
	ORIGIN_FORMAT_ERROR,
	PEER_HEADER,
	PROTOCOL_HEADER,
	parseOrigin,
	prepare,
	shutdownTimeoutSeconds
} from '../../../scripts/serve';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const SERVE = join(PROJECT_ROOT, 'scripts', 'serve.ts');
const STANDIN = join(import.meta.dir, 'fixtures', 'standin-adapter.js');
const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

function scratch(): string {
	const directory = mkdtempSync(join(tmpdir(), 'serve-test-'));
	cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
	return directory;
}

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const { port } = server.address() as { port: number };
	await new Promise((done) => server.close(done));
	return port;
}

async function waitFor<T>(
	read: () => T | Promise<T>,
	accept: (value: T) => boolean,
	timeout = 5000
): Promise<T> {
	const deadline = Date.now() + timeout;
	let value = await read();
	while (!accept(value)) {
		if (Date.now() > deadline) throw new Error(`condition not met in ${timeout} ms`);
		await Bun.sleep(25);
		value = await read();
	}
	return value;
}

interface Started {
	child: ChildProcess;
	port: number;
	temp: string;
	output: () => string;
	exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

/** Starts `bun scripts/serve.ts` with a private TMPDIR, so leftover socket directories show. */
async function start(env: Record<string, string>, { waitForReady = true } = {}): Promise<Started> {
	const cwd = scratch();
	const temp = scratch();
	mkdirSync(join(cwd, 'build'));
	copyFileSync(STANDIN, join(cwd, 'build', 'index.js'));
	const port = env.PORT ? Number(env.PORT) : await freePort();
	const child = spawn('bun', [SERVE], {
		cwd,
		env: {
			PATH: process.env.PATH ?? '',
			HOME: process.env.HOME ?? '',
			TMPDIR: temp,
			HOST: '127.0.0.1',
			PORT: String(port),
			...env
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	child.stdout?.on('data', (chunk) => {
		output += chunk;
	});
	child.stderr?.on('data', (chunk) => {
		output += chunk;
	});
	const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) =>
		child.on('exit', (code, signal) => done({ code, signal }))
	);
	cleanups.push(() => child.kill('SIGKILL'));
	if (waitForReady) {
		const deadline = Date.now() + 10_000;
		while (!/Listening on|standin listening on http/.test(output)) {
			if (Date.now() > deadline || child.exitCode !== null) {
				throw new Error(`serve.ts did not start:\n${output}`);
			}
			await Bun.sleep(25);
		}
	}
	return { child, port, temp, output: () => output, exited };
}

interface Reply {
	status: number;
	headers: IncomingMessage['headers'];
	body: Buffer;
}

function call(
	port: number,
	path: string,
	options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<Reply> {
	return new Promise((done, fail) => {
		const req = httpRequest(
			{ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers },
			(res) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				res.on('end', () =>
					done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
				);
				res.on('error', fail);
			}
		);
		req.on('error', fail);
		req.end(options.body);
	});
}

async function echo(port: number, options: Parameters<typeof call>[2] = {}) {
	const reply = await call(port, '/echo?x=1', options);
	return JSON.parse(reply.body.toString()) as {
		method: string;
		path: string;
		search: string;
		body: string;
		headers: Record<string, string>;
		env: Record<string, string | null>;
	};
}

const socketDirectories = (temp: string) =>
	readdirSync(temp).filter((name) => name.startsWith('obzorarr-'));

describe('parseOrigin', () => {
	it.each([
		['http://192.168.1.10:3000', 'http://192.168.1.10:3000'],
		['https://obzorarr.example.com', 'https://obzorarr.example.com'],
		['http://localhost:3000/', 'http://localhost:3000'],
		['  http://192.168.1.10:3000/  ', 'http://192.168.1.10:3000'],
		['HTTP://Obzorarr.Example', 'http://obzorarr.example'],
		['https://obzorarr.example:443', 'https://obzorarr.example'],
		['http://obzorarr.lan:80/', 'http://obzorarr.lan'],
		['http://[::1]:3000', 'http://[::1]:3000']
	])('accepts %j as %s', (value, canonical) => {
		expect(parseOrigin(value).origin).toBe(canonical);
	});

	it.each([
		['a path', 'https://x.example/path'],
		['a path with a trailing slash', 'https://x.example/path/'],
		['a query', 'http://example.com/?a=1'],
		['an empty query', 'http://example.com/?'],
		['a fragment', 'http://example.com/#top'],
		['an empty fragment', 'http://example.com#'],
		['credentials', 'http://user:pass@example.com'],
		['a user name', 'http://user@example.com'],
		['a non-http(s) scheme', 'ftp://x'],
		['garbage', 'not a url']
	])('rejects %s with the startup error', (_reason, value) => {
		expect(() => parseOrigin(value)).toThrow(ORIGIN_FORMAT_ERROR);
	});

	it('uses the shared startup error text', () => {
		expect(ORIGIN_FORMAT_ERROR).toBe(
			'ORIGIN must be a bare http(s) origin such as http://192.168.1.10:3000 (no path, query, fragment or credentials).'
		);
	});

	it('never echoes credentials, even when the URL parser rejects the value', () => {
		const secret = `pw-${crypto.randomUUID()}`;
		for (const value of [
			`http://user:${secret}@example.com/x`,
			`http://user:${secret}@exa mple.com`
		]) {
			let caught: unknown;
			try {
				parseOrigin(value);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(Error);
			expect((caught as Error).cause).toBeUndefined();
			expect(Object.keys(caught as object)).toEqual([]);
			expect(String((caught as Error).message)).not.toContain(secret);
			expect(Bun.inspect(caught)).not.toContain(secret);
		}
	});
});

describe('prepare', () => {
	it('maps IDLE_TIMEOUT only when it is set, and an explicit CONNECTION_IDLE_TIMEOUT wins', () => {
		const mapped: Record<string, string | undefined> = { IDLE_TIMEOUT: '20' };
		prepare(mapped);
		expect(mapped.CONNECTION_IDLE_TIMEOUT).toBe('20');

		const explicit: Record<string, string | undefined> = {
			IDLE_TIMEOUT: '20',
			CONNECTION_IDLE_TIMEOUT: '5'
		};
		prepare(explicit);
		expect(explicit.CONNECTION_IDLE_TIMEOUT).toBe('5');

		const unset: Record<string, string | undefined> = {};
		prepare(unset);
		expect(unset).not.toHaveProperty('CONNECTION_IDLE_TIMEOUT');
	});

	it('exports the canonical ORIGIN for the app, and treats a blank ORIGIN as unset', () => {
		const environment: Record<string, string | undefined> = {
			ORIGIN: ' HTTP://192.168.1.10:3000/ '
		};
		const plan = prepare(environment);
		if (plan.mode !== 'front') throw new Error('expected the front');
		cleanups.push(() => rmSync(plan.directory, { recursive: true, force: true }));
		expect(environment.ORIGIN).toBe('http://192.168.1.10:3000');
		expect(environment[FRONT_ORIGIN_MARKER]).toBe('http://192.168.1.10:3000');

		const blank: Record<string, string | undefined> = { ORIGIN: '   ' };
		expect(prepare(blank)).toEqual({ mode: 'direct', warning: MISSING_ORIGIN_WARNING });
		expect(blank).not.toHaveProperty('ORIGIN');
	});

	it('without ORIGIN sets nothing for a front, and warns unless PROTOCOL_HEADER is set', () => {
		const environment: Record<string, string | undefined> = {
			PORT: '3000',
			[FRONT_ORIGIN_MARKER]: 'http://stale.example'
		};
		expect(prepare(environment)).toEqual({ mode: 'direct', warning: MISSING_ORIGIN_WARNING });
		// Only the front sets the marker; a value inherited from the environment is dropped.
		expect(environment).toEqual({ PORT: '3000' });

		expect(prepare({ PROTOCOL_HEADER: 'x-forwarded-proto' })).toEqual({
			mode: 'direct',
			warning: null
		});
	});

	it("with ORIGIN prepares a private socket and the front's headers", () => {
		const environment: Record<string, string | undefined> = {
			ORIGIN: 'http://192.168.1.10:3000',
			IDLE_TIMEOUT: '15',
			PORT_HEADER: 'x-forwarded-port',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			HOST_HEADER: 'x-forwarded-host'
		};
		const plan = prepare(environment);
		if (plan.mode !== 'front') throw new Error('expected the front');
		cleanups.push(() => rmSync(plan.directory, { recursive: true, force: true }));

		expect(plan.hostname).toBe('0.0.0.0');
		expect(plan.port).toBe(3000);
		expect(plan.idleTimeout).toBe(15);
		expect(plan.ownPeerHeader).toBe(true);
		expect(plan.directory.startsWith(join(tmpdir(), 'obzorarr-'))).toBe(true);
		expect(existsSync(plan.directory)).toBe(true);
		expect(plan.socket).toBe(join(plan.directory, 'app.sock'));
		expect(environment.SOCKET_PATH).toBe(plan.socket);
		expect(environment.PROTOCOL_HEADER).toBe(PROTOCOL_HEADER);
		expect(environment.HOST_HEADER).toBe(HOST_HEADER);
		expect(environment.ADDRESS_HEADER).toBe(PEER_HEADER);
		expect(environment).not.toHaveProperty('PORT_HEADER');
		expect(environment.CONNECTION_IDLE_TIMEOUT).toBe('0');
		expect(environment[FRONT_ORIGIN_MARKER]).toBe('http://192.168.1.10:3000');
	});

	it("keeps an operator ADDRESS_HEADER and leaves Bun's idle default when none is set", () => {
		const environment: Record<string, string | undefined> = {
			ORIGIN: 'https://obzorarr.example.com',
			ADDRESS_HEADER: 'x-forwarded-for',
			XFF_DEPTH: '1'
		};
		const plan = prepare(environment);
		if (plan.mode !== 'front') throw new Error('expected the front');
		cleanups.push(() => rmSync(plan.directory, { recursive: true, force: true }));
		expect(plan.ownPeerHeader).toBe(false);
		expect(plan.idleTimeout).toBeUndefined();
		expect(environment.ADDRESS_HEADER).toBe('x-forwarded-for');
		expect(environment.XFF_DEPTH).toBe('1');
	});

	it.each([
		['PORT', { ORIGIN: 'http://a.example', PORT: 'http' }],
		['PORT', { ORIGIN: 'http://a.example', PORT: '70000' }],
		['CONNECTION_IDLE_TIMEOUT', { ORIGIN: 'http://a.example', CONNECTION_IDLE_TIMEOUT: '300' }]
	])('rejects an invalid %s before creating a socket directory', (name, environment) => {
		const before = readdirSync(tmpdir()).filter((entry) => entry.startsWith('obzorarr-'));
		expect(() => prepare({ ...environment })).toThrow(new RegExp(`^${name} must be an integer`));
		const after = readdirSync(tmpdir()).filter((entry) => entry.startsWith('obzorarr-'));
		expect(after).toEqual(before);
	});

	it('reads SHUTDOWN_TIMEOUT as the adapter does', () => {
		expect(shutdownTimeoutSeconds({})).toBe(30);
		expect(shutdownTimeoutSeconds({ SHUTDOWN_TIMEOUT: '5' })).toBe(5);
		expect(shutdownTimeoutSeconds({ SHUTDOWN_TIMEOUT: 'soon' })).toBe(30);
	});
});

describe('serve.ts process', () => {
	it('without ORIGIN loads the adapter directly and warns exactly once', async () => {
		const server = await start({});
		const seen = await echo(server.port);
		expect(seen.env).toMatchObject({
			SOCKET_PATH: null,
			PROTOCOL_HEADER: null,
			HOST_HEADER: null,
			[FRONT_ORIGIN_MARKER]: null
		});
		expect(server.output().split(MISSING_ORIGIN_WARNING).length - 1).toBe(1);
		expect(server.output()).not.toContain('Listening on http');
	});

	it('does not warn when ORIGIN or PROTOCOL_HEADER is set', async () => {
		const withProtocol = await start({ PROTOCOL_HEADER: 'x-forwarded-proto' });
		await echo(withProtocol.port);
		expect(withProtocol.output()).not.toContain(MISSING_ORIGIN_WARNING);

		const port = await freePort();
		const fronted = await start({ ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port) });
		await echo(fronted.port);
		expect(fronted.output()).not.toContain(MISSING_ORIGIN_WARNING);
	});

	it('with ORIGIN fronts the adapter and overwrites the origin and peer headers', async () => {
		const port = await freePort();
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			PROTOCOL_HEADER: 'x-forwarded-proto',
			HOST_HEADER: 'x-forwarded-host',
			PORT_HEADER: 'x-forwarded-port'
		});
		expect(server.output()).toContain(`for http://127.0.0.1:${port}`);

		const seen = await echo(server.port, {
			headers: {
				host: 'evil.example',
				[PROTOCOL_HEADER]: 'https',
				[HOST_HEADER]: 'evil.example',
				[PEER_HEADER]: '203.0.113.9',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'attacker.example',
				'x-forwarded-port': '8443',
				'x-forwarded-for': '203.0.113.9'
			}
		});
		// ORIGIN wins over contradictory operator-configured protocol, host and port headers.
		expect(seen.env).toMatchObject({
			PROTOCOL_HEADER,
			HOST_HEADER,
			ADDRESS_HEADER: PEER_HEADER,
			PORT_HEADER: null,
			CONNECTION_IDLE_TIMEOUT: '0',
			[FRONT_ORIGIN_MARKER]: `http://127.0.0.1:${port}`
		});
		expect(seen.env.SOCKET_PATH).toMatch(/obzorarr-[^/]+\/app\.sock$/);
		expect(seen.headers[PROTOCOL_HEADER]).toBe('http');
		expect(seen.headers[HOST_HEADER]).toBe(`127.0.0.1:${port}`);
		expect(seen.headers[PEER_HEADER]).toBe('127.0.0.1');
		// Forwarded headers pass through untouched; the adapter only trusts the ones it is told to.
		expect(seen.headers['x-forwarded-for']).toBe('203.0.113.9');
	});

	it('hands the adapter the canonical ORIGIN when it is written with a trailing slash', async () => {
		const port = await freePort();
		const server = await start({ ORIGIN: `http://127.0.0.1:${port}/`, PORT: String(port) });
		const seen = await echo(server.port);
		expect(seen.env.ORIGIN).toBe(`http://127.0.0.1:${port}`);
		expect(seen.env[FRONT_ORIGIN_MARKER]).toBe(`http://127.0.0.1:${port}`);
		expect(seen.headers[HOST_HEADER]).toBe(`127.0.0.1:${port}`);
	});

	it('passes an operator ADDRESS_HEADER through and drops a client-supplied peer header', async () => {
		const port = await freePort();
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			ADDRESS_HEADER: 'x-forwarded-for'
		});
		const seen = await echo(server.port, {
			headers: { [PEER_HEADER]: '203.0.113.9', 'x-forwarded-for': '198.51.100.7' }
		});
		expect(seen.env.ADDRESS_HEADER).toBe('x-forwarded-for');
		expect(seen.headers['x-forwarded-for']).toBe('198.51.100.7');
		expect(seen.headers).not.toHaveProperty(PEER_HEADER);
	});

	it('forwards method, path, query and body, and leaves redirects and encodings alone', async () => {
		const port = await freePort();
		const server = await start({ ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port) });

		const posted = await echo(server.port, { method: 'POST', body: 'hello' });
		expect(posted).toMatchObject({ method: 'POST', path: '/echo', search: '?x=1', body: 'hello' });
		const got = await echo(server.port);
		expect(got).toMatchObject({ method: 'GET', body: '' });

		const redirect = await call(server.port, '/redirect');
		expect(redirect.status).toBe(302);
		expect(redirect.headers.location).toBe('/elsewhere');

		const gzip = await call(server.port, '/gzip', { headers: { 'accept-encoding': 'gzip' } });
		expect(gzip.headers['content-encoding']).toBe('gzip');
		expect([...gzip.body.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
	});

	it('propagates a client abort to the adapter', async () => {
		const port = await freePort();
		const marker = join(scratch(), 'aborted');
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			STANDIN_ABORT_FILE: marker
		});
		await new Promise<void>((done) => {
			const req = httpRequest({ host: '127.0.0.1', port: server.port, path: '/hold' }, (res) => {
				res.once('data', () => {
					req.destroy();
					done();
				});
			});
			req.on('error', () => {});
			req.end();
		});
		expect(await waitFor(() => existsSync(marker), Boolean)).toBe(true);
	});

	it('answers 503 when the adapter is unreachable', async () => {
		const port = await freePort();
		const server = await start({ ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port) });
		await call(server.port, '/stop');
		await Bun.sleep(100);
		const reply = await call(server.port, '/echo');
		expect(reply.status).toBe(503);
	});

	it('keeps an idle event stream open past the client idle timeout', async () => {
		const port = await freePort();
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			IDLE_TIMEOUT: '1'
		});
		const reply = await call(server.port, '/sse?gap=2500');
		expect(reply.headers['content-type']).toBe('text/event-stream');
		expect(reply.body.toString()).toBe('data: one\n\ndata: two\n\n');
	}, 10_000);

	// This pins the outcome (a slow client still downloading when the adapter has drained and
	// emitted sveltekit:shutdown gets every byte; the front stops accepting and removes the
	// socket), not the mechanism: on Bun 1.4.2 the body is already buffered in the front by then,
	// so a front that force-closed at sveltekit:shutdown also passed this in otpravkarr's runs.
	// The deadline end of the budget is pinned by the SHUTDOWN_TIMEOUT=3 test below.
	it('on SIGTERM stops accepting, a slow client still gets every byte, the socket is removed', async () => {
		const port = await freePort();
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			SHUTDOWN_TIMEOUT: '15'
		});
		expect(socketDirectories(server.temp)).toHaveLength(1);

		// Read about 2 MiB/s, so the 8 MiB body is still downloading when the adapter's side has
		// drained and emits sveltekit:shutdown. Bun answers a still-streaming proxied body with
		// chunked encoding, so the check is the byte count against the adapter's body size.
		const download = new Promise<{ bytes: number; complete: boolean; error?: unknown }>((done) => {
			const req = httpRequest({ host: '127.0.0.1', port: server.port, path: '/big' }, (res) => {
				let bytes = 0;
				res.on('data', (chunk: Buffer) => {
					bytes += chunk.length;
					res.pause();
					setTimeout(() => res.resume(), Math.ceil(chunk.length / 2048));
				});
				res.on('end', () => done({ bytes, complete: res.complete }));
				res.on('error', (error) => done({ bytes, complete: false, error }));
			});
			req.on('error', (error) => done({ bytes: 0, complete: false, error }));
			req.end();
		});
		await Bun.sleep(300);
		server.child.kill('SIGTERM');

		await waitFor(server.output, (output) => output.includes('standin drained'));
		await expect(call(server.port, '/echo')).rejects.toThrow();

		const result = await download;
		expect(result.error).toBeUndefined();
		expect(result.complete).toBe(true);
		expect(result.bytes).toBe(8 * 1024 * 1024);
		expect(await server.exited).toEqual({ code: 0, signal: null });
		expect(socketDirectories(server.temp)).toEqual([]);
	}, 30_000);

	it('force-closes a client that cannot finish within SHUTDOWN_TIMEOUT', async () => {
		const port = await freePort();
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			SHUTDOWN_TIMEOUT: '3'
		});
		// Bun's node:http client notices the reset late on a paused stream, so read the byte
		// count when the process has exited instead of waiting for the response to end.
		let bytes = 0;
		const req = httpRequest({ host: '127.0.0.1', port: server.port, path: '/big' }, (res) => {
			res.on('data', (chunk: Buffer) => {
				bytes += chunk.length;
				res.pause();
				setTimeout(() => res.resume(), 200);
			});
			res.on('error', () => {});
		});
		req.on('error', () => {});
		req.end();
		cleanups.push(() => req.destroy());
		await Bun.sleep(300);
		const signalled = Date.now();
		server.child.kill('SIGTERM');

		expect(await server.exited).toEqual({ code: 0, signal: null });
		const elapsed = (Date.now() - signalled) / 1000;
		// The floor proves the SHUTDOWN_TIMEOUT budget was honoured; the ceiling only catches a front
		// that waits far past it, with headroom for a slow runner.
		expect(elapsed).toBeGreaterThanOrEqual(2.5);
		expect(elapsed).toBeLessThan(10);
		expect(bytes).toBeGreaterThan(0);
		expect(bytes).toBeLessThan(8 * 1024 * 1024);
		expect(socketDirectories(server.temp)).toEqual([]);
	}, 30_000);

	// At the end of its drain the adapter force-closes the streams still open. An event stream has
	// no length, so the front ends it as a normal end of stream (EventSource reconnects) instead of
	// passing the failure on, which clients see as a connection reset.
	it('on SIGTERM ends an open event stream normally when the adapter force-closes it', async () => {
		const port = await freePort();
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			SHUTDOWN_TIMEOUT: '1'
		});
		const response = await fetch(`http://127.0.0.1:${server.port}/sse-open`);
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		const body = response.text();
		await Bun.sleep(300);
		server.child.kill('SIGTERM');

		expect(await body).toBe('data: one\n\n');
		expect(await server.exited).toEqual({ code: 0, signal: null });
		expect(socketDirectories(server.temp)).toEqual([]);
	}, 15_000);

	it('on SIGTERM still breaks off any other body the adapter force-closes', async () => {
		const port = await freePort();
		const server = await start({
			ORIGIN: `http://127.0.0.1:${port}`,
			PORT: String(port),
			SHUTDOWN_TIMEOUT: '1'
		});
		const response = await fetch(`http://127.0.0.1:${server.port}/hold-open`);
		expect(response.headers.get('content-type')).toBe('text/plain');
		const body = response.text();
		await Bun.sleep(300);
		server.child.kill('SIGTERM');

		// A truncated body must never look complete.
		await expect(body).rejects.toThrow();
		expect(await server.exited).toEqual({ code: 0, signal: null });
		expect(socketDirectories(server.temp)).toEqual([]);
	}, 15_000);

	it('shuts down cleanly when SIGTERM arrives while the adapter is still loading', async () => {
		const port = await freePort();
		const server = await start(
			{ ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port), STANDIN_LOAD_DELAY_MS: '1500' },
			{ waitForReady: false }
		);
		// The public port is bound before the adapter loads: wait for a TCP connect (an HTTP
		// request would be held until the adapter is ready), then signal mid-load.
		const accepting = () =>
			new Promise<boolean>((done) => {
				const socket = connect(port, '127.0.0.1');
				socket.once('connect', () => {
					socket.destroy();
					done(true);
				});
				socket.once('error', () => done(false));
			});
		await waitFor(accepting, Boolean);
		expect(server.output()).not.toContain('standin listening');
		server.child.kill('SIGTERM');
		const signalled = Date.now();
		const exited = await Promise.race([
			server.exited,
			Bun.sleep(15_000).then(() => 'timeout' as const)
		]);
		expect(exited).toEqual({ code: 0, signal: null });
		expect(Date.now() - signalled).toBeLessThan(15_000);
		expect(socketDirectories(server.temp)).toEqual([]);
	}, 25_000);

	it('leaves nothing behind when the adapter fails to load', async () => {
		const port = await freePort();
		const server = await start(
			{ ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port), STANDIN_THROW: '1' },
			{ waitForReady: false }
		);
		const { code } = await server.exited;
		expect(code).not.toBe(0);
		expect(server.output()).toContain('stand-in adapter failed to load');
		expect(socketDirectories(server.temp)).toEqual([]);
		const probe: Server = createServer();
		await new Promise<void>((done, fail) => {
			probe.once('error', fail);
			probe.listen(port, '127.0.0.1', done);
		});
		await new Promise((done) => probe.close(done));
	});

	it('fails clearly when the public port is taken, without starting the adapter', async () => {
		const blocker: Server = createServer();
		await new Promise<void>((done) => blocker.listen(0, '127.0.0.1', done));
		cleanups.push(() => blocker.close());
		const { port } = blocker.address() as { port: number };

		const server = await start(
			{ ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port) },
			{ waitForReady: false }
		);
		const { code } = await server.exited;
		expect(code).not.toBe(0);
		expect(server.output()).toMatch(/EADDRINUSE|address already in use|port \d+ in use/i);
		expect(server.output()).not.toContain('standin listening');
		expect(socketDirectories(server.temp)).toEqual([]);
	});

	it('fails clearly on a malformed ORIGIN without echoing it', async () => {
		const secret = `pw-${crypto.randomUUID()}`;
		for (const origin of [`http://user:${secret}@exa mple.com`, 'https://x.example/path']) {
			const server = await start({ ORIGIN: origin }, { waitForReady: false });
			const { code } = await server.exited;
			expect(code).not.toBe(0);
			expect(server.output()).toContain(ORIGIN_FORMAT_ERROR);
			expect(server.output()).not.toContain(secret);
			expect(server.output()).not.toContain('standin listening');
		}
	});
});
