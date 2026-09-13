import { env } from '$env/dynamic/public';
import type { DiscordSDK } from '@discord/embedded-app-sdk';

export type DiscordIdentity = {
	id: string;
	username: string;
	displayName: string;
	avatar: string | null;
};

let discordSdk: DiscordSDK | null = null;

async function getDiscordSdk(): Promise<DiscordSDK> {
	if (discordSdk) {
		return discordSdk;
	}

	const clientId = env.PUBLIC_DISCORD_CLIENT_ID;

	if (!clientId) {
		throw new Error(
			'PUBLIC_DISCORD_CLIENT_ID is not configured.'
		);
	}

	const { DiscordSDK } =
		await import('@discord/embedded-app-sdk');

	discordSdk = new DiscordSDK(clientId);

	await discordSdk.ready();

	return discordSdk;
}

export async function authenticateDiscord(): Promise<DiscordIdentity> {
	const clientId = env.PUBLIC_DISCORD_CLIENT_ID;

	if (!clientId) {
		throw new Error(
			'PUBLIC_DISCORD_CLIENT_ID is not configured.'
		);
	}

	const sdk = await getDiscordSdk();

	const { code } = await sdk.commands.authorize({
		client_id: clientId,
		response_type: 'code',
		state: '',
		prompt: 'none',
		scope: [
			'identify',
			'rpc.activities.write'
		]
	});

	const tokenResponse = await fetch('/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ code })
	});

	if (!tokenResponse.ok) {
		throw new Error(
			'Discord token exchange failed.'
		);
	}

	const { access_token } =
		await tokenResponse.json();

	const auth =
		await sdk.commands.authenticate({
			access_token
		});

	if (!auth?.user) {
		throw new Error(
			'Discord authentication failed.'
		);
	}

	return {
		id: auth.user.id,
		username: auth.user.username,
		displayName:
			auth.user.global_name ??
			auth.user.username,
		avatar: auth.user.avatar ?? null
	};
}

export async function setPlayingPresence(
	safeNumber: number,
	startedAt: number | null = null
) {
	const sdk = await getDiscordSdk();

	await sdk.commands.setActivity({
		activity: {
			type: 0,
			details: `Cracking Safe #${safeNumber
				.toString()
				.padStart(3, '0')}`,
			state: 'Playing the daily safe',
			...(startedAt !== null
				? {
						timestamps: {
							start: Math.floor(
								startedAt / 1000
							)
						}
					}
				: {})
		}
	});
}

export async function setCompletedPresence(
	safeNumber: number,
	attempts: number,
	elapsedMs: number,
	streak: number
) {
	const sdk = await getDiscordSdk();

	const seconds =
		Math.floor(elapsedMs / 1000);

	const minutes =
		Math.floor(seconds / 60);

	const remainder =
		seconds % 60;

	const time =
		`${minutes}:${remainder
			.toString()
			.padStart(2, '0')}`;

	await sdk.commands.setActivity({
		activity: {
			type: 0,
			details: `Cracked Safe #${safeNumber
				.toString()
				.padStart(3, '0')}`,
			state:
				`${attempts} guesses • ${time}` +
				` • ${streak} day streak`
		}
	});
}