import type { Cookies } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';
import { isSecureRequest } from '$lib/server/security/cookie-security';
import { invalidateSession } from './session';

export async function logout(cookies: Cookies, requestUrl?: URL): Promise<void> {
	const sessionId = cookies.get('session');

	if (sessionId) {
		try {
			await invalidateSession(sessionId);
		} catch (err) {
			logger.error('Error invalidating session', 'Logout', { error: String(err) });
		}
	}

	cookies.delete('session', { path: '/', secure: isSecureRequest(requestUrl) });
}
