import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AppSettingsKey,
	FunFactFrequency,
	getFunFactFrequency,
	setAppSetting
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { customSlides } from '$lib/server/db/schema';
import {
	getSlideConfigByType,
	initializeDefaultSlideConfig
} from '$lib/server/slides/config.service';
import { actions, load } from '../../../src/routes/admin/slides/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type SetFunFactFrequencyAction = NonNullable<typeof actions.setFunFactFrequency>;
type CreateCustomAction = NonNullable<typeof actions.createCustom>;
type UpdateCustomAction = NonNullable<typeof actions.updateCustom>;
type DeleteCustomAction = NonNullable<typeof actions.deleteCustom>;
type ToggleCustomSlideAction = NonNullable<typeof actions.toggleCustomSlide>;
type ReorderAction = NonNullable<typeof actions.reorder>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createFrequencyRequest(mode: string, customCount?: string): Request {
	const formData = new FormData();
	formData.set('mode', mode);
	if (customCount !== undefined) {
		formData.set('customCount', customCount);
	}

	return new Request('http://localhost/admin/slides?/setFunFactFrequency', {
		method: 'POST',
		body: formData
	});
}

async function runSetFunFactFrequency(request: Request) {
	const setFrequency = actions.setFunFactFrequency as SetFunFactFrequencyAction;
	return setFrequency({
		request,
		locals: adminLocals
	} as Parameters<SetFunFactFrequencyAction>[0]);
}

function buildCreateCustomRequest(fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		formData.set(k, v);
	}
	return new Request('http://localhost/admin/slides?/createCustom', {
		method: 'POST',
		body: formData
	});
}

function buildUpdateCustomRequest(fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		formData.set(k, v);
	}
	return new Request('http://localhost/admin/slides?/updateCustom', {
		method: 'POST',
		body: formData
	});
}

function buildIdRequest(action: string, id: string): Request {
	const formData = new FormData();
	formData.set('id', id);
	return new Request(`http://localhost/admin/slides?/${action}`, {
		method: 'POST',
		body: formData
	});
}

function buildReorderRequest(
	order: Array<{ type: 'builtin' | 'custom'; id: string | number }>
): Request {
	const formData = new FormData();
	formData.set('order', JSON.stringify(order));
	return new Request('http://localhost/admin/slides?/reorder', {
		method: 'POST',
		body: formData
	});
}

async function runCreateCustom(request: Request) {
	const handler = actions.createCustom as CreateCustomAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<CreateCustomAction>[0]);
}

async function runUpdateCustom(request: Request) {
	const handler = actions.updateCustom as UpdateCustomAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<UpdateCustomAction>[0]);
}

async function runDeleteCustom(request: Request) {
	const handler = actions.deleteCustom as DeleteCustomAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<DeleteCustomAction>[0]);
}

async function runToggleCustomSlide(request: Request) {
	const handler = actions.toggleCustomSlide as ToggleCustomSlideAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<ToggleCustomSlideAction>[0]);
}

async function runReorder(request: Request) {
	const handler = actions.reorder as ReorderAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<ReorderAction>[0]);
}

describe('admin slides actions', () => {
	beforeEach(resetSharedTestDb);

	for (const customCount of ['0', '16', '', '1abc', '1.5']) {
		it(`rejects invalid custom fun fact count ${customCount || '<empty>'}`, async () => {
			const result = await runSetFunFactFrequency(
				createFrequencyRequest(FunFactFrequency.CUSTOM, customCount)
			);

			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'Custom count must be between 1 and 15'
				}
			});
		});
	}

	for (const [customCount, expectedCount] of [
		['1', 1],
		['15', 15]
	] as const) {
		it(`accepts custom fun fact count ${customCount}`, async () => {
			await expect(
				runSetFunFactFrequency(createFrequencyRequest(FunFactFrequency.CUSTOM, customCount))
			).resolves.toMatchObject({
				success: true,
				funFactFrequency: {
					mode: FunFactFrequency.CUSTOM,
					count: expectedCount
				}
			});

			expect(await getFunFactFrequency()).toEqual({
				mode: FunFactFrequency.CUSTOM,
				count: expectedCount
			});
		});
	}

	// Mirrors the dogfood ISSUE-011 repro: change from default to "few" and confirm
	// the value is read back via getFunFactFrequency() like the load function does.
	for (const [mode, expectedCount] of [
		[FunFactFrequency.FEW, 2],
		[FunFactFrequency.NORMAL, 4],
		[FunFactFrequency.MANY, 8]
	] as const) {
		it(`persists fun fact frequency mode ${mode}`, async () => {
			await expect(runSetFunFactFrequency(createFrequencyRequest(mode))).resolves.toMatchObject({
				success: true,
				funFactFrequency: { mode, count: expectedCount }
			});

			expect(await getFunFactFrequency()).toEqual({ mode, count: expectedCount });
		});
	}

	describe('createCustom success contract (FIX-5 / ISSUE-007)', () => {
		it('returns { success: true, slide } on a valid create so the modal can close only on success', async () => {
			const result = await runCreateCustom(
				buildCreateCustomRequest({
					title: 'My recap slide',
					content: 'Some safe **markdown** content',
					enabled: 'true'
				})
			);

			// The enhance callback closes the editor ONLY when result.type === 'success';
			// the persisted slide must come back so the refreshed list shows it immediately.
			expect(result).toMatchObject({ success: true, slide: { title: 'My recap slide' } });

			const rows = await db.select().from(customSlides);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.content).toBe('Some safe **markdown** content');
		});
	});

	describe('createCustom enhance ordering (FIX-5 / ISSUE-007 source guard)', () => {
		const readSource = async () => await Bun.file('src/routes/admin/slides/+page.svelte').text();

		it('awaits update() before closing the editor and only closes on success', async () => {
			const src = await readSource();
			const updateIdx = src.indexOf('await update(');
			const closeIdx = src.indexOf('closeEditor();', updateIdx);
			expect(updateIdx).toBeGreaterThan(-1);
			expect(closeIdx).toBeGreaterThan(updateIdx);
			// closeEditor in the enhance flow is guarded by a success check.
			expect(/result\.type === 'success'\)\s*\{\s*closeEditor\(\);/s.test(src)).toBe(true);
		});

		it('no longer blanks editorTitle/editorContent inside the enhance callback (content preserved on failure)', async () => {
			const src = await readSource();
			// Scope the assertion to the create/update editor form so we don't trip
			// over openCreate()'s legitimate field reset elsewhere. Anchor on the
			// editor form's action attribute, then take its enhance callback body.
			const formStart = src.indexOf("'?/updateCustom' : '?/createCustom'");
			expect(formStart).toBeGreaterThan(-1);
			const region = src.slice(formStart, src.indexOf('</form>', formStart));
			// FIX-5: the old unsafe-html branch that blanked the fields on failure is gone…
			expect(region.includes('editorContent = ')).toBe(false);
			// …and the list is refreshed without resetting the still-open form.
			expect(region.includes('update({ reset: false })')).toBe(true);
		});
	});

	describe('validation-alert dismissal (ISSUE-003 source guard)', () => {
		// The custom-slide validation alert is derived from the page-level `form`
		// action data, which survives until the next POST — so a corrected/reopened
		// dialog kept showing a stale error. A local dismissal flag gates visibility:
		// dismiss on content edit + dialog (re)open, re-arm on a fresh failed submit.
		// No vitest-browser-svelte harness exists, so pin the mechanism in source.
		const readSource = async () => await Bun.file('src/routes/admin/slides/+page.svelte').text();

		it('declares the dismissal flag and a gated visibleFieldErrors derivation', async () => {
			const src = await readSource();
			expect(src).toContain('let fieldErrorsDismissed = $state(false)');
			expect(src).toContain(
				'const visibleFieldErrors = $derived(fieldErrorsDismissed ? undefined : slideFieldErrors)'
			);
		});

		it('dismisses stale errors on title/content edit (oninput) and on dialog (re)open', async () => {
			const src = await readSource();
			expect(src).toContain('oninput={() => (fieldErrorsDismissed = true)}');
			// openNewEditor + openEditEditor each set the flag so a reopened dialog
			// shows no stale error (the oninput uses an arrow, not a `;` statement).
			const dismissOnOpen = src.match(/fieldErrorsDismissed = true;/g) ?? [];
			expect(dismissOnOpen.length).toBeGreaterThanOrEqual(2);
		});

		it('re-arms the alert on a fresh failed submit', async () => {
			const src = await readSource();
			expect(src).toContain("if (result.type === 'failure')");
			expect(src).toContain('fieldErrorsDismissed = false');
		});

		it('binds the rendered field errors to visibleFieldErrors, not the raw form errors', async () => {
			const src = await readSource();
			expect(src).toContain('{#if visibleFieldErrors?.content?.[0]}');
			expect(src).toContain('{#if visibleFieldErrors?.title?.[0]}');
		});
	});

	describe('createCustom error mapping', () => {
		it('returns 400 with fieldErrors.content when content has unsafe HTML', async () => {
			const result = await runCreateCustom(
				buildCreateCustomRequest({
					title: 'Hello',
					content: '<script>alert(1)</script>',
					enabled: 'true'
				})
			);

			// ISSUE-006: the rejection is now branch-specific (the <script> branch),
			// still routed to fieldErrors.content via slideErrorToFail.
			const scriptReason = 'Remove <script> tags. Slide content cannot include inline scripts.';
			expect(result).toMatchObject({
				status: 400,
				data: {
					error: scriptReason,
					fieldErrors: { content: [scriptReason] }
				}
			});
		});

		it('returns 400 with fieldErrors.title when title exceeds Zod max', async () => {
			const result = await runCreateCustom(
				buildCreateCustomRequest({
					title: 'x'.repeat(201),
					content: 'Some content',
					enabled: 'true'
				})
			);
			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'Validation failed',
					fieldErrors: { title: expect.any(Array) }
				}
			});
		});
	});

	describe('updateCustom error mapping', () => {
		it('returns 404 when id does not exist', async () => {
			const result = await runUpdateCustom(
				buildUpdateCustomRequest({
					id: '99999',
					title: 'Updated',
					content: 'Updated content'
				})
			);
			expect(result).toMatchObject({
				status: 404,
				data: { error: expect.stringContaining('not found') }
			});
		});

		it('returns 400 with fieldErrors.content when updating with unsafe HTML', async () => {
			const insertResult = await db
				.insert(customSlides)
				.values({
					title: 'Existing',
					content: 'Hello world',
					enabled: true,
					sortOrder: 0,
					year: null
				})
				.returning();
			const id = insertResult[0]?.id;
			expect(id).toBeDefined();

			const result = await runUpdateCustom(
				buildUpdateCustomRequest({
					id: String(id),
					content: '<script>boom()</script>'
				})
			);
			expect(result).toMatchObject({
				status: 400,
				data: {
					fieldErrors: { content: expect.any(Array) }
				}
			});
		});
	});

	describe('toggleCustomSlide / deleteCustom error mapping', () => {
		it('toggleCustomSlide returns 404 for unknown id', async () => {
			const result = await runToggleCustomSlide(buildIdRequest('toggleCustomSlide', '99999'));
			expect(result).toMatchObject({
				status: 404,
				data: { error: expect.stringContaining('not found') }
			});
		});

		it('deleteCustom returns 404 for unknown id', async () => {
			const result = await runDeleteCustom(buildIdRequest('deleteCustom', '99999'));
			expect(result).toMatchObject({
				status: 404,
				data: { error: expect.stringContaining('not found') }
			});
		});
	});

	describe('reorder', () => {
		it('persists unified built-in and custom slide order', async () => {
			await initializeDefaultSlideConfig();
			const insertResult = await db
				.insert(customSlides)
				.values({
					title: 'Custom recap',
					content: 'Custom content',
					enabled: true,
					sortOrder: 99,
					year: null
				})
				.returning();
			const customId = insertResult[0]?.id;
			expect(customId).toBeDefined();

			const result = await runReorder(
				buildReorderRequest([
					{ type: 'custom', id: customId ?? 0 },
					{ type: 'builtin', id: 'genres' },
					{ type: 'builtin', id: 'total-time' }
				])
			);

			expect(result).toMatchObject({ success: true });

			const customRows = await db.select().from(customSlides);
			const customRow = customRows.find((row) => row.id === customId);
			expect(customRow?.sortOrder).toBe(0);
			expect((await getSlideConfigByType('genres'))?.sortOrder).toBe(1);
			expect((await getSlideConfigByType('total-time'))?.sortOrder).toBe(2);
		});
	});

	describe('class attributes in custom slide content', () => {
		const content = '<p class="fixed inset-0 z-[100]">Overlay</p>';

		it('stores the Markdown unchanged but renders it without classes on load', async () => {
			expect(
				await runCreateCustom(
					buildCreateCustomRequest({ title: 'Classy', content, enabled: 'true' })
				)
			).toMatchObject({ success: true });

			const rows = await db.select().from(customSlides);
			expect(rows[0]?.content).toBe(content);

			const data = await (
				load as unknown as () => Promise<{ customSlides: { renderedHtml: string }[] }>
			)();
			expect(data.customSlides[0]?.renderedHtml).toBe('<p>Overlay</p>');
		});

		it('previews without classes', async () => {
			const formData = new FormData();
			formData.set('content', content);
			const handler = actions.previewMarkdown as NonNullable<typeof actions.previewMarkdown>;
			const result = await handler({
				request: new Request('http://localhost/admin/slides?/previewMarkdown', {
					method: 'POST',
					body: formData
				}),
				locals: adminLocals
			} as Parameters<typeof handler>[0]);
			expect(result).toEqual({ success: true, html: '<p>Overlay</p>' });
		});
	});
});

describe('slides load — AI fun-fact status flag (ISSUE-012)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
	});

	function runLoad() {
		return (load as unknown as () => Promise<{ aiFunFactsActive: boolean }>)();
	}

	it('reports aiFunFactsActive=false when no OpenAI key is configured', async () => {
		const data = await runLoad();
		expect(data.aiFunFactsActive).toBe(false);
	});

	it('reports aiFunFactsActive=true when an OpenAI key is stored', async () => {
		await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'sk-test-key');
		const data = await runLoad();
		expect(data.aiFunFactsActive).toBe(true);
	});
});
