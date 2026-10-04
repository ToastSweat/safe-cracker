import Database from 'better-sqlite3-multiple-ciphers';

import { getDatabaseKey } from './db-key';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dataDirectory = join(process.cwd(), 'data');

if (!existsSync(dataDirectory)) {
	mkdirSync(dataDirectory, { recursive: true });
}

const databasePath = join(dataDirectory, 'safe-cracker.db');

function createDatabase() {
    const key = getDatabaseKey();

	const database = new Database(databasePath, {
		timeout: 5000
	});

	database.pragma("cipher = 'chacha20'");
	database.key(key);

    // Keep your existing database.exec(...) schema below.

	database.exec(`
		PRAGMA foreign_keys = ON;
		PRAGMA journal_mode = WAL;

		CREATE TABLE IF NOT EXISTS players (
			discord_user_id TEXT PRIMARY KEY,
			username TEXT NOT NULL,
			display_name TEXT NOT NULL,
			avatar TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		) STRICT;

		CREATE TABLE IF NOT EXISTS sessions (
			token_hash TEXT PRIMARY KEY,
			discord_user_id TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,

			FOREIGN KEY (discord_user_id)
				REFERENCES players(discord_user_id)
				ON DELETE CASCADE
		) STRICT;

		CREATE TABLE IF NOT EXISTS daily_runs (
			discord_user_id TEXT NOT NULL,
			safe_date TEXT NOT NULL,
			safe_number INTEGER NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			started_at INTEGER,
			completed_at INTEGER,
			elapsed_ms INTEGER,

			PRIMARY KEY (discord_user_id, safe_date),

			FOREIGN KEY (discord_user_id)
				REFERENCES players(discord_user_id)
				ON DELETE CASCADE
		) STRICT;

		CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
			ON sessions(expires_at);

		CREATE INDEX IF NOT EXISTS idx_daily_runs_leaderboard
			ON daily_runs(
				safe_date,
				completed_at,
				attempts,
				elapsed_ms
			);
	`);

	return database;
}

const globalDatabase = globalThis as typeof globalThis & {
	safeCrackerDatabase?: ReturnType<typeof createDatabase>;
};

export const db =
	globalDatabase.safeCrackerDatabase ?? createDatabase();

globalDatabase.safeCrackerDatabase = db;