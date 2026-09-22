import { env } from '$env/dynamic/public';

type DiscordSdk =
	import('@discord/embedded-app-sdk').DiscordSDK;

export type DiscordIdentity = {
	id: string;
	username: string;
	displayName: string;
	avatar: string | null;
};

let discordSdk: DiscordSdk | null = null;

async function getDiscordSdk(): Promise<DiscordSdk> {
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

	const sdk = new DiscordSDK(clientId);

	await sdk.ready();

	discordSdk = sdk;

	return sdk;
}

function formatSafeNumber(safeNumber: number) {
	return safeNumber.toString().padStart(3, '0');
}

function formatPresenceTime(milliseconds: number) {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${minutes}:${seconds
		.toString()
		.padStart(2, '0')}`;
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
	try {
		const sdk = await getDiscordSdk();

		await sdk.commands.setActivity({
			activity: {
				type: 0,
				details:
					`Cracking Safe #${formatSafeNumber(
						safeNumber
					)}`,
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
	} catch (error) {
		/*
		 * Rich Presence is optional.
		 * Never let it break authentication/gameplay.
		 */
		console.warn(
			'Unable to set Discord playing presence:',
			error
		);
	}
}

export async function setCompletedPresence(
	safeNumber: number,
	attempts: number,
	elapsedMs: number,
	streak: number
) {
	try {
		const sdk = await getDiscordSdk();

		const streakText =
			`${streak} day${streak === 1 ? '' : 's'} streak`;

		await sdk.commands.setActivity({
			activity: {
				type: 0,
				details:
					`Cracked Safe #${formatSafeNumber(
						safeNumber
					)}`,
				state:
					`${attempts} guesses • ` +
					`${formatPresenceTime(elapsedMs)} • ` +
					streakText
			}
		});
	} catch (error) {
		console.warn(
			'Unable to set Discord completed presence:',
			error
		);
	}
}

export async function shareSafeResult(
	playerName: string,
	safeNumber: number,
	attempts: number,
	elapsedMs: number,
	streak: number,
	rank: number | null
) {
	const sdk = await getDiscordSdk();

	const minutes = Math.floor(elapsedMs / 60000);
	const seconds = Math.floor((elapsedMs % 60000) / 1000);
	const hundredths = Math.floor((elapsedMs % 1000) / 10);

	const time =
		`${minutes.toString().padStart(2, '0')}:` +
		`${seconds.toString().padStart(2, '0')}.` +
		`${hundredths.toString().padStart(2, '0')}`;

	const streakText =
		`${streak} Day${streak === 1 ? '' : 's'} Streak`;

	const rankLine =
		rank !== null
			? `🏆 Rank #**${rank}**\n`
			: '';

	const { success } =
		await sdk.commands.shareLink({
			message:
				`# ${playerName} was playing Safe Cracker\n\n` +
				rankLine +
				`🔥 **${streak}** Day Streak\n` +
				`**${attempts}** Guesses • ${time}`,
			custom_id: `safe-${formatSafeNumber(safeNumber)}`
		});

	return success;
}