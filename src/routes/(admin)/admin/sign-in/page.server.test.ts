import { isHttpError } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
vi.mock("#lib/server/services/sign-in/sign-in.ts", () => ({ signIn }));
vi.mock("#lib/server/services/setup/startup.ts", () => ({
	currentDatabase: () => ({}),
	currentOrigin: () => undefined,
}));

const { actions } = await import("./+page.server.ts");

/**
 * The sign-in action for a form post to `/admin/sign-in` with `query`, from `clientAddress`; the
 * browser says which address it is on, unless `origin` is null. What it returned or threw, and
 * the headers and cookies it set.
 */
async function post({
	query = "",
	origin = "http://192.168.1.20:3000",
	clientAddress = "198.51.100.9",
}: {
	query?: string;
	origin?: string | null;
	clientAddress?: string;
} = {}) {
	const setHeaders = vi.fn();
	const cookies = { set: vi.fn() };
	const url = new URL(`http://app.test/admin/sign-in${query}`);
	const request = new Request(url, {
		method: "POST",
		headers: origin === null ? {} : { origin },
		body: new URLSearchParams({ username: "owner", password: "secret words" }),
	});
	let outcome: unknown;
	try {
		outcome = await actions.default({
			request,
			url,
			locals: { clientAddress },
			setHeaders,
			cookies,
		} as unknown as Parameters<typeof actions.default>[0]);
	} catch (thrown) {
		outcome = thrown;
	}
	return { outcome, setHeaders, cookies };
}

const signedIn = () =>
	signIn.mockResolvedValue({
		status: "signed-in",
		session: { token: "tok", expiresAt: new Date(Date.now() + 60_000) },
	});

beforeEach(() => {
	signIn.mockReset();
});

describe("the sign-in action", () => {
	it("signs in with the session cookie, not Secure over plain HTTP, and goes to /admin", async () => {
		signedIn();
		const { outcome, cookies } = await post();
		expect(outcome).toMatchObject({ status: 303, location: "/admin" });
		expect(signIn.mock.calls[0]?.[1]).toEqual({
			username: "owner",
			password: "secret words",
			clientAddress: "198.51.100.9",
		});
		expect(cookies.set).toHaveBeenCalledWith(
			"obzorarr_session",
			"tok",
			expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", secure: false }),
		);
	});

	it("returns to a safe `next`, keeping only its path", async () => {
		signedIn();
		const { outcome } = await post({ query: "?next=%2Fadmin%2Fsettings%3Ftab%3Dx" });
		expect(outcome).toMatchObject({ status: 303, location: "/admin/settings" });
	});

	it("drops an unsafe `next` and goes to /admin", async () => {
		for (const next of ["//evil.test/admin", "/.//evil.test", "/a/..//evil.test"]) {
			signedIn();
			const { outcome } = await post({ query: `?next=${encodeURIComponent(next)}` });
			expect(outcome, next).toMatchObject({ status: 303, location: "/admin" });
		}
	});

	it("answers a wrong username or password with one message, keeping only the username", async () => {
		signIn.mockResolvedValue({ status: "wrong" });
		const { outcome } = await post();
		expect(outcome).toMatchObject({ status: 400, data: { username: "owner", wrong: true } });
		expect(JSON.stringify(outcome)).not.toContain("secret words");
	});

	it("says the server is busy, with when to try again in its headers", async () => {
		const headers = { "retry-after": "5" };
		signIn.mockResolvedValue({ status: "too-many", reason: "busy", retryAfterSeconds: 5, headers });
		const { outcome, setHeaders } = await post();
		expect(outcome).toMatchObject({ status: 429, data: { username: "owner", busy: true } });
		expect(setHeaders).toHaveBeenCalledWith(headers);
	});

	it("shows the wait for a limit or a wait after failed sign-ins, with its headers", async () => {
		for (const reason of ["limit", "wait"]) {
			const headers = { "retry-after": "240", "x-ratelimit-limit": "10" };
			signIn.mockResolvedValue({ status: "too-many", reason, retryAfterSeconds: 240, headers });
			const { outcome, setHeaders } = await post();
			expect(outcome, reason).toMatchObject({
				status: 429,
				data: { username: "owner", retryAfterSeconds: 240 },
			});
			expect((outcome as { data: object }).data).not.toHaveProperty("busy");
			expect(setHeaders, reason).toHaveBeenCalledWith(headers);
		}
	});

	it("refuses a browser that didn't say which address it is on, before checking anything", async () => {
		const { outcome } = await post({ origin: null });
		expect(isHttpError(outcome, 403)).toBe(true);
		expect((outcome as { body: { message: string } }).body.message).toBe(
			"Your browser didn't say which address it is using. Set ORIGIN and restart Obzorarr.",
		);
		expect(signIn).not.toHaveBeenCalled();
	});

	it("keeps its answers out of every cache", async () => {
		signIn.mockResolvedValue({ status: "wrong" });
		const { setHeaders } = await post();
		expect(setHeaders).toHaveBeenCalledWith({ "cache-control": "no-store" });
	});
});
