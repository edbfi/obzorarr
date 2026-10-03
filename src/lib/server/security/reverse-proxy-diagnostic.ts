import { isIP } from 'node:net';
import type {
	ReverseProxyDiagnostic,
	ReverseProxyDiagnosticReasonCode,
	SourceAddressCategory
} from '$lib/security/reverse-proxy';
import {
	type ConfigValue,
	getCsrfConfigWithSource,
	getTrustProxyConfigWithSource
} from '$lib/server/admin/settings.service';
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
	trustProxy: ConfigValue<string>;
	csrfOrigin: ConfigValue<string>;
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

function reasonForReview(
	forwardedPair: ReturnType<typeof parseForwardedProtoHost>
): ReverseProxyDiagnosticReasonCode {
	if (forwardedPair.status === 'missing') return 'forwarded-pair-missing';
	if (forwardedPair.status === 'partial') return 'forwarded-pair-partial';
	if (!forwardedPair.isUsable) return 'forwarded-pair-invalid';
	return 'forwarded-pair-ambiguous';
}

function recommendationFor(input: {
	originEnvConfigured: boolean;
	trustEnabled: boolean;
	trustSource: ReverseProxyDiagnostic['facts']['trustProxy']['source'];
	browserOrigin: OriginDiagnostic;
	requestOrigin: string | null;
	effectiveAppOrigin: string | null;
	forwardedPair: ReturnType<typeof parseForwardedProtoHost>;
}): Pick<ReverseProxyDiagnostic, 'action' | 'reasonCodes'> {
	const browserMatchesRequestUrl = originsEqual(input.browserOrigin.origin, input.requestOrigin);
	const browserMatchesEffectiveApp = originsEqual(
		input.browserOrigin.origin,
		input.effectiveAppOrigin
	);
	const forwardedPairMatchesBrowser = originsEqual(
		input.browserOrigin.origin,
		input.forwardedPair.url?.origin ?? null
	);

	// With ORIGIN set in the environment, the effective origin is ORIGIN whatever
	// TRUST_PROXY says (forwarded headers never override it), so proxy trust is moot.
	if (input.originEnvConfigured) {
		if (!input.browserOrigin.isValid) {
			return { action: 'unable-to-determine', reasonCodes: ['browser-origin-invalid'] };
		}
		return browserMatchesEffectiveApp === true
			? { action: 'leave-disabled', reasonCodes: ['origin-env-configured'] }
			: { action: 'unable-to-determine', reasonCodes: ['origin-env-mismatch'] };
	}

	if (input.trustSource === 'env') {
		return {
			action: 'env-controlled',
			reasonCodes: [
				input.trustEnabled ? 'trust-proxy-env-locked-enabled' : 'trust-proxy-env-locked-disabled'
			]
		};
	}

	if (!input.browserOrigin.isValid) {
		return { action: 'unable-to-determine', reasonCodes: ['browser-origin-invalid'] };
	}

	if (!input.trustEnabled) {
		if (
			browserMatchesRequestUrl === false &&
			input.forwardedPair.isUsable &&
			forwardedPairMatchesBrowser === true
		) {
			return {
				action: 'confirm-trust-boundary',
				reasonCodes: ['forwarded-pair-matches-browser']
			};
		}

		if (browserMatchesRequestUrl === true) {
			return {
				action: 'leave-disabled',
				reasonCodes: [
					input.forwardedPair.status === 'missing'
						? 'request-origin-matches-without-forwarded-pair'
						: 'request-origin-already-matches-browser'
				]
			};
		}

		return {
			action: 'review-proxy',
			reasonCodes: [reasonForReview(input.forwardedPair)]
		};
	}

	if (input.forwardedPair.isUsable && browserMatchesEffectiveApp === true) {
		return { action: 'appears-working', reasonCodes: ['trust-proxy-working'] };
	}

	return { action: 'review-proxy', reasonCodes: ['trust-proxy-enabled-broken'] };
}

export function buildReverseProxyDiagnostic(
	input: ReverseProxyDiagnosticBuildInput
): ReverseProxyDiagnostic {
	const forwardedPair = parseForwardedProtoHost(input.request.headers);
	const requestOrigin = originFromUrl(input.request.url);
	const effectiveAppOrigin = originFromUrl(input.effectiveAppUrl);
	const browserOrigin = normalizeOrigin(input.browserOrigin);
	const configuredPublicOrigin = normalizeOrigin(input.csrfOrigin.value || null);
	const trustEnabled = input.trustProxy.value === 'true';
	const { action, reasonCodes } = recommendationFor({
		originEnvConfigured: input.csrfOrigin.source === 'env' && Boolean(input.csrfOrigin.value),
		trustEnabled,
		trustSource: input.trustProxy.source,
		browserOrigin,
		requestOrigin,
		effectiveAppOrigin,
		forwardedPair
	});

	return {
		facts: {
			trustProxy: {
				enabled: trustEnabled,
				source: input.trustProxy.source,
				isLocked: input.trustProxy.isLocked
			},
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
				browserMatchesRequestUrl: originsEqual(browserOrigin.origin, requestOrigin),
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
	const [trustProxy, csrfOrigin] = await Promise.all([
		getTrustProxyConfigWithSource(),
		getCsrfConfigWithSource()
	]);

	return buildReverseProxyDiagnostic({
		...input,
		trustProxy: trustProxy.trustProxy,
		csrfOrigin: csrfOrigin.origin
	});
}

export const ENABLE_TRUST_PROXY_NOT_RECOMMENDED_MESSAGE =
	'The current diagnostic does not recommend enabling reverse proxy header trust.';

export type EnableTrustProxyDecision = { ok: true } | { ok: false; error: string };

/**
 * Gate the "enable TRUST_PROXY" write on the live diagnostic recommendation.
 * Both the admin Security page and the onboarding proxy-trust step run the
 * diagnostic immediately before flipping the setting; this helper is the
 * single source of truth for the rejection message.
 */
export function assertEnableTrustProxyAllowed(
	diagnostic: ReverseProxyDiagnostic
): EnableTrustProxyDecision {
	if (diagnostic.action === 'confirm-trust-boundary') {
		return { ok: true };
	}
	return { ok: false, error: ENABLE_TRUST_PROXY_NOT_RECOMMENDED_MESSAGE };
}
