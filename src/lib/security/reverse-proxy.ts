export type ReverseProxyConfigSource = 'env' | 'db' | 'default';

export type ForwardedHeaderName =
	| 'Forwarded'
	| 'X-Forwarded-For'
	| 'X-Forwarded-Host'
	| 'X-Forwarded-Proto'
	| 'X-Real-IP';

export type ForwardedProtoHostStatus =
	| 'usable'
	| 'missing'
	| 'partial'
	| 'invalid-proto'
	| 'unsafe-host'
	| 'invalid-host';

export interface ReverseProxyForwardedPairFact {
	status: ForwardedProtoHostStatus;
	isUsable: boolean;
	protoPresent: boolean;
	hostPresent: boolean;
}

export interface ReverseProxyConfigFact {
	enabled: boolean;
	source: ReverseProxyConfigSource;
	isLocked: boolean;
}

export interface ReverseProxyConfiguredOriginFact {
	isConfigured: boolean;
	isValid: boolean;
	source: ReverseProxyConfigSource;
	isLocked: boolean;
}

export type SourceAddressCategory =
	| 'loopback'
	| 'private-lan'
	| 'docker/private-range'
	| 'tailscale/cgnat'
	| 'link-local'
	| 'public'
	| 'unknown';

export type ReverseProxyRecommendationAction =
	| 'confirm-trust-boundary'
	| 'leave-disabled'
	| 'review-proxy'
	| 'appears-working'
	| 'unable-to-determine'
	| 'env-controlled';

export type ReverseProxyDiagnosticReasonCode =
	| 'trust-proxy-env-locked-enabled'
	| 'trust-proxy-env-locked-disabled'
	| 'browser-origin-invalid'
	| 'forwarded-pair-matches-browser'
	| 'request-origin-matches-without-forwarded-pair'
	| 'request-origin-already-matches-browser'
	| 'forwarded-pair-missing'
	| 'forwarded-pair-partial'
	| 'forwarded-pair-invalid'
	| 'forwarded-pair-ambiguous'
	| 'trust-proxy-working'
	| 'trust-proxy-enabled-broken'
	| 'origin-env-configured'
	| 'origin-env-mismatch';

export type ReverseProxyDocumentationPurpose =
	| 'forwarded-host-proto'
	| 'header-replacement-boundary'
	| 'obzorarr-configuration';

export type ReverseProxyDocumentationId =
	| 'nginx-proxy-set-header'
	| 'nginx-proxy-manager-custom-config'
	| 'caddy-reverse-proxy'
	| 'apache-request-header'
	| 'obzorarr-trust-proxy';

export type ReverseProxyProviderId = 'nginx' | 'nginx-proxy-manager' | 'caddy' | 'apache' | 'other';

export interface ReverseProxyDocumentationLink {
	id: ReverseProxyDocumentationId;
	provider: string;
	url: string;
	purpose: ReverseProxyDocumentationPurpose;
	applicabilityLabel: string;
}

export type ReverseProxyPresentationTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface ReverseProxyPresentation {
	tone: ReverseProxyPresentationTone;
	headline: string;
	diagnosis: string;
	nextAction: string;
	consequence: string;
	pairLabel: string;
	safetyNotice: string;
	documentationIds: ReverseProxyDocumentationId[];
}
export interface ReverseProxyDiagnosticFacts {
	trustProxy: ReverseProxyConfigFact;
	browserOrigin: {
		isValid: boolean;
		origin: string | null;
	};
	configuredPublicOrigin: ReverseProxyConfiguredOriginFact;
	origins: {
		effectiveApp: string | null;
		forwardedPair: string | null;
	};
	forwardedHeaders: {
		present: ForwardedHeaderName[];
		pair: ReverseProxyForwardedPairFact;
	};
	sourceAddress: {
		category: SourceAddressCategory;
	};
	originComparison: {
		browserMatchesRequestUrl: boolean | null;
		browserMatchesEffectiveApp: boolean | null;
		forwardedPairMatchesBrowser: boolean | null;
	};
}

export interface ReverseProxyDiagnostic {
	facts: ReverseProxyDiagnosticFacts;
	action: ReverseProxyRecommendationAction;
	reasonCodes: ReverseProxyDiagnosticReasonCode[];
}
