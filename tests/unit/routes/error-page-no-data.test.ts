import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// ISSUE-002 — friendly no-data / 404 pages must not render the bare numeric
// status code.
//
// The dogfood run hit `/wrapped/<no-data-year>`, where the recap loader throws a
// 404 that the wrapped `+error.svelte` renders as a friendly "No Wrapped for
// {year} yet" empty-state. Before this fix the component still rendered
// `<div class="status-code">{status}</div>` unconditionally, so a big "404" sat
// above the friendly copy and read as a hard error. The HTTP status is unchanged
// (still 404) — this is presentation only.
//
// These components read `page` from `$app/state` and are awkward to mount in unit tests,
// so — consistent with the source-assertion contract pattern already used by
// `sse-denial-contract.test.ts` and `route-export-guard.test.ts` — we assert at
// the source level that the `.status-code` markup is conditionally gated (and, in
// the wrapped page, gated by the no-data flag) while the friendly title is kept.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

/**
 * Returns the `{#if ...}` condition guarding the `.status-code` element, or null
 * if the element is not wrapped in an `{#if}` block (i.e. rendered
 * unconditionally — the pre-fix shape this test must reject).
 */
function statusCodeGuard(source: string): string | null {
	const elementIdx = source.indexOf('class="status-code"');
	if (elementIdx === -1) return null;
	// Find the nearest `{#if ...}` that opens before the element and is not closed
	// by an `{/if}` between it and the element.
	const before = source.slice(0, elementIdx);
	const ifMatches = [...before.matchAll(/\{#if\s+([^}]+)\}/g)];
	if (ifMatches.length === 0) return null;
	const lastIf = ifMatches[ifMatches.length - 1];
	if (!lastIf) return null;
	const afterLastIf = before.slice(lastIf.index ?? 0);
	if (afterLastIf.includes('{/if}')) return null; // that block already closed
	return (lastIf[1] ?? '').trim();
}

/**
 * Resolves the effective guard logic. The guard may be inlined in the `{#if}` or
 * a derived boolean (e.g. `showStatusCode`) whose definition holds the actual
 * condition — return both so a substring assertion can match either form.
 */
function resolvedGuardLogic(source: string): string | null {
	const guard = statusCodeGuard(source);
	if (guard === null) return null;
	// If the guard is a bare derived-boolean identifier, fold in its definition.
	const identMatch = guard.match(/^!?\s*([A-Za-z_$][\w$]*)$/);
	const ident = identMatch?.[1];
	if (ident) {
		const defMatch = source.match(new RegExp(`const\\s+${ident}\\s*=\\s*\\$derived[^\\n]*`));
		if (defMatch) return `${guard} ${defMatch[0]}`;
	}
	return guard;
}

describe('ISSUE-002 — wrapped no-data error page suppresses the bare status code', () => {
	it('gates the .status-code element on a condition (not rendered unconditionally)', async () => {
		const src = await readSource('src/routes/wrapped/[year=year]/+error.svelte');
		const guard = statusCodeGuard(src);
		expect(guard).not.toBeNull();
	});

	it('suppresses the status code for the no-data case via the isNoDataForYear flag', async () => {
		const src = await readSource('src/routes/wrapped/[year=year]/+error.svelte');
		const guard = resolvedGuardLogic(src);
		// The guarding condition (inline or via its derived definition) must
		// reference the existing no-data flag so the big numeric code cannot render
		// on the friendly empty-state.
		expect(guard).toContain('isNoDataForYear');
	});

	it('keeps the friendly title for the no-data case', async () => {
		const src = await readSource('src/routes/wrapped/[year=year]/+error.svelte');
		// The friendly title text stays; only the bare numeric code is suppressed.
		// biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the source contains the literal ${year} placeholder, not a runtime template
		expect(src).toContain('No Wrapped for ${year} yet');
	});

	it('does not change the HTTP status (status stays a read of page.status)', async () => {
		const src = await readSource('src/routes/wrapped/[year=year]/+error.svelte');
		// The component only READS `page.status`; the fix is presentation-only, so
		// the rendered HTTP status (404) is unchanged.
		expect(src).toContain('const status = $derived(page.status)');
	});
});

describe('ISSUE-002 — root error page suppresses the bare status code on 404', () => {
	it('gates the .status-code element on a condition (not rendered unconditionally)', async () => {
		const src = await readSource('src/routes/+error.svelte');
		const guard = statusCodeGuard(src);
		expect(guard).not.toBeNull();
	});

	it('suppresses the status code for the friendly 404 case', async () => {
		const src = await readSource('src/routes/+error.svelte');
		const guard = resolvedGuardLogic(src);
		// The guard (inline or via its derived definition) must reference the 404
		// status so the bare code is hidden for the friendly not-found copy while
		// 403/429/5xx still show it.
		expect(guard).toContain('404');
	});
});
