import { describe, expect, it } from 'bun:test';
import {
	diagramForReverseProxyDiagnostic,
	documentationForDiagnostic,
	documentationForGuide,
	presentReverseProxyDiagnostic,
	REVERSE_PROXY_DOCUMENTATION,
	REVERSE_PROXY_PROVIDER_GUIDES
} from '$lib/copy/reverse-proxy';
import type {
	ForwardedProtoHostStatus,
	ReverseProxyDiagnostic,
	ReverseProxyRecommendationAction
} from '$lib/security/reverse-proxy';

function diagnostic(
	action: ReverseProxyRecommendationAction,
	status: ForwardedProtoHostStatus = 'usable',
	reasonCodes: ReverseProxyDiagnostic['reasonCodes'] = []
): ReverseProxyDiagnostic {
	const protoPresent = status !== 'missing';
	const hostPresent = status !== 'missing' && status !== 'partial';
	const matches = action === 'origin-matches';
	return {
		facts: {
			browserOrigin: { isValid: true, origin: 'https://wrapped.example.com' },
			configuredPublicOrigin: {
				isConfigured: true,
				isValid: true,
				source: 'db',
				isLocked: false
			},
			origins: {
				effectiveApp: matches ? 'https://wrapped.example.com' : 'https://obzorarr:3000',
				forwardedPair: 'https://wrapped.example.com'
			},
			forwardedHeaders: {
				present:
					status === 'missing'
						? []
						: status === 'partial'
							? ['X-Forwarded-Proto']
							: ['X-Forwarded-Host', 'X-Forwarded-Proto'],
				pair: {
					status,
					isUsable: status === 'usable',
					protoPresent,
					hostPresent
				}
			},
			sourceAddress: { category: 'docker/private-range' },
			originComparison: {
				browserMatchesEffectiveApp: matches,
				forwardedPairMatchesBrowser: true
			}
		},
		action,
		reasonCodes
	};
}

const ACTIONS: ReverseProxyRecommendationAction[] = [
	'origin-matches',
	'set-origin',
	'unable-to-determine'
];

describe('reverse proxy presenter', () => {
	it.each(ACTIONS)('presents %s with a diagnosis and persistent action', (action) => {
		const view = presentReverseProxyDiagnostic(diagnostic(action));
		expect(view.headline.length).toBeGreaterThan(0);
		expect(view.diagnosis.length).toBeGreaterThan(0);
		expect(view.nextAction.length).toBeGreaterThan(0);
		expect(view.consequence.length).toBeGreaterThan(0);
		expect(view.safetyNotice).toContain('ORIGIN needs no forwarding headers');
		expect(view.safetyNotice).toContain('PROTOCOL_HEADER=x-forwarded-proto');
	});

	it.each(ACTIONS)('never offers the retired TRUST_PROXY setting (%s)', (action) => {
		for (const status of [
			'usable',
			'missing',
			'partial',
			'invalid-proto',
			'unsafe-host',
			'invalid-host'
		] as const) {
			const view = presentReverseProxyDiagnostic(diagnostic(action, status));
			expect(JSON.stringify(view)).not.toMatch(/TRUST_PROXY|header trust/i);
		}
	});

	it('tells a mismatched deployment to set ORIGIN to the browser origin and restart', () => {
		const view = presentReverseProxyDiagnostic(
			diagnostic('set-origin', 'usable', ['request-origin-differs-from-browser'])
		);
		expect(view.tone).toBe('warning');
		expect(view.diagnosis).toBe(
			'Obzorarr sees https://obzorarr:3000, but this page was opened at https://wrapped.example.com.'
		);
		expect(view.nextAction).toContain('Set ORIGIN=https://wrapped.example.com');
		expect(view.nextAction).toContain('restart Obzorarr');
	});

	it('needs no change when the origin already matches, fronted or not', () => {
		const direct = presentReverseProxyDiagnostic(
			diagnostic('origin-matches', 'missing', ['request-origin-matches-browser'])
		);
		expect(direct.tone).toBe('success');
		expect(direct.nextAction).toContain('No change is needed');
		expect(direct.documentationIds).toEqual(['obzorarr-origin']);
		const fronted = presentReverseProxyDiagnostic(
			diagnostic('origin-matches', 'usable', ['origin-env-configured'])
		);
		expect(fronted.diagnosis).toContain('ORIGIN is https://wrapped.example.com');
	});

	it('asks to open the configured ORIGIN when the browser is elsewhere', () => {
		const view = presentReverseProxyDiagnostic(
			diagnostic('unable-to-determine', 'usable', ['origin-env-mismatch'])
		);
		expect(view.diagnosis).toContain('ORIGIN is https://obzorarr:3000');
		expect(view.nextAction).toContain('set ORIGIN to it and restart Obzorarr');
	});

	it('selects the matching diagram for every diagnostic result state', () => {
		const states = {
			'browser-address-unavailable': diagnostic('unable-to-determine'),
			'origin-matches': diagnostic('origin-matches'),
			'set-origin': diagnostic('set-origin')
		} as const;

		for (const expected of Object.keys(states) as Array<keyof typeof states>) {
			expect(diagramForReverseProxyDiagnostic(states[expected])).toBe(expected);
		}
	});

	it('offers the per-proxy forwarding-header guides only with the ORIGIN repair', () => {
		expect(presentReverseProxyDiagnostic(diagnostic('set-origin')).documentationIds.length).toBe(
			REVERSE_PROXY_DOCUMENTATION.length
		);
		expect(presentReverseProxyDiagnostic(diagnostic('origin-matches')).documentationIds).toEqual([
			'obzorarr-origin'
		]);
		expect(
			presentReverseProxyDiagnostic(diagnostic('unable-to-determine')).documentationIds
		).toEqual(['obzorarr-origin']);
		for (const guide of REVERSE_PROXY_PROVIDER_GUIDES) {
			expect(guide.steps.join(' ')).not.toContain('TRUST_PROXY');
		}
	});

	it('keeps documentation official, purpose-scoped, and provider-complete', () => {
		for (const link of REVERSE_PROXY_DOCUMENTATION) {
			expect(new URL(link.url).protocol).toBe('https:');
			expect(link.applicabilityLabel.length).toBeGreaterThan(0);
		}
		expect(REVERSE_PROXY_PROVIDER_GUIDES.map((guide) => guide.id)).toEqual([
			'nginx',
			'nginx-proxy-manager',
			'caddy',
			'apache',
			'other'
		]);
		expect(
			REVERSE_PROXY_PROVIDER_GUIDES.filter((guide) =>
				['nginx', 'caddy', 'apache'].includes(guide.id)
			).every((guide) => guide.config)
		).toBe(true);
		expect(
			REVERSE_PROXY_PROVIDER_GUIDES.every(
				(guide) => documentationForGuide(guide).id === guide.documentationId
			)
		).toBe(true);
	});

	it('uses provider-derived values without redundant or hardcoded forwarding headers', () => {
		const guide = (id: (typeof REVERSE_PROXY_PROVIDER_GUIDES)[number]['id']) =>
			REVERSE_PROXY_PROVIDER_GUIDES.find((candidate) => candidate.id === id);

		const caddy = guide('caddy');
		expect(caddy?.config).toBe('obzorarr.example.com {\n\treverse_proxy obzorarr:3000\n}');
		expect(caddy?.config).not.toContain('header_up');
		const npm = guide('nginx-proxy-manager');
		expect(npm?.config).toBeUndefined();
		expect(npm?.steps.join(' ')).toContain('not runtime-verified');

		const nginx = guide('nginx');
		expect(nginx?.config).toContain('X-Forwarded-Proto $scheme');
		expect(nginx?.config).toContain('X-Forwarded-Host $server_name:$server_port');
		expect(nginx?.config).not.toContain('X-Forwarded-Proto https');
		expect(nginx?.config).not.toContain('$http_host');

		expect(guide('apache')?.config).toContain('expr=%{REQUEST_SCHEME}');
		expect(guide('apache')?.config).toContain('expr=%{SERVER_NAME}:%{SERVER_PORT}');
		expect(guide('apache')?.steps.join(' ')).toContain('rejects unmatched Host values');
		expect(guide('apache')?.config).not.toContain('%{HTTP_HOST}');
	});

	it('uses only host/protocol and Obzorarr configuration guidance', () => {
		const links = documentationForDiagnostic(diagnostic('set-origin'));
		expect(links.length).toBeGreaterThan(0);
		expect(
			links.every((link) =>
				['forwarded-host-proto', 'header-replacement-boundary', 'obzorarr-configuration'].includes(
					link.purpose
				)
			)
		).toBe(true);
	});
});
