import { describe, expect, it } from "vitest";
import { Secret } from "#lib/server/security/secrets/secret.ts";
import { redact } from "./redact.ts";

const R = "[redacted]";

describe("redact", () => {
	describe("URLs", () => {
		it("removes the credentials from a URL", () => {
			expect(redact("http://owner:hunter2@plex.local:32400/library")).toBe(
				`http://${R}@plex.local:32400/library`,
			);
		});

		it("removes token-like query parameters and keeps the others", () => {
			expect(redact("https://plex.tv/api?X-Plex-Token=abc123&type=1&api_key=k9")).toBe(
				`https://plex.tv/api?X-Plex-Token=${R}&type=1&api_key=${R}`,
			);
		});

		it("cleans every URL inside a longer text", () => {
			expect(redact("fetch https://a.test/?token=t1 failed, retrying http://u:p@b.test/x")).toBe(
				`fetch https://a.test/?token=${R} failed, retrying http://${R}@b.test/x`,
			);
		});

		it("leaves a text without URLs as it is", () => {
			expect(redact("the owner signed in")).toBe("the owner signed in");
		});
	});

	describe("fields", () => {
		it("redacts authorisation and cookie headers, whatever their case", () => {
			expect(
				redact({ Authorization: "Bearer x", Cookie: "s=1", "Set-Cookie": "s=2", Accept: "*/*" }),
			).toEqual({ Authorization: R, Cookie: R, "Set-Cookie": R, Accept: "*/*" });
		});

		it("redacts a Headers object's sensitive fields", () => {
			const headers = new Headers({ authorization: "Basic x", "x-plex-token": "t", host: "h" });
			expect(redact({ headers })).toEqual({
				headers: { authorization: R, "x-plex-token": R, host: "h" },
			});
		});

		it("redacts keys that look like a token, secret, password, cookie, session or key", () => {
			expect(
				redact({
					accessToken: "a",
					client_secret: "b",
					password: "c",
					cookies: "d",
					sessionId: "e",
					apiKey: "f",
					monkey: "kept",
					keyboard: "kept",
					count: 3,
				}),
			).toEqual({
				accessToken: R,
				client_secret: R,
				password: R,
				cookies: R,
				sessionId: R,
				apiKey: R,
				monkey: "kept",
				keyboard: "kept",
				count: 3,
			});
		});

		it("redacts matching keys at any depth, in objects and arrays", () => {
			expect(
				redact({
					request: { servers: [{ name: "home", token: "t" }], meta: { deep: { secret: "s" } } },
				}),
			).toEqual({
				request: { servers: [{ name: "home", token: R }], meta: { deep: { secret: R } } },
			});
		});

		it("redacts a whole object under a matching key", () => {
			expect(redact({ session: { id: "x", user: 1 } })).toEqual({ session: R });
		});

		it("cleans URLs in nested values too", () => {
			expect(redact({ upstream: { url: "http://a:b@plex.local/" } })).toEqual({
				upstream: { url: `http://${R}@plex.local/` },
			});
		});
	});

	describe("values", () => {
		it("keeps a Secret redacted", () => {
			expect(redact({ value: new Secret("plaintext") })).toEqual({ value: R });
		});

		it("turns an error into its name, message and stack, with URLs cleaned", () => {
			const error = new TypeError("fetch http://u:p@plex.local/ failed");
			const result = redact({ error }) as { error: Record<string, string> };
			expect(result.error.name).toBe("TypeError");
			expect(result.error.message).toBe(`fetch http://${R}@plex.local/ failed`);
			expect(result.error.stack).not.toContain("u:p@");
		});

		it("marks a circular reference instead of looping", () => {
			const node: Record<string, unknown> = { name: "loop" };
			node.self = node;
			expect(redact(node)).toEqual({ name: "loop", self: "[circular]" });
		});

		it("keeps numbers, booleans and null, and turns a bigint into text", () => {
			expect(redact({ n: 1, b: true, z: null, big: 10n })).toEqual({
				n: 1,
				b: true,
				z: null,
				big: "10",
			});
		});
	});
});
