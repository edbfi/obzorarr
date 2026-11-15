/** A system error's code, such as `ENOENT`; its message can hold the path, so it's never used. */
export function errorCode(error: unknown): string {
	const code = error instanceof Error && "code" in error ? error.code : undefined;
	return typeof code === "string" && /^E[A-Z0-9]+$/.test(code) ? code : "unknown error";
}
