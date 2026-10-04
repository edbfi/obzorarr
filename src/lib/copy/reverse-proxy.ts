import type {
	ForwardedProtoHostStatus,
	ReverseProxyDiagnostic,
	ReverseProxyDocumentationLink,
	ReverseProxyPresentation,
	ReverseProxyProviderId
} from '$lib/security/reverse-proxy';

export const REVERSE_PROXY_COPY = {
	panelTitle: 'Public address',
	panelSubtitle: 'Check that Obzorarr sees the address your browser opened',
	rerunButton: 'Re-run diagnostic',
	rerunButtonInProgress: 'Re-checking…',
	diagnosticFailedHeadline: 'Diagnostic could not finish',
	diagnosticFailedExplanation:
		'The check itself failed. This does not show that the public address is configured incorrectly.',
	detailsButton: 'Technical evidence and proxy guides',
	providerGuidesHeading: 'Without ORIGIN: forwarding headers by proxy',
	continueWarning:
		'Continuing keeps the detected host/protocol problem. Public links, Plex callbacks, or CSRF origin checks may use the wrong origin.'
} as const;

export type ReverseProxyDiagramId = 'browser-address-unavailable' | 'origin-matches' | 'set-origin';

const SAFETY_NOTICE =
	'ORIGIN needs no forwarding headers. Set PROTOCOL_HEADER=x-forwarded-proto and HOST_HEADER=x-forwarded-host only without ORIGIN, when every request reaches Obzorarr through a proxy that overwrites both headers; a directly reachable Obzorarr must never read them.';

const PROXY_REPAIR_DOCUMENTATION_IDS = [
	'nginx-proxy-set-header',
	'nginx-proxy-manager-custom-config',
	'caddy-reverse-proxy',
	'apache-request-header',
	'obzorarr-origin'
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

export function presentReverseProxyDiagnostic(
	diagnostic: ReverseProxyDiagnostic
): ReverseProxyPresentation {
	const pairLabel = PAIR_LABELS[diagnostic.facts.forwardedHeaders.pair.status];
	const browserOrigin = displayOrigin(diagnostic.facts.browserOrigin.origin);
	const effectiveOrigin = displayOrigin(diagnostic.facts.origins.effectiveApp);
	const fronted =
		diagnostic.reasonCodes.includes('origin-env-configured') ||
		diagnostic.reasonCodes.includes('origin-env-mismatch');

	switch (diagnostic.action) {
		case 'origin-matches':
			return {
				tone: 'success',
				headline: 'Obzorarr already sees the browser origin',
				diagnosis: fronted
					? `ORIGIN is ${effectiveOrigin}, the address this page was opened at.`
					: `The origin Obzorarr sees, ${effectiveOrigin}, matches the address this page was opened at.`,
				nextAction: 'No change is needed while people open Obzorarr at this address.',
				consequence: 'No host or protocol repair is needed for this request.',
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-origin']
			};
		case 'set-origin':
			return {
				tone: 'warning',
				headline: 'Obzorarr sees a different origin than your browser',
				diagnosis: `Obzorarr sees ${effectiveOrigin}, but this page was opened at ${browserOrigin}.`,
				nextAction: `Set ORIGIN=${browserOrigin} in the environment or container configuration, restart Obzorarr, then rerun.`,
				consequence: REVERSE_PROXY_COPY.continueWarning,
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: [...PROXY_REPAIR_DOCUMENTATION_IDS]
			};
		case 'unable-to-determine':
			return {
				tone: 'warning',
				headline: 'Open Obzorarr at its intended public address',
				diagnosis: fronted
					? `ORIGIN is ${effectiveOrigin}, but this page was opened at ${browserOrigin}.`
					: 'The address this page was opened at could not be read as an http:// or https:// origin.',
				nextAction:
					'Load this page from the address people open in the browser and rerun. If that address is not ORIGIN, set ORIGIN to it and restart Obzorarr.',
				consequence: REVERSE_PROXY_COPY.continueWarning,
				pairLabel,
				safetyNotice: SAFETY_NOTICE,
				documentationIds: ['obzorarr-origin']
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
	switch (diagnostic.action) {
		case 'unable-to-determine':
			return 'browser-address-unavailable';
		case 'origin-matches':
			return 'origin-matches';
		case 'set-origin':
			return 'set-origin';
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
		id: 'obzorarr-origin',
		provider: 'Obzorarr',
		url: 'https://github.com/edbfi/obzorarr#running-behind-a-reverse-proxy',
		purpose: 'obzorarr-configuration',
		applicabilityLabel: 'Obzorarr ORIGIN and reverse-proxy guidance'
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
			'Obzorarr does not provide a PROTOCOL_HEADER/HOST_HEADER recipe for NPM because the generated directive placement was not runtime-verified. Set ORIGIN instead; otherwise verify that the generated Nginx configuration replaces both headers before setting PROTOCOL_HEADER and HOST_HEADER.'
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
			'Reload the proxy, set PROTOCOL_HEADER=x-forwarded-proto and HOST_HEADER=x-forwarded-host for Obzorarr, restart it, then rerun.'
		],
		documentationId: 'obzorarr-origin'
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
