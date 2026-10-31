import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { Secret } from "./secret.ts";

// Every value here is generated from bytes when the test runs; none is written in the repo.
const randomValue = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** Each form a secret can be printed or converted in, and exactly what it must give. */
const forms: { name: string; print: (secret: Secret) => string; expected: string }[] = [
	{ name: "String()", print: (secret) => String(secret), expected: "[redacted]" },
	{ name: ".toString()", print: (secret) => secret.toString(), expected: "[redacted]" },
	{ name: "a template string", print: (secret) => `${secret}`, expected: "[redacted]" },
	{
		name: "+ after a string",
		// biome-ignore lint/style/useTemplate: this row tests the + operator itself.
		print: (secret) => "token: " + secret,
		expected: "token: [redacted]",
	},
	{
		name: "+ before a string",
		// biome-ignore lint/style/useTemplate: this row tests the + operator itself.
		print: (secret) => secret + "!",
		expected: "[redacted]!",
	},
	{
		name: "JSON.stringify",
		print: (secret) => JSON.stringify(secret),
		expected: '"[redacted]"',
	},
	{
		name: "JSON.stringify in an object",
		print: (secret) => JSON.stringify({ secret }),
		expected: '{"secret":"[redacted]"}',
	},
	{ name: "Bun.inspect", print: (secret) => Bun.inspect(secret), expected: "[redacted]" },
	{ name: "util.inspect", print: (secret) => inspect(secret), expected: "[redacted]" },
	{
		name: "util.inspect in an object",
		print: (secret) => inspect({ secret }),
		expected: "{ secret: [redacted] }",
	},
];

describe("Secret", () => {
	it("reveals its value unchanged", () => {
		const values = [randomValue(), ` \t${randomValue()}\r\nключ ✓ `, ""];

		for (const value of values) expect(new Secret(value).reveal()).toBe(value);
	});

	for (const { name, print, expected } of forms) {
		it(`prints as ${expected} through ${name}`, () => {
			expect(print(new Secret(randomValue()))).toBe(expected);
		});
	}

	it("prints as [redacted] through console.log", () => {
		// Vitest replaces `console`, so a child process prints for real. The value is generated in
		// the child and never passes through its arguments or environment.
		const module = JSON.stringify(new URL("./secret.ts", import.meta.url).href);
		const script = `
			import { Secret } from ${module};
			console.log(new Secret(crypto.getRandomValues(new Uint8Array(32)).toBase64()));
		`;
		const { exitCode, stdout, stderr } = Bun.spawnSync(
			[process.execPath, "--no-env-file", "-e", script],
			{
				stdout: "pipe",
				stderr: "pipe",
				env: { PATH: process.env.PATH, NO_COLOR: "1" },
				timeout: 5_000,
			},
		);

		expect({ exitCode, stderr: stderr.toString() }).toEqual({ exitCode: 0, stderr: "" });
		expect(stdout.toString()).toBe("[redacted]\n");
	});

	it("has no behaviour beyond reveal() and the printing hooks", () => {
		expect(Reflect.ownKeys(new Secret(randomValue()))).toEqual([]);
		expect(Reflect.ownKeys(Secret.prototype)).toEqual([
			"constructor",
			"reveal",
			"toString",
			"toJSON",
			Symbol.toPrimitive,
			Symbol.for("nodejs.util.inspect.custom"),
		]);
	});
});
