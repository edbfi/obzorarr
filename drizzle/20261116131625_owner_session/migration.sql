CREATE TABLE `owner_session` (
	`token_hash` text PRIMARY KEY,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
