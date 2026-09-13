import type {
	ForwardedProtoHostStatus,
	ReverseProxyDiagnostic,
	ReverseProxyDocumentationLink,
	ReverseProxyPresentation,
	ReverseProxyProviderId
} from '$lib/security/reverse-proxy';

export const REVERSE_PROXY_COPY = {
	panelTitle: 'Reverse-proxy header trust',
	panelSubtitle: 'Verify the public host and protocol Obzorarr receives from your proxy',
	rerunButton: 'Re-run diagnostic',
	rerunButtonInProgress: 'Re-checking…',
	diagnosticFailedHeadline: 'Diagnostic could not finish',
	diagnosticFailedExplanation:
		'The check itself failed. This does not show that the reverse proxy is configured incorrectly.',
	detailsButton: 'Technical evidence and repair guides',
	savedVerifying: 'Setting saved. Obzorarr is checking the new result…',
	savedUnverified:
		'The setting was saved, but Obzorarr could not verify the result. Re-run the diagnostic before relying on public URLs.',
	continueWarning:
		'Continuing keeps the detected host/protocol problem. Public links, Plex callbacks, or CSRF origin checks may use the wrong origin.'
} as const;

export type ReverseProxyDiagramId =
	| 'browser-address-unavailable'
	| 'correct-without-trust'
	| 'environment-disabled-broken'
	| 'environment-disabled-correct'
	| 'environment-disabled-needed'
	| 'environment-enabled-broken'
	| 'environment-enabled-working'
	| 'forwarded-address-conflict'
	| 'forwarded-match-boundary-unverified'
	| 'headers-missing'
	| 'host-invalid'
	| 'host-missing'
	| 'host-unsafe'
	| 'protocol-invalid'
	| 'protocol-missing'
	| 'trust-enabled-broken'
	| 'trust-working';

const SAFETY_NOTICE =
	'Trust forwarding headers only when Obzorarr is reachable through a proxy that removes or overwrites visitor-supplied X-Forwarded-Proto and X-Forwarded-Host values. Never enable TRUST_PROXY for a directly exposed app.';

const PROXY_REPAIR_DOCUMENTATION_IDS = [
	'nginx-proxy-set-header',
	'nginx-proxy-manager-custom-config',
	'caddy-reverse-proxy',
	'apache-request-header',
	'obzorarr-trust-proxy'
] as const;

const PAIR_LABELS: Record<ForwardedProtoHostStatus, string> = {
	usable: 'Both headers are present and valid',
	missing: 'Both headers are missing',
	partial: 'Only one required header is present',
	'invalid-proto': 'X-Forwarded-Proto is invalid',
	'unsafe-host': 'X-Forwarded-Host contains an unsafe value',
	'invalid-host': 'X-Forwarded-Host is invalid'
};

function displayOrigin(origin: string | null): string {
	return origin ?? 'not available';
}

function observedEvidence(diagnostic: ReverseProxyDiagnostic): string {
	const pair = diagnostic.facts.forwardedHeaders.pair;
	const browserOrigin = displayOrigin(diagnostic.facts.browserOrigin.origin);
	const forwardedOrigin = displayOrigin(diagnostic.facts.origins.forwardedPair);

	switch (pair.status) {
		case 'missing':
			return 'Neither X-Forwarded-Proto nor X-Forwarded-Host arrived with this request.';
		case 'partial':
			return pair.protoPresent
				? 'X-Forwarded-Proto arrived, but X-Forwarded-Host is missing.'
				: 'X-Forwarded-Host arrived, but X-Forwarded-Proto is missing.';
		case 'invalid-proto':
			return 'X-Forwarded-Proto arrived with a value other than http or https.';
		case 'unsafe-host':
			return 'X-Forwarded-Host arrived with characters that are unsafe in a public origin.';
		case 'invalid-host':
			return 'X-Forwarded-Host arrived, but it is not a valid public host and optional port.';
		case 'usable':
			if (diagnostic.facts.originComparison.forwardedPairMatchesBrowser === false) {
				return `Both required headers arrived, but forwarded origin ${forwardedOrigin} does not match browser origin ${browserOrigin}.`;
			}
			if (diagnostic.facts.originComparison.browserMatchesRequestUrl === true) {
				return `Both required headers arrived, and the request origin Obzorarr received already matches browser origin ${browserOrigin}.`;
			}
			return `Both required headers arrived with forwarded origin ${forwardedOrigin}.`;
		default: {
			const exhaustive: never = pair.status;
			return exhaustive;
		}
	}
}

function reviewNextAction(diagnostic: ReverseProxyDiagnostic): string {
	const status = diagnostic.facts.forwardedHeaders.pair.status;
	switch (status) {
		case 'missing':
			return 'Configure the proxy to overwrite both X-Forwarded-Proto and X-Forwarded-Host, then rerun.';
		case 'partial':
			return 'Add the missing member of the X-Forwarded-Proto/X-Forwarded-Host pair, overwrite both values at the proxy, then rerun.';
		case 'invalid-proto':
			return 'Set X-Forwarded-Proto to exactly http or https at the proxy, then rerun.';
		case 'unsafe-host':
		case 'invalid-host':
			return 'Set X-Forwarded-Host to the public hostname (and port when non-standard), then rerun.';
		case 'usable':
			if (diagnostic.facts.originComparison.forwardedPairMatchesBrowser === false) {
				return 'The forwarded origin conflicts with the browser origin. Set both headers from the public request, then rerun.';
			}
			if (diagnostic.facts.originComparison.browserMatchesRequestUrl === true) {
				return 'Obzorarr already sees the browser origin, so in-app forwarding-header trust is not needed for this request.';
			}
			return 'The pair is valid, but Obzorarr could not confirm the trusted proxy boundary. Verify the last proxy overwrites both headers, then rerun.';
		default: {
			const exhaustive: never = status;
			return exhaustive;
		}
	}
}

export function presentReverseProxyDiagnostic(
	diagnostic: ReverseProxyDiagnostic
): ReverseProxyPresentation {
	const pairLabel = PAIR_LABELS[diagnostic.facts.forwardedHeaders.pair.status];
	const diagnosis = observedEvidence(diagnostic);

	switch (diagnostic.action) {
		case 'confirm-trust-boundary':
			return {
				tone: 'warning',
				headline: 'Forwarded origin is consistent; proxy boundary is unverified',
				diagnosis,
				nextAction:
					'Confirm that Obzorarr cannot be reached around the proxy and that the last proxy overwrites both forwarding headers, then enable TRUST_PROXY.',
				consequence:
					'Matching values show consistency, not that a trusted proxy supplied them. Until enabled, Obzorarr keeps using its adapter-constructed request origin.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
			};
		case 'leave-disabled':
			return {
				tone: 'success',
				headline: 'Obzorarr already sees the browser origin',
				diagnosis,
				nextAction:
					'Leave TRUST_PROXY disabled; forwarding-header trust is unnecessary while the request origin remains correct.',
				consequence: 'No host or protocol repair is needed for this request.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-trust-proxy']
			};
		case 'appears-working':
			return {
				tone: 'success',
				headline: 'Trusted proxy origin appears to be working',
				diagnosis,
				nextAction:
					'No setting change is needed. Confirm the proxy replacement boundary remains enforced, especially after proxy changes.',
				consequence: 'Obzorarr’s effective public host and protocol match the browser origin.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-trust-proxy']
			};
		case 'unable-to-determine':
			return {
				tone: 'warning',
				headline: 'Open Obzorarr at its intended public address',
				diagnosis,
				nextAction:
					'Load this page from the public http:// or https:// origin and rerun; forwarded headers alone are not trusted evidence.',
				consequence: REVERSE_PROXY_COPY.continueWarning,
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-trust-proxy']
			};
		case 'env-controlled': {
			const enabled = diagnostic.facts.trustProxy.enabled;
			const pair = diagnostic.facts.forwardedHeaders.pair;
			const effectiveMatches = diagnostic.facts.originComparison.browserMatchesEffectiveApp;
			const requestMatches = diagnostic.facts.originComparison.browserMatchesRequestUrl;
			const forwardedMatches = diagnostic.facts.originComparison.forwardedPairMatchesBrowser;

			if (enabled && pair.isUsable && effectiveMatches === true) {
				return {
					tone: 'success',
					headline: 'TRUST_PROXY is enabled by the environment and the origin matches',
					diagnosis,
					nextAction:
						'No environment change is needed. Keep the proxy replacement boundary enforced and rerun after proxy changes.',
					consequence:
						'Environment-managed TRUST_PROXY is working for this request; client-IP handling remains separate.',
					pairLabel,
					safetyNotice: SAFETY_NOTICE,
					documentationIds: ['obzorarr-trust-proxy']
				};
			}

			if (!enabled && requestMatches === true) {
				return {
					tone: 'success',
					headline: 'TRUST_PROXY is disabled by the environment and the request origin matches',
					diagnosis,
					nextAction:
						'Leave TRUST_PROXY=false. Change it only when Obzorarr needs forwarded host/protocol values and is isolated behind a proxy that overwrites both headers.',
					consequence:
						'The environment-managed setting already produces the correct origin for this request.',
					pairLabel,
					safetyNotice: SAFETY_NOTICE,
					documentationIds: ['obzorarr-trust-proxy']
				};
			}

			if (!enabled && pair.isUsable && forwardedMatches === true && requestMatches === false) {
				return {
					tone: 'warning',
					headline: 'TRUST_PROXY is disabled by the environment',
					diagnosis,
					nextAction:
						'After verifying the proxy replacement boundary, set TRUST_PROXY=true in the environment or container configuration, restart Obzorarr, and rerun.',
					consequence:
						'Obzorarr cannot use the matching forwarded public origin until the environment setting changes and the app restarts.',
					pairLabel,
					safetyNotice: SAFETY_NOTICE,
					documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
				};
			}

			return {
				tone: 'danger',
				headline: `TRUST_PROXY is ${enabled ? 'enabled' : 'disabled'} by the environment, but the proxy evidence needs repair`,
				diagnosis,
				nextAction: `${reviewNextAction(diagnostic)} Restart Obzorarr after changing TRUST_PROXY in the environment or container configuration.`,
				consequence: enabled
					? pair.isUsable
						? 'Obzorarr is trusting a host/protocol result that does not match or cannot be verified against the browser origin.'
						: effectiveMatches === false
							? 'Obzorarr rejected the unusable forwarding metadata, and the adapter fallback does not match the browser origin.'
							: 'Obzorarr rejected the unusable forwarding metadata; repair it before relying on proxy trust.'
					: 'Do not enable TRUST_PROXY until the forwarding pair and replacement boundary are correct.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
			};
		}
		case 'review-proxy':
			return {
				tone: 'danger',
				headline: 'Proxy headers need repair',
				diagnosis,
				nextAction: reviewNextAction(diagnostic),
				consequence: REVERSE_PROXY_COPY.continueWarning,
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
			};
		default: {
			const exhaustive: never = diagnostic.action;
			return exhaustive;
		}
	}
}

export function diagramForReverseProxyDiagnostic(
	diagnostic: ReverseProxyDiagnostic
): ReverseProxyDiagramId {
	const pair = diagnostic.facts.forwardedHeaders.pair;
	const comparison = diagnostic.facts.originComparison;

	switch (diagnostic.action) {
		case 'unable-to-determine':
			return 'browser-address-unavailable';
		case 'leave-disabled':
			return 'correct-without-trust';
		case 'confirm-trust-boundary':
			return 'forwarded-match-boundary-unverified';
		case 'appears-working':
			return 'trust-working';
		case 'env-controlled':
			if (
				diagnostic.facts.trustProxy.enabled &&
				pair.isUsable &&
				comparison.browserMatchesEffectiveApp === true
			) {
				return 'environment-enabled-working';
			}
			if (!diagnostic.facts.trustProxy.enabled && comparison.browserMatchesRequestUrl === true) {
				return 'environment-disabled-correct';
			}
			if (
				!diagnostic.facts.trustProxy.enabled &&
				pair.isUsable &&
				comparison.forwardedPairMatchesBrowser === true &&
				comparison.browserMatchesRequestUrl === false
			) {
				return 'environment-disabled-needed';
			}
			return diagnostic.facts.trustProxy.enabled
				? 'environment-enabled-broken'
				: 'environment-disabled-broken';
		case 'review-proxy':
			if (diagnostic.facts.trustProxy.enabled) return 'trust-enabled-broken';
			switch (pair.status) {
				case 'missing':
					return 'headers-missing';
				case 'partial':
					return pair.protoPresent ? 'host-missing' : 'protocol-missing';
				case 'invalid-proto':
					return 'protocol-invalid';
				case 'unsafe-host':
					return 'host-unsafe';
				case 'invalid-host':
					return 'host-invalid';
				case 'usable':
					return 'forwarded-address-conflict';
				default: {
					const exhaustive: never = pair.status;
					return exhaustive;
				}
			}
		default: {
			const exhaustive: never = diagnostic.action;
			return exhaustive;
		}
	}
}

export const REVERSE_PROXY_DOCUMENTATION: ReverseProxyDocumentationLink[] = [
	{
		id: 'nginx-proxy-set-header',
		provider: 'Nginx',
		url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header',
		purpose: 'forwarded-host-proto',
		applicabilityLabel: 'Official proxy_set_header reference'
	},
	{
		id: 'nginx-proxy-manager-custom-config',
		provider: 'Nginx Proxy Manager',
		url: 'https://github.com/NginxProxyManager/nginx-proxy-manager/blob/v2.14.0/docker/rootfs/etc/nginx/conf.d/include/proxy.conf',
		purpose: 'forwarded-host-proto',
		applicabilityLabel: 'Official v2.14.0 generated proxy header configuration'
	},
	{
		id: 'caddy-reverse-proxy',
		provider: 'Caddy',
		url: 'https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers',
		purpose: 'header-replacement-boundary',
		applicabilityLabel: 'Official reverse_proxy header behavior'
	},
	{
		id: 'apache-request-header',
		provider: 'Apache',
		url: 'https://httpd.apache.org/docs/2.4/mod/mod_headers.html#requestheader',
		purpose: 'header-replacement-boundary',
		applicabilityLabel: 'Official RequestHeader replacement reference'
	},
	{
		id: 'obzorarr-trust-proxy',
		provider: 'Obzorarr',
		url: 'https://github.com/edbfi/obzorarr#running-behind-a-reverse-proxy',
		purpose: 'obzorarr-configuration',
		applicabilityLabel: 'Obzorarr TRUST_PROXY and restart guidance'
	}
];

export interface ReverseProxyProviderGuide {
	id: ReverseProxyProviderId;
	label: string;
	steps: string[];
	config?: string;
	documentationId: ReverseProxyDocumentationLink['id'];
}

export const REVERSE_PROXY_PROVIDER_GUIDES: ReverseProxyProviderGuide[] = [
	{
		id: 'nginx',
		label: 'Nginx',
		steps: [
			'Use an exact server_name and reject unmatched hosts so the selected server name is an approved public hostname.',
			'These directives derive protocol, hostname, and listener port from the selected public server. If external port translation changes the public port, configure an allowlisted public authority instead.'
		],
		config:
			'proxy_set_header X-Forwarded-Proto $scheme;\nproxy_set_header X-Forwarded-Host $server_name:$server_port;',
		documentationId: 'nginx-proxy-set-header'
	},
	{
		id: 'nginx-proxy-manager',
		label: 'Nginx Proxy Manager',
		steps: [
			'Use a Proxy Host for the exact public hostname. Nginx Proxy Manager 2.14.0 sets X-Forwarded-Proto by default but can preserve an incoming valid value, and it does not set X-Forwarded-Host.',
			'Obzorarr does not provide a TRUST_PROXY recipe for NPM because the generated directive placement was not runtime-verified. Leave trust disabled when Obzorarr already sees the browser origin; otherwise verify that the generated Nginx configuration replaces both headers before enabling it.'
		],
		documentationId: 'nginx-proxy-manager-custom-config'
	},
	{
		id: 'caddy',
		label: 'Caddy',
		steps: [
			'Caddy sets X-Forwarded-Proto and X-Forwarded-Host and ignores incoming values for those managed headers by default. No header_up override is needed.',
			'If another proxy is in front of Caddy, configure Caddy trusted_proxies for only that known upstream chain. Reload Caddy, then rerun.'
		],
		config: 'obzorarr.example.com {\n\treverse_proxy obzorarr:3000\n}',
		documentationId: 'caddy-reverse-proxy'
	},
	{
		id: 'apache',
		label: 'Apache',
		steps: [
			'Use a name-based VirtualHost for the exact public host and a separate first/default VirtualHost that rejects unmatched Host values.',
			'Apache adds X-Forwarded-Host by default, but not X-Forwarded-Proto; these replacements derive both from the accepted VirtualHost and its listener. If external port translation changes the public port, configure an allowlisted public authority instead.'
		],
		config:
			'RequestHeader set X-Forwarded-Proto "expr=%{REQUEST_SCHEME}"\nRequestHeader set X-Forwarded-Host "expr=%{SERVER_NAME}:%{SERVER_PORT}"',
		documentationId: 'apache-request-header'
	},
	{
		id: 'other',
		label: 'Other proxy',
		steps: [
			'At the last trusted hop, remove any inbound X-Forwarded-Proto and X-Forwarded-Host values.',
			'Set X-Forwarded-Proto from the public request scheme and X-Forwarded-Host from its public host.',
			'Reload the proxy, restart Obzorarr only if TRUST_PROXY is environment-controlled, then rerun.'
		],
		documentationId: 'obzorarr-trust-proxy'
	}
];

export function documentationForDiagnostic(
	diagnostic: ReverseProxyDiagnostic
): ReverseProxyDocumentationLink[] {
	const ids = new Set(presentReverseProxyDiagnostic(diagnostic).documentationIds);
	return REVERSE_PROXY_DOCUMENTATION.filter((link) => ids.has(link.id));
}

export function documentationForGuide(
	guide: ReverseProxyProviderGuide
): ReverseProxyDocumentationLink {
	const link = REVERSE_PROXY_DOCUMENTATION.find(({ id }) => id === guide.documentationId);
	if (!link) throw new Error(`Missing reverse-proxy documentation: ${guide.documentationId}`);
	return link;
}
