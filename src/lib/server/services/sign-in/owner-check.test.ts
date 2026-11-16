import { describe, expect, it } from "vitest";
import { ownerCheck } from "./owner-check.ts";

const signedOut = (path: string, method = "GET") => ownerCheck({ path, method, signedIn: false });
const signedIn = (path: string, method = "GET") => ownerCheck({ path, method, signedIn: true });

describe("ownerCheck", () => {
	it("sends a signed-out page or data request under /admin to sign in, returning to its path", () => {
		expect(signedOut("/admin")).toEqual({
			action: "redirect",
			location: "/admin/sign-in?next=%2Fadmin",
		});
		expect(signedOut("/admin/settings/security", "HEAD")).toEqual({
			action: "redirect",
			location: "/admin/sign-in?next=%2Fadmin%2Fsettings%2Fsecurity",
		});
	});

	it("refuses any other signed-out method under /admin, never replaying it", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			expect(signedOut("/admin/settings/security", method), method).toEqual({
				action: "refuse",
				returnTo: "/admin/settings/security",
			});
		}
	});

	it("leaves sign-in and sign-out open, with or without a trailing slash", () => {
		for (const path of ["/admin/sign-in", "/admin/sign-in/", "/admin/sign-out"]) {
			expect(signedOut(path), path).toEqual({ action: "pass", noStore: false });
			expect(signedOut(path, "POST"), path).toEqual({ action: "pass", noStore: false });
		}
	});

	it("checks the path as SvelteKit matches it, so an encoded letter can't slip past", () => {
		expect(signedOut("/%61dmin/settings/security")).toMatchObject({ action: "redirect" });
		// A path that can't be decoded is treated as owner-only.
		expect(signedOut("/admin/%E0%A4%A", "POST")).toMatchObject({ action: "refuse" });
	});

	it("guards a trailing slash, anything below sign-in or sign-out, and every method", () => {
		expect(signedOut("/admin/")).toMatchObject({ action: "redirect" });
		expect(signedOut("/admin/sign-in/x")).toMatchObject({ action: "redirect" });
		expect(signedOut("/admin/sign-out/")).toEqual({ action: "pass", noStore: false });
		expect(signedOut("/admin/settings", "OPTIONS")).toMatchObject({ action: "refuse" });
		// `%2F` stays encoded, as SvelteKit leaves it, so this matches no route and is a 404.
		expect(signedOut("/admin%2Fsettings")).toEqual({ action: "pass", noStore: false });
	});

	it("leaves every other path alone", () => {
		for (const path of ["/", "/setup", "/healthz", "/administrator", "/admins/x"]) {
			expect(signedOut(path), path).toEqual({ action: "pass", noStore: false });
		}
	});

	it("lets the signed-in owner through, kept out of every cache", () => {
		expect(signedIn("/admin/settings/security")).toEqual({ action: "pass", noStore: true });
		expect(signedIn("/admin/settings/security", "POST")).toEqual({ action: "pass", noStore: true });
	});

	it("sends a signed-in owner who opens the sign-in page to the admin", () => {
		expect(signedIn("/admin/sign-in")).toEqual({ action: "redirect", location: "/admin" });
		// Signing in again still works.
		expect(signedIn("/admin/sign-in", "POST")).toEqual({ action: "pass", noStore: false });
	});
});
