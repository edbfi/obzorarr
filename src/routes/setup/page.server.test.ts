import { isHttpError } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimInstance = vi.fn();
vi.mock("#lib/server/services/setup/claim.ts", () => ({ claimInstance }));
vi.mock("#lib/server/services/setup/startup.ts", () => ({
	currentDatabase: () => ({}),
	currentOrigin: () => undefined,
}));

const { actions } = await import("./+page.server.ts");

/**
 * The claim action for a form post from `clientAddress`, with its headers caught; the browser
 * says which address it is on, unless `origin` is null.
 */
async function post(clientAddress: string | undefined, origin: string | null = "http://app.test") {
	const setHeaders = vi.fn();
	const request = new Request("http://app.test/setup", {
		method: "POST",
		headers: origin === null ? {} : { origin },
		body: new URLSearchParams({ token: "abcd-efgh-ijkl", username: "owner", password: "x" }),
	});
	const result = await actions.default({
		request,
		locals: { clientAddress },
		setHeaders,
	} as unknown as Parameters<typeof actions.default>[0]);
	return { result, setHeaders };
}

beforeEach(() => {
	claimInstance.mockReset();
});

describe("the claim action", () => {
	it("passes the client address the rate-limit stage found", async () => {
		claimInstance.mockResolvedValue({ status: "token" });
		await post("198.51.100.9");
		expect(claimInstance.mock.calls[0]?.[1]).toMatchObject({ clientAddress: "198.51.100.9" });
	});

	it("turns a refused claim into the form's 429, with when to try again in its headers", async () => {
		const headers = { "retry-after": "240", "x-ratelimit-limit": "5" };
		claimInstance.mockResolvedValue({
			status: "too-many",
			reason: "limit",
			retryAfterSeconds: 240,
			headers,
		});
		const { result, setHeaders } = await post("198.51.100.9");
		expect(result).toMatchObject({
			status: 429,
			data: { username: "owner", retryAfterSeconds: 240 },
		});
		expect(setHeaders).toHaveBeenCalledWith(headers);
	});

	it("says the server is busy when every hash slot is, which no wait in minutes describes", async () => {
		claimInstance.mockResolvedValue({
			status: "too-many",
			reason: "busy",
			retryAfterSeconds: 5,
			headers: { "retry-after": "5" },
		});
		const { result, setHeaders } = await post(undefined);
		expect(result).toMatchObject({ status: 429, data: { busy: true } });
		expect((result as { data: object }).data).not.toHaveProperty("retryAfterSeconds");
		expect(setHeaders).toHaveBeenCalledWith({ "retry-after": "5" });
	});

	it("refuses a browser that didn't say which address it is on, before anything else", async () => {
		let refused: unknown;
		try {
			await post("198.51.100.9", null);
		} catch (error) {
			refused = error;
		}
		expect(isHttpError(refused, 403)).toBe(true);
		expect((refused as { body: { message: string } }).body.message).toBe(
			"Your browser didn't say which address it is using. Set ORIGIN and restart Obzorarr.",
		);
		expect(claimInstance).not.toHaveBeenCalled();
	});

	it("keeps the claim's answers out of every cache", async () => {
		claimInstance.mockResolvedValue({ status: "token" });
		const { setHeaders } = await post("198.51.100.9");
		expect(setHeaders).toHaveBeenCalledWith({ "cache-control": "no-store" });
	});
});
