import { json } from '@sveltejs/kit';

import {
	SESSION_COOKIE_NAME,
	getSessionPlayer
} from '$lib/server/auth';

import { getDailySafe } from '$lib/server/dailySafe';
import { getDailyRun } from '$lib/server/run';

export async function GET({ cookies }) {
	const sessionToken =
		cookies.get(SESSION_COOKIE_NAME);

	const player =
		getSessionPlayer(sessionToken);

	if (!player) {
		return json(
			{ error: 'Authentication required' },
			{ status: 401 }
		);
	}

	const daily = await getDailySafe();

	const run = getDailyRun(
		player.discord_user_id,
		daily.date
	);

	if (!run) {
		return json({
			started: false,
			completed: false,
			attempts: 0,
			elapsedMs: 0
		});
	}

	if (
		run.completed_at !== null &&
		run.elapsed_ms !== null
	) {
		return json({
			started: true,
			completed: true,
			attempts: run.attempts,
			elapsedMs: run.elapsed_ms,
			combination: daily.combination
		});
	}

	return json({
		started: true,
		completed: false,
		attempts: run.attempts,
		elapsedMs:
			run.started_at === null
				? 0
				: Date.now() - run.started_at
	});
}