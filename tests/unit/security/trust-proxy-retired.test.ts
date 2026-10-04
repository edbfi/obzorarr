import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { removeRetiredTrustProxySetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { env } from '$lib/server/private-env';
import { clearRateLimitStore } from '$lib/server/ratelimit';
import { rateLimitHandle } from '$lib/server/security/rate-limit-handle';
import { requestFilterHandle } from '$lib/server/security/request-filter';
import { retiredTrustProxyWarning } from '$lib/server/startup';
import { resetSharedTestDb } from '../../helpers/db';

// TRUST_PROXY (env or the stored admin/onboarding toggle) used to let proxyHandle rewrite
// event.url from the last hop of X-Forwarded-Proto/X-Forwarded-Host when the front was not
// running. ORIGIN replaced it (and, without ORIGIN behind a trusted proxy, the adapter's own
// PROTOCOL_HEADER/HOST_HEADER, covered in tests/integration/adapter-url-fixture.test.ts).

const SRC = join(import.meta.dir, '..', '..', '..', 'src');
const TRUST_PROXY_KEY = 'trust_proxy';
const FORWARDED = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'public.example' };

function envRecord(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

async function storeTrustProxy(value: string): Promise<void> {
	await db.insert(appSettings).values({ key: TRUST_PROXY_KEY, value });
}

async function storedTrustProxy(): Promise<string | null> {
	const rows = await db.select().from(appSettings).where(eq(appSettings.key, TRUST_PROXY_KEY));
	return rows[0]?.value ?? null;
}

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

describe('TRUST_PROXY is retired', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		clearRateLimitStore();
		delete envRecord().TRUST_PROXY;
	});

	afterEach(() => {
		delete envRecord().TRUST_PROXY;
	});

	it('leaves no hook that rewrites event.url from forwarded headers', async () => {
		const hooks = await Bun.file(join(SRC, 'hooks.server.ts')).text();
		expect(hooks).not.toContain('proxyHandle');
		for (const file of await sourceFiles(SRC)) {
			const source = await Bun.file(file).text();
			expect(source, file).not.toMatch(/defineProperty\(\s*event\s*,\s*['"]url['"]/);
			expect(source, file).not.toContain('isProxiedHttps');
			expect(source, file).not.toContain('getTrustProxyConfigWithSource');
		}
	});

	// Before: with TRUST_PROXY on, an early 404 on an http event.url carried HSTS when the
	// request claimed X-Forwarded-Proto: https. Now only event.url decides.
	for (const [label, enable] of [
		['set in the environment', () => (envRecord().TRUST_PROXY = 'true')],
		['stored by the old admin toggle', () => storeTrustProxy('true')]
	] as const) {
		it(`ignores forwarded headers for HSTS with TRUST_PROXY ${label}`, async () => {
			await enable();
			const resolve = mock(async () => new Response('resolved'));
			const call = (url: string) =>
				requestFilterHandle({
					event: {
						request: new Request(url, { headers: FORWARDED }),
						url: new URL(url),
						getClientAddress: () => '198.51.100.10'
					},
					resolve
				} as unknown as Parameters<typeof requestFilterHandle>[0]);

			const http = (await call('http://internal.local/favicon.ico')) as Response;
			expect(http.status).toBe(404);
			expect(http.headers.get('Strict-Transport-Security')).toBeNull();

			const https = (await call('https://public.example/favicon.ico')) as Response;
			expect(https.headers.get('Strict-Transport-Security')).toContain('max-age=');
			expect(resolve).not.toHaveBeenCalled();
		});
	}

	it('ignores forwarded headers for HSTS on rate-limited responses', async () => {
		envRecord().TRUST_PROXY = 'true';
		await storeTrustProxy('true');
		const resolve = mock(async () => new Response('resolved'));
		let last: Response | undefined;
		for (let i = 0; i < 31; i++) {
			last = (await rateLimitHandle({
				event: {
					request: new Request('http://internal.local/', { headers: FORWARDED }),
					url: new URL('http://internal.local/'),
					getClientAddress: () => '198.51.100.11'
				},
				resolve
			} as unknown as Parameters<typeof rateLimitHandle>[0])) as Response;
		}
		expect(last?.status).toBe(429);
		expect(last?.headers.get('Strict-Transport-Security')).toBeNull();
	});

	describe('stored setting', () => {
		it('reports a stored "true" and deletes the row', async () => {
			await storeTrustProxy('true');
			expect(await removeRetiredTrustProxySetting()).toBe(true);
			expect(await storedTrustProxy()).toBeNull();
		});

		it('deletes a stored "false" silently: it never turned header trust on', async () => {
			await storeTrustProxy('false');
			expect(await removeRetiredTrustProxySetting()).toBe(false);
			expect(await storedTrustProxy()).toBeNull();
		});

		it('is a no-op without a stored row', async () => {
			expect(await removeRetiredTrustProxySetting()).toBe(false);
		});
	});

	describe('startup warning', () => {
		it('stays silent when nobody sets TRUST_PROXY', () => {
			expect(retiredTrustProxyWarning({ fromEnvironment: false, fromSettings: false })).toBeNull();
		});

		it('names ORIGIN and the header settings as the replacement', () => {
			for (const source of [
				{ fromEnvironment: true, fromSettings: false },
				{ fromEnvironment: false, fromSettings: true },
				{ fromEnvironment: true, fromSettings: true }
			]) {
				const warning = retiredTrustProxyWarning(source) ?? '';
				expect(warning).toStartWith('TRUST_PROXY is no longer supported and is ignored');
				expect(warning).toContain('Set ORIGIN to the address users open');
				expect(warning).toContain(
					'PROTOCOL_HEADER=x-forwarded-proto and HOST_HEADER=x-forwarded-host'
				);
				expect(warning.includes('remove TRUST_PROXY from the environment')).toBe(
					source.fromEnvironment
				);
				expect(warning.includes('saved reverse-proxy header trust switch has been removed')).toBe(
					source.fromSettings
				);
			}
		});
	});
});
