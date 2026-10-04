// @ts-nocheck -- test fixture standing in for the generated adapter output (untyped JS).
// Stand-in for the adapter-bun build output (build/index.js), used by tests/unit/scripts/serve.test.ts.
// It reads the same environment variables as @sveltejs/adapter-bun, listens on SOCKET_PATH or
// HOST/PORT, and drains and emits sveltekit:shutdown on SIGTERM the way the adapter does.
import { writeFileSync } from 'node:fs';
import process from 'node:process';

if (process.env.STANDIN_THROW === '1') throw new Error('stand-in adapter failed to load');
// Like adapter-bun's top-level `await server.init(...)`: loading takes a while, and the signal
// handlers below exist only once it finishes.
if (process.env.STANDIN_LOAD_DELAY_MS) {
	await new Promise((done) => setTimeout(done, Number(process.env.STANDIN_LOAD_DELAY_MS)));
}

const env = process.env;
const seen = Object.fromEntries(
	[
		'SOCKET_PATH',
		'PROTOCOL_HEADER',
		'HOST_HEADER',
		'PORT_HEADER',
		'ADDRESS_HEADER',
		'CONNECTION_IDLE_TIMEOUT',
		'OBZORARR_FRONT_ORIGIN',
		'ORIGIN'
	].map((name) => [name, env[name] ?? null])
);
const big = new Uint8Array(Number(env.STANDIN_BIG_BYTES || 8 * 1024 * 1024)).fill(97);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** @param {Request} request */
async function handle(request) {
	const url = new URL(request.url);
	switch (url.pathname) {
		case '/echo':
			return Response.json({
				method: request.method,
				path: url.pathname,
				search: url.search,
				body: await request.text(),
				headers: Object.fromEntries(request.headers),
				env: seen
			});
		case '/redirect':
			return new Response(null, { status: 302, headers: { location: '/elsewhere' } });
		case '/gzip':
			return new Response(Bun.gzipSync(new TextEncoder().encode('compressed body')), {
				headers: { 'content-encoding': 'gzip', 'content-type': 'text/plain' }
			});
		case '/sse': {
			const stream = new ReadableStream({
				async start(controller) {
					controller.enqueue(new TextEncoder().encode('data: one\n\n'));
					await sleep(Number(url.searchParams.get('gap') || 3000));
					controller.enqueue(new TextEncoder().encode('data: two\n\n'));
					controller.close();
				}
			});
			return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
		}
		case '/sse-open': {
			// One event, then idle until the client leaves or the server force-closes the connection.
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('data: one\n\n'));
				}
			});
			return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
		}
		case '/hold-open': {
			// A plain (non-event-stream) body that never ends on its own.
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('partial'));
				}
			});
			return new Response(stream, { headers: { 'content-type': 'text/plain' } });
		}
		case '/hold': {
			// Streams until the client goes away, then records the abort.
			request.signal.addEventListener('abort', () => {
				if (env.STANDIN_ABORT_FILE) writeFileSync(env.STANDIN_ABORT_FILE, 'aborted');
			});
			const stream = new ReadableStream({
				async pull(controller) {
					await sleep(100);
					controller.enqueue(new TextEncoder().encode('.'));
				}
			});
			return new Response(stream, { headers: { 'content-type': 'text/plain' } });
		}
		case '/big':
			return new Response(big, { headers: { 'content-type': 'application/octet-stream' } });
		case '/stop':
			setTimeout(() => server.stop(true), 10);
			return new Response('stopping');
		default:
			return new Response('not found', { status: 404 });
	}
}

const options = env.SOCKET_PATH
	? { unix: env.SOCKET_PATH }
	: { hostname: env.HOST || '0.0.0.0', port: Number(env.PORT || 3000) };
const idle = env.CONNECTION_IDLE_TIMEOUT;
const server = Bun.serve({
	...options,
	...(idle ? { idleTimeout: Number(idle) } : {}),
	fetch: handle
});
console.log(`standin listening on ${env.SOCKET_PATH || server.url}`);

let stopping = false;
async function shutdown(reason) {
	if (stopping) return process.exit(1);
	stopping = true;
	const timeout = Number(env.SHUTDOWN_TIMEOUT || 30) * 1000;
	let timer;
	const drained = await Promise.race([
		server.stop().then(() => true),
		new Promise((done) => {
			timer = setTimeout(() => done(false), timeout);
		})
	]);
	clearTimeout(timer);
	if (!drained) await server.stop(true);
	console.log('standin drained');
	process.emit('sveltekit:shutdown', reason);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
