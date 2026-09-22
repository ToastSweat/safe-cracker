import { json } from '@sveltejs/kit';
import { getDailySafe } from '$lib/server/dailySafe';

const startedAt = Date.now();

export async function GET() {
	const daily = await getDailySafe();

	return json({
		status: 'ok',
		safeNumber: daily.safeNumber,
		date: daily.date,
		uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
	});
}