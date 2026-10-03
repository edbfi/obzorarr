import type { Database as BunDatabase } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { building } from '$app/env';
import * as schema from './schema';

// SvelteKit 3 loads server modules while it builds. Never open, create or migrate
// the real database then: the build gets a throwaway in-memory database instead.
const databasePath = building ? ':memory:' : (process.env.DATABASE_PATH ?? 'data/obzorarr.db');

// Fail closed if a test run is not explicitly pointed at an in-memory/test database.
if (
	process.env.NODE_ENV === 'test' &&
	databasePath !== ':memory:' &&
	!databasePath.includes('test')
) {
	throw new Error(
		`CRITICAL: Test environment attempting to access production database at "${databasePath}". ` +
			`Set DATABASE_PATH=:memory: in .env.test or ensure bun test uses --env-file=.env.test.`
	);
}

if (databasePath !== ':memory:') {
	mkdirSync(dirname(databasePath), { recursive: true });
}

// Keep adapter-bun/Rolldown from resolving Bun's builtin at build time.
const sqliteModuleName = ['bun', 'sqlite'].join(':');
const { Database } = (await import(
	/* @vite-ignore */ sqliteModuleName
)) as typeof import('bun:sqlite');
const sqlite: BunDatabase = new Database(databasePath, {
	strict: true,
	create: true
});

sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA busy_timeout = 5000');
sqlite.exec('PRAGMA cache_size = 10000');

export const db = drizzle(sqlite, { schema });

if (databasePath !== ':memory:') {
	migrate(db, { migrationsFolder: './drizzle' });
}

export { sqlite };
