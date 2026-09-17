import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repositoryRoot = process.cwd();
let fixtureRoot = '';

function inheritedEnvironment(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(Bun.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
	);
}

async function writeFixture(): Promise<void> {
	fixtureRoot = await mkdtemp(join(tmpdir(), 'obzorarr-adapter-url-'));
	await mkdir(join(fixtureRoot, 'node_modules'));
	for (const dependency of ['@sveltejs', 'svelte', 'svelte-adapter-bun', 'vite']) {
		await symlink(
			join(repositoryRoot, 'node_modules', dependency),
			join(fixtureRoot, 'node_modules', dependency),
			'dir'
		);
	}
	await Bun.write(
		join(fixtureRoot, 'package.json'),
		JSON.stringify({ type: 'module', scripts: { build: 'vite build' } })
	);
	await Bun.write(
		join(fixtureRoot, 'svelte.config.js'),
		"import adapter from 'svelte-adapter-bun';\nexport default { kit: { adapter: adapter() } };\n"
	);
	await Bun.write(
		join(fixtureRoot, 'vite.config.ts'),
		"import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [sveltekit()] });\n"
	);
	await mkdir(join(fixtureRoot, 'src/routes'), { recursive: true });
	await writeFile(
		join(fixtureRoot, 'src/app.html'),
		'<!doctype html><html lang="en"><head><meta charset="utf-8">%sveltekit.head%</head><body><div style="display: contents">%sveltekit.body%</div></body></html>'
	);
	await writeFile(
		join(fixtureRoot, 'src/routes/+server.ts'),
		"import { json } from '@sveltejs/kit';\nexport const GET = ({ request, url }) => json({ requestUrl: request.url, eventUrl: url.href });\n"
	);
}

async function buildFixture(): Promise<void> {
	const process = Bun.spawn(
		['bun', '--bun', join(repositoryRoot, 'node_modules/vite/bin/vite.js'), 'build'],
		{
			cwd: fixtureRoot,
			env: { ...inheritedEnvironment(), NODE_ENV: 'production' },
			stdout: 'pipe',
			stderr: 'pipe'
		}
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text()
	]);
	if (exitCode !== 0) {
		throw new Error(`Fixture build failed (${exitCode})\n${stdout}\n${stderr}`);
	}
}

interface AdapterCase {
	host: string;
	env?: Record<string, string>;
	headers?: Record<string, string>;
}
function consumeServerOutput(stdout: ReadableStream<Uint8Array>): {
	origin: Promise<string>;
	drained: Promise<void>;
} {
	let resolveOrigin!: (origin: string) => void;
	let rejectOrigin!: (reason: unknown) => void;
	const origin = new Promise<string>((resolve, reject) => {
		resolveOrigin = resolve;
		rejectOrigin = reject;
	});
	const drained = (async () => {
		const reader = stdout.getReader();
		const decoder = new TextDecoder();
		let output = '';
		let foundOrigin = false;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					if (!foundOrigin) {
						rejectOrigin(new Error(`Fixture server exited before listening: ${output}`));
					}
					return;
				}
				if (foundOrigin) continue;

				output += decoder.decode(value, { stream: true });
				const listeningOrigin = output.match(/Listening on (https?:\/\/\S+)/)?.[1];
				if (listeningOrigin) {
					foundOrigin = true;
					resolveOrigin(listeningOrigin);
					output = '';
				}
			}
		} catch (error) {
			if (!foundOrigin) rejectOrigin(error);
			throw error;
		} finally {
			reader.releaseLock();
		}
	})();

	return { origin, drained };
}

async function observeAdapterUrl(testCase: AdapterCase): Promise<{
	requestUrl: string;
	eventUrl: string;
}> {
	const port = '0';
	const environment = inheritedEnvironment();
	for (const key of [
		'ORIGIN',
		'PROTOCOL_HEADER',
		'HOST_HEADER',
		'PORT_HEADER',
		'ADDRESS_HEADER',
		'XFF_DEPTH'
	]) {
		delete environment[key];
	}
	Object.assign(environment, {
		NODE_ENV: 'production',
		HOST: '127.0.0.1',
		PORT: port,
		...testCase.env
	});
	const server = Bun.spawn(['bun', 'build/index.js'], {
		cwd: fixtureRoot,
		env: environment,
		stdout: 'pipe',
		stderr: 'inherit'
	});
	const serverOutput = consumeServerOutput(server.stdout);
	let outputFailure: { error: unknown } | undefined;
	const outputDrain = serverOutput.drained.catch((error) => {
		outputFailure = { error };
		server.kill();
	});
	let result: { requestUrl: string; eventUrl: string } | undefined;
	let operationFailure: { error: unknown } | undefined;
	try {
		const serverOrigin = await Promise.race([
			serverOutput.origin,
			server.exited.then((exitCode) => {
				throw new Error(`Fixture server exited before listening (${exitCode})`);
			}),
			Bun.sleep(2_500).then(() => {
				throw new Error('Fixture server did not start');
			})
		]);
		let response: Response | undefined;
		for (let attempt = 0; attempt < 10; attempt += 1) {
			try {
				response = await fetch(serverOrigin, {
					headers: { Host: testCase.host, ...testCase.headers }
				});
				break;
			} catch {
				await Bun.sleep(25);
			}
		}
		if (!response) {
			throw new Error('Fixture server did not accept requests');
		}
		expect(response.status).toBe(200);
		result = (await response.json()) as { requestUrl: string; eventUrl: string };
	} catch (error) {
		operationFailure = { error };
	} finally {
		server.kill();
		await Promise.all([server.exited, outputDrain]);
	}
	if (outputFailure) throw outputFailure.error;
	if (operationFailure) throw operationFailure.error;
	if (!result) throw new Error('Fixture server returned no observation');
	return result;
}

beforeAll(async () => {
	try {
		await writeFixture();
		await buildFixture();
	} catch (error) {
		if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
		throw error;
	}
}, 120_000);

afterAll(async () => {
	if (!fixtureRoot) return;
	const cleanedPath = fixtureRoot;
	await rm(cleanedPath, { recursive: true, force: true });
	await expect(access(cleanedPath)).rejects.toThrow();
});

describe('installed svelte-adapter-bun request URL construction', () => {
	it('uses its documented HTTPS default and incoming Host when ORIGIN is unset', async () => {
		const observed = await observeAdapterUrl({ host: 'public.example:8443' });
		expect(observed).toEqual({
			requestUrl: 'https://public.example:8443/',
			eventUrl: 'https://public.example:8443/'
		});
	}, 30_000);

	it('uses ORIGIN ahead of contradictory configured origin headers', async () => {
		const observed = await observeAdapterUrl({
			host: 'internal.example:3000',
			env: {
				ORIGIN: 'https://canonical.example',
				PROTOCOL_HEADER: 'x-forwarded-proto',
				HOST_HEADER: 'x-forwarded-host',
				PORT_HEADER: 'x-forwarded-port'
			},
			headers: {
				'x-forwarded-proto': 'http',
				'x-forwarded-host': 'attacker.example',
				'x-forwarded-port': '8080'
			}
		});
		expect(observed).toEqual({
			requestUrl: 'https://canonical.example/',
			eventUrl: 'https://canonical.example/'
		});
	}, 30_000);

	it('uses configured protocol and host headers', async () => {
		const observed = await observeAdapterUrl({
			host: 'internal.example:3000',
			env: {
				PROTOCOL_HEADER: 'x-forwarded-proto',
				HOST_HEADER: 'x-forwarded-host'
			},
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'public.example'
			}
		});
		expect(observed).toEqual({
			requestUrl: 'https://public.example/',
			eventUrl: 'https://public.example/'
		});
	}, 30_000);

	it('uses a separately configured port header', async () => {
		const observed = await observeAdapterUrl({
			host: 'internal.example:3000',
			env: {
				PROTOCOL_HEADER: 'x-forwarded-proto',
				HOST_HEADER: 'x-forwarded-host',
				PORT_HEADER: 'x-forwarded-port'
			},
			headers: {
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'public.example',
				'x-forwarded-port': '8443'
			}
		});
		expect(observed).toEqual({
			requestUrl: 'https://public.example:8443/',
			eventUrl: 'https://public.example:8443/'
		});
	}, 30_000);

	it('shows SvelteKit normalizing a default port while preserving an IPv6 non-default port', async () => {
		const defaultPort = await observeAdapterUrl({ host: 'public.example:443' });
		expect(defaultPort).toEqual({
			requestUrl: 'https://public.example:443/',
			eventUrl: 'https://public.example/'
		});

		const ipv6 = await observeAdapterUrl({ host: '[2001:db8::1]:8443' });
		expect(ipv6).toEqual({
			requestUrl: 'https://[2001:db8::1]:8443/',
			eventUrl: 'https://[2001:db8::1]:8443/'
		});
	}, 30_000);
});
