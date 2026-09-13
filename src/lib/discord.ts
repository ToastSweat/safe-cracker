import { env } from '$env/dynamic/public';

export type DiscordIdentity = {
	id: string;
	username: string;
	displayName: string;
	avatar: string | null;
};

export async function authenticateDiscord(): Promise<DiscordIdentity> {
	const clientId = env.PUBLIC_DISCORD_CLIENT_ID;

	if (!clientId) {
		throw new Error('PUBLIC_DISCORD_CLIENT_ID is not configured.');
	}

	const { DiscordSDK } = await import('@discord/embedded-app-sdk');

	const discordSdk = new DiscordSDK(clientId);

	await discordSdk.ready();

	const { code } = await discordSdk.commands.authorize({
		client_id: clientId,
		response_type: 'code',
		state: '',
		prompt: 'none',
		scope: ['identify']
	});

	const tokenResponse = await fetch('/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ code })
	});

	if (!tokenResponse.ok) {
		throw new Error('Discord token exchange failed.');
	}

	const { access_token } = await tokenResponse.json();

	const auth = await discordSdk.commands.authenticate({
		access_token
	});

	if (!auth?.user) {
		throw new Error('Discord authentication failed.');
	}

	return {
		id: auth.user.id,
		username: auth.user.username,
		displayName: auth.user.global_name ?? auth.user.username,
		avatar: auth.user.avatar ?? null
	};
}