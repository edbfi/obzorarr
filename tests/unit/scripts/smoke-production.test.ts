import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type StoppableSubprocess, stopSubprocess } from '../../../scripts/subprocess';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
type Signal = number | NodeJS.Signals | undefined;

function createFakeSubprocess(onKill?: (signal: Signal, exit: (code: number) => void) => void) {
	let exitCode: number | null = null;
	let resolveExit!: (code: number) => void;
	const signals: Signal[] = [];
	let unrefCalls = 0;
	const exited = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});
	const exit = (code: number) => {
		exitCode = code;
		resolveExit(code);
	};
	const subprocess: StoppableSubprocess = {
		get exitCode() {
			return exitCode;
		},
		exited,
		kill(signal) {
			signals.push(signal);
			onKill?.(signal, exit);
		},
		unref() {
			unrefCalls += 1;
		}
	};

	return {
		subprocess,
		signals,
		get unrefCalls() {
			return unrefCalls;
		}
	};
}

describe('production smoke runner', () => {
	it('rejects an occupied port instead of accepting a foreign HTTP server', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'obzorarr-smoke-test-'));
		const foreignServer = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch: () => new Response('foreign server')
		});

		try {
			const result = Bun.spawn(['bun', 'run', 'scripts/smoke-production.ts'], {
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					DATABASE_PATH: join(tempDir, 'smoke.db'),
					PORT: String(foreignServer.port),
					SMOKE_TIMEOUT_MS: '1000'
				},
				stdout: 'pipe',
				stderr: 'pipe'
			});
			const [exitCode, stdout, stderr] = await Promise.all([
				result.exited,
				new Response(result.stdout).text(),
				new Response(result.stderr).text()
			]);

			expect(exitCode).not.toBe(0);
			expect(`${stdout}\n${stderr}`).toContain(
				`Smoke-test port ${foreignServer.port} is already in use`
			);
		} finally {
			await foreignServer.stop(true);
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('production smoke entry', () => {
	it('starts the production entry scripts/serve.ts without ORIGIN', async () => {
		const source = await Bun.file(join(PROJECT_ROOT, 'scripts/smoke-production.ts')).text();
		expect(source).toContain("Bun.spawn(['bun', './scripts/serve.ts']");
		expect(source).toContain('delete childEnv.ORIGIN;');
		const pkg = await Bun.file(join(PROJECT_ROOT, 'package.json')).json();
		expect(pkg.scripts.start).toBe('NODE_ENV=production bun ./scripts/serve.ts');
	});
});

describe('bounded subprocess shutdown', () => {
	it('returns after graceful termination', async () => {
		const fake = createFakeSubprocess((signal, exit) => {
			if (signal === undefined) exit(0);
		});

		await stopSubprocess(fake.subprocess, 20);

		expect(fake.signals).toEqual([undefined]);
		expect(fake.unrefCalls).toBe(0);
	});

	it('escalates to SIGKILL when graceful termination times out', async () => {
		const fake = createFakeSubprocess((signal, exit) => {
			if (signal === 'SIGKILL') exit(137);
		});

		await stopSubprocess(fake.subprocess, 5);

		expect(fake.signals).toEqual([undefined, 'SIGKILL']);
		expect(fake.unrefCalls).toBe(0);
	});

	it('unrefs and fails after both termination attempts time out', async () => {
		const fake = createFakeSubprocess();

		await expect(stopSubprocess(fake.subprocess, 5)).rejects.toThrow(
			'Subprocess did not terminate within 10ms'
		);
		expect(fake.signals).toEqual([undefined, 'SIGKILL']);
		expect(fake.unrefCalls).toBe(1);
	});
});
