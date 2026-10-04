import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { snapshotRuneGlobals, svelteCompilerPlugin } from '../../helpers/svelte-compile';
import type { FixtureState, mountFixture } from './fixtures/form-accessibility-client';
import { FIXTURE_FORM_ID, formAccessibilitySchema } from './fixtures/form-accessibility-schema';

// Client-side counterpart of form-accessibility.test.ts (owner decision, 2026-10-02):
// the components are mounted into a Happy DOM document and errors appear and clear
// the way superForm updates them after a submit.
//
// `bun test` resolves `svelte` to its server entry, where `mount()` does not exist,
// and the browser condition must not be set globally (the server-render tests need
// `svelte/server`). So the fixture is compiled with `generate: 'client'` and bundled
// in isolation with `Bun.build({ target: 'browser', conditions: ['browser'] })`, and
// only that bundle is imported here.

type MountFixture = typeof mountFixture;

const ENTRY = join(import.meta.dir, 'fixtures', 'form-accessibility-client.ts');
const ids = (name: string) => ({
	control: `${FIXTURE_FORM_ID}-${name}-control`,
	description: `${FIXTURE_FORM_ID}-${name}-description`,
	errors: `${FIXTURE_FORM_ID}-${name}-errors`
});

let outdir = '';
let mount: MountFixture;
let initialState: FixtureState;
let restoreRuneGlobals = () => {};

beforeAll(async () => {
	// Under node_modules so the bundled Svelte runtime stays out of the coverage report.
	const cacheDir = join(import.meta.dir, '..', '..', '..', 'node_modules', '.cache');
	await mkdir(cacheDir, { recursive: true });
	outdir = await mkdtemp(join(cacheDir, 'obzorarr-form-dom-'));
	const result = await Bun.build({
		entrypoints: [ENTRY],
		outdir,
		target: 'browser',
		conditions: ['browser'],
		format: 'esm',
		plugins: [svelteCompilerPlugin('client')]
	});
	if (!result.success) {
		throw new AggregateError(result.logs, 'client bundle failed');
	}
	const validated = await superValidate(
		{ timezone: 'Europe/Copenhagen', shareMode: 'public', enabled: true },
		zod4(formAccessibilitySchema),
		{ id: FIXTURE_FORM_ID }
	);
	initialState = {
		id: validated.id,
		data: validated.data,
		errors: validated.errors,
		constraints: validated.constraints ?? {}
	};
	restoreRuneGlobals = snapshotRuneGlobals();
	GlobalRegistrator.register();
	({ mountFixture: mount } = await import(join(outdir, 'form-accessibility-client.js')));
});

afterAll(async () => {
	restoreRuneGlobals();
	if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
	if (outdir) await rm(outdir, { recursive: true, force: true });
});

function referencedIdsExist(element: Element) {
	const value = element.getAttribute('aria-describedby');
	if (!value) return true;
	return value.split(/\s+/).every((id) => document.getElementById(id) !== null);
}

describe('form components in the browser: errors appear and clear', () => {
	it('updates aria-invalid and aria-describedby and announces in the same live region', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const fixture = mount(target, initialState);
		const timezone = ids('timezone');

		const control = document.getElementById(timezone.control) as HTMLInputElement;
		const liveRegion = document.getElementById(timezone.errors) as HTMLElement;
		expect(control).not.toBeNull();
		expect(liveRegion.getAttribute('aria-live')).toBe('assertive');
		expect(liveRegion.textContent?.trim()).toBe('');
		expect(control.hasAttribute('aria-invalid')).toBe(false);
		expect(control.getAttribute('aria-describedby')).toBe(timezone.description);

		fixture.setErrors({ timezone: ['Enter a timezone'] });

		expect(control.getAttribute('aria-invalid')).toBe('true');
		expect(control.getAttribute('aria-describedby')).toBe(
			`${timezone.description} ${timezone.errors}`
		);
		expect(referencedIdsExist(control)).toBe(true);
		// The text lands in the live region that was already in the DOM, not a new node.
		expect(document.getElementById(timezone.errors)).toBe(liveRegion);
		expect(liveRegion.textContent).toContain('Enter a timezone');

		fixture.setErrors({});

		expect(control.hasAttribute('aria-invalid')).toBe(false);
		expect(control.getAttribute('aria-describedby')).toBe(timezone.description);
		expect(document.getElementById(timezone.errors)).toBe(liveRegion);
		expect(liveRegion.textContent?.trim()).toBe('');
		expect(referencedIdsExist(control)).toBe(true);

		fixture.destroy();
		target.remove();
	});

	it('leaves no aria-describedby on a field without a description once errors clear', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const fixture = mount(target, initialState);
		const enabled = ids('enabled');
		const control = document.getElementById(enabled.control) as HTMLInputElement;
		const liveRegion = document.getElementById(enabled.errors) as HTMLElement;

		expect(control.hasAttribute('aria-describedby')).toBe(false);
		fixture.setErrors({ enabled: ['Required'] });
		expect(control.getAttribute('aria-describedby')).toBe(enabled.errors);
		expect(control.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(enabled.errors)).toBe(liveRegion);
		fixture.setErrors({});
		expect(control.hasAttribute('aria-describedby')).toBe(false);
		expect(control.hasAttribute('aria-invalid')).toBe(false);

		fixture.destroy();
		target.remove();
	});

	it('keeps the radio group named by its label after mount', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const fixture = mount(target, initialState);
		const group = target.querySelector('[role="radiogroup"]') as HTMLElement;
		const labelId = group.getAttribute('aria-labelledby') ?? '';
		expect(document.getElementById(labelId)?.textContent?.trim()).toBe('Share mode');
		fixture.destroy();
		target.remove();
	});
});
