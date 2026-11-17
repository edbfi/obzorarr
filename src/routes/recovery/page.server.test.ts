import { isActionFailure, isHttpError } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recover = vi.fn();
const waiting = vi.hoisted(() => ({ value: true }));
vi.mock("#lib/server/services/sign-in/recovery.ts", () => ({
	recover,
	isRecoveryWaiting: () => waiting.value,
}));
vi.mock("#lib/server/services/setup/startup.ts", () => ({
	currentDatabase: () => ({}),
	currentOrigin: () => undefined,
}));

const { actions, load } = await import("./+page.server.ts");

type Action = (typeof actions)["default"];

/**
 * The recovery action for a form post from a browser on `http://192.168.1.20:3000`, or with no
 * `Origin` when `origin` is null. What it returned or threw, and the headers and cookies it set.
 */
async function post({ origin = "http://192.168.1.20:3000" }: { origin?: string | null } = {}) {
	const setHeaders = vi.fn();
	const cookies = { set: vi.fn() };
	const url = new URL("http://app.test/recovery");
	const request = new Request(url, {
		method: "POST",
		headers: origin === null ? {} : { origin },
		body: new URLSearchParams({ token: "abcd-efgh-ijkl", password: "new words go here" }),
	});
	let outcome: unknown;
	try {
		outcome = await actions.default({
			request,
			url,
			locals: { clientAddress: "198.51.100.9" },
			setHeaders,
			cookies,
		} as unknown as Parameters<Action>[0]);
	} catch (thrown) {
		outcome = thrown;
	}
	return { outcome, setHeaders, cookies };
}

beforeEach(() => {
	recover.mockReset();
	waiting.value = true;
});

describe("the recovery page's load", () => {
	it("is not found unless a recovery token is waiting, and never cached", () => {
		const setHeaders = vi.fn();
		const loadWith = () =>
			load({
				request: new Request("http://app.test/recovery"),
				setHeaders,
			} as unknown as Parameters<typeof load>[0]);
		expect(() => loadWith()).not.toThrow();
		expect(setHeaders).toHaveBeenCalledWith({ "cache-control": "no-store" });
		waiting.value = false;
		let thrown: unknown;
		try {
			loadWith();
		} catch (caught) {
			thrown = caught;
		}
		expect(isHttpError(thrown, 404)).toBe(true);
	});

	it("keeps a failed POST's answer without JavaScript, where it runs after the action used the token", () => {
		waiting.value = false;
		expect(() =>
			load({
				request: new Request("http://app.test/recovery", { method: "POST" }),
				setHeaders: vi.fn(),
			} as unknown as Parameters<typeof load>[0]),
		).not.toThrow();
	});
});

describe("the recovery action", () => {
	it("recovers, sets the new session's cookie and lands on the Security tab", async () => {
		recover.mockResolvedValue({
			status: "recovered",
			session: { token: "tok", expiresAt: new Date(Date.now() + 60_000) },
		});
		const { outcome, cookies, setHeaders } = await post();
		expect(outcome).toMatchObject({ status: 303, location: "/admin/settings/security" });
		expect(recover.mock.calls[0]?.[1]).toEqual({
			token: "abcd-efgh-ijkl",
			password: "new words go here",
			clientAddress: "198.51.100.9",
		});
		expect(cookies.set).toHaveBeenCalledWith(
			"obzorarr_session",
			"tok",
			expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", secure: false }),
		);
		expect(setHeaders).toHaveBeenCalledWith({ "cache-control": "no-store" });
	});

	it("answers a broken rule, a refused token and a failure, keeping neither the token nor the password", async () => {
		for (const [result, data, status] of [
			[{ status: "invalid", error: "common" }, { passwordError: "common" }, 400],
			[{ status: "token" }, { tokenRefused: true }, 400],
			[{ status: "failed" }, { failed: true }, 500],
		] as const) {
			recover.mockResolvedValue(result);
			const { outcome } = await post();
			expect(isActionFailure(outcome)).toBe(true);
			expect(outcome).toMatchObject({ status, data });
			expect(JSON.stringify(outcome)).not.toContain("abcd");
			expect(JSON.stringify(outcome)).not.toContain("new words");
		}
	});

	it("answers too many attempts with a 429, its headers and how long to wait", async () => {
		const headers = { "retry-after": "300", "x-ratelimit-limit": "5" };
		recover.mockResolvedValue({
			status: "too-many",
			reason: "limit",
			retryAfterSeconds: 300,
			headers,
		});
		const { outcome, setHeaders } = await post();
		expect(outcome).toMatchObject({ status: 429, data: { retryAfterSeconds: 300 } });
		expect(setHeaders).toHaveBeenCalledWith(headers);
		recover.mockResolvedValue({
			status: "too-many",
			reason: "busy",
			retryAfterSeconds: 5,
			headers: { "retry-after": "5" },
		});
		expect((await post()).outcome).toMatchObject({ status: 429, data: { busy: true } });
	});

	it("is not found unless a token is waiting, before the browser's address is checked", async () => {
		waiting.value = false;
		const { outcome } = await post({ origin: null });
		expect(isHttpError(outcome, 404)).toBe(true);
		expect(recover).not.toHaveBeenCalled();
		recover.mockResolvedValue({ status: "not-found" });
		waiting.value = true;
		expect(isHttpError((await post()).outcome, 404)).toBe(true);
	});

	it("is refused before anything is checked when the browser didn't say which address it is on", async () => {
		const { outcome } = await post({ origin: null });
		expect(isHttpError(outcome, 403)).toBe(true);
		expect((outcome as { body: { message: string } }).body.message).toContain("ORIGIN");
		expect(recover).not.toHaveBeenCalled();
	});
});
