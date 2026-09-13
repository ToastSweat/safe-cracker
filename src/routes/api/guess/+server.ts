import { json } from '@sveltejs/kit';
import { getDailySafe } from '$lib/server/dailySafe';

export async function POST({ request }) {
	const body = await request.json();

	const guess = Number(body.guess);

	if (
		!Number.isInteger(guess) ||
		guess < 0 ||
		guess > 9999
	) {
		return json(
			{
				error: 'Invalid guess'
			},
			{
				status: 400
			}
		);
	}

	const daily = await getDailySafe();

	if (guess === daily.combination) {
		return json({
			result: 'cracked'
		});
	}

	if (guess < daily.combination) {
		return json({
			result: 'higher'
		});
	}

	return json({
		result: 'lower'
	});
}