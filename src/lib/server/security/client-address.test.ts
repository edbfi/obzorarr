import { describe, expect, it, vi } from "vitest";
import { clientAddressReader } from "./client-address.ts";

/** A reader for `addressHeader`, with its warnings caught. */
function reader(addressHeader?: string) {
	const warn = vi.fn();
	const read = clientAddressReader({ addressHeader: () => addressHeader, warn });
	return { read, warn };
}

/**
 * The request as `handle` sees it: a copy of the one the server received, as Paraglide's
 * middleware makes, carrying `headers`.
 */
function request(headers: Record<string, string> = {}): Request {
	return new Request(new Request("http://app.test/", { headers }));
}

/** What adapter-bun's `getClientAddress` gives: the address, or its throw. */
const gives = (address: string) => () => address;
const throwsMissing = () => {
	throw new Error("Address header was specified with ADDRESS_HEADER=x-forwarded-for but is absent");
};

describe("clientAddressReader", () => {
	it("keys an IPv4 address as itself, and an IPv4-mapped IPv6 address as its IPv4", () => {
		const { read } = reader();
		expect(read(gives("192.168.1.20"), request())).toEqual({ kind: "known", key: "192.168.1.20" });
		expect(read(gives("::ffff:192.168.1.20"), request())).toEqual({
			kind: "known",
			key: "192.168.1.20",
		});
	});

	it("keys an IPv6 address by its /64, however it is written", () => {
		const { read } = reader();
		const key = "2001:db8:aa:bb::/64";
		for (const address of [
			"2001:db8:aa:bb::1",
			"2001:0db8:00aa:00bb:1:2:3:4",
			"[2001:DB8:AA:BB::ff]",
			"2001:db8:aa:bb::1%eth0",
		]) {
			expect(read(gives(address), request())).toEqual({ kind: "known", key });
		}
		expect(read(gives("::1"), request())).toEqual({ kind: "known", key: "0:0:0:0::/64" });
	});

	describe("with ADDRESS_HEADER set", () => {
		it("takes the address the adapter read from the header", () => {
			const { read, warn } = reader("x-forwarded-for");
			expect(read(gives("203.0.113.9"), request({ "x-forwarded-for": "203.0.113.9" }))).toEqual({
				kind: "known",
				key: "203.0.113.9",
			});
			expect(warn).not.toHaveBeenCalled();
		});

		it("refuses a request that left the header out or cut it short, warning once by name", () => {
			const { read, warn } = reader("x-forwarded-for");
			expect(read(throwsMissing, request())).toEqual({ kind: "refused" });
			expect(read(throwsMissing, request())).toEqual({ kind: "refused" });
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]?.[0]).toContain("ADDRESS_HEADER");
		});

		it("refuses a header that holds no IP address", () => {
			const { read } = reader("x-real-ip");
			expect(read(gives("not-an-address"), request({ "x-real-ip": "not-an-address" }))).toEqual({
				kind: "refused",
			});
			expect(read(gives(""), request({ "x-real-ip": "" }))).toEqual({ kind: "refused" });
		});
	});

	describe("without ADDRESS_HEADER", () => {
		it("counts a request with no address at all as unknown, warning once", () => {
			const { read, warn } = reader();
			expect(read(gives(""), request())).toEqual({ kind: "unknown" });
			expect(read(throwsMissing, request())).toEqual({ kind: "unknown" });
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it("warns once that X-Forwarded-For arrived, since every visitor then shares the proxy's address", () => {
			const { read, warn } = reader();
			const forwarded = request({ "x-forwarded-for": "198.51.100.7" });
			expect(read(gives("10.0.0.2"), forwarded)).toEqual({ kind: "known", key: "10.0.0.2" });
			read(gives("10.0.0.2"), forwarded);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]?.[0]).toContain("ADDRESS_HEADER");
		});
	});
});
