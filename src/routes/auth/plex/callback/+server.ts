import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { createSessionFromPlexToken } from '$lib/server/auth/login-completion';
import { NotServerMemberError, PlexAuthApiError } from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { OnboardingClaimRequiredError } from '$lib/server/onboarding';
import type { RequestHandler } from './$types';

const CallbackRequestSchema = z.object({
	authToken: z.string().min(1, 'Auth token is required')
});

// Response.json would add `;charset=utf-8`; keep the exact header SvelteKit's
// deprecated json() helper sent.
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parseResult = CallbackRequestSchema.safeParse(body);
	if (!parseResult.success) {
		error(400, 'Invalid request: authToken is required');
	}

	const { authToken } = parseResult.data;

	try {
		return Response.json(
			await createSessionFromPlexToken(authToken, cookies, { requestUrl: url }),
			JSON_HEADERS
		);
	} catch (err) {
		if (err instanceof NotServerMemberError) {
			error(403, err.message);
		}

		if (err instanceof OnboardingClaimRequiredError) {
			error(403, err.message);
		}

		if (err instanceof PlexAuthApiError) {
			logger.error('Plex OAuth callback failed', 'Auth', {
				statusCode: err.statusCode,
				endpoint: err.endpoint
			});

			if (err.statusCode === 401) {
				error(401, 'Invalid or expired auth token. Sign in again.');
			}

			error(502, 'Could not reach Plex. Try again.');
		}

		logger.error('Unexpected error in OAuth callback', 'Auth', {
			errorType: err instanceof Error ? err.name : typeof err
		});
		error(500, 'Something went wrong. Try again.');
	}
};
