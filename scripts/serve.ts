// Production entry (`bun ./scripts/serve.ts`). SvelteKit 3 adapters no longer read a runtime
// ORIGIN, so when the operator sets one, this listener fronts the adapter over a private Unix
// socket and supplies the configured origin through headers only it can set. Without ORIGIN the
// adapter listens directly on HOST/PORT and derives the origin as https + Host.
//
// This file runs from the image next to build/ without bundling: it imports only node: builtins
// and Bun globals.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Environment = Record<string, string | undefined>;

export const PROTOCOL_HEADER = 'x-obzorarr-origin-proto';
export const HOST_HEADER = 'x-obzorarr-origin-host';
export const PEER_HEADER = 'x-obzorarr-peer';
/**
 * Set by the front, and only by the front, to the origin it supplies. The app reads it to know
 * that `event.url` already carries ORIGIN (the reverse-proxy diagnostic then reports ORIGIN);
 * ORIGIN alone does not say that, because build/index.js started directly ignores ORIGIN.
 */
export const FRONT_ORIGIN_MARKER = 'OBZORARR_FRONT_ORIGIN';

/**
 * Logged once at startup when neither ORIGIN nor PROTOCOL_HEADER is set. The wording is shared
 * by every edbfi app's front. In Obzorarr the failure over plain HTTP is sign-in: session and
 * sign-in cookies follow the https scheme the adapter assumes, so browsers refuse them.
 */
export const MISSING_ORIGIN_WARNING =
	'ORIGIN is not set: Obzorarr assumes it is served over HTTPS behind a proxy that preserves ' +
	'the Host header. Over plain HTTP, signing in and saving changes will fail. Set ORIGIN to ' +
	'the address users open, for example ORIGIN=http://192.168.1.10:3000.';

/** The startup error for an ORIGIN that is not a bare origin. It never contains the value. */
export const ORIGIN_FORMAT_ERROR =
	'ORIGIN must be a bare http(s) origin such as http://192.168.1.10:3000 (no path, query, fragment or credentials).';

/**
 * Parses ORIGIN as every edbfi front does: trim; the value must parse as an http(s) URL with no
 * credentials, no path other than `/` and no `?` or `#`. An uppercase scheme or host, a default
 * port and one trailing `/` are accepted; `url.origin` is the canonical form. The app parses it
 * the same way (src/lib/server/security/origin.ts; this file runs unbundled, so it keeps its own
 * copy). The error never echoes the value, which may carry credentials, and never wraps the URL
 * parser's error (it keeps the raw input).
 */
export function parseOrigin(value: string): URL {
	const trimmed = value.trim();
	let url: URL | undefined;
	try {
		url = new URL(trimmed);
	} catch {
		// reported below without the value
	}
	if (
		!url ||
		(url.protocol !== 'http:' && url.protocol !== 'https:') ||
		url.username !== '' ||
		url.password !== '' ||
		url.pathname !== '/' ||
		// An empty query or fragment leaves no trace on the parsed URL.
		/[?#]/.test(trimmed)
	) {
		throw new Error(ORIGIN_FORMAT_ERROR);
	}
	return url;
}

function integer(name: string, value: string, max: number): number {
	if (!/^\d+$/.test(value) || Number(value) > max) {
		throw new Error(`${name} must be an integer between 0 and ${max}.`);
	}
	return Number(value);
}

/** The adapter's SHUTDOWN_TIMEOUT, parsed as @sveltejs/adapter-bun parses it (default 30 s). */
export function shutdownTimeoutSeconds(environment: Environment): number {
	const value = environment.SHUTDOWN_TIMEOUT;
	return value !== undefined && /^\d+$/.test(value) ? Number(value) : 30;
}

export type Plan =
	| { mode: 'direct'; warning: string | null }
	| {
			mode: 'front';
			origin: URL;
			hostname: string;
			port: number;
			idleTimeout: number | undefined;
			ownPeerHeader: boolean;
			directory: string;
			socket: string;
	  };

/**
 * Prepares the environment the adapter reads and returns how to start. Mutates `environment`.
 */
export function prepare(environment: Environment): Plan {
	// @sveltejs/adapter-bun renamed IDLE_TIMEOUT to CONNECTION_IDLE_TIMEOUT; keep the documented
	// variable working. An explicit CONNECTION_IDLE_TIMEOUT wins.
	if (environment.IDLE_TIMEOUT) environment.CONNECTION_IDLE_TIMEOUT ??= environment.IDLE_TIMEOUT;
	delete environment[FRONT_ORIGIN_MARKER];

	if (!environment.ORIGIN?.trim()) {
		// A blank ORIGIN means unset. The origin is never derived from the request's Host header
		// here (DNS rebinding).
		delete environment.ORIGIN;
		const warning = environment.PROTOCOL_HEADER ? null : MISSING_ORIGIN_WARNING;
		return { mode: 'direct', warning };
	}

	const origin = parseOrigin(environment.ORIGIN);
	// The app compares ORIGIN with the browser's Origin header (csrfHandle), so it reads the
	// canonical form: `http://192.168.1.10:3000/` must not reject every write.
	environment.ORIGIN = origin.origin;
	const hostname = environment.HOST || '0.0.0.0';
	const port = integer('PORT', environment.PORT || '3000', 65535);
	const idle = environment.CONNECTION_IDLE_TIMEOUT;
	const idleTimeout = idle ? integer('CONNECTION_IDLE_TIMEOUT', idle, 255) : undefined;

	const directory = mkdtempSync(join(tmpdir(), 'obzorarr-'));
	const socket = join(directory, 'app.sock');
	environment.SOCKET_PATH = socket;
	// The front overwrites these headers on every request, so clients cannot forge them, and
	// ORIGIN wins over any operator-configured protocol, host or port header.
	environment.PROTOCOL_HEADER = PROTOCOL_HEADER;
	environment.HOST_HEADER = HOST_HEADER;
	delete environment.PORT_HEADER;
	// An operator-configured address header (e.g. x-forwarded-for behind a trusted proxy)
	// passes through unchanged; otherwise the front reports the TCP peer itself.
	const ownPeerHeader = !environment.ADDRESS_HEADER;
	if (ownPeerHeader) environment.ADDRESS_HEADER = PEER_HEADER;
	// Over a Unix socket the adapter's event-stream idle exemption does not work (Bun 1.4.2,
	// oven-sh/bun#43816), so the adapter side never times out and the public listener enforces
	// the client idle timeout.
	environment.CONNECTION_IDLE_TIMEOUT = '0';
	environment[FRONT_ORIGIN_MARKER] = origin.origin;

	return { mode: 'front', origin, hostname, port, idleTimeout, ownPeerHeader, directory, socket };
}

/**
 * The path and query of a request as Bun received them, sliced from `request.url` after any
 * authority. Never `new URL(request.url)`: Bun builds `request.url` from the client's Host header,
 * and a Host that does not parse (`x:99999`, `[::1`, an empty one) made that throw, so the front
 * answered 500 before the request reached the app. The front supplies the origin itself.
 */
export function forwardPath(requestUrl: string): string {
	// A bare path is already the path; its query may itself contain "://".
	if (requestUrl.startsWith('/')) return requestUrl;
	const scheme = requestUrl.indexOf('://');
	const start = scheme === -1 ? 0 : requestUrl.indexOf('/', scheme + 3);
	return start === -1 ? '/' : requestUrl.slice(start);
}

/**
 * An event stream has no length, so when the adapter force-closes it (at the end of its shutdown
 * drain) the public stream ends normally and the browser's EventSource reconnects. Passing the
 * upstream error on would reset the client connection instead. Other responses keep the error,
 * so a truncated download never looks complete.
 */
function endCleanlyOnUpstreamError(
	upstream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
	const reader = upstream.getReader();
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) controller.close();
				else controller.enqueue(value);
			} catch {
				controller.close();
			}
		},
		cancel(reason) {
			return reader.cancel(reason);
		}
	});
}

export async function serve(
	environment: Environment = process.env,
	importServer: () => Promise<unknown> = () => import(pathToFileURL(resolve('build/index.js')).href)
): Promise<void> {
	const plan = prepare(environment);
	if (plan.mode === 'direct') {
		if (plan.warning) console.warn(plan.warning);
		await importServer();
		return;
	}

	const { origin, ownPeerHeader, directory, socket } = plan;
	const removeSocketDirectory = () => rmSync(directory, { recursive: true, force: true });
	let markReady = () => {};
	const ready = new Promise<void>((resolveReady) => {
		markReady = resolveReady;
	});

	// Bind the public port before loading the adapter, so a busy port never starts the app;
	// requests that arrive while the adapter loads wait for it.
	let listener: ReturnType<typeof Bun.serve>;
	try {
		listener = Bun.serve({
			hostname: plan.hostname,
			port: plan.port,
			...(plan.idleTimeout === undefined ? {} : { idleTimeout: plan.idleTimeout }),
			// BODY_SIZE_LIMIT is enforced by the adapter behind the socket.
			maxRequestBodySize: Number.MAX_SAFE_INTEGER,
			async fetch(request, server) {
				await ready;
				const headers = new Headers(request.headers);
				headers.set(PROTOCOL_HEADER, origin.protocol.slice(0, -1));
				headers.set(HOST_HEADER, origin.host);
				if (ownPeerHeader) headers.set(PEER_HEADER, server.requestIP(request)?.address ?? '');
				else headers.delete(PEER_HEADER);
				let response: Response;
				try {
					response = await fetch(`http://localhost${forwardPath(request.url)}`, {
						method: request.method,
						headers,
						body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
						redirect: 'manual',
						decompress: false,
						signal: request.signal,
						unix: socket
					});
				} catch {
					return new Response('Service Unavailable', { status: 503 });
				}
				if (
					response.headers.get('content-type')?.startsWith('text/event-stream') &&
					response.body
				) {
					server.timeout(request, 0);
					return new Response(endCleanlyOnUpstreamError(response.body), response);
				}
				return response;
			}
		});
	} catch (error) {
		removeSocketDirectory();
		throw error;
	}

	// Shutdown: the adapter drains the socket side for up to SHUTDOWN_TIMEOUT, then emits
	// sveltekit:shutdown. A slow public client can still be downloading from this listener at
	// that point, so wait for the public drain too, within the same budget from the signal, and
	// force-close only when that deadline passes.
	let deadline = 0;
	let publicDrain: Promise<void> | undefined;
	const startDrain = () => {
		if (publicDrain) return publicDrain;
		deadline = Date.now() + shutdownTimeoutSeconds(environment) * 1000;
		publicDrain = listener.stop();
		return publicDrain;
	};
	// The adapter installs its own SIGTERM/SIGINT handlers only when it has finished loading. A
	// signal that arrives earlier is remembered and delivered again once they exist, so the
	// adapter still drains and emits sveltekit:shutdown. A second signal before then exits with
	// status 1 at once, as the adapter does for a second signal (the exit handler below removes
	// the socket directory). The handlers stay registered: Bun's default handler would end the
	// process without that cleanup.
	let loaded = false;
	let earlySignal: NodeJS.Signals | undefined;
	const onSignal = (signal: NodeJS.Signals) => {
		startDrain();
		if (loaded) return;
		if (earlySignal) process.exit(1);
		earlySignal = signal;
	};
	process.on('SIGTERM', onSignal);
	process.on('SIGINT', onSignal);
	// Every exit removes the socket directory, also one that skips sveltekit:shutdown (the
	// adapter's process.exit(1) on a second signal). Exit handlers must be synchronous; rmSync is.
	process.once('exit', removeSocketDirectory);
	process.once('sveltekit:shutdown', async () => {
		const drain = startDrain();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const drained = await Promise.race([
			drain.then(() => true),
			new Promise<false>((resolveTimeout) => {
				timer = setTimeout(() => resolveTimeout(false), Math.max(0, deadline - Date.now()));
			})
		]);
		clearTimeout(timer);
		if (!drained) await listener.stop(true);
		removeSocketDirectory();
	});

	try {
		await importServer();
	} catch (error) {
		process.off('SIGTERM', onSignal);
		process.off('SIGINT', onSignal);
		await listener.stop(true);
		removeSocketDirectory();
		throw error;
	}
	loaded = true;
	markReady();
	if (earlySignal) process.kill(process.pid, earlySignal);

	console.log(`Listening on ${listener.url} for ${origin.origin}`);
}

if (import.meta.main) await serve();
