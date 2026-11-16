import { isActionFailure, isHttpError } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const changePassword = vi.fn();
const countOtherSessions = vi.fn();
const endOtherSessions = vi.fn();
vi.mock("#lib/server/services/sign-in/password-change.ts", () => ({ changePassword }));
vi.mock("#lib/server/services/sign-in/sessions.ts", () => ({
	countOtherSessions,
	endOtherSessions,
}));
vi.mock("#lib/server/services/setup/startup.ts", () => ({
	currentDatabase: () => ({}),
	currentOrigin: () => undefined,
}));

const { actions, load } = await import("./+page.server.ts");

type Action = (typeof actions)["password"];

/**
 * The action `name` for a form post from a browser with the session cookie `cookie` (none when
 * null) on `http://192.168.1.20:3000`, or with no `Origin` when `origin` is null. What it returned or threw,
 * and the headers and cookies it set.
 */
async function post(
	name: "password" | "sessions",
	{
		origin = "http://192.168.1.20:3000",
		cookie = "tok",
	}: { origin?: string | null; cookie?: string | null } = {},
) {
	const setHeaders = vi.fn();
	const cookies = { get: vi.fn(() => cookie ?? undefined), set: vi.fn(), delete: vi.fn() };
	const url = new URL(`http://app.test/admin/settings/security?/${name}`);
	const request = new Request(url, {
		method: "POST",
		headers: origin === null ? {} : { origin },
		body: new URLSearchParams({ current: "old words here", next: "new words go here" }),
	});
	let outcome: unknown;
	try {
		outcome = await (actions[name] as Action)({
			request,
			url,
			locals: { clientAddress: "198.51.100.9", owner: { username: "Gunnhild" } },
			setHeaders,
			cookies,
		} as unknown as Parameters<Action>[0]);
	} catch (thrown) {
		outcome = thrown;
	}
	return { outcome, setHeaders, cookies };
}

beforeEach(() => {
	changePassword.mockReset();
	countOtherSessions.mockReset();
	endOtherSessions.mockReset();
});

describe("the Security tab's load", () => {
	it("counts the other browsers signed in", async () => {
		countOtherSessions.mockResolvedValue(2);
		const data = await load({
			cookies: { get: () => "tok" },
		} as unknown as Parameters<typeof load>[0]);
		expect(data).toEqual({ otherSessions: 2 });
		expect(countOtherSessions.mock.calls[0]?.[1]).toBe("tok");
	});
});

describe("the password action", () => {
	it("changes the password with this session's token, then sets the new one's cookie", async () => {
		const expiresAt = new Date(Date.now() + 60_000);
		changePassword.mockResolvedValue({ status: "changed", session: { token: "new", expiresAt } });
		const { outcome, cookies } = await post("password");
		expect(outcome).toEqual({ password: { changed: true } });
		expect(changePassword.mock.calls[0]?.[1]).toEqual({
			sessionToken: "tok",
			current: "old words here",
			next: "new words go here",
			clientAddress: "198.51.100.9",
		});
		expect(cookies.set).toHaveBeenCalledWith(
			"obzorarr_session",
			"new",
			expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", secure: false }),
		);
	});

	it("answers a wrong current password and a broken rule as field errors", async () => {
		changePassword.mockResolvedValue({ status: "wrong-current" });
		const wrong = await post("password");
		expect(isActionFailure(wrong.outcome)).toBe(true);
		expect(wrong.outcome).toMatchObject({
			status: 400,
			data: { password: { wrongCurrent: true } },
		});
		changePassword.mockResolvedValue({ status: "invalid", error: "common" });
		const invalid = await post("password");
		expect(invalid.outcome).toMatchObject({ status: 400, data: { password: { error: "common" } } });
		expect(wrong.cookies.set).not.toHaveBeenCalled();
	});

	it("answers too many attempts with a 429, its headers and how long to wait", async () => {
		const headers = { "retry-after": "300", "x-ratelimit-limit": "10" };
		changePassword.mockResolvedValue({
			status: "too-many",
			reason: "wait",
			retryAfterSeconds: 300,
			headers,
		});
		const { outcome, setHeaders } = await post("password");
		expect(outcome).toMatchObject({ status: 429, data: { password: { retryAfterSeconds: 300 } } });
		expect(setHeaders).toHaveBeenCalledWith(headers);
		changePassword.mockResolvedValue({
			status: "too-many",
			reason: "busy",
			retryAfterSeconds: 5,
			headers: { "retry-after": "5" },
		});
		expect((await post("password")).outcome).toMatchObject({
			status: 429,
			data: { password: { busy: true } },
		});
	});

	it("says the session ended, clearing its cookie, when it ended during the change", async () => {
		changePassword.mockResolvedValue({ status: "signed-out" });
		const { outcome, cookies } = await post("password");
		expect(isHttpError(outcome, 403)).toBe(true);
		// The status is in the body too, since SvelteKit's client drops it from an action error.
		expect(outcome).toMatchObject({ body: { status: 403 } });
		expect(cookies.delete).toHaveBeenCalledWith(
			"obzorarr_session",
			expect.objectContaining({ path: "/", secure: false }),
		);
	});

	it("is refused before anything is checked when the browser didn't say which address it is on", async () => {
		const { outcome } = await post("password", { origin: null });
		expect(isHttpError(outcome, 403)).toBe(true);
		expect((outcome as { body: { message: string } }).body.message).toContain("ORIGIN");
		expect(outcome).toMatchObject({ body: { status: 403 } });
		expect(changePassword).not.toHaveBeenCalled();
	});
});

describe("the sessions action", () => {
	it("signs every other browser out and says how many", async () => {
		endOtherSessions.mockResolvedValue(3);
		const { outcome } = await post("sessions");
		expect(outcome).toEqual({ sessions: { ended: 3 } });
		expect(endOtherSessions.mock.calls[0]?.[1]).toBe("tok");
	});

	it("says the session ended, clearing its cookie, when the caller's own session ended", async () => {
		endOtherSessions.mockResolvedValue(undefined);
		const { outcome, cookies } = await post("sessions");
		expect(isHttpError(outcome, 403)).toBe(true);
		expect(outcome).toMatchObject({ body: { message: "Your session ended. Sign in again." } });
		expect(cookies.delete).toHaveBeenCalledWith(
			"obzorarr_session",
			expect.objectContaining({ path: "/", secure: false }),
		);
	});
});

describe("a request without the session cookie", () => {
	it("is told its session ended, and neither action does anything", async () => {
		for (const name of ["password", "sessions"] as const) {
			const { outcome } = await post(name, { cookie: null });
			expect(isHttpError(outcome, 403), name).toBe(true);
		}
		expect(changePassword).not.toHaveBeenCalled();
		expect(endOtherSessions).not.toHaveBeenCalled();
	});
});
