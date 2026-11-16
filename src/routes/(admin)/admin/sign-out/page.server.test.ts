import { isHttpError } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const endSession = vi.fn();
vi.mock("#lib/server/services/sign-in/sessions.ts", () => ({ endSession }));
vi.mock("#lib/server/services/setup/startup.ts", () => ({
	currentDatabase: () => ({}),
	currentOrigin: () => undefined,
}));

const { actions, load } = await import("./+page.server.ts");

/** What `run` returned or threw. */
async function outcome(run: () => unknown): Promise<unknown> {
	try {
		return await run();
	} catch (thrown) {
		return thrown;
	}
}

/** The sign-out action for a POST from a browser on `origin` (none when null) with `cookie`. */
function post(origin: string | null, cookie: string | undefined) {
	const cookies = { get: vi.fn(() => cookie), delete: vi.fn() };
	const request = new Request("http://app.test/admin/sign-out", {
		method: "POST",
		headers: origin === null ? {} : { origin },
	});
	const run = () =>
		actions.default({ request, cookies } as unknown as Parameters<typeof actions.default>[0]);
	return { run, cookies };
}

beforeEach(() => {
	endSession.mockReset();
});

describe("/admin/sign-out", () => {
	it("signs nobody out on a GET, which only goes to /admin", async () => {
		expect(await outcome(() => load({} as Parameters<typeof load>[0]))).toMatchObject({
			status: 303,
			location: "/admin",
		});
		expect(endSession).not.toHaveBeenCalled();
	});

	it("ends the session and deletes the cookie, Secure over https, then goes to sign in", async () => {
		const { run, cookies } = post("https://obzorarr.example", "tok");
		expect(await outcome(run)).toMatchObject({ status: 303, location: "/admin/sign-in" });
		expect(endSession).toHaveBeenCalledWith({}, "tok");
		expect(cookies.delete).toHaveBeenCalledWith(
			"obzorarr_session",
			expect.objectContaining({ path: "/", secure: true }),
		);
	});

	it("only clears the cookie when there is no session", async () => {
		const { run, cookies } = post("http://192.168.1.20:3000", undefined);
		expect(await outcome(run)).toMatchObject({ status: 303, location: "/admin/sign-in" });
		expect(endSession).not.toHaveBeenCalled();
		expect(cookies.delete).toHaveBeenCalledWith(
			"obzorarr_session",
			expect.objectContaining({ secure: false }),
		);
	});

	it("refuses a browser that didn't say which address it is on, before anything else", async () => {
		const { run, cookies } = post(null, "tok");
		const refused = await outcome(run);
		expect(isHttpError(refused, 403)).toBe(true);
		expect(endSession).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});
});
