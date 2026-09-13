import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

import {
	SESSION_COOKIE_NAME,
	createSession,
	upsertPlayer,
	type DiscordUser
} from '$lib/server/auth';

export async function POST({ request, cookies }) {
	const { code } = await request.json();

	if (!code || typeof code !== 'string') {
		return json(
			{ error: 'Missing authorization code' },
			{ status: 400 }
		);
	}

	const clientId = publicEnv.PUBLIC_DISCORD_CLIENT_ID;
	const clientSecret = privateEnv.DISCORD_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		console.error('Discord OAuth environment variables are not configured.');

		return json(
			{ error: 'Discord OAuth is not configured' },
			{ status: 500 }
		);
	}

	const tokenResponse = await fetch(
		'https://discord.com/api/oauth2/token',
		{
			method: 'POST',
			headers: {
				'Content-Type':
					'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'authorization_code',
				code
			})
		}
	);

	if (!tokenResponse.ok) {
		const error = await tokenResponse.text();

		console.error(
			'Discord token exchange failed:',
			error
		);

		return json(
			{ error: 'Discord token exchange failed' },
			{ status: 502 }
		);
	}

	const tokenData = await tokenResponse.json();

	if (!tokenData.access_token) {
		return json(
			{ error: 'Discord returned no access token' },
			{ status: 502 }
		);
	}

	/*
	 * Don't trust identity supplied by the browser.
	 *
	 * Ask Discord directly which user owns the
	 * access token we just received.
	 */
	const userResponse = await fetch(
		'https://discord.com/api/users/@me',
		{
			headers: {
				Authorization: `Bearer ${tokenData.access_token}`
			}
		}
	);

	if (!userResponse.ok) {
		const error = await userResponse.text();

		console.error(
			'Unable to retrieve Discord user:',
			error
		);

		return json(
			{ error: 'Unable to retrieve Discord user' },
			{ status: 502 }
		);
	}

	const discordUser =
		(await userResponse.json()) as DiscordUser;

	upsertPlayer(discordUser);

	const session = createSession(discordUser.id);

	cookies.set(
		SESSION_COOKIE_NAME,
		session.token,
		{
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'none',
			expires: new Date(session.expiresAt)
		}
	);

	return json({
		access_token: tokenData.access_token
	});
}