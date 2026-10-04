import { describe, expect, it } from 'bun:test';
import { isRedirect, redirect } from '@sveltejs/kit';
import { buildPlexOAuthUrl, PLEX_AUTH_ORIGIN } from '$lib/server/auth/plex-oauth';

// SvelteKit 3 rejects external redirects unless the call allows them. GET /auth/plex
// allows exactly Plex's hosted sign-in origin, never `external: true`.

function thrown(fn: () => void): unknown {
	try {
		fn();
	} catch (error) {
		return error;
	}
	throw new Error('expected a throw');
}

describe('Plex sign-in redirect allowlist', () => {
	it('is the origin buildPlexOAuthUrl produces', () => {
		expect(PLEX_AUTH_ORIGIN).toBe('https://app.plex.tv');
		expect(
			new URL(buildPlexOAuthUrl('CODE', 'http://obzorarr.test/auth/plex/redirect')).origin
		).toBe(PLEX_AUTH_ORIGIN);
	});

	it('lets the Plex sign-in URL through', () => {
		const url = buildPlexOAuthUrl('CODE', 'http://obzorarr.test/auth/plex/redirect');
		const result = thrown(() => redirect(303, url, { external: [PLEX_AUTH_ORIGIN] }));
		expect(isRedirect(result)).toBe(true);
	});

	it('rejects any other external origin', () => {
		for (const location of [
			'https://plex.tv.example/auth',
			'https://evil.example/',
			'http://app.plex.tv/auth'
		]) {
			const result = thrown(() => redirect(303, location, { external: [PLEX_AUTH_ORIGIN] }));
			expect(isRedirect(result)).toBe(false);
		}
	});
});
