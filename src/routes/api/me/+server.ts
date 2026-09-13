import { json } from '@sveltejs/kit';

import {
	SESSION_COOKIE_NAME,
	getSessionPlayer
} from '$lib/server/auth';

export function GET({ cookies }) {
	const sessionToken = cookies.get(SESSION_COOKIE_NAME);
	const player = getSessionPlayer(sessionToken);

	if (!player) {
		return json(
			{
				authenticated: false
			},
			{
				status: 401
			}
		);
	}

	return json({
		authenticated: true,
		player: {
			id: player.discord_user_id,
			username: player.username,
			displayName: player.display_name,
			avatar: player.avatar
		}
	});
}