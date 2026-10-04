import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// ISSUE-007 source-guard.
//
// The reverse-proxy diagnostic auto-runs on mount via a $effect; a success/error
// toast must fire ONLY when the user clicks "Re-run diagnostic", never on the
// silent on-mount run. The Bun suite has no DOM runner to observe toasts firing,
// so this guard pins the wiring in source: runDiagnostic is gated on a
// `userInitiated` flag, the re-run button passes `userInitiated: true`, and the
// on-mount $effect calls runDiagnostic with no args (so it defaults to false).

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const SECURITY_PAGE = 'src/routes/admin/settings/security/+page.svelte';

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

describe('reverse-proxy diagnostic toast and progressive guidance', () => {
	it('imports the toast service', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toContain("import { toast } from '$lib/services/toast'");
	});
	it('uses the shared diagnostic DTO and presenter rather than route-local semantic maps', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toContain(
			"import type { ReverseProxyDiagnostic } from '$lib/security/reverse-proxy'"
		);
		expect(src).toContain('presentReverseProxyDiagnostic(diagnostic)');
		expect(src).toContain('documentationForGuide(guide)');
		expect(src).toContain('REVERSE_PROXY_PROVIDER_GUIDES');
		expect(src).toContain('<details class="provider-guide">');
		expect(src).toContain('Copy configuration');
		expect(src).toContain('role="status" aria-live="polite"');
		expect(src).not.toContain('type ReverseProxyDiagnosticView');
		expect(src).not.toContain('function getForwardedPairLabel');
	});

	it('offers no header-trust switch: ORIGIN is set in the environment', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).not.toContain('updateTrustProxy');
		expect(src).not.toContain('TRUST_PROXY');
		expect(src).not.toContain('Enable header trust');
		expect(src).toContain('<code>ORIGIN</code> environment variable');
		expect(src).toContain('Restart Obzorarr after changing ORIGIN');
		expect(src).not.toContain('headers for client IP, host');
		expect(src).not.toContain('Raw app origin');
	});

	it('scopes provider repair guides to the presenter and keeps failure recovery actionable', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toContain('presentation.documentationIds.includes(guide.documentationId)');
		expect(src).toContain('{#each applicableProviderGuides as guide}');
		expect(src).toMatch(
			/diagnosticStatus === 'failure'[\s\S]*runDiagnostic\(\{ userInitiated: true \}\)/
		);
		expect(src).toMatch(/try \{[\s\S]*await invalidateAll\(\)[\s\S]*finally \{/);
	});

	it('runDiagnostic accepts a userInitiated option defaulting to false', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toMatch(/function runDiagnostic\(\s*\{\s*userInitiated\s*=\s*false/);
	});

	it('the re-run button passes userInitiated: true', async () => {
		const src = await readSource(SECURITY_PAGE);
		expect(src).toMatch(
			/onclick=\{\(\)\s*=>\s*(?:void\s+)?runDiagnostic\(\s*\{\s*userInitiated:\s*true\s*\}\s*\)\}/
		);
	});

	it('the on-mount $effect calls runDiagnostic with NO args (stays silent)', async () => {
		const src = await readSource(SECURITY_PAGE);
		// The auto-run is `void runDiagnostic();` — no userInitiated argument, so it
		// defaults to false and never toasts.
		expect(src).toMatch(/void runDiagnostic\(\s*\);/);
		// And it must NOT pass userInitiated: true on the auto-run. The negative
		// lookbehind excludes the re-run button (`=> void runDiagnostic({...})`),
		// which legitimately passes userInitiated: true — we only forbid the
		// standalone on-mount statement from carrying the flag.
		expect(src).not.toMatch(/(?<!>\s)void runDiagnostic\(\s*\{\s*userInitiated:\s*true/);
	});

	it('every toast call is gated behind userInitiated', async () => {
		const src = await readSource(SECURITY_PAGE);
		// Each toast.success / toast.error in this file must be guarded by
		// `if (userInitiated)`; an ungated toast would fire on the on-mount run.
		const toastCalls = src.match(/toast\.(success|error)\(/g) ?? [];
		expect(toastCalls.length).toBeGreaterThan(0);
		const gatedToasts = src.match(/if \(userInitiated\) toast\.(success|error)\(/g) ?? [];
		expect(gatedToasts.length).toBe(toastCalls.length);
	});
});
