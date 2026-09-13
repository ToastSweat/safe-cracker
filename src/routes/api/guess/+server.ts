import { json } from '@sveltejs/kit';

import {
	SESSION_COOKIE_NAME,
	getSessionPlayer
} from '$lib/server/auth';

import { getDailySafe } from '$lib/server/dailySafe';
import { recordGuess } from '$lib/server/run';

export async function POST({ request, cookies }) {
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

	const body = await request.json();
	const guess = Number(body.guess);

	if (
		!Number.isInteger(guess) ||
		guess < 0 ||
		guess > 9999
	) {
		return json(
			{ error: 'Invalid guess' },
			{ status: 400 }
		);
	}

	const daily = await getDailySafe();

	const result = recordGuess({
		discordUserId: player.discord_user_id,
		safeDate: daily.date,
		safeNumber: daily.safeNumber,
		combination: daily.combination,
		guess
	});

	if (result.result === 'cracked') {
		return json({
			...result,
			combination: daily.combination
		});
	}

	if (result.result === 'completed') {
		return json({
			...result,
			combination: daily.combination
		});
	}

	return json(result);
}