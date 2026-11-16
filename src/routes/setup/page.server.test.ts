import { beforeEach, describe, expect, it, vi } from "vitest";

const claimInstance = vi.fn();
vi.mock("#lib/server/services/setup/claim.ts", () => ({ claimInstance }));
vi.mock("#lib/server/services/setup/startup.ts", () => ({ currentDatabase: () => ({}) }));

const { actions } = await import("./+page.server.ts");

/** The claim action for a form post from `clientAddress`, with its headers caught. */
async function post(clientAddress: string | undefined) {
	const setHeaders = vi.fn();
	const request = new Request("http://app.test/setup", {
		method: "POST",
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
		claimInstance.mockResolvedValue({ status: "too-many", retryAfterSeconds: 240, headers });
		const { result, setHeaders } = await post("198.51.100.9");
		expect(result).toMatchObject({
			status: 429,
			data: { username: "owner", retryAfterSeconds: 240 },
		});
		expect(setHeaders).toHaveBeenCalledWith(headers);
	});

	it("does the same for busy hash slots", async () => {
		claimInstance.mockResolvedValue({
			status: "too-many",
			retryAfterSeconds: 5,
			headers: { "retry-after": "5" },
		});
		const { result, setHeaders } = await post(undefined);
		expect(result).toMatchObject({ status: 429, data: { retryAfterSeconds: 5 } });
		expect(setHeaders).toHaveBeenCalledWith({ "retry-after": "5" });
	});
});
