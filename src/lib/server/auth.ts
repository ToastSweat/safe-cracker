import { createHash, randomBytes } from 'node:crypto';
import { db } from '$lib/server/db';

export const SESSION_COOKIE_NAME = 'safe_cracker_session';

const SESSION_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

export type DiscordUser = {
	id: string;
	username: string;
	global_name: string | null;
	avatar: string | null;
};

function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function upsertPlayer(user: DiscordUser) {
	const now = Date.now();
	const displayName = user.global_name ?? user.username;

	db.prepare(`
		INSERT INTO players (
			discord_user_id,
			username,
			display_name,
			avatar,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?)

		ON CONFLICT(discord_user_id) DO UPDATE SET
			username = excluded.username,
			display_name = excluded.display_name,
			avatar = excluded.avatar,
			updated_at = excluded.updated_at
	`).run(
		user.id,
		user.username,
		displayName,
		user.avatar,
		now,
		now
	);
}

export function createSession(discordUserId: string) {
	const now = Date.now();
	const expiresAt = now + SESSION_LENGTH_MS;

	const token = randomBytes(32).toString('base64url');
	const tokenHash = hashSessionToken(token);

	// Clean up expired sessions.
    db.prepare(`
        DELETE FROM sessions
        WHERE expires_at <= ?
    `).run(now);

    // Only keep the newest Safe Cracker session for this player.
    db.prepare(`
        DELETE FROM sessions
        WHERE discord_user_id = ?
    `).run(discordUserId);

    db.prepare(`
        INSERT INTO sessions (
            token_hash,
            discord_user_id,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?, ?)
    `).run(
        tokenHash,
        discordUserId,
        now,
        expiresAt
    );
}

export function getSessionPlayer(sessionToken: string | undefined) {
	if (!sessionToken) {
		return null;
	}

	const tokenHash = hashSessionToken(sessionToken);
	const now = Date.now();

	const row = db.prepare(`
		SELECT
			p.discord_user_id,
			p.username,
			p.display_name,
			p.avatar
		FROM sessions s
		JOIN players p
			ON p.discord_user_id = s.discord_user_id
		WHERE s.token_hash = ?
		  AND s.expires_at > ?
	`).get(tokenHash, now) as
		| {
				discord_user_id: string;
				username: string;
				display_name: string;
				avatar: string | null;
		  }
		| undefined;

	return row ?? null;
}