import { describe, expect, it } from "vitest";
import {
	SESSION_COOKIE,
	SESSION_COOKIE_DELETION,
	sessionCookieDeletion,
	sessionCookieOptions,
} from "./session-cookie.ts";

describe("the session cookie", () => {
	it("is named after the app, so apps on one address don't sign each other out", () => {
		expect(SESSION_COOKIE).toBe("obzorarr_session");
	});

	it("is host-only, HttpOnly and SameSite=Lax, lasting until the session's 30-day end", () => {
		const now = new Date("2026-11-16T12:00:00Z");
		const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
		expect(sessionCookieOptions("http://192.168.1.20:3000", end, now)).toEqual({
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: false,
			maxAge: 30 * 24 * 60 * 60,
		});
	});

	it("is Secure exactly when the browser's address is https", () => {
		const now = new Date();
		const end = new Date(now.getTime() + 60_000);
		expect(sessionCookieOptions("https://obzorarr.example", end, now).secure).toBe(true);
		expect(sessionCookieOptions("http://obzorarr.example", end, now).secure).toBe(false);
	});

	it("never has a negative Max-Age", () => {
		const now = new Date();
		expect(sessionCookieOptions("http://a.test", new Date(now.getTime() - 1000), now).maxAge).toBe(
			0,
		);
	});

	it("is deleted with secure: false, which works over HTTP and HTTPS alike", () => {
		expect(SESSION_COOKIE_DELETION).toEqual({
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: false,
		});
	});
});

describe("sessionCookieDeletion", () => {
	it("deletes the cookie with Secure exactly when the browser's address is https", () => {
		expect(sessionCookieDeletion("https://obzorarr.example")).toEqual({
			...SESSION_COOKIE_DELETION,
			secure: true,
		});
		expect(sessionCookieDeletion("http://192.168.1.20:3000")).toEqual(SESSION_COOKIE_DELETION);
	});
});
