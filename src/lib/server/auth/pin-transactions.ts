import { Buffer } from 'node:buffer';
import type { Cookies } from '@sveltejs/kit';
import { eq, lte } from 'drizzle-orm';
import { dev } from '$app/env';
import { db } from '$lib/server/db/client';
import { pinTransactions } from '$lib/server/db/schema';

const PIN_STATE_COOKIE = 'plex_login_state';
const PIN_TRANSACTION_TTL_MS = 15 * 60 * 1000;

interface PinTransaction {
	pinId: number;
	state: string;
	expiresAt: Date;
	callbackVerified: boolean;
}

export interface VerifiedPinCallback {
	pinId: number;
	expiresAt: Date;
}

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax' as const,
	maxAge: Math.floor(PIN_TRANSACTION_TTL_MS / 1000)
};

const COOKIE_DELETE_OPTIONS = {
	path: COOKIE_OPTIONS.path,
	httpOnly: COOKIE_OPTIONS.httpOnly,
	secure: COOKIE_OPTIONS.secure,
	sameSite: COOKIE_OPTIONS.sameSite
};

function generateState(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Buffer.from(bytes).toString('base64url');
}

async function pruneExpired(now = Date.now()): Promise<void> {
	await db.delete(pinTransactions).where(lte(pinTransactions.expiresAt, new Date(now)));
}

export async function createPinTransaction(pinId: number, cookies: Cookies): Promise<string> {
	await pruneExpired();

	const state = generateState();
	await db.insert(pinTransactions).values({
		pinId,
		state,
		expiresAt: new Date(Date.now() + PIN_TRANSACTION_TTL_MS),
		callbackVerified: false
	});
	cookies.set(PIN_STATE_COOKIE, state, COOKIE_OPTIONS);

	return state;
}

export function parsePinForwardUrl(forwardUrl: string, requestUrl: URL): URL {
	const parsed = new URL(forwardUrl, requestUrl.origin);

	if (parsed.origin !== requestUrl.origin) {
		throw new Error('Plex redirect URL must use the Obzorarr origin');
	}

	return parsed;
}

export function appendPinStateToForwardUrl(
	forwardUrl: string,
	requestUrl: URL,
	state: string
): string {
	const parsed = parsePinForwardUrl(forwardUrl, requestUrl);

	parsed.searchParams.set('state', state);
	return parsed.toString();
}

export async function verifyPinCallback(
	cookies: Cookies,
	state: string | null
): Promise<VerifiedPinCallback | null> {
	await pruneExpired();

	const cookieState = cookies.get(PIN_STATE_COOKIE);
	if (!state || !cookieState || state !== cookieState) {
		return null;
	}

	const updated = await db
		.update(pinTransactions)
		.set({ callbackVerified: true })
		.where(eq(pinTransactions.state, state))
		.returning({
			pinId: pinTransactions.pinId,
			expiresAt: pinTransactions.expiresAt
		});

	return updated[0] ?? null;
}

export async function markPinCallbackVerified(
	cookies: Cookies,
	state: string | null
): Promise<boolean> {
	return (await verifyPinCallback(cookies, state)) !== null;
}

export async function getPinTransactionForRequest(
	pinId: number,
	cookies: Cookies
): Promise<PinTransaction | null> {
	await pruneExpired();

	const state = cookies.get(PIN_STATE_COOKIE);
	if (!state) {
		return null;
	}

	const transaction = await db.query.pinTransactions.findFirst({
		where: eq(pinTransactions.state, state)
	});
	if (!transaction || transaction.pinId !== pinId) {
		return null;
	}

	return transaction;
}

export async function clearPinTransaction(cookies: Cookies, state: string): Promise<void> {
	try {
		await db.delete(pinTransactions).where(eq(pinTransactions.state, state));
	} finally {
		cookies.delete(PIN_STATE_COOKIE, COOKIE_DELETE_OPTIONS);
	}
}

export async function _resetPinTransactionsForTests(): Promise<void> {
	await db.delete(pinTransactions);
}
