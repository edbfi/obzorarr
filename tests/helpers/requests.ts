import type { Cookies } from '@sveltejs/kit';

export interface RecordedCookieSet {
	name: string;
	value: string;
	options?: Parameters<Cookies['set']>[2];
}

export interface RecordedCookieDelete {
	name: string;
	options?: Parameters<Cookies['delete']>[1];
}

export interface TestCookies extends Cookies {
	sets: RecordedCookieSet[];
	deletes: RecordedCookieDelete[];
}

export function createTestCookies(initial: Record<string, string> = {}): TestCookies {
	const store = new Map(Object.entries(initial));
	const sets: RecordedCookieSet[] = [];
	const deletes: RecordedCookieDelete[] = [];

	return {
		sets,
		deletes,
		get(name: string) {
			return store.get(name);
		},
		getAll() {
			return Array.from(store.entries()).map(([name, value]) => ({ name, value }));
		},
		set(name: string, value: string, options?: Parameters<Cookies['set']>[2]) {
			store.set(name, value);
			sets.push({ name, value, options });
		},
		delete(name: string, options?: Parameters<Cookies['delete']>[1]) {
			store.delete(name);
			deletes.push({ name, options });
		},
		serialize(name: string, value: string) {
			return `${name}=${value}`;
		}
	} as TestCookies;
}

export function createFormRequest(
	url: string,
	fields: Record<string, string>,
	init: Omit<RequestInit, 'body' | 'method'> = {}
): Request {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		formData.set(key, value);
	}

	return new Request(url, {
		...init,
		method: 'POST',
		body: formData
	});
}

export function createMockJsonResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Error',
		json: () => Promise.resolve(data),
		headers: new Headers(),
		redirected: false,
		type: 'basic',
		url: '',
		clone: () => createMockJsonResponse(data, ok, status),
		body: null,
		bodyUsed: false,
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		blob: () => Promise.resolve(new Blob()),
		formData: () => Promise.resolve(new FormData()),
		text: () => Promise.resolve(JSON.stringify(data))
	} as Response;
}

/** A request URL for helpers that decide a cookie's Secure flag from it (https: Secure). */
export const TEST_REQUEST_URL = new URL('https://obzorarr.test/');
