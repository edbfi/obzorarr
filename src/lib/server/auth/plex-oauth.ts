import {
	PinExpiredError,
	type PinInfo,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexAuthApiError,
	type PlexPinResponse,
	PlexPinResponseSchema,
	type PlexUser,
	PlexUserSchema,
	type PollPinOptions
} from './types';

const PLEX_TV_URL = 'https://plex.tv';
const PLEX_AUTH_URL = 'https://app.plex.tv/auth';
/** The only external origin the sign-in redirect may target (SvelteKit 3 `redirect` allowlist). */
export const PLEX_AUTH_ORIGIN = new URL(PLEX_AUTH_URL).origin;

const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'Content-Type': 'application/x-www-form-urlencoded',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION,
	'X-Plex-Platform': 'Web',
	'X-Plex-Platform-Version': '1.0',
	'X-Plex-Device': 'Browser',
	'X-Plex-Device-Name': PLEX_PRODUCT
} as const;

const DEFAULT_POLL_OPTIONS: Required<PollPinOptions> = {
	maxAttempts: 60,
	intervalMs: 5000
};

/** Plex.tv PINs expire after 15 minutes, so callers must start polling immediately. */
export async function requestPin(): Promise<PlexPinResponse> {
	const endpoint = `${PLEX_TV_URL}/api/v2/pins`;

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: PLEX_TV_HEADERS,
			body: new URLSearchParams({
				strong: 'true',
				'X-Plex-Client-Identifier': PLEX_CLIENT_ID
			})
		});

		if (!response.ok) {
			throw new PlexAuthApiError(
				`Failed to request PIN: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		const result = PlexPinResponseSchema.safeParse(data);

		if (!result.success) {
			throw new PlexAuthApiError(
				`Invalid PIN response: ${result.error.message}`,
				undefined,
				endpoint,
				result.error
			);
		}

		return result.data;
	} catch (error) {
		if (error instanceof PlexAuthApiError) {
			throw error;
		}

		throw new PlexAuthApiError(
			`Failed to request PIN: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

/** Plex.tv reports expired or unknown PINs as 404; normalize that into PinExpiredError. */
export async function checkPinStatus(pinId: number): Promise<PlexPinResponse> {
	const endpoint = `${PLEX_TV_URL}/api/v2/pins/${pinId}`;

	try {
		const response = await fetch(endpoint, {
			method: 'GET',
			headers: PLEX_TV_HEADERS
		});

		if (!response.ok) {
			if (response.status === 404) {
				throw new PinExpiredError();
			}

			throw new PlexAuthApiError(
				`Failed to check PIN status: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		const result = PlexPinResponseSchema.safeParse(data);

		if (!result.success) {
			throw new PlexAuthApiError(
				`Invalid PIN response: ${result.error.message}`,
				undefined,
				endpoint,
				result.error
			);
		}

		return result.data;
	} catch (error) {
		if (error instanceof PlexAuthApiError || error instanceof PinExpiredError) {
			throw error;
		}

		throw new PlexAuthApiError(
			`Failed to check PIN status: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

/** Keep polling server-side so callers get one expiry error for both Plex expiry and UI timeout. */
export async function pollPinForToken(
	pinId: number,
	options: PollPinOptions = {}
): Promise<string> {
	const { maxAttempts, intervalMs } = { ...DEFAULT_POLL_OPTIONS, ...options };

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const pin = await checkPinStatus(pinId);

		if (pin.authToken) {
			return pin.authToken;
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new PinExpiredError('Login timed out. Try again.');
}

/** Validate Plex's external profile payload before onboarding/auth code trusts its identifiers. */
export async function getPlexUserInfo(
	authToken: string,
	options: { signal?: AbortSignal } = {}
): Promise<PlexUser> {
	const endpoint = `${PLEX_TV_URL}/api/v2/user`;

	try {
		const response = await fetch(endpoint, {
			method: 'GET',
			headers: {
				...PLEX_TV_HEADERS,
				'X-Plex-Token': authToken
			},
			signal: options.signal
		});

		if (!response.ok) {
			throw new PlexAuthApiError(
				`Failed to get user info: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		const result = PlexUserSchema.safeParse(data);

		if (!result.success) {
			throw new PlexAuthApiError(
				`Invalid user response: ${result.error.message}`,
				undefined,
				endpoint,
				result.error
			);
		}

		return result.data;
	} catch (error) {
		if (error instanceof PlexAuthApiError) {
			throw error;
		}

		throw new PlexAuthApiError(
			`Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

/** Plex expects app/device context in the hash fragment that the hosted auth page reads. */
export function buildPlexOAuthUrl(pinCode: string, forwardUrl?: string): string {
	const params = new URLSearchParams({
		clientID: PLEX_CLIENT_ID,
		code: pinCode,
		'context[device][product]': PLEX_PRODUCT,
		'context[device][version]': PLEX_VERSION,
		'context[device][platform]': 'Web',
		'context[device][platformVersion]': '1.0',
		'context[device][device]': 'Browser',
		'context[device][deviceName]': PLEX_PRODUCT,
		'context[device][model]': 'hosted'
	});

	if (forwardUrl) {
		params.set('forwardUrl', forwardUrl);
	}

	return `${PLEX_AUTH_URL}#?${params.toString()}`;
}

/** Bundle the PIN and hosted-auth URL so the client and polling loop share one expiry window. */
export async function getPinInfo(forwardUrl?: string): Promise<PinInfo> {
	const pin = await requestPin();

	return {
		pinId: pin.id,
		code: pin.code,
		authUrl: buildPlexOAuthUrl(pin.code, forwardUrl),
		expiresAt: pin.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString()
	};
}
