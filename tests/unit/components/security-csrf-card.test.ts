import { afterAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { compile } from 'svelte/compiler';
import { snapshotRuneGlobals, svelteCompilerPlugin } from '../../helpers/svelte-compile';

// Server render of the Security settings page's CSRF card. The description line
// ends "Source: <origin source> (locked by env)." and Svelte keeps the one space
// that the markup puts between an expression and the text after it, so the period
// must sit directly after the label, or after the source when the origin is not
// locked. Rendering is the only check that sees the whitespace Svelte emits.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const PAGE_PATH = join(PROJECT_ROOT, 'src/routes/admin/settings/security/+page.svelte');
const KIT_STUBS = join(import.meta.dir, 'fixtures', 'security-page-kit-stubs.ts');

const restoreRuneGlobals = snapshotRuneGlobals();
afterAll(restoreRuneGlobals);

// The page file itself is compiled unchanged except that its three SvelteKit
// imports point at the stubs. It is imported under a query string so that this
// plugin, not a shared Svelte plugin another test file registered earlier in the
// same process, loads it; every other component loads through the shared one.
Bun.plugin({
	name: 'obzorarr-test-security-page',
	setup(build) {
		build.onLoad({ filter: /\+page\.svelte\?csrf-card$/ }, async ({ path }) => {
			const source = (await Bun.file(path.replace(/\?.*$/, '')).text()).replace(
				/(['"])(\$app\/forms|\$app\/navigation|\$lib\/utils\/submit-action)\1/g,
				JSON.stringify(KIT_STUBS)
			);
			const { js } = compile(source, { filename: path, generate: 'server', dev: false });
			return { contents: js.code, loader: 'js' };
		});
	}
});
Bun.plugin(svelteCompilerPlugin('server'));
const { render } = await import('svelte/server');
const { default: SecurityPage } = await import(`${PAGE_PATH}?csrf-card`);

type OriginSource = 'env' | 'db' | 'default';

function renderCsrfDescription(originSource: OriginSource, originLocked: boolean): string {
	const { body } = render(SecurityPage, {
		props: {
			data: {
				security: {
					originValue: originSource === 'default' ? '' : 'https://obzorarr.example.com',
					csrfEnabled: originSource !== 'default',
					originSource,
					originLocked,
					warningDismissed: false,
					csrfOriginSkipped: false
				},
				csrfOriginVersion: '2026-01-01T00:00:00.000Z'
			}
		}
	});
	const start = body.indexOf('Origin check applied to all state-changing requests');
	expect(start).toBeGreaterThan(-1);
	const end = body.indexOf('</p>', start);
	expect(end).toBeGreaterThan(start);
	return body
		.slice(start, end)
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

describe('Security page CSRF card description', () => {
	it('puts the period directly after "(locked by env)"', () => {
		const text = renderCsrfDescription('env', true);
		expect(text).toEndWith('Source: env (locked by env).');
		expect(text).not.toMatch(/\s\./);
	});

	it.each(['db', 'default'] as const)('puts the period directly after the %s source', (source) => {
		const text = renderCsrfDescription(source, false);
		expect(text).toEndWith(`Source: ${source}.`);
		expect(text).not.toContain('locked by env');
		expect(text).not.toMatch(/\s\./);
	});
});
