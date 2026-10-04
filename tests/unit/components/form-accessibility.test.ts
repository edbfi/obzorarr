import { afterAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { writable } from 'svelte/store';
import type { SuperForm } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { snapshotRuneGlobals, svelteCompilerPlugin } from '../../helpers/svelte-compile';
import {
	FIXTURE_FORM_ID,
	type FormAccessibilityFixtureData,
	formAccessibilitySchema
} from './fixtures/form-accessibility-schema';

// Server render (unhydrated HTML) of the in-house form components that replaced
// Formsnap. The client-side counterpart, with errors appearing and clearing in
// a DOM, is form-accessibility-dom.test.ts.

const restoreRuneGlobals = snapshotRuneGlobals();
afterAll(restoreRuneGlobals);
Bun.plugin(svelteCompilerPlugin('server'));
const { render } = await import('svelte/server');
const { default: Fixture } = await import('./fixtures/FormAccessibilityFixture.svelte');

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

interface ParsedElement {
	tag: string;
	attrs: Map<string, string>;
	text: string;
}

async function parseElements(html: string): Promise<ParsedElement[]> {
	const elements: ParsedElement[] = [];
	const open: ParsedElement[] = [];
	await new HTMLRewriter()
		.on('*', {
			element(element) {
				const entry: ParsedElement = {
					tag: element.tagName,
					attrs: new Map(element.attributes as Iterable<[string, string]>),
					text: ''
				};
				elements.push(entry);
				if (element.canHaveContent && !element.selfClosing) {
					open.push(entry);
					element.onEndTag(() => {
						open.pop();
					});
				}
			}
		})
		.onDocument({
			text(chunk) {
				for (const entry of open) entry.text += chunk.text;
			}
		})
		.transform(new Response(html))
		.text();
	return elements;
}

async function renderFixture(data: Record<string, unknown>) {
	const validated = await superValidate(data, zod4(formAccessibilitySchema), {
		id: FIXTURE_FORM_ID
	});
	const form = {
		form: writable(validated.data),
		formId: writable(validated.id),
		errors: writable(validated.errors),
		constraints: writable(validated.constraints),
		tainted: writable(undefined)
	} as unknown as SuperForm<FormAccessibilityFixtureData>;
	const { body } = render(Fixture, { props: { form } });
	const elements = await parseElements(body);
	const byId = (id: string) => {
		const matches = elements.filter((element) => element.attrs.get('id') === id);
		expect(matches).toHaveLength(1);
		return matches[0] as ParsedElement;
	};
	return { body, elements, byId };
}

const VALID = { timezone: 'Europe/Copenhagen', shareMode: 'public', enabled: true };
const INVALID = { timezone: '', shareMode: 'nope', enabled: true };

const ids = (name: string) => ({
	control: `${FIXTURE_FORM_ID}-${name}-control`,
	label: `${FIXTURE_FORM_ID}-${name}-label`,
	description: `${FIXTURE_FORM_ID}-${name}-description`,
	errors: `${FIXTURE_FORM_ID}-${name}-errors`
});

function expectNoDanglingReferences(elements: ParsedElement[]) {
	const present = new Set(elements.map((element) => element.attrs.get('id')).filter(Boolean));
	for (const element of elements) {
		for (const attribute of ['for', 'aria-describedby', 'aria-labelledby']) {
			const value = element.attrs.get(attribute);
			if (!value) continue;
			for (const id of value.split(/\s+/)) {
				expect(present.has(id)).toBe(true);
			}
		}
	}
}

describe('form components: server-rendered accessibility attributes', () => {
	it('links the label to the control with stable ids', async () => {
		const { byId } = await renderFixture(VALID);
		const timezone = ids('timezone');
		const label = byId(timezone.label);
		expect(label.tag).toBe('label');
		expect(label.attrs.get('for')).toBe(timezone.control);
		expect(label.text.trim()).toBe('Timezone');
		expect(byId(timezone.control).attrs.get('name')).toBe('timezone');
	});

	it('describes a valid control by its declared description only', async () => {
		const { byId } = await renderFixture(VALID);
		const timezone = ids('timezone');
		const control = byId(timezone.control);
		expect(control.attrs.get('aria-describedby')).toBe(timezone.description);
		expect(control.attrs.has('aria-invalid')).toBe(false);
		expect(control.attrs.get('aria-required')).toBe('true');
		expect(byId(timezone.description).text).toContain('IANA name');
	});

	it('adds the errors container and aria-invalid only while there are errors', async () => {
		const { byId } = await renderFixture(INVALID);
		const timezone = ids('timezone');
		const control = byId(timezone.control);
		expect(control.attrs.get('aria-describedby')).toBe(
			`${timezone.description} ${timezone.errors}`
		);
		expect(control.attrs.get('aria-invalid')).toBe('true');
		expect(byId(timezone.errors).text).toContain('Enter a timezone');
		expect(byId(timezone.label).attrs.has('data-form-error')).toBe(true);
	});

	it('omits aria-describedby for a valid field without a description', async () => {
		const { byId } = await renderFixture(VALID);
		const control = byId(ids('enabled').control);
		expect(control.attrs.has('aria-describedby')).toBe(false);
		expect(control.attrs.has('aria-invalid')).toBe(false);
	});

	it('names each radio group through aria-labelledby pointing at its visible label', async () => {
		for (const data of [VALID, INVALID]) {
			const { elements, byId } = await renderFixture(data);
			const shareMode = ids('shareMode');
			const groups = elements.filter((element) => element.attrs.get('role') === 'radiogroup');
			expect(groups).toHaveLength(1);
			const group = groups[0] as ParsedElement;
			expect(group.attrs.get('aria-labelledby')).toBe(shareMode.label);
			expect(byId(shareMode.label).text.trim()).toBe('Share mode');
		}
	});

	it('keeps every errors container in the DOM as an assertive live region', async () => {
		for (const data of [VALID, INVALID]) {
			const { byId } = await renderFixture(data);
			for (const name of ['timezone', 'shareMode', 'enabled']) {
				expect(byId(ids(name).errors).attrs.get('aria-live')).toBe('assertive');
			}
		}
	});

	it('references only ids that exist in the HTML', async () => {
		for (const data of [VALID, INVALID]) {
			const { elements } = await renderFixture(data);
			expectNoDanglingReferences(elements);
		}
	});

	it('renders the same ids on every render', async () => {
		const collect = async () =>
			(await renderFixture(INVALID)).elements
				.map((element) => element.attrs.get('id'))
				.filter(Boolean);
		expect(await collect()).toEqual(await collect());
	});
});

describe('form call sites', () => {
	const CALL_SITES = [
		'src/routes/admin/settings/system/+page.svelte',
		'src/routes/admin/settings/privacy/+page.svelte'
	];

	function fieldBlocks(source: string): string[] {
		return [...source.matchAll(/<Form\.Field\b[\s\S]*?<\/Form\.Field>/g)].map((match) => match[0]);
	}

	it('declares `description` on exactly the fields that render a Form.Description', async () => {
		for (const path of CALL_SITES) {
			const source = await Bun.file(join(PROJECT_ROOT, path)).text();
			const blocks = fieldBlocks(source);
			expect(blocks.length).toBeGreaterThan(0);
			for (const block of blocks) {
				const opening = block.slice(0, block.indexOf('>') + 1);
				expect(/\sdescription(\s|>)/.test(opening)).toBe(block.includes('<Form.Description'));
			}
		}
	});

	it('names every RadioGroup inside a Form.Control through its label id', async () => {
		let radioGroups = 0;
		for (const path of CALL_SITES) {
			const source = await Bun.file(join(PROJECT_ROOT, path)).text();
			for (const block of fieldBlocks(source)) {
				for (const match of block.matchAll(/<RadioGroup\b[^>]*>/g)) {
					radioGroups += 1;
					expect(match[0]).toContain('aria-labelledby={labelId}');
				}
			}
		}
		expect(radioGroups).toBe(3);
	});

	it('no longer depends on Formsnap', async () => {
		const pkg = await Bun.file(join(PROJECT_ROOT, 'package.json')).json();
		expect(pkg.devDependencies?.formsnap).toBeUndefined();
		expect(pkg.dependencies?.formsnap).toBeUndefined();
	});
});
