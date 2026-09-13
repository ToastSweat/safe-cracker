import { env } from '$env/dynamic/private';

const TIME_ZONE = 'America/Chicago';
const DAY_MS = 86_400_000;

export type DailySafe = {
	date: string;
	safeNumber: number;
	combination: number;
};

function getCentralDate(date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);

	const year = parts.find((part) => part.type === 'year')?.value;
	const month = parts.find((part) => part.type === 'month')?.value;
	const day = parts.find((part) => part.type === 'day')?.value;

	if (!year || !month || !day) {
		throw new Error('Unable to determine Central date.');
	}

	return `${year}-${month}-${day}`;
}

function dateToUtcMilliseconds(date: string): number {
	const [year, month, day] = date.split('-').map(Number);

	return Date.UTC(year, month - 1, day);
}

function getSafeNumber(date: string): number {
	const launchDate = env.SAFE_CRACKER_LAUNCH_DATE;

	if (!launchDate) {
		throw new Error('SAFE_CRACKER_LAUNCH_DATE is not configured.');
	}

	const difference =
		dateToUtcMilliseconds(date) -
		dateToUtcMilliseconds(launchDate);

	return Math.floor(difference / DAY_MS) + 1;
}

async function generateCombination(date: string): Promise<number> {
	const secret = env.SAFE_CRACKER_SECRET;

	if (!secret) {
		throw new Error('SAFE_CRACKER_SECRET is not configured.');
	}

	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{
			name: 'HMAC',
			hash: 'SHA-256'
		},
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		encoder.encode(`daily:${date}`)
	);

	const bytes = new Uint8Array(signature);

	const value =
		((bytes[0] << 24) |
			(bytes[1] << 16) |
			(bytes[2] << 8) |
			bytes[3]) >>>
		0;

	return value % 10000;
}

export async function getDailySafe(): Promise<DailySafe> {
	const date = getCentralDate();
	const safeNumber = getSafeNumber(date);

	if (safeNumber < 1) {
		throw new Error('Safe Cracker has not launched yet.');
	}

	return {
		date,
		safeNumber,
		combination: await generateCombination(date)
	};
}