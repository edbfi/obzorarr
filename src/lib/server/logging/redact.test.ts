import { DrizzleQueryError } from "drizzle-orm";
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

		it("removes credentials after a scheme joined to a word", () => {
			expect(redact("dsn x_postgres://u:hunter2@h/db")).toBe(`dsn x_postgres://${R}@h/db`);
			expect(redact(`/x?${"a=1;".repeat(25_000)}token=t`)).toMatch(/;token=\[redacted\]$/);
		});

		// Logged URLs come from outside, so a hostile one must not stall the logger. A time limit
		// fails under load and misses a fast quadratic scan, so this compares growth instead: 8
		// times the input takes about 8 times as long if linear, and 45 to 64 if quadratic. The
		// small and large runs alternate, so load slows both alike, and the fastest of each counts.
		// Contention for the CPU's cache can still slow the large run alone, so a test may try twice
		// more: a quadratic scan fails every attempt.
		it.each<[string, (size: number) => string]>([
			["dots that could start a scheme", (size) => "a.".repeat(size * 4)],
			["parameters behind semicolons", (size) => `/x?${"a=1;".repeat(size)}token=t`],
			// Each round of decoding peels one layer off: `%2525…253F` is `size` layers deep.
			["an escape encoded again and again", (size) => `/x?a=%${"25".repeat(size)}3F`],
			["encoded values behind semicolons", (size) => `/x?${"a=%3F;".repeat(size)}`],
			// Splitting a name into words must not backtrack through a run of capitals.
			["a parameter name in capitals", (size) => `/x?${"A".repeat(size)}=1`],
		])("scans %s in linear time", { retry: 2 }, (_, input) => {
			const smallText = input(5_000);
			const largeText = input(40_000);
			const timed = (text: string) => {
				const started = performance.now();
				redact(text);
				return performance.now() - started;
			};
			let small = Number.POSITIVE_INFINITY;
			let large = Number.POSITIVE_INFINITY;
			for (let run = 0; run < 7; run++) {
				small = Math.min(small, timed(smallText));
				large = Math.min(large, timed(largeText));
			}
			// The 2 ms keeps timer noise on a fast scan from counting as growth.
			expect(large).toBeLessThan(24 * small + 2);
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
			// A bare query string, whose first parameter has no separator before it.
			expect(redact("/r?u=token%3Dabc%26x%3D1&y=2")).toBe(`/r?u=${R}&y=2`);
			// A parameter behind a semicolon, whose own value starts with the credential.
			expect(redact("/r?a=1;u=token%3Dabc&y=2")).toBe(`/r?a=${R}&y=2`);
			expect(redact("/r?a=1;b=2;u=token%3Dabc")).toBe(`/r?a=${R}`);
			// A value that is itself a chain of assignments.
			expect(redact("/r?a=1;u=v%3Dtoken%3Dabc&y=2")).toBe(`/r?a=${R}&y=2`);
			expect(redact("/r?u=v%3Dw%3Dx%3Dpassword%3Dabc&y=2")).toBe(`/r?u=${R}&y=2`);
			// A chain whose credential is encoded once more.
			expect(redact("/r?a=1;u=v%3Dtoken%253Dabc")).toBe(`/r?a=${R}`);
		});

		it("still finds a hash or a URL's password encoded in a value, behind a semicolon too", () => {
			const hash = "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo";
			for (const hidden of [hash, hash.replace("$v=19", ""), "https://a;b=c:pw@host/"]) {
				const encoded = encodeURIComponent(hidden);
				expect(redact(`/r?u=${encoded}`)).toBe(`/r?u=${R}`);
				expect(redact(`/r?u=1%3B${encoded}&y=2`)).toBe(`/r?u=${R}&y=2`);
			}
		});

		it("keeps an encoded value that hides nothing", () => {
			expect(redact("/login?next=%2Flibrary%3Ftype%3D1&lang=da")).toBe(
				"/login?next=%2Flibrary%3Ftype%3D1&lang=da",
			);
			expect(redact("/search?q=100%25%20sure%")).toBe("/search?q=100%25%20sure%");
			// A chained value in base64, whose padding is a run of `=`.
			expect(redact("/login?next=%2Fa%3Fid%3DYWJjZA%3D%3D")).toBe(
				"/login?next=%2Fa%3Fid%3DYWJjZA%3D%3D",
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

	describe("database errors and password hashes", () => {
		const HASH =
			"$argon2id$v=19$m=65536,t=2,p=1$/seEFvW4OSZIjbIuRmn3B5Qo57VWz2sgfKL0ipDNHQs$NkKmoFBaJSLdYTbzOZHz7diXfC6Zi+WSdO2WpLgqMx4";

		it("hides an argon2 hash wherever it appears in text", () => {
			expect(redact(`stored ${HASH} for the owner`)).toBe(`stored ${R} for the owner`);
			expect(redact(`"${HASH}",1700000000000`)).toBe(`"${R}",1700000000000`);
			expect(redact("$argon2i$v=19$m=4096,t=3,p=1$c2FsdA$aGFzaA")).toBe(R);
		});

		it("drops a failed query's parameters from its message, stack and fields, keeping the query", () => {
			const query = 'insert into "owner" ("id", "username", "password_hash") values (?, ?, ?)';
			const cause = new Error("UNIQUE constraint failed: owner.id");
			// A value with a line break carries the rest of the values onto the following lines.
			const failed = new DrizzleQueryError(query, [1, "Gunnhild\nØstergaard", HASH], cause);
			expect(failed.message).toContain("Østergaard");
			const logged = redact(failed) as Record<string, unknown>;
			const text = JSON.stringify(logged);
			expect(text).not.toContain("Gunnhild");
			expect(text).not.toContain("Østergaard");
			expect(text).not.toContain("argon2");
			expect(logged.params).toBe(R);
			expect(logged.query).toBe(query);
			expect(logged.message).toBe(`Failed query: ${query}\nparams: ${R}`);
			// The stack keeps its frames after the hidden values.
			expect(logged.stack).toMatch(/params: \[redacted\]\n\s+at /);
			expect(text).toContain("UNIQUE constraint failed: owner.id");
		});

		it("isn't fooled by a value that looks like a stack frame", () => {
			const query = 'update "settings" set "value" = ? where "key" = ?';
			const failed = new DrizzleQueryError(
				query,
				["before\n\tat sensitive\nafter", "k"],
				new Error("x"),
			);
			const logged = redact(failed) as Record<string, unknown>;
			const text = JSON.stringify(logged);
			expect(text).not.toContain("sensitive");
			expect(text).not.toContain("after");
			expect(logged.message).toBe(`Failed query: ${query}\nparams: ${R}`);
			// The real frames are still there.
			expect(logged.stack).toMatch(
				/^DrizzleQueryError: Failed query: [^\n]*\nparams: \[redacted\]\n\s+at /,
			);
		});

		it("cleans the whole stack as text when its header isn't the error's message", () => {
			// The stack was built before the message was shortened.
			const shortened = new Error("q\nparams: a\nSECRET");
			void shortened.stack;
			shortened.message = "q\nparams: a";
			const custom = Object.assign(new Error("boom"), {
				stack: "Custom: header\nparams: a\nSECRET\n    at frame (file.ts:1:1)",
			});
			for (const error of [shortened, custom]) {
				const text = JSON.stringify(redact(error));
				expect(text).not.toContain("SECRET");
				expect(text).not.toContain("frame (file.ts");
			}
		});

		it("stays fast on text built to slow the parameters' rule down", () => {
			const started = performance.now();
			redact(`\nparams: ${"\n ".repeat(200_000)}x`);
			redact(`\nparams: a${"\nparams: a".repeat(100_000)}`);
			expect(performance.now() - started).toBeLessThan(1000);
		});

		it("hides a hash written in base64url or with JSON's escaped slashes", () => {
			expect(redact("$argon2id$v=19$m=65536,t=2,p=1$c2_x-dA$aG_Fz-aA")).toBe(R);
			expect(redact(String.raw`"$argon2id$v=19$m=65536,t=2,p=1$ab\/cd$ef\/gh"`)).toBe(`"${R}"`);
			// Another escape ends it, so the text after it stays.
			expect(redact(String.raw`"$argon2id$v=19$m=65536,t=2,p=1$abcd$efgh\nnext line"`)).toBe(
				String.raw`"${R}\nnext line"`,
			);
		});
	});
});

describe("a value that can't be read", () => {
	it("marks a throwing toJSON as unreadable, keeping what is around it", () => {
		const broken = {
			toJSON() {
				throw new Error("no JSON for you");
			},
		};
		expect(redact({ before: 1, broken, after: "kept" })).toEqual({
			before: 1,
			broken: "[unreadable]",
			after: "kept",
		});
	});

	it("marks only a throwing getter's field as unreadable", () => {
		const value = {
			kept: "yes",
			get broken() {
				throw new Error("no value for you");
			},
		};
		expect(redact(value)).toEqual({ kept: "yes", broken: "[unreadable]" });
	});

	it("keeps an error's name and message when its stack can't be read", () => {
		const hostile = new Error("boom");
		Object.defineProperty(hostile, "stack", {
			get() {
				throw new Error("no stack for you");
			},
		});
		expect(redact(hostile)).toMatchObject({
			name: "Error",
			message: "boom",
			stack: "[unreadable]",
		});
	});

	it("marks an object whose keys can't be listed as unreadable", () => {
		const proxy = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error("no keys for you");
				},
			},
		);
		expect(redact({ proxy })).toEqual({ proxy: "[unreadable]" });
	});

	it("stops a chain of causes too deep to walk, without overflowing the stack", () => {
		let error = new Error("the bottom");
		for (let i = 0; i < 20_000; i++) error = new Error(`level ${i}`, { cause: error });
		let text = "";
		expect(() => {
			text = JSON.stringify(redact(error));
		}).not.toThrow();
		expect(text).toContain("[too deep]");
		expect(text).not.toContain("the bottom");
	});
});

describe("a value that can't be read, more ways", () => {
	const throwingFunction = () => {
		const fn = () => {};
		fn.toString = () => {
			throw new Error("no text for you");
		};
		return fn;
	};

	it("marks a function whose text can't be read, alone and beside readable fields", () => {
		expect(redact(throwingFunction())).toBe("[unreadable]");
		expect(redact({ keep: 1, fn: throwingFunction() })).toEqual({ keep: 1, fn: "[unreadable]" });
	});

	it("cleans a function's text like any other", () => {
		const fn = () => {};
		fn.toString = () => "https://u:hunter2@host/?token=abc";
		expect(JSON.stringify(redact({ fn }))).not.toContain("hunter2");
		expect(JSON.stringify(redact({ fn }))).not.toContain("abc");
	});

	it("marks a revoked proxy, a callable one included, beside readable fields", () => {
		const object = Proxy.revocable({}, {});
		const callable = Proxy.revocable(() => {}, {});
		object.revoke();
		callable.revoke();
		expect(redact({ keep: 1, object: object.proxy, callable: callable.proxy })).toEqual({
			keep: 1,
			object: "[unreadable]",
			callable: "[unreadable]",
		});
	});

	it("marks only an array's element whose getter throws", () => {
		const list = [1, 2, 3];
		Object.defineProperty(list, 1, {
			get() {
				throw new Error("no element for you");
			},
		});
		expect(redact(list)).toEqual([1, "[unreadable]", 3]);
	});

	it("never runs a getter on a key it hides anyway", () => {
		let read = false;
		const value = {
			get password() {
				read = true;
				return "hunter2";
			},
		};
		expect(redact(value)).toEqual({ password: "[redacted]" });
		expect(read).toBe(false);
	});

	it("cleans an error's name, in its own field and in its stack", () => {
		const error = new Error("boom");
		error.name = "Bad https://u:hunter2@host";
		expect(JSON.stringify(redact(error))).not.toContain("hunter2");
	});

	it("keeps an own errors field on an error that isn't an AggregateError", () => {
		const error = Object.assign(new Error("invalid"), { errors: ["name is required"] });
		expect(redact(error)).toMatchObject({ errors: ["name is required"] });
	});

	it("walks an enumerable cause once, so a long chain of them stays quick", () => {
		let error = new Error("the bottom");
		for (let i = 0; i < 30; i++) {
			const next = new Error(`level ${i}`);
			// As Drizzle's query errors do: an own, enumerable `cause`.
			Object.assign(next, { cause: error });
			error = next;
		}
		const started = performance.now();
		expect(JSON.stringify(redact(error))).toContain("the bottom");
		expect(performance.now() - started).toBeLessThan(1000);
	});
});

describe("a value too large to walk", () => {
	it("stops a shared object reached by many paths, quickly and with a marker", () => {
		let shared: object = { leaf: true };
		for (let i = 0; i < 30; i++) shared = { left: shared, right: shared };
		const started = performance.now();
		const text = JSON.stringify(redact(shared));
		expect(performance.now() - started).toBeLessThan(1000);
		expect(text).toContain("[too large]");
		expect(text.length).toBeLessThan(2_000_000);
	});

	it("walks a huge sparse array without allocating its length", () => {
		const sparse: unknown[] = [];
		sparse.length = 2 ** 32 - 1;
		sparse[0] = "first";
		const started = performance.now();
		const walked = redact(sparse) as unknown[];
		expect(performance.now() - started).toBeLessThan(1000);
		expect(walked[0]).toBe("first");
		expect(walked.at(-1)).toBe("[too large]");
	});

	it("keeps small values whole", () => {
		const value = { list: Array.from({ length: 100 }, (_, index) => ({ index })) };
		expect(redact(value)).toEqual(value);
	});

	it("counts an object's plain fields, and ends a wide one with a marker", () => {
		const wide = Object.fromEntries(
			Array.from({ length: 50_000 }, (_, index) => [`k${index}`, index]),
		);
		const walked = redact(wide) as Record<string, unknown>;
		expect(Object.keys(walked).length).toBeLessThan(10_100);
		expect(walked["[too large]"]).toBe("40001 more");
		expect(walked.k0).toBe(0);
	});

	it("stops a shared wide object reached by many paths, quickly", () => {
		let shared: object = Object.fromEntries(
			Array.from({ length: 1000 }, (_, index) => [`k${index}`, index]),
		);
		for (let i = 0; i < 30; i++) shared = { left: shared, right: shared };
		const started = performance.now();
		const text = JSON.stringify(redact(shared));
		expect(performance.now() - started).toBeLessThan(1000);
		expect(text.length).toBeLessThan(2_000_000);
	});

	it("counts a request's headers, and ends a huge set with a marker", () => {
		const headers = new Headers(
			Array.from({ length: 20_000 }, (_, index): [string, string] => [`x-h${index}`, "v"]),
		);
		const walked = redact(headers) as Record<string, unknown>;
		expect(Object.keys(walked).length).toBeLessThan(10_100);
		expect(walked["[too large]"]).toMatch(/^\d+ more$/);
	});

	it("walks an entry's own errors first, so a large part beside one can't crowd it out", () => {
		const request = Array.from({ length: 20_000 }, () => ({}));
		const walked = redact({ request, error: new Error("boom") }) as Record<string, unknown>;
		expect(walked.error).toMatchObject({ name: "Error", message: "boom" });
		expect((walked.error as { stack: string }).stack).toMatch(/^Error: boom\n/);
		expect(Object.keys(walked)).toEqual(["request", "error"]);
	});

	it("never reads a field past the budget", () => {
		let reads = 0;
		const wide = {};
		for (let i = 0; i < 20_000; i++) {
			Object.defineProperty(wide, `k${i}`, { enumerable: true, get: () => ++reads });
		}
		const walked = redact({ wide }) as { wide: Record<string, unknown> };
		expect(reads).toBeLessThan(10_000);
		expect(walked.wide["[too large]"]).toMatch(/^\d+ more$/);
		reads = 0;
		// At the top, the first 10,000 values are read to find its errors, and no more.
		expect(redact(wide)).toHaveProperty(["[too large]"]);
		expect(reads).toBe(10_000);
	});

	it("reads each value at the top once, keeping the first answer", () => {
		let reads = 0;
		const entry = {
			get once() {
				reads++;
				if (reads > 1) throw new Error("read twice");
				return "first value";
			},
		};
		expect(redact(entry)).toEqual({ once: "first value" });
		expect(reads).toBe(1);
	});

	it("stays quick on a huge entry, looking for its errors among only as many fields as it walks", () => {
		const huge = Object.fromEntries(Array.from({ length: 1_000_000 }, (_, i) => [`k${i}`, i]));
		const started = performance.now();
		redact(huge);
		expect(performance.now() - started).toBeLessThan(1000);
	});

	it("stops errors that share each other as fields, quickly", () => {
		let shared = new Error("leaf");
		for (let i = 0; i < 30; i++)
			shared = Object.assign(new Error(`level ${i}`), { a: shared, b: shared });
		const started = performance.now();
		const text = JSON.stringify(redact({ big: Array(20_000).fill(0), error: shared }));
		expect(performance.now() - started).toBeLessThan(1000);
		expect(text).toContain("level 29");
		expect(text).toContain("[too large]");
	});

	it("counts each field holding an error, even one that is circular", () => {
		const looped = new Error("looped");
		for (let i = 0; i < 10_000; i++) Object.assign(looped, { [`f${i}`]: looped });
		const refs = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`r${i}`, looped]));
		const started = performance.now();
		const text = JSON.stringify(redact({ big: Array(20_000).fill(0), ...refs }));
		expect(performance.now() - started).toBeLessThan(1000);
		expect(text.length).toBeLessThan(2_000_000);
	});

	it("counts each field holding an error, even one too deep to walk", () => {
		const error = new Error("deep");
		let nested: object = Object.fromEntries(
			Array.from({ length: 50_000 }, (_, i) => [`e${i}`, error]),
		);
		for (let i = 0; i < 31; i++) nested = { nested };
		const text = JSON.stringify(redact(nested));
		expect(text.split('"[too deep]"').length - 1).toBeLessThan(10_200);
		expect(text).toMatch(/"\[too large\]":"\d+ more"/);
	});

	it("walks an error's cause before its own fields, so a large field can't hide it", () => {
		const error = new Error("outer", { cause: new Error("root") });
		Object.assign(error, { diagnostics: Array(20_000).fill(0) });
		expect(redact(error)).toMatchObject({ cause: { message: "root" } });
	});
});

describe("each value read once", () => {
	/** A getter that answers once and throws after, counting its reads. */
	function once(value: unknown) {
		const getter = {
			reads: 0,
			get: () => (++getter.reads > 1 ? throwing() : value),
			enumerable: true,
		};
		return getter;
	}
	function throwing(): never {
		throw new Error("read twice");
	}

	it("reads an error's name, message and stack once, enumerable or not", () => {
		const error = new Error("boom");
		const stack = error.stack as string;
		const name = once("Error");
		const message = once("boom");
		const frames = once(stack);
		Object.defineProperties(error, { name, message, stack: frames });
		const walked = redact(error) as Record<string, unknown>;
		expect(walked).toMatchObject({ name: "Error", message: "boom" });
		expect(walked.stack).toMatch(/^Error: boom\n/);
		expect([name.reads, message.reads, frames.reads]).toEqual([1, 1, 1]);
	});

	it("reads a toJSON once, and calls it on its object", () => {
		const getter = once(function (this: { value: string }) {
			return this.value;
		});
		const value = Object.defineProperties({ value: "json" }, { toJSON: getter });
		expect(redact({ value })).toEqual({ value: "json" });
		expect(getter.reads).toBe(1);
	});

	it("reads a toJSON that isn't a function once, and logs it as a field", () => {
		const getter = once(5);
		const value = Object.defineProperties({ other: 1 }, { toJSON: getter });
		expect(redact({ value })).toEqual({ value: { other: 1, toJSON: 5 } });
		expect(getter.reads).toBe(1);
	});
});

describe("an error's message", () => {
	it("keeps the stack when the message isn't text", () => {
		const error = new Error("42");
		Object.defineProperty(error, "message", { value: 42 });
		const walked = redact(error) as { message: unknown; stack: unknown };
		expect(walked.message).toBe("42");
		expect(walked.stack).toMatch(/^Error: 42\n/);
	});
});

describe("an error's name", () => {
	it("is cleaned when it comes from the error's class", () => {
		class Bad extends Error {}
		Object.defineProperty(Bad.prototype, "name", { value: "Bad https://u:hunter2@host" });
		expect(JSON.stringify(redact(new Bad("boom")))).not.toContain("hunter2");
	});

	it("is logged when it is a symbol, whose stack Bun itself can't build", () => {
		const error = new Error("boom");
		Object.defineProperty(error, "name", { value: Symbol("odd") });
		expect(redact(error)).toMatchObject({
			name: "Symbol(odd)",
			message: "boom",
			stack: "[unreadable]",
		});
	});
});
