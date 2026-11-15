import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ConfigError } from "./config-error.ts";
import { errorCode } from "./error-code.ts";

export type DatabasePathEnv = { readonly OBZORARR_DATABASE_PATH?: string | undefined };

const VARIABLE = "OBZORARR_DATABASE_PATH";
const DEFAULT = "data/obzorarr.db";

/**
 * Returns the database file's absolute path, resolved against `cwd`. An empty variable counts as
 * unset. The file's folder is created if it is missing, and must be writable.
 */
export async function readDatabasePath(env: DatabasePathEnv, cwd = process.cwd()): Promise<string> {
	const given = env.OBZORARR_DATABASE_PATH || undefined;
	const path = resolve(cwd, given ?? DEFAULT);
	const subject =
		given === undefined ? `${VARIABLE} is unset, and the default ${DEFAULT}` : VARIABLE;
	const folder = dirname(path);
	try {
		await mkdir(folder, { recursive: true });
	} catch (error) {
		throw new ConfigError(
			VARIABLE,
			`${subject} names a folder that can't be created (${errorCode(error)})`,
		);
	}
	try {
		await access(folder, constants.W_OK);
	} catch (error) {
		throw new ConfigError(
			VARIABLE,
			`${subject} names a folder that can't be written (${errorCode(error)})`,
		);
	}
	return path;
}
