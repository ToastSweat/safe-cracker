import { db } from '$lib/server/db';

export type DailyRun = {
	discord_user_id: string;
	safe_date: string;
	safe_number: number;
	attempts: number;
	started_at: number | null;
	completed_at: number | null;
	elapsed_ms: number | null;
};

export function getDailyRun(
	discordUserId: string,
	safeDate: string
): DailyRun | null {
	const row = db
		.prepare(`
			SELECT
				discord_user_id,
				safe_date,
				safe_number,
				attempts,
				started_at,
				completed_at,
				elapsed_ms
			FROM daily_runs
			WHERE discord_user_id = ?
			  AND safe_date = ?
		`)
		.get(discordUserId, safeDate) as DailyRun | undefined;

	return row ?? null;
}

export function recordGuess({
	discordUserId,
	safeDate,
	safeNumber,
	combination,
	guess
}: {
	discordUserId: string;
	safeDate: string;
	safeNumber: number;
	combination: number;
	guess: number;
}) {
	const now = Date.now();

	db.exec('BEGIN IMMEDIATE');

	try {
		const existing = getDailyRun(
			discordUserId,
			safeDate
		);

		/*
		 * Once today's safe has been cracked, that run is final.
		 * Reloading/reopening cannot create a better score.
		 */
		if (
			existing &&
			existing.completed_at !== null &&
			existing.elapsed_ms !== null
		) {
			db.exec('COMMIT');

			return {
				result: 'completed' as const,
				attempts: existing.attempts,
				elapsedMs: existing.elapsed_ms,
				startedAt: existing.started_at,
				completedAt: existing.completed_at
			};
		}

		const startedAt =
			existing?.started_at ?? now;

		const attempts =
			(existing?.attempts ?? 0) + 1;

		if (!existing) {
			db.prepare(`
				INSERT INTO daily_runs (
					discord_user_id,
					safe_date,
					safe_number,
					attempts,
					started_at,
					completed_at,
					elapsed_ms
				)
				VALUES (?, ?, ?, ?, ?, NULL, NULL)
			`).run(
				discordUserId,
				safeDate,
				safeNumber,
				attempts,
				startedAt
			);
		} else {
			db.prepare(`
				UPDATE daily_runs
				SET attempts = ?,
					started_at = ?
				WHERE discord_user_id = ?
				  AND safe_date = ?
			`).run(
				attempts,
				startedAt,
				discordUserId,
				safeDate
			);
		}

		if (guess === combination) {
			const completedAt = now;
			const elapsedMs =
				completedAt - startedAt;

			db.prepare(`
				UPDATE daily_runs
				SET completed_at = ?,
					elapsed_ms = ?
				WHERE discord_user_id = ?
				  AND safe_date = ?
			`).run(
				completedAt,
				elapsedMs,
				discordUserId,
				safeDate
			);

			db.exec('COMMIT');

			return {
				result: 'cracked' as const,
				attempts,
				elapsedMs,
				startedAt,
				completedAt
			};
		}

		db.exec('COMMIT');

		return {
			result:
				guess < combination
					? ('higher' as const)
					: ('lower' as const),

			attempts,
			elapsedMs: now - startedAt,
			startedAt,
			completedAt: null
		};
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}