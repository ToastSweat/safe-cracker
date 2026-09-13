import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export async function POST({ request }) {
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

	const response = await fetch('https://discord.com/api/oauth2/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'authorization_code',
			code
		})
	});

	if (!response.ok) {
		const error = await response.text();

		console.error('Discord token exchange failed:', error);

		return json(
			{ error: 'Discord token exchange failed' },
			{ status: 502 }
		);
	}

	const data = await response.json();

	if (!data.access_token) {
		console.error('Discord returned no access token.');

		return json(
			{ error: 'Discord returned no access token' },
			{ status: 502 }
		);
	}

	return json({
		access_token: data.access_token
	});
}