import { connect } from "@tursodatabase/database";
import { DrizzleQueryError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/tursodatabase/database";

/**
 * Opens the database file at `path` (D6: the one connection the app uses). A failed query's error
 * never carries the values bound to it, which can be a password's hash or a username; Drizzle's
 * default, set here so an upgrade can't turn it on.
 */
export async function openDatabase(path: string) {
	const client = await connect(path);
	return drizzle({ client, paramsInErrors: false });
}

/**
 * What a log entry keeps of a failed query: its name, its text, with placeholders for its values,
 * and the database's own error, never Drizzle's message or stack, which can repeat the values.
 * Anything else is returned as it is. A layer of its own, so a caller that logs a failed write of
 * credentials stays safe whatever `paramsInErrors` and `redact` do.
 */
export function queryFailure(error: unknown): unknown {
	if (!(error instanceof DrizzleQueryError)) return error;
	return { name: error.name, query: error.query, cause: error.cause };
}

export type Database = Awaited<ReturnType<typeof openDatabase>>;

/** A transaction's handle: every statement in a transaction goes through it (D6). */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What a named operation runs on: the database, or a transaction a service opened. */
export type Executor = Database | Transaction;
