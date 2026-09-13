import { json } from '@sveltejs/kit';

import {
	SESSION_COOKIE_NAME,
	getSessionPlayer
} from '$lib/server/auth';

import { getDailySafe } from '$lib/server/dailySafe';
import { getPlayerStats } from '$lib/server/stats';

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

	return json({
		safeNumber: daily.safeNumber,
		...getPlayerStats(
			player.discord_user_id,
			daily.date,
			daily.safeNumber
		)
	});
}