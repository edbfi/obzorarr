import { env } from '$lib/server/private-env';

export const OPENAI_HTTPS_REQUIRED_MESSAGE = 'OpenAI base URL must use HTTPS.';
export const PLEX_HTTP_OPT_IN_REQUIRED_MESSAGE =
	'HTTP Plex URLs require a local/private host and explicit local HTTP opt-in.';

export class CredentialedUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CredentialedUrlError';
	}
}

function parseCredentialedBaseUrl(rawUrl: string): URL {
	const trimmed = rawUrl.trim().replace(/\/+$/, '');
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new CredentialedUrlError('Invalid URL format');
	}

	if (parsed.username || parsed.password) {
		throw new CredentialedUrlError('Configured base URLs must not include credentials.');
	}
	if (parsed.search || parsed.hash) {
		throw new CredentialedUrlError(
			'Configured base URLs must not include query strings or fragments.'
		);
	}

	return parsed;
}

function parseIpv4(hostname: string): number[] | null {
	const parts = hostname.split('.');
	if (parts.length !== 4) return null;

	const octets: number[] = [];
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const value = Number(part);
		if (!Number.isInteger(value) || value < 0 || value > 255) return null;
		octets.push(value);
	}
	return octets;
}

function isIpv6Literal(hostname: string): boolean {
	if (!hostname.includes(':')) return false;

	try {
		new URL(`http://[${hostname}]`);
		return true;
	} catch {
		return false;
	}
}

function isIpv6UniqueLocal(hostname: string): boolean {
	if (!isIpv6Literal(hostname)) return false;

	const firstHextet = /^([0-9a-f]{1,4}):/i.exec(hostname)?.[1];
	if (!firstHextet) return false;

	const value = Number.parseInt(firstHextet, 16);
	return value >= 0xfc00 && value <= 0xfdff;
}

export function isLocalOrPrivateHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

	if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) {
		return true;
	}

	const ipv4 = parseIpv4(host);
	if (ipv4) {
		const [a, b] = ipv4;
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		return false;
	}

	if (host === '::1') return true;
	if (isIpv6UniqueLocal(host)) return true;
	if (/^fe[89ab][0-9a-f]?:/i.test(host)) return true;

	return false;
}

export function envAllowsInsecureLocalPlexHttp(): boolean {
	return env.PLEX_ALLOW_INSECURE_LOCAL_HTTP === 'true';
}

export function normalizeOpenAIBaseUrl(rawUrl: string): string {
	const parsed = parseCredentialedBaseUrl(rawUrl);
	if (parsed.protocol !== 'https:') {
		throw new CredentialedUrlError(OPENAI_HTTPS_REQUIRED_MESSAGE);
	}
	return parsed.toString().replace(/\/+$/, '');
}

export function normalizePlexServerUrl(
	rawUrl: string,
	options: { allowInsecureLocalHttp: boolean }
): string {
	const parsed = parseCredentialedBaseUrl(rawUrl);

	if (parsed.protocol === 'https:') {
		return parsed.toString().replace(/\/+$/, '');
	}

	if (parsed.protocol !== 'http:') {
		throw new CredentialedUrlError('Plex server URL must use HTTP or HTTPS.');
	}

	if (!options.allowInsecureLocalHttp || !isLocalOrPrivateHost(parsed.hostname)) {
		throw new CredentialedUrlError(PLEX_HTTP_OPT_IN_REQUIRED_MESSAGE);
	}

	return parsed.toString().replace(/\/+$/, '');
}

export function shouldPersistPlexInsecureLocalHttpOptIn(rawUrl: string): boolean {
	const parsed = parseCredentialedBaseUrl(rawUrl);
	return parsed.protocol === 'http:' && isLocalOrPrivateHost(parsed.hostname);
}
