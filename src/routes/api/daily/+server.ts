import { json } from '@sveltejs/kit';
import { getDailySafe } from '$lib/server/dailySafe';

export async function GET() {
	const daily = await getDailySafe();

	return json({
		date: daily.date,
		safeNumber: daily.safeNumber
	});
}