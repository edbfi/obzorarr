import { describe, expect, it } from 'bun:test';
import { canonicalOrigin, ORIGIN_FORMAT_ERROR } from '$lib/server/security/origin';
import {
	ORIGIN_FORMAT_ERROR as FRONT_ORIGIN_FORMAT_ERROR,
	parseOrigin as frontParseOrigin
} from '../../../scripts/serve';

// ORIGIN is parsed the same way by the front (scripts/serve.ts, unbundled, its own copy) and by
// the app (src/env.ts and the CSRF origin). If the two drifted, a value the front accepts could
// be compared in another form by csrfHandle, which is how a trailing `/` rejected every write.

const ACCEPTED: Array<[string, string]> = [
	['http://192.168.1.10:3000', 'http://192.168.1.10:3000'],
	['http://192.168.1.10:3000/', 'http://192.168.1.10:3000'],
	['  https://obzorarr.example  ', 'https://obzorarr.example'],
	['HTTPS://Obzorarr.Example:443/', 'https://obzorarr.example'],
	['http://obzorarr.lan:80', 'http://obzorarr.lan'],
	['http://[::1]:3000/', 'http://[::1]:3000'],
	['http://bücher.example', 'http://xn--bcher-kva.example']
];

const REJECTED: Array<[string, string]> = [
	['a path', 'https://x.example/path'],
	['a query', 'http://example.com/?a=1'],
	['an empty query', 'http://example.com?'],
	['a fragment', 'http://example.com/#top'],
	['an empty fragment', 'http://example.com/#'],
	['credentials', 'http://user:pass@example.com'],
	['a user name', 'http://user@example.com'],
	['a non-http(s) scheme', 'ftp://x.example'],
	['a scheme-relative value', '//x.example'],
	['garbage', 'not a url']
];

describe('canonicalOrigin (the app)', () => {
	it.each(ACCEPTED)('accepts %j as %s', (value, canonical) => {
		expect(canonicalOrigin(value)).toBe(canonical);
	});

	it.each(REJECTED)('rejects %s', (_reason, value) => {
		expect(() => canonicalOrigin(value)).toThrow(ORIGIN_FORMAT_ERROR);
	});

	it('treats an unset or blank value as unset', () => {
		expect(canonicalOrigin(undefined)).toBeUndefined();
		expect(canonicalOrigin('')).toBeUndefined();
		expect(canonicalOrigin('  ')).toBeUndefined();
	});

	it('never echoes the value, even when the URL parser rejects it', () => {
		const secret = `pw-${crypto.randomUUID()}`;
		for (const value of [
			`http://user:${secret}@example.com/x`,
			`http://user:${secret}@exa mple.com`
		]) {
			let caught: unknown;
			try {
				canonicalOrigin(value);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(Error);
			expect((caught as Error).cause).toBeUndefined();
			expect(Bun.inspect(caught)).not.toContain(secret);
		}
	});
});

describe('the front and the app parse ORIGIN alike', () => {
	it('use the same startup error', () => {
		expect(FRONT_ORIGIN_FORMAT_ERROR).toBe(ORIGIN_FORMAT_ERROR);
	});

	it.each(ACCEPTED)('both accept %j as %s', (value, canonical) => {
		expect(frontParseOrigin(value).origin).toBe(canonical);
	});

	it.each(REJECTED)('both reject %s', (_reason, value) => {
		expect(() => frontParseOrigin(value)).toThrow(ORIGIN_FORMAT_ERROR);
	});
});
