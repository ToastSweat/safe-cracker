import { db } from '$lib/server/db';

type LeaderboardRow = {
	discord_user_id: string;
	display_name: string;
	avatar: string | null;
	attempts: number;
	elapsed_ms: number;
	completed_at: number;
};

function toLeaderboardEntry(row: LeaderboardRow, rank: number) {
	return {
		rank,
		discordUserId: row.discord_user_id,
		displayName: row.display_name,
		avatar: row.avatar,
		attempts: row.attempts,
		elapsedMs: row.elapsed_ms
	};
}

export function getPlayerStats(
	discordUserId: string,
	safeDate: string,
	currentSafeNumber: number,
	limit = 10
) {
	const rows = db
		.prepare(`
			SELECT
				r.discord_user_id,
				p.display_name,
				p.avatar,
				r.attempts,
				r.elapsed_ms,
				r.completed_at
			FROM daily_runs r
			JOIN players p
				ON p.discord_user_id = r.discord_user_id
			WHERE r.safe_date = ?
			  AND r.completed_at IS NOT NULL
			  AND r.elapsed_ms IS NOT NULL
			ORDER BY
				r.attempts ASC,
				r.elapsed_ms ASC,
				r.completed_at ASC
		`)
		.all(safeDate) as LeaderboardRow[];

	const currentIndex = rows.findIndex(
		(row) => row.discord_user_id === discordUserId
	);

	const leaderboard = rows
		.slice(0, limit)
		.map((row, index) =>
			toLeaderboardEntry(row, index + 1)
		);

	const currentPlayer =
		currentIndex >= 0
			? toLeaderboardEntry(
					rows[currentIndex],
					currentIndex + 1
				)
			: null;

	const completedRows = db
		.prepare(`
			SELECT safe_number
			FROM daily_runs
			WHERE discord_user_id = ?
			  AND completed_at IS NOT NULL
			ORDER BY safe_number ASC
		`)
		.all(discordUserId) as {
			safe_number: number;
		}[];

	const completedSafeNumbers = [
		...new Set(
			completedRows.map((row) => row.safe_number)
		)
	];

	let bestStreak = 0;
	let runningStreak = 0;
	let previousSafe: number | null = null;

	for (const safeNumber of completedSafeNumbers) {
		if (
			previousSafe !== null &&
			safeNumber === previousSafe + 1
		) {
			runningStreak++;
		} else {
			runningStreak = 1;
		}

		bestStreak = Math.max(
			bestStreak,
			runningStreak
		);

		previousSafe = safeNumber;
	}

	const completedSet = new Set(
		completedSafeNumbers
	);

	/*
	 * If today's safe isn't completed yet, yesterday is
	 * still allowed to be the end of the current streak.
	 * The streak doesn't break until the day is actually missed.
	 */
	let streakAnchor = completedSet.has(
		currentSafeNumber
	)
		? currentSafeNumber
		: currentSafeNumber - 1;

	let currentStreak = 0;

	while (
		streakAnchor >= 1 &&
		completedSet.has(streakAnchor)
	) {
		currentStreak++;
		streakAnchor--;
	}

	return {
		leaderboard,
		currentPlayer,
		totalPlayers: rows.length,
		streak: {
			current: currentStreak,
			best: bestStreak,
			totalCompleted:
				completedSafeNumbers.length
		}
	};
}