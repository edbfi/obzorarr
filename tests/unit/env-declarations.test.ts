import { describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { variables } from '../../src/env';

// SvelteKit 3 exposes only the private variables declared in src/env.ts; an
// undeclared one silently reads as undefined. Keep the declarations equal to what
// the readers of $lib/server/private-env actually use.

const SRC = join(import.meta.dir, '..', '..', 'src');

async function sourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return sourceFiles(path);
			return /\.(ts|js|svelte)$/.test(entry.name) ? [path] : [];
		})
	);
	return nested.flat();
}

async function namesReadThroughPrivateEnv(): Promise<Set<string>> {
	const names = new Set<string>();
	for (const file of await sourceFiles(SRC)) {
		const source = await Bun.file(file).text();
		if (!source.includes("from '$lib/server/private-env'")) continue;
		for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)) {
			names.add(match[1] as string);
		}
	}
	return names;
}

describe('src/env.ts declarations', () => {
	it('declares exactly the variables the app reads through $lib/server/private-env', async () => {
		const read = [...(await namesReadThroughPrivateEnv())].sort();
		expect(read.length).toBeGreaterThan(0);
		expect(Object.keys(variables).sort()).toEqual(read);
	});

	it('leaves unset variables undefined instead of substituting a default', async () => {
		for (const [name, config] of Object.entries(variables)) {
			const schema = (config as { schema?: { '~standard': { validate(v: unknown): unknown } } })
				.schema;
			expect(schema, name).toBeDefined();
			const unset = (await schema?.['~standard'].validate(undefined)) as { value?: unknown };
			expect(unset.value, name).toBeUndefined();
			const set = (await schema?.['~standard'].validate('x')) as { value?: unknown };
			expect(set.value, name).toBe('x');
		}
	});

	it('routes every private env read through $lib/server/private-env', async () => {
		for (const file of await sourceFiles(SRC)) {
			const source = await Bun.file(file).text();
			expect(source, file).not.toMatch(/from '\$env\/(dynamic|static)\/private'/);
			if (!file.endsWith(join('lib', 'server', 'private-env.ts'))) {
				expect(source, file).not.toMatch(/from '\$app\/env\/private'/);
			}
		}
	});
});
