import type { ForwardedHeaderName, ForwardedProtoHostStatus } from '$lib/security/reverse-proxy';

type ForwardedProto = 'http' | 'https';

export interface ForwardedProtoHostResult {
	status: ForwardedProtoHostStatus;
	isUsable: boolean;
	protoPresent: boolean;
	hostPresent: boolean;
	url: URL | null;
}

type HeaderReader = Pick<Headers, 'get'>;

const FORWARDED_HEADER_LOOKUP: Array<[ForwardedHeaderName, string]> = [
	['Forwarded', 'forwarded'],
	['X-Forwarded-For', 'x-forwarded-for'],
	['X-Forwarded-Host', 'x-forwarded-host'],
	['X-Forwarded-Proto', 'x-forwarded-proto'],
	['X-Real-IP', 'x-real-ip']
];

// Trust only the last hop: a correctly configured reverse proxy strips any
// client-supplied forwarded values before appending its own.
function lastHopValue(headerValue: string | null): string | null {
	if (!headerValue) return null;
	const parts = headerValue.split(',');
	const last = parts[parts.length - 1]?.trim();
	return last && last.length > 0 ? last : null;
}

function isValidForwardedProto(value: string): value is ForwardedProto {
	return value === 'http' || value === 'https';
}

// Reject CR/LF (response-splitting / header-injection defense), whitespace,
// and URL delimiter characters that would confuse new URL() into parsing a
// different host than intended. Specifically:
//   @  - userinfo delimiter: "trusted@evil.com" -> hostname is evil.com
//   /  - path delimiter: "evil.com/path" passes through to pathname
//   \  - backslash path delimiter: "evil.com\path" passes through to pathname
//   ?  - query delimiter: "evil.com?x=1" passes through to search
//   #  - fragment delimiter: "evil.com#foo" passes through to hash
// IPv6 literals like "[::1]:8443" are NOT rejected because they contain no
// delimiter characters from the banned set.
function isSafeForwardedHost(value: string): boolean {
	return value.length > 0 && !/[\r\n\s@/\\?#]/.test(value);
}

export function getForwardedHeaderNamesPresent(headers: HeaderReader): ForwardedHeaderName[] {
	return FORWARDED_HEADER_LOOKUP.flatMap(([name, header]) =>
		headers.get(header) === null ? [] : [name]
	);
}

export function parseForwardedProtoHost(headers: HeaderReader): ForwardedProtoHostResult {
	const protoCandidate = lastHopValue(headers.get('x-forwarded-proto'));
	const hostCandidate = lastHopValue(headers.get('x-forwarded-host'));
	const protoPresent = protoCandidate !== null;
	const hostPresent = hostCandidate !== null;

	if (!protoPresent && !hostPresent) {
		return { status: 'missing', isUsable: false, protoPresent, hostPresent, url: null };
	}

	if (!protoPresent || !hostPresent) {
		return { status: 'partial', isUsable: false, protoPresent, hostPresent, url: null };
	}

	const safeProto = isValidForwardedProto(protoCandidate.toLowerCase())
		? protoCandidate.toLowerCase()
		: null;
	if (!safeProto) {
		return { status: 'invalid-proto', isUsable: false, protoPresent, hostPresent, url: null };
	}

	if (!isSafeForwardedHost(hostCandidate)) {
		return { status: 'unsafe-host', isUsable: false, protoPresent, hostPresent, url: null };
	}

	try {
		const url = new URL(`${safeProto}://${hostCandidate}/`);
		return { status: 'usable', isUsable: true, protoPresent, hostPresent, url };
	} catch {
		return { status: 'invalid-host', isUsable: false, protoPresent, hostPresent, url: null };
	}
}
