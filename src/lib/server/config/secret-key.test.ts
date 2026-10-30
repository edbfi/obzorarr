import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	readSecretKey,
	type SecretKeyCheck,
	type SecretKeyEnv,
	SecretKeyError,
} from "./secret-key.ts";

// Every key here is generated from bytes when the test runs; none is written in the repo.
const randomKey = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

let dir: string;
let files = 0;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "obzorarr-secret-key-"));
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** Writes `content` to a new file in the test's directory and returns its path. */
async function keyFile(content: string | Uint8Array): Promise<string> {
	const path = join(dir, `key-${files++}`);
	await writeFile(path, content);
	return path;
}

async function failure(env: SecretKeyEnv): Promise<SecretKeyError> {
	try {
		await readSecretKey(env);
	} catch (error) {
		if (error instanceof SecretKeyError) return error;
		throw error;
	}
	throw new Error("the key was read");
}

describe("readSecretKey", () => {
	it("returns OBZORARR_SECRET_KEY's text unchanged", async () => {
		const key = ` ${randomKey()}\n`;

		expect(await readSecretKey({ OBZORARR_SECRET_KEY: key })).toEqual({
			text: key,
			variable: "OBZORARR_SECRET_KEY",
		});
	});

	it("returns the text of the file OBZORARR_SECRET_KEY_FILE names", async () => {
		const key = randomKey();

		expect(await readSecretKey({ OBZORARR_SECRET_KEY_FILE: await keyFile(key) })).toEqual({
			text: key,
			variable: "OBZORARR_SECRET_KEY_FILE",
		});
	});

	for (const [name, ending] of [
		["LF", "\n"],
		["CRLF", "\r\n"],
	]) {
		it(`removes one trailing ${name} from the file`, async () => {
			const key = randomKey();
			const path = await keyFile(key + ending);

			expect((await readSecretKey({ OBZORARR_SECRET_KEY_FILE: path })).text).toBe(key);
		});
	}

	for (const [name, content, text] of [
		["a second trailing LF", (key: string) => `${key}\n\n`, (key: string) => `${key}\n`],
		["a trailing CR alone", (key: string) => `${key}\r`, (key: string) => `${key}\r`],
		["a trailing space", (key: string) => `${key} \n`, (key: string) => `${key} `],
		["leading whitespace", (key: string) => ` \t${key}\n`, (key: string) => ` \t${key}`],
		[
			"a leading byte order mark",
			(key: string) => `\uFEFF${key}\n`,
			(key: string) => `\uFEFF${key}`,
		],
	] as const) {
		it(`keeps ${name} in the file's text`, async () => {
			const key = randomKey();
			const path = await keyFile(content(key));

			expect((await readSecretKey({ OBZORARR_SECRET_KEY_FILE: path })).text).toBe(text(key));
		});
	}

	it("decodes invalid UTF-8 without failing, leaving it for the format check", async () => {
		const path = await keyFile(Uint8Array.of(0x41, 0xff, 0x41, 0x0a));

		expect((await readSecretKey({ OBZORARR_SECRET_KEY_FILE: path })).text).toBe("A\uFFFDA");
	});

	it("returns empty text for an empty key file", async () => {
		const path = await keyFile("");

		expect(await readSecretKey({ OBZORARR_SECRET_KEY_FILE: path })).toEqual({
			text: "",
			variable: "OBZORARR_SECRET_KEY_FILE",
		});
	});

	it("reads a file of exactly 4 KiB", async () => {
		const content = `${"A".repeat(4095)}\n`;

		expect(content).toHaveLength(4096);
		const { text } = await readSecretKey({ OBZORARR_SECRET_KEY_FILE: await keyFile(content) });
		expect(text).toBe("A".repeat(4095));
	});

	for (const [name, content] of [
		["4,097 bytes, counting its trailing newline", `${"A".repeat(4096)}\n`],
		["4,097 bytes in 2,049 characters", `${"\u00E9".repeat(2048)}\n`],
		["far over 4 KiB", "A".repeat(65_536)],
	]) {
		it(`refuses a file of ${name} as too large`, async () => {
			const error = await failure({ OBZORARR_SECRET_KEY_FILE: await keyFile(content) });

			expect(error.check).toBe("too-large");
			expect(error.message).toContain("OBZORARR_SECRET_KEY_FILE");
		});
	}

	it("uses the file when OBZORARR_SECRET_KEY is empty", async () => {
		const key = randomKey();
		const env = { OBZORARR_SECRET_KEY: "", OBZORARR_SECRET_KEY_FILE: await keyFile(key) };

		expect(await readSecretKey(env)).toEqual({ text: key, variable: "OBZORARR_SECRET_KEY_FILE" });
	});

	it("uses the key when OBZORARR_SECRET_KEY_FILE is empty", async () => {
		const key = randomKey();
		const env = { OBZORARR_SECRET_KEY: key, OBZORARR_SECRET_KEY_FILE: "" };

		expect(await readSecretKey(env)).toEqual({ text: key, variable: "OBZORARR_SECRET_KEY" });
	});

	/** Each case expects its check, and a message naming every variable in `names`. */
	const failing: {
		name: string;
		env: () => Promise<SecretKeyEnv>;
		check: SecretKeyCheck;
		names: string[];
	}[] = [
		{
			name: "neither variable",
			env: async () => ({}),
			check: "missing",
			names: ["OBZORARR_SECRET_KEY", "OBZORARR_SECRET_KEY_FILE"],
		},
		{
			name: "both variables empty",
			env: async () => ({ OBZORARR_SECRET_KEY: "", OBZORARR_SECRET_KEY_FILE: "" }),
			check: "missing",
			names: ["OBZORARR_SECRET_KEY", "OBZORARR_SECRET_KEY_FILE"],
		},
		{
			name: "both variables set",
			env: async () => ({
				OBZORARR_SECRET_KEY: randomKey(),
				OBZORARR_SECRET_KEY_FILE: await keyFile(randomKey()),
			}),
			check: "both-set",
			names: ["OBZORARR_SECRET_KEY", "OBZORARR_SECRET_KEY_FILE"],
		},
		{
			name: "both variables set to the same key",
			env: async () => {
				const key = randomKey();
				return { OBZORARR_SECRET_KEY: key, OBZORARR_SECRET_KEY_FILE: await keyFile(key) };
			},
			check: "both-set",
			names: ["OBZORARR_SECRET_KEY", "OBZORARR_SECRET_KEY_FILE"],
		},
		{
			name: "a missing file",
			env: async () => ({ OBZORARR_SECRET_KEY_FILE: join(dir, "missing") }),
			check: "unreadable",
			names: ["OBZORARR_SECRET_KEY_FILE"],
		},
		{
			name: "a directory",
			env: async () => {
				const path = join(dir, `directory-${files++}`);
				await mkdir(path);
				return { OBZORARR_SECRET_KEY_FILE: path };
			},
			check: "unreadable",
			names: ["OBZORARR_SECRET_KEY_FILE"],
		},
	];

	for (const { name, env, check, names } of failing) {
		it(`refuses ${name} with the ${check} check`, async () => {
			const error = await failure(await env());

			expect(error.check).toBe(check);
			for (const variable of names) expect(error.message).toContain(variable);
		});
	}

	it("names the error code of an unreadable file, but never its path", async () => {
		const path = join(dir, "missing");
		const { message } = await failure({ OBZORARR_SECRET_KEY_FILE: path });

		expect(message).toContain("ENOENT");
		expect(message).not.toContain(path);
	});

	it("never puts 6 characters of a key set as OBZORARR_SECRET_KEY_FILE into its message", async () => {
		const key = randomKey();
		const { check, message } = await failure({ OBZORARR_SECRET_KEY_FILE: key });

		expect(check).toBe("unreadable");
		for (let start = 0; start + 6 <= key.length; start++) {
			expect(message).not.toContain(key.slice(start, start + 6));
		}
	});
});
