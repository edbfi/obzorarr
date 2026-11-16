import { isIPv4, isIPv6 } from "node:net";

/** What the rate limits count a request under (SPEC-sign-in.md, "Configuration"). */
export type ClientAddress =
	/** `key` is the IPv4 address, or the IPv6 address's /64. */
	| { readonly kind: "known"; readonly key: string }
	/** `ADDRESS_HEADER` is set, but the request didn't come through the proxy that sets it. */
	| { readonly kind: "refused" }
	/** No address at all, such as over a Unix socket: the limits are skipped. */
	| { readonly kind: "unknown" };

export type ClientAddressOptions = {
	/** `ADDRESS_HEADER`, as startup read it. */
	readonly addressHeader: () => string | undefined;
	/** Where the once-a-process warnings go. */
	readonly warn: (message: string) => void;
};

/**
 * Reads a request's client address from adapter-bun's `getClientAddress`, which takes it from
 * `ADDRESS_HEADER` and `XFF_DEPTH` when they are set and from the connection otherwise:
 * - with `ADDRESS_HEADER` set, a request whose header is missing, cut short (the adapter throws)
 *   or not an IP address is refused: setting it says every request comes through the proxy, and
 *   the connection's own address can't be read instead, since Bun knows it only for the request
 *   it received and `handle` sees a copy;
 * - without it, only a request with no address at all is unknown, and `X-Forwarded-For` arriving
 *   means a proxy hides every visitor behind its own address, which is worth a warning.
 * Each warning is written once a process.
 */
export function clientAddressReader(options: ClientAddressOptions) {
	const warned = new Set<string>();
	const warnOnce = (message: string) => {
		if (warned.has(message)) return;
		warned.add(message);
		options.warn(message);
	};

	return (getClientAddress: () => string, request: Request): ClientAddress => {
		const addressHeader = options.addressHeader();
		let address: string | undefined;
		try {
			address = getClientAddress();
		} catch {
			address = undefined;
		}
		const key = address === undefined ? undefined : addressKey(address);
		if (addressHeader !== undefined) {
			if (key !== undefined) return { kind: "known", key };
			warnOnce(
				`a request without a client address in ${addressHeader} was refused: ADDRESS_HEADER says every request comes through the proxy`,
			);
			return { kind: "refused" };
		}
		if (request.headers.has("x-forwarded-for")) {
			warnOnce(
				"X-Forwarded-For arrives while ADDRESS_HEADER is unset, so every visitor counts as the proxy's address: set ADDRESS_HEADER",
			);
		}
		if (key !== undefined) return { kind: "known", key };
		warnOnce("a request with no client address skips the rate limits");
		return { kind: "unknown" };
	};
}

/** An address's key: the IPv4 address, IPv4-mapped IPv6 as its IPv4, or the IPv6 /64. */
function addressKey(raw: string): string | undefined {
	const address = raw
		.trim()
		.replace(/^\[(.*)\]$/, "$1")
		.replace(/%.*$/, "");
	if (isIPv4(address)) return address;
	if (!isIPv6(address)) return undefined;
	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
	if (mapped?.[1] !== undefined && isIPv4(mapped[1])) return mapped[1];
	const groups = hextets(address);
	return `${groups.slice(0, 4).join(":")}::/64`;
}

/** An IPv6 address's eight groups, `::` expanded, without leading zeros. */
function hextets(address: string): string[] {
	// An IPv4 tail, as in `::1.2.3.4`, is two groups.
	const withoutTail = address.replace(/(\d{1,3}(?:\.\d{1,3}){3})$/, (ipv4) => {
		const [a = 0, b = 0, c = 0, d = 0] = ipv4.split(".").map(Number);
		return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	});
	const [head = "", tail] = withoutTail.split("::");
	const left = head === "" ? [] : head.split(":");
	const right = tail === undefined || tail === "" ? [] : tail.split(":");
	const fill = tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
	return [...left, ...fill, ...right].map((group) => Number.parseInt(group, 16).toString(16));
}
