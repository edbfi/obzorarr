import { isIP } from 'node:net';
import type { ReverseProxyDiagnostic, SourceAddressCategory } from '$lib/security/reverse-proxy';
import { type ConfigValue, getCsrfConfigWithSource } from '$lib/server/admin/settings.service';
import { env } from '$lib/server/private-env';
import { getForwardedHeaderNamesPresent, parseForwardedProtoHost } from './forwarded-headers';

export type {
	ReverseProxyDiagnostic,
	ReverseProxyRecommendationAction
} from '$lib/security/reverse-proxy';

export interface ReverseProxyDiagnosticInput {
	request: Request;
	effectiveAppUrl: string | URL;
	browserOrigin?: string | null;
	sourceAddress?: string | null;
}

export interface ReverseProxyDiagnosticBuildInput extends ReverseProxyDiagnosticInput {
	csrfOrigin: ConfigValue<string>;
	/** scripts/serve.ts fronts the app with ORIGIN (OBZORARR_FRONT_ORIGIN is set). */
	fronted?: boolean;
}

interface OriginDiagnostic {
	origin: string | null;
	isValid: boolean;
}

function originFromUrl(value: string | URL): string | null {
	try {
		return value instanceof URL ? value.origin : new URL(value).origin;
	} catch {
		return null;
	}
}

function normalizeOrigin(value: string | null | undefined): OriginDiagnostic {
	if (!value) return { origin: null, isValid: false };

	try {
		const parsed = new URL(value);
		const isHttpOrigin =
			(parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
			!parsed.username &&
			!parsed.password;
		return {
			origin: isHttpOrigin ? parsed.origin : null,
			isValid: isHttpOrigin
		};
	} catch {
		return { origin: null, isValid: false };
	}
}

function originsEqual(a: string | null, b: string | null): boolean | null {
	if (!a || !b) return null;
	return a.toLowerCase() === b.toLowerCase();
}

function stripIpv6Zone(address: string): string {
	const zoneIndex = address.indexOf('%');
	return zoneIndex === -1 ? address : address.slice(0, zoneIndex);
}

function normalizeSourceAddress(address: string): string | null {
	const trimmed = address.trim();
	if (!trimmed) return null;

	const withoutBrackets =
		trimmed.startsWith('[') && trimmed.includes(']')
			? trimmed.slice(1, trimmed.indexOf(']'))
			: trimmed;

	const addressWithoutZone = stripIpv6Zone(withoutBrackets.toLowerCase());
	if (isIP(addressWithoutZone)) return addressWithoutZone;

	const maybeIpv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
	if (maybeIpv4WithPort?.[1] && isIP(maybeIpv4WithPort[1])) return maybeIpv4WithPort[1];

	return null;
}

function ipv4Octets(address: string): [number, number, number, number] | null {
	const parts = address.split('.');
	if (parts.length !== 4) return null;
	const octets = parts.map((part) => Number(part)) as [number, number, number, number];
	if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
		return null;
	}
	return octets;
}

export function classifySourceAddress(address: string | null | undefined): SourceAddressCategory {
	const normalized = normalizeSourceAddress(address ?? '');
	if (!normalized) return 'unknown';

	if (normalized.startsWith('::ffff:')) {
		return classifySourceAddress(normalized.slice('::ffff:'.length));
	}

	const ipv4 = ipv4Octets(normalized);
	if (ipv4) {
		const [a, b] = ipv4;
		if (a === 127) return 'loopback';
		if (a === 172 && b >= 16 && b <= 31) return 'docker/private-range';
		if (a === 10 || (a === 192 && b === 168)) return 'private-lan';
		if (a === 169 && b === 254) return 'link-local';
		if (a === 100 && b >= 64 && b <= 127) return 'tailscale/cgnat';
		return 'public';
	}

	if (normalized === '::1') return 'loopback';
	if (normalized.startsWith('fc') || normalized.startsWith('fd')) return 'private-lan';
	if (/^fe[89ab]/.test(normalized)) return 'link-local';
	return 'public';
}

// The effective origin is what event.url carries: ORIGIN when scripts/serve.ts fronts the
// app, otherwise the adapter's (the operator's PROTOCOL_HEADER/HOST_HEADER, else https and
// the Host header). Forwarded headers never change it on their own, so the one repair this
// diagnostic recommends for a mismatch is ORIGIN.
function recommendationFor(input: {
	frontedWithOrigin: boolean;
	browserOrigin: OriginDiagnostic;
	effectiveAppOrigin: string | null;
}): Pick<ReverseProxyDiagnostic, 'action' | 'reasonCodes'> {
	if (!input.browserOrigin.isValid) {
		return { action: 'unable-to-determine', reasonCodes: ['browser-origin-invalid'] };
	}

	const matches = originsEqual(input.browserOrigin.origin, input.effectiveAppOrigin) === true;

	if (input.frontedWithOrigin) {
		return matches
			? { action: 'origin-matches', reasonCodes: ['origin-env-configured'] }
			: { action: 'unable-to-determine', reasonCodes: ['origin-env-mismatch'] };
	}

	return matches
		? { action: 'origin-matches', reasonCodes: ['request-origin-matches-browser'] }
		: { action: 'set-origin', reasonCodes: ['request-origin-differs-from-browser'] };
}

export function buildReverseProxyDiagnostic(
	input: ReverseProxyDiagnosticBuildInput
): ReverseProxyDiagnostic {
	const forwardedPair = parseForwardedProtoHost(input.request.headers);
	const effectiveAppOrigin = originFromUrl(input.effectiveAppUrl);
	const browserOrigin = normalizeOrigin(input.browserOrigin);
	const configuredPublicOrigin = normalizeOrigin(input.csrfOrigin.value || null);
	const { action, reasonCodes } = recommendationFor({
		frontedWithOrigin: input.fronted === true,
		browserOrigin,
		effectiveAppOrigin
	});

	return {
		facts: {
			browserOrigin: {
				isValid: browserOrigin.isValid,
				origin: browserOrigin.origin
			},
			configuredPublicOrigin: {
				isValid: configuredPublicOrigin.isValid,
				source: input.csrfOrigin.source,
				isConfigured: Boolean(input.csrfOrigin.value),
				isLocked: input.csrfOrigin.isLocked
			},
			origins: {
				effectiveApp: effectiveAppOrigin,
				forwardedPair: forwardedPair.url?.origin ?? null
			},
			forwardedHeaders: {
				present: getForwardedHeaderNamesPresent(input.request.headers),
				pair: {
					status: forwardedPair.status,
					isUsable: forwardedPair.isUsable,
					protoPresent: forwardedPair.protoPresent,
					hostPresent: forwardedPair.hostPresent
				}
			},
			sourceAddress: {
				category: classifySourceAddress(input.sourceAddress)
			},
			originComparison: {
				browserMatchesEffectiveApp: originsEqual(browserOrigin.origin, effectiveAppOrigin),
				forwardedPairMatchesBrowser: originsEqual(
					browserOrigin.origin,
					forwardedPair.url?.origin ?? null
				)
			}
		},
		action,
		reasonCodes
	};
}

export async function createReverseProxyDiagnostic(
	input: ReverseProxyDiagnosticInput
): Promise<ReverseProxyDiagnostic> {
	const csrfOrigin = await getCsrfConfigWithSource();

	return buildReverseProxyDiagnostic({
		...input,
		csrfOrigin: csrfOrigin.origin,
		fronted: Boolean(env.OBZORARR_FRONT_ORIGIN)
	});
}
