/**
 * db/client performs import-time initialization, so these cases run in
 * subprocesses instead of re-importing it inside the preloaded Bun test process.
 */

import { describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

// db/client imports `building` from SvelteKit's $app/env virtual module, which only
// exists inside Kit; outside the preloaded test process, provide it as a runtime module.
const appEnvStub = (building: boolean) =>
	`Bun.plugin({ name: 'app-env-stub', setup(build) { build.module('$app/env', () => ({ loader: 'object', exports: { browser: false, building: ${building}, dev: false, version: 'test' } })); } });`;

async function runDbClientScript(script: string, env: Record<string, string>, building = false) {
	const result = await Bun.spawn(['bun', '--eval', `${appEnvStub(building)}\n${script}`], {
		cwd: PROJECT_ROOT,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe'
	});

	return {
		exitCode: await result.exited,
		stdout: await new Response(result.stdout).text()
	};
}

describe('db/client module initialization', () => {
	describe('environment safety check', () => {
		it.each([
			['/tmp/production.db', 1, 'EXPECTED_ERROR'],
			[':memory:', 0, 'SUCCESS'],
			['/tmp/test-obzorarr.db', 0, 'SUCCESS']
		] as const)('handles test DATABASE_PATH=%s', async (databasePath, exitCode, output) => {
			const script = `
				process.env.NODE_ENV = 'test';
				process.env.DATABASE_PATH = '${databasePath}';
				try {
					const { db } = await import('$lib/server/db/client');
					if (db) {
						console.log('SUCCESS');
						process.exit(0);
					}
					process.exit(1);
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					if (message.includes('CRITICAL')) {
						console.log('EXPECTED_ERROR');
						process.exit(1);
					}
					console.error('UNEXPECTED_ERROR:', message);
					process.exit(2);
				}
			`;

			const result = await runDbClientScript(script, {
				NODE_ENV: 'test',
				DATABASE_PATH: databasePath
			});

			expect(result.exitCode).toBe(exitCode);
			expect(result.stdout).toContain(output);
		});
	});

	describe('directory creation', () => {
		it('creates parent directory for file-based databases in non-test env', async () => {
			const tempDbPath = `/tmp/obzorarr-test-${Date.now()}/data/test.db`;
			const script = `
				import { existsSync, rmSync } from 'node:fs';
				import { dirname } from 'node:path';

				process.env.NODE_ENV = 'development';
				process.env.DATABASE_PATH = '${tempDbPath}';

				try {
					await import('$lib/server/db/client');
					const parentDir = dirname('${tempDbPath}');
					if (existsSync(parentDir)) {
						console.log('DIRECTORY_CREATED');
						rmSync(dirname(parentDir), { recursive: true, force: true });
						process.exit(0);
					}
					console.log('DIRECTORY_NOT_CREATED');
					process.exit(1);
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					console.error('ERROR:', message);
					process.exit(2);
				}
			`;

			const result = await runDbClientScript(script, {
				NODE_ENV: 'development',
				DATABASE_PATH: tempDbPath
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('DIRECTORY_CREATED');
		});
	});

	describe('while SvelteKit builds', () => {
		it('opens an in-memory database and never creates DATABASE_PATH', async () => {
			const tempDbPath = join(tmpdir(), `obzorarr-build-${Date.now()}`, 'data', 'obzorarr.db');
			const script = `
				const { existsSync } = await import('node:fs');
				const { dirname } = await import('node:path');
				const { sqlite } = await import('$lib/server/db/client');
				console.log(sqlite.filename === ':memory:' ? 'MEMORY' : 'FILE');
				console.log(existsSync(dirname(dirname('${tempDbPath}'))) ? 'CREATED' : 'NOT_CREATED');
			`;

			const result = await runDbClientScript(
				script,
				{ NODE_ENV: 'production', DATABASE_PATH: tempDbPath },
				true
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('MEMORY');
			expect(result.stdout).toContain('NOT_CREATED');
		});
	});

	describe('exported objects', () => {
		it('exports db and sqlite objects', async () => {
			const { db, sqlite } = await import('$lib/server/db/client');

			expect(db).toBeDefined();
			expect(sqlite).toBeDefined();
		});
	});
});
