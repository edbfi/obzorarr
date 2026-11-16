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

		it("removes credentials through the last @, whatever punctuation the password holds", () => {
			expect(redact("http://u:p@ss@plex.local/x")).toBe(`http://${R}@plex.local/x`);
			expect(redact("http://owner@example.com:hunter2@plex.local/")).toBe(
				`http://${R}@plex.local/`,
			);
			expect(redact("open https://owner:pass'word@plex.local/ now")).toBe(
				`open https://${R}@plex.local/ now`,
			);
		});

		it("removes token-like parameters from relative URLs and fragments too", () => {
			expect(redact("GET /library/sections?X-Plex-Token=abc123&type=1 failed")).toBe(
				`GET /library/sections?X-Plex-Token=${R}&type=1 failed`,
			);
			expect(redact({ path: "/library?X-Plex-Token=abc123" })).toEqual({
				path: `/library?X-Plex-Token=${R}`,
			});
			expect(redact("https://app.test/callback#access_token=t9&state=s")).toBe(
				`https://app.test/callback#access_token=${R}&state=s`,
			);
		});

		it("redacts a sensitive value whole, through semicolons and quotes", () => {
			expect(redact("https://a.test/?token=prefix;secret-suffix&type=1")).toBe(
				`https://a.test/?token=${R}&type=1`,
			);
			expect(redact({ url: `/x?token=it's"secret` })).toEqual({ url: `/x?token=${R}` });
		});

		it("still finds a sensitive parameter after an ordinary one's semicolon", () => {
			expect(redact("/path?a=1;token=x&b=2")).toBe(`/path?a=1;token=${R}&b=2`);
			expect(redact("/app;jsessionid=abc123")).toBe(`/app;jsessionid=${R}`);
		});

		it("removes credentials after a scheme joined to a word, in linear time", () => {
			expect(redact("dsn x_postgres://u:hunter2@h/db")).toBe(`dsn x_postgres://${R}@h/db`);
			const started = performance.now();
			redact("a.".repeat(50_000));
			redact(`/x?${"a=1;".repeat(25_000)}token=t`);
			redact(`/x?a=${"%2525".repeat(20_000)}`);
			redact(`/x?${"a=%3F;".repeat(25_000)}`);
			expect(performance.now() - started).toBeLessThan(200);
			expect(redact(`/x?${"a=1;".repeat(25_000)}token=t`)).toMatch(/;token=\[redacted\]$/);
		});

		it("redacts a parameter whose percent-encoded value hides a credential", () => {
			// Plex's photo transcoder takes its source, token included, as an encoded `url`.
			expect(
				redact(
					"/photo/:/transcode?width=300&url=%2Flibrary%2Fmetadata%2F1%2Fthumb%3FX-Plex-Token%3Dabc123&height=450",
				),
			).toBe(`/photo/:/transcode?width=300&url=${R}&height=450`);
			expect(redact("https://app.test/r?u=https%3A%2F%2Fowner%3Ahunter2%40plex.local%2F")).toBe(
				`https://app.test/r?u=${R}`,
			);
			// Encoded twice, and next to a stray `%` that isn't an escape.
			expect(redact("/r?u=100%25%20off%3Ftoken%253Dabc&x=1")).toBe(`/r?u=${R}&x=1`);
			// Behind an escape that isn't valid UTF-8.
			expect(redact("/r?u=%FF%3Ftoken%3Dabc")).toBe(`/r?u=${R}`);
		});

		it("keeps an encoded value that hides nothing", () => {
			expect(redact("/login?next=%2Flibrary%3Ftype%3D1&lang=da")).toBe(
				"/login?next=%2Flibrary%3Ftype%3D1&lang=da",
			);
			expect(redact("/search?q=100%25%20sure%")).toBe("/search?q=100%25%20sure%");
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

		it("catches acronyms and names run together, and short words only as whole words", () => {
			expect(
				redact({
					APIToken: "a",
					DBPassword: "b",
					refreshtoken: "c",
					plextoken: "d",
					auth: "e",
					basicAuth: "f",
					authHeader: "g",
					authCode: "h",
					pass: "j",
					passphrase: "k",
					oauth: "l",
					author: "kept",
					passage: "kept",
				}),
			).toEqual({
				APIToken: R,
				DBPassword: R,
				refreshtoken: R,
				plextoken: R,
				auth: R,
				basicAuth: R,
				authHeader: R,
				authCode: R,
				pass: R,
				passphrase: R,
				oauth: R,
				author: "kept",
				passage: "kept",
			});
		});

		it("keeps the names known to hold no credential, matched exactly, and still cleans them", () => {
			expect(
				redact({
					ratingKey: "5512",
					parentRatingKey: "5510",
					grandparentRatingKey: "5500",
					keyId: "Zm9vYmFy",
					maxTokens: 512,
					authError: "Plex answered 401 for https://plex.tv/api?X-Plex-Token=abc123",
					RatingKey: "x",
					ratingKeys: "y",
					userKeyId: "z",
				}),
			).toEqual({
				ratingKey: "5512",
				parentRatingKey: "5510",
				grandparentRatingKey: "5500",
				keyId: "Zm9vYmFy",
				maxTokens: 512,
				authError: `Plex answered 401 for https://plex.tv/api?X-Plex-Token=${R}`,
				RatingKey: R,
				ratingKeys: R,
				userKeyId: R,
			});
			expect(redact("/library/metadata?ratingKey=5512&X-Plex-Token=abc123")).toBe(
				`/library/metadata?ratingKey=5512&X-Plex-Token=${R}`,
			);
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

		it("keeps an error's own fields and its cause, redacted like any other value", () => {
			const cause = Object.assign(new Error("connect http://u:p@plex.local/"), {
				code: "ECONNREFUSED",
			});
			const error = Object.assign(new Error("fetch failed", { cause }), {
				code: "E_PLEX",
				token: "t",
			});
			const result = redact({ error }) as {
				error: Record<string, unknown> & { cause: Record<string, unknown> };
			};
			expect(result.error).toMatchObject({ name: "Error", code: "E_PLEX", token: R });
			expect(result.error.cause).toMatchObject({
				message: `connect http://${R}@plex.local/`,
				code: "ECONNREFUSED",
			});
		});

		it("keeps the errors an AggregateError holds", () => {
			const result = redact(new AggregateError([new Error("one")], "both failed")) as {
				errors: { message: string }[];
			};
			expect(result.errors.map((error) => error.message)).toEqual(["one"]);
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
