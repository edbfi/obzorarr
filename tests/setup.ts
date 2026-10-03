import { mock } from 'bun:test';
import { testToast } from './helpers/toast';

process.env.NODE_ENV = 'test';

// Tests must never touch the development SQLite file.
process.env.DATABASE_PATH = ':memory:';

mock.module('$env/dynamic/private', () => ({
	env: {
		PLEX_SERVER_URL: 'https://test-plex-server:32400',
		PLEX_TOKEN: 'test-plex-token',
		ENABLE_LIVE_SYNC: 'false',
		OPENAI_API_KEY: '',
		OPENAI_API_URL: '',
		OPENAI_MODEL: ''
	}
}));

mock.module('$env/static/private', () => ({
	PLEX_SERVER_URL: 'https://test-plex-server:32400',
	PLEX_TOKEN: 'test-plex-token'
}));

// Mock SvelteKit's $app/env virtual module (the app imports it instead of the
// deprecated $app/environment alias). Tests exercise production-mode behavior
// (dev=false) by default; individual tests may re-mock this module if they need to
// simulate the dev flag being true.
mock.module('$app/env', () => ({
	dev: false,
	browser: false,
	building: false,
	version: 'test'
}));

// Mock app toasts globally so client utility tests don't pull the Svelte/Sonner runtime.
mock.module('$lib/services/toast', () => ({
	toast: testToast
}));

// Static imports would let the DB client read DATABASE_PATH before the test override.
const { sqlite } = await import('$lib/server/db/client');

sqlite.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		plex_id INTEGER UNIQUE NOT NULL,
		account_id INTEGER,
		username TEXT NOT NULL,
		email TEXT,
		thumb TEXT,
		is_admin INTEGER DEFAULT 0,
		created_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS play_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		history_key TEXT UNIQUE NOT NULL,
		rating_key TEXT NOT NULL,
		title TEXT NOT NULL,
		type TEXT NOT NULL,
		viewed_at INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		library_section_id INTEGER NOT NULL,
		thumb TEXT,
		duration INTEGER,
		grandparent_title TEXT,
		grandparent_rating_key TEXT,
		grandparent_thumb TEXT,
		parent_title TEXT,
		genres TEXT,
		release_year INTEGER
	);

	CREATE TABLE IF NOT EXISTS sync_status (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		started_at INTEGER NOT NULL,
		completed_at INTEGER,
		records_processed INTEGER DEFAULT 0,
		last_viewed_at INTEGER,
		status TEXT NOT NULL,
		error TEXT
	);

	CREATE TABLE IF NOT EXISTS cached_stats (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		year INTEGER NOT NULL,
		stats_type TEXT NOT NULL,
		stats_json TEXT NOT NULL,
		calculated_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS share_settings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		year INTEGER NOT NULL,
		mode TEXT NOT NULL DEFAULT 'public',
		mode_source TEXT NOT NULL DEFAULT 'explicit',
		share_token TEXT UNIQUE,
		public_slug TEXT UNIQUE,
		can_user_control INTEGER DEFAULT 0,
		show_logo INTEGER
	);

	-- ISSUE-001: mirror migration 0010's UNIQUE(user_id, year) so the test DB
	-- matches production. getOrCreateShareSettings' onConflictDoNothing targets
	-- this index; without it SQLite rejects the ON CONFLICT clause.
	CREATE UNIQUE INDEX IF NOT EXISTS share_settings_user_year_unq ON share_settings (user_id, year);

	CREATE TABLE IF NOT EXISTS custom_slides (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		enabled INTEGER DEFAULT 1,
		sort_order INTEGER NOT NULL,
		year INTEGER
	);

	CREATE TABLE IF NOT EXISTS slide_config (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		slide_type TEXT NOT NULL,
		enabled INTEGER DEFAULT 1,
		sort_order INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS app_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		plex_token TEXT NOT NULL,
		is_admin INTEGER DEFAULT 0,
		expires_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS pin_transactions (
		state TEXT PRIMARY KEY NOT NULL,
		pin_id INTEGER NOT NULL,
		expires_at INTEGER NOT NULL,
		callback_verified INTEGER DEFAULT 0 NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_pin_transactions_expires_at
		ON pin_transactions (expires_at);

	CREATE TABLE IF NOT EXISTS logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		level TEXT NOT NULL,
		message TEXT NOT NULL,
		source TEXT,
		metadata TEXT,
		timestamp INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS metadata_cache (
		rating_key TEXT PRIMARY KEY,
		duration INTEGER,
		genres TEXT,
		release_year INTEGER,
		fetched_at INTEGER NOT NULL,
		fetch_failed INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS plex_accounts (
		account_id INTEGER PRIMARY KEY,
		plex_id INTEGER NOT NULL,
		username TEXT NOT NULL,
		thumb TEXT,
		is_owner INTEGER DEFAULT 0,
		updated_at INTEGER
	);
`);
