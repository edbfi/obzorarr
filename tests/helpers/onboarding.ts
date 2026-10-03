import { expect } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { resetSharedTestDb } from './db';

export interface CookieMutation {
	name: string;
	value?: string;
	options?: unknown;
}

export interface OnboardingTestCookies extends Cookies {
	claimValues: Map<string, string>;
	sets: CookieMutation[];
	deletes: CookieMutation[];
	sessionId?: string;
}

export const onboardingAdminLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
};

export async function resetOnboardingTestState(): Promise<void> {
	await resetSharedTestDb();
	clearBootstrapToken();
}

export function createOnboardingCookies(sessionId?: string): OnboardingTestCookies {
	const claimValues = new Map<string, string>();
	const sets: CookieMutation[] = [];
	const deletes: CookieMutation[] = [];
	const cookies = {
		claimValues,
		sets,
		deletes,
		sessionId,
		get(name: string) {
			return name === 'session' && cookies.sessionId ? cookies.sessionId : claimValues.get(name);
		},
		getAll() {
			return [];
		},
		set(name: string, value: string, options?: unknown) {
			sets.push({ name, value, options });
			claimValues.set(name, value);
		},
		delete(name: string, options?: unknown) {
			deletes.push({ name, options });
			claimValues.delete(name);
		},
		serialize() {
			return '';
		},
		// SvelteKit 3 adds Cookies.parse (Set-Cookie parsing); no onboarding code calls it.
		parse(): never {
			throw new Error('cookies.parse is not used by the onboarding flow');
		}
	} as OnboardingTestCookies;

	return cookies;
}

export function setOnboardingSessionCookie<T extends OnboardingTestCookies>(
	cookies: T,
	sessionId: string
): T {
	cookies.sessionId = sessionId;
	return cookies;
}

export async function claimOnboardingCookies<T extends OnboardingTestCookies>(
	cookies: T = createOnboardingCookies() as T
): Promise<T> {
	const token = createBootstrapToken();
	expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');
	return cookies;
}

export function createThrowingOnboardingCookies(errorToThrow: Error): Cookies {
	return {
		get: () => {
			throw errorToThrow;
		},
		getAll: () => [],
		set: () => {},
		delete: () => {},
		serialize: () => ''
	} as unknown as Cookies;
}

export function createJsonRequest(path: string, body: unknown): Request {
	return new Request(`http://localhost${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

export function createPlexIdentityResponse(): Response {
	return new Response(
		JSON.stringify({
			MediaContainer: {
				machineIdentifier: 'a'.repeat(32),
				friendlyName: 'Test Server'
			}
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
}

export function createPlexResourcesResponse(resources: unknown[]): Response {
	return new Response(JSON.stringify(resources), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

type RedirectStatus = 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308;

export async function expectRedirect(
	run: () => unknown,
	location: string,
	status: RedirectStatus = 303
): Promise<void> {
	try {
		await run();
		expect.unreachable('Expected redirect');
	} catch (error) {
		expect(isRedirect(error)).toBe(true);
		if (!isRedirect(error)) throw error;
		expect(error.status).toBe(status);
		expect(error.location).toBe(location);
	}
}

export function expectHttpError(
	error: unknown,
	status: number,
	message?: string
): asserts error is ReturnType<typeof isHttpError> extends true ? never : never {
	expect(isHttpError(error)).toBe(true);
	if (!isHttpError(error)) throw error;
	expect(error.status).toBe(status);
	if (message !== undefined) expect(error.body.message).toBe(message);
}

export function expectUnexpectedClaimError(error: unknown, expected: Error): void {
	expect(isHttpError(error)).toBe(false);
	expect(error).toBe(expected);
}
