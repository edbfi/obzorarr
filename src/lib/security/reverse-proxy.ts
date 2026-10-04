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
	| 'origin-matches'
	| 'set-origin'
	| 'unable-to-determine';

export type ReverseProxyDiagnosticReasonCode =
	| 'browser-origin-invalid'
	| 'request-origin-matches-browser'
	| 'request-origin-differs-from-browser'
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
	| 'obzorarr-origin';

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
		browserMatchesEffectiveApp: boolean | null;
		forwardedPairMatchesBrowser: boolean | null;
	};
}

export interface ReverseProxyDiagnostic {
	facts: ReverseProxyDiagnosticFacts;
	action: ReverseProxyRecommendationAction;
	reasonCodes: ReverseProxyDiagnosticReasonCode[];
}
