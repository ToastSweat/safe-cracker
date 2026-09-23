<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		authenticateDiscord,
		setCompletedPresence,
		setPlayingPresence,
		shareSafeResult
	} from '$lib/discord';

	let discordUserId = $state('');
	let discordDisplayName = $state('');
	let discordAuthError = $state('');

	let safeNumber = $state<number | null>(null);
    let dailyDate = $state('');

	let guess = $state('');
    let attempts = $state(0);
    let feedback = $state('');
    let cracked = $state(false);

    let startedAt = $state<number | null>(null);
    let elapsed = $state(0);

	let timer: ReturnType<typeof setInterval> | null = null;
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	
	let guessQueue: Promise<void> = Promise.resolve();
	
	let serverSessionVerified = $state(false);
	
	type LeaderboardEntry = {
		rank: number;
		discordUserId: string;
		displayName: string;
		avatar: string | null;
		attempts: number;
		elapsedMs: number;
	};

	let initializing = $state(true);
	let embeddedInDiscord = $state(false);

	let leaderboard = $state<LeaderboardEntry[]>([]);
	let currentPlayerRank = $state<LeaderboardEntry | null>(null);

	let currentStreak = $state(0);
	let bestStreak = $state(0);
	let totalCompleted = $state(0);
	let totalPlayersToday = $state(0);
	
	const connectingTips = [
		'One safe every day. Make it count.',
		'Fewest guesses wins. Fastest time breaks ties.',
		'The combination is always between 0000 and 9999.',
		'HIGHER means the combination is above your guess.',
		'LOWER means the combination is below your guess.',
		'You only get one completed run per safe.',
		'Once your first guess is submitted, the clock is running.',
		'Closing Safe Cracker does not stop an active timer.',
		'Your run will still be waiting if you come back later.',
		'There is no guess history. Remember your own bounds.',
		'Keep narrowing the range. Panic is optional.',
		'A good first guess can save a lot of work.',
		'Halfway is usually a pretty good place to start.',
		'Fewer guesses matter more than a faster time.',
		'Accuracy first. Speed breaks the tie.',
		'Today’s safe is the same for everyone.',
		'Every player gets the same combination each day.',
		'Your streak survives until you actually miss a day.',
		'Crack today’s safe to keep your streak alive.',
		'The leaderboard resets with each new daily safe.',
		'You can share your result after cracking the safe.',
		'Your Discord profile can show what safe you are cracking.',
		'Try not to forget whether 4200 was too high.',
		'The safe remembers. Even when you do not.',
		'Guess responsibly.',
		'Good guesses open doors.',
		'Bad guesses also open doors. Eventually.',
		'The safe is not judging you. The leaderboard is.',
		'Somewhere, somebody is already doing better than you.',
		'Rank #1 is just last place with fewer witnesses.',
		'There are no loot boxes inside the safe.',
		'The safe contains absolutely no Tactical Safe Pants.',
		'This loading tip is technically gameplay advice.',
		'Hi Mom!',
		'Hi Soul!',
		'Hi Bryce!',
		'Hi Steven!',
		'Have you tried guessing the correct number?',
		'The combination is probably not 0000. Probably.',
		'Remembering numbers builds character. Allegedly.',
		'Safe Cracker does not endorse hitting the safe with a hammer.',
		'The lock is digital. Threatening it will not help.',
		'Please do not lick the keypad.',
		'Management denies rumors that Safe #666 is haunted.',
		'The combination has never been "password."',
		'No safes were harmed in the making of this Activity.',
		'Cosmic Raven Games accepts no responsibility for damaged egos.',
		'Every wrong guess still tells you something.',
		'Discipline opens everything.',
		'Same minds. Bigger wins.',
		'Crack today. Claim tomorrow.'
	];

	let connectingTip = $state(connectingTips[0]);

	async function shareResult() {
		if (
			!cracked ||
			safeNumber === null
		) {
			return;
		}

		try {
			await shareSafeResult(
				discordDisplayName,
				safeNumber,
				attempts,
				elapsed,
				currentStreak,
				currentPlayerRank?.rank ?? null
			);
		} catch (error) {
			console.error(
				'Unable to share Safe Cracker result:',
				error
			);
		}
	}

	async function loadStats() {
		const response = await fetch('/api/stats');

		if (!response.ok) {
			console.error('Unable to load player stats.');
			return;
		}

		const stats = await response.json();

		leaderboard = stats.leaderboard;
		currentPlayerRank = stats.currentPlayer;

		currentStreak = stats.streak.current;
		bestStreak = stats.streak.best;
		totalCompleted = stats.streak.totalCompleted;
		totalPlayersToday = stats.totalPlayers;
	}

	function startTimer() {
		if (timer) return;

		if (startedAt === null) {
			startedAt = Date.now();
		}

		timer = setInterval(() => {
			if (startedAt !== null) {
				elapsed = Date.now() - startedAt;
			}
		}, 10);
	}

	function stopTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function showFeedback(message: string) {
		feedback = message;

		if (feedbackTimer) {
			clearTimeout(feedbackTimer);
		}

		feedbackTimer = setTimeout(() => {
            feedback = '';
        }, 900);
	}

	async function loadRun() {
		const response = await fetch('/api/run');

		if (response.status === 401) {
			return;
		}

		if (!response.ok) {
			console.error('Unable to load daily run.');
			return;
		}

		const run = await response.json();

		attempts = run.attempts;
		elapsed = run.elapsedMs;

		if (run.completed) {
			cracked = true;
			stopTimer();
			feedback = 'SAFE CRACKED';

			await loadStats();

			if (safeNumber !== null) {
				await setCompletedPresence(
					safeNumber,
					run.attempts,
					run.elapsedMs,
					currentStreak
				);
			}

			return;
		}

		if (run.started) {
			startedAt = Date.now() - run.elapsedMs;
			startTimer();
		}

		if (safeNumber !== null) {
			await setPlayingPresence(
				safeNumber,
				startedAt
			);
		}
	}

	function syncRunFromServer(data: {
		attempts: number;
		elapsedMs: number;
	}) {
		attempts = data.attempts;
		elapsed = data.elapsedMs;

		if (!cracked) {
			startedAt = Date.now() - data.elapsedMs;
			startTimer();
		}
	}

	async function completeRun(data: {
		attempts: number;
		elapsedMs: number;
	}) {
		attempts = data.attempts;
		elapsed = data.elapsedMs;
		cracked = true;

		stopTimer();

		if (feedbackTimer) {
			clearTimeout(feedbackTimer);
			feedbackTimer = null;
		}

		feedback = 'SAFE CRACKED';

		await loadStats();

		if (safeNumber !== null) {
			await setCompletedPresence(
				safeNumber,
				data.attempts,
				data.elapsedMs,
				currentStreak
			);
		}
	}

	async function sendGuess(value: number) {
		if (cracked) return;

		const response = await fetch('/api/guess', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				guess: value
			})
		});

		if (!response.ok) {
			if (response.status === 401) {
				throw new Error('Safe Cracker session expired.');
			}

			throw new Error('Unable to submit guess.');
		}

		const data = await response.json();

		if (
			data.result === 'cracked' ||
			data.result === 'completed'
		) {
			await completeRun(data);
			return;
		}

		syncRunFromServer(data);

		if (data.result === 'higher') {
			showFeedback('HIGHER ↑');
			return;
		}

		if (data.result === 'lower') {
			showFeedback('LOWER ↓');
		}
	}

	function queueGuess(value: number) {
		guessQueue = guessQueue
			.then(async () => {
				if (cracked) return;

				await sendGuess(value);
			})
			.catch((error) => {
				console.error('Guess failed:', error);

				showFeedback('ERROR');
			});
	}

    function submitGuess() {
		if (cracked) return;
		if (!guess) return;
		if (!serverSessionVerified) return;

		const value = Number(guess);

		if (
			!Number.isInteger(value) ||
			value < 0 ||
			value > 9999
		) {
			showFeedback('INVALID');
			guess = '';
			return;
		}

		/*
		* Start the visual timer immediately.
		* The server will reconcile the authoritative
		* elapsed time when the response returns.
		*/
		const wasNotStarted = startedAt === null;

		startTimer();

		if (
			wasNotStarted &&
			safeNumber !== null &&
			startedAt !== null
		) {
			void setPlayingPresence(
				safeNumber,
				startedAt
			);
		}

		/*
		* Clear immediately.
		* The player can already enter the next guess.
		*/
		guess = '';

		queueGuess(value);
	}

	function pressDigit(digit: string) {
		if (cracked) return;
		if (guess.length >= 4) return;

		guess += digit;
	}

	function backspace() {
		if (cracked) return;

		guess = guess.slice(0, -1);
	}

	function formatTime(milliseconds: number) {
		const totalSeconds = milliseconds / 1000;
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = Math.floor(totalSeconds % 60);
		const hundredths = Math.floor((milliseconds % 1000) / 10);

		return `${minutes.toString().padStart(2, '0')}:${seconds
			.toString()
			.padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
	}

    function handleKeydown(event: KeyboardEvent) {
        if (cracked) return;

        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            pressDigit(event.key);
            return;
        }

        if (event.key === 'Backspace') {
            event.preventDefault();
            backspace();
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            submitGuess();
        }
    }

	async function setupDiscord() {
		try {
			const user = await authenticateDiscord();

			discordUserId = user.id;
			discordDisplayName = user.displayName;

			const sessionResponse = await fetch('/api/me');

			if (!sessionResponse.ok) {
				throw new Error('Safe Cracker session was not created.');
			}

			const sessionData = await sessionResponse.json();

			if (
				!sessionData.authenticated ||
				sessionData.player.id !== user.id
			) {
				throw new Error('Safe Cracker session identity mismatch.');
			}

			serverSessionVerified = true;

			await loadRun();

			console.log(
				`Discord authenticated: ${user.displayName} (${user.id})`
			);
		} catch (error) {
			console.error('Discord authentication failed:', error);

			discordAuthError =
				error instanceof Error
					? error.message
					: 'Discord authentication failed.';
		}
	}

	async function loadDaily() {
		const response = await fetch('/api/daily');

		if (!response.ok) {
			console.error('Unable to load daily safe.');
			return;
		}

		const daily = await response.json();

		safeNumber = daily.safeNumber;
		dailyDate = daily.date;
	}

    async function initializeApp() {
		try {
			await loadDaily();

			embeddedInDiscord =
				window.self !== window.top;

			if (!embeddedInDiscord) {
				return;
			}

			await setupDiscord();
		} finally {
			initializing = false;
		}
	}

	onMount(() => {
		connectingTip =
			connectingTips[
				Math.floor(Math.random() * connectingTips.length)
			];

		void initializeApp();
	});

	onDestroy(() => {
		stopTimer();

		if (feedbackTimer) {
			clearTimeout(feedbackTimer);
		}
	});
</script>

<svelte:head>
	<title>Safe Cracker</title>

	<meta
		name="description"
		content="Crack the daily safe using as few guesses as possible."
	/>
</svelte:head>
<svelte:window onkeydown={handleKeydown} />

<main>
	{#if initializing}
		<section class="connecting-screen">
			<img
				class="connecting-logo"
				src="/images/connecting/Connecting_Logo.png"
				alt="Safe Cracker"
			/>

			<img
				class="connecting-spinner"
				src="/images/connecting/Connecting_Spinner.png"
				alt=""
			/>

			<img
				class="connecting-title"
				src="/images/connecting/Connecting_Connecting_Text.png"
				alt="Connecting..."
			/>

			<p class="connecting-tip">
				{connectingTip}
			</p>

			<p class="connecting-copyright">
				©2026 COSMIC RAVEN GAMES. ALL RIGHTS RESERVED.
			</p>
		</section>

	{:else if !embeddedInDiscord}
		<section class="loading-screen">
			<p class="eyebrow">SAFE CRACKER</p>
			<h1>DISCORD ACTIVITY</h1>
			<p class="range">
				Launch Safe Cracker from Discord to play.
			</p>
		</section>

	{:else}
		<section class="game">
		<div class="heading">
			<p class="eyebrow">
                {#if safeNumber !== null}
                    DAILY SAFE #{safeNumber.toString().padStart(3, '0')}
                {:else}
                    DAILY SAFE
                {/if}
            </p>
			<h1>SAFE CRACKER</h1>
			<p class="range">Combination range: 0000–9999</p>
		
			
			{#if discordDisplayName && serverSessionVerified}
				<p class="range">
					Authenticated as {discordDisplayName} • Session verified
				</p>
			{:else if discordAuthError}
				<p class="range">Discord auth failed</p>
			{/if}
		</div>

		<div class:cracked class="safe-display">
			<div class="screen">
				{#if cracked}
					OPEN
				{:else}
					{guess.padEnd(4, '_')}
				{/if}
			</div>

			<div class="feedback" class:visible={feedback !== ''}>
                {feedback}
            </div>
		</div>

		<form
			onsubmit={(event) => {
				event.preventDefault();
				submitGuess();
			}}
		>
			<input
				aria-label="Safe combination"
				bind:value={guess}
				inputmode="numeric"
				maxlength="4"
				pattern="[0-9]*"
				disabled={cracked}
				autocomplete="off"
			/>

			<div class="keypad">
				{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
					<button type="button" onclick={() => pressDigit(digit)} disabled={cracked}>
						{digit}
					</button>
				{/each}

				<button type="button" class="utility" onclick={backspace} disabled={cracked}>
					⌫
				</button>

				<button type="button" onclick={() => pressDigit('0')} disabled={cracked}>
					0
				</button>

				<button type="submit" class="enter" disabled={cracked || !guess}>
					↵
				</button>
			</div>
		</form>

		<div class="stats">
			<div>
				<span>ATTEMPT</span>
				<strong>{attempts}</strong>
			</div>

			<div>
				<span>TIME</span>
				<strong>{formatTime(elapsed)}</strong>
			</div>
		</div>

		{#if cracked}
			<div class="victory">
				<p>SAFE OPEN</p>
				<strong>{attempts} guesses</strong>
				<span>{formatTime(elapsed)}</span>
			</div>

			<button
				type="button"
				class="share-result"
				onclick={shareResult}
			>
				SHARE RESULT
			</button>

			<div class="postgame-stats">
				<div class="streak-grid">
					<div>
						<span>CURRENT STREAK</span>
						<strong>{currentStreak}</strong>
					</div>

					<div>
						<span>BEST STREAK</span>
						<strong>{bestStreak}</strong>
					</div>

					<div>
						<span>SAFES CRACKED</span>
						<strong>{totalCompleted}</strong>
					</div>
				</div>

				<div class="leaderboard">
					<div class="leaderboard-heading">
						<strong>TODAY'S LEADERBOARD</strong>
						<span>
							{totalPlayersToday}
							{totalPlayersToday === 1
								? ' CRACKER'
								: ' CRACKERS'}
						</span>
					</div>

					{#each leaderboard as entry}
						<div
							class="leaderboard-row"
							class:you={
								entry.discordUserId === discordUserId
							}
						>
							<span class="rank">
								#{entry.rank}
							</span>

							<span class="player">
								{entry.displayName}

								{#if entry.discordUserId === discordUserId}
									<small>YOU</small>
								{/if}
							</span>

							<span>
								{entry.attempts} guesses
							</span>

							<span class="leaderboard-time">
								{formatTime(entry.elapsedMs)}
							</span>
						</div>
					{/each}

					{#if
						currentPlayerRank &&
						!leaderboard.some(
							(entry) =>
								entry.discordUserId ===
								currentPlayerRank?.discordUserId
						)
					}
						<div class="leaderboard-divider">
							•••
						</div>

						<div class="leaderboard-row you">
							<span class="rank">
								#{currentPlayerRank.rank}
							</span>

							<span class="player">
								{currentPlayerRank.displayName}
								<small>YOU</small>
							</span>

							<span>
								{currentPlayerRank.attempts}
								guesses
							</span>

							<span class="leaderboard-time">
								{formatTime(
									currentPlayerRank.elapsedMs
								)}
							</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}
		</section>
	{/if}
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		background: #111;
		color: #eee;
		font-family:
			Arial,
			Helvetica,
			sans-serif;
	}

	button,
	input {
		font: inherit;
	}

	main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 2rem 1rem;
	}

	.game {
		width: min(100%, 420px);
	}

	.heading {
		text-align: center;
		margin-bottom: 2rem;
	}

	.eyebrow {
		margin: 0 0 0.4rem;
		font-size: 0.75rem;
		letter-spacing: 0.25em;
		color: #999;
	}

	h1 {
		margin: 0;
		font-size: 2.4rem;
		letter-spacing: 0.08em;
	}

	.range {
		color: #888;
		font-size: 0.9rem;
	}

	.safe-display {
		background: #222;
		border: 2px solid #555;
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1rem;
		transition:
			border-color 150ms ease,
			transform 150ms ease;
	}

	.safe-display.cracked {
		border-color: #aaa;
		transform: scale(1.01);
	}

	.screen {
		background: #070707;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 1rem;
		text-align: center;
		font-family: 'Courier New', monospace;
		font-size: 2.5rem;
		font-weight: bold;
		letter-spacing: 0.3em;
		min-height: 78px;
	}

	.feedback {
		height: 2rem;
		margin-top: 0.75rem;
		display: grid;
		place-items: center;
		font-weight: bold;
		letter-spacing: 0.15em;
		opacity: 0;
		transition: opacity 250ms ease;
	}

	.feedback.visible {
		opacity: 1;
	}

	form > input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.keypad {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.keypad button {
		height: 64px;
		background: #2b2b2b;
		color: white;
		border: 1px solid #555;
		border-radius: 5px;
		font-size: 1.4rem;
		cursor: pointer;
	}

	.keypad button:hover:not(:disabled) {
		background: #383838;
	}

	.keypad button:active:not(:disabled) {
		transform: translateY(1px);
	}

	.keypad button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.keypad .utility,
	.keypad .enter {
		font-size: 1.2rem;
	}

	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.stats div {
		background: #191919;
		border: 1px solid #333;
		padding: 0.85rem;
		text-align: center;
	}

	.stats span {
		display: block;
		color: #777;
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		margin-bottom: 0.25rem;
	}

	.stats strong {
		font-family: 'Courier New', monospace;
		font-size: 1.15rem;
	}

	.victory {
		margin-top: 1rem;
		padding: 1rem;
		text-align: center;
		border: 1px solid #555;
		background: #181818;
	}

	.victory p {
		margin: 0 0 0.5rem;
		font-weight: bold;
		letter-spacing: 0.15em;
	}

	.victory strong,
	.victory span {
		display: block;
		margin-top: 0.25rem;
	}

	.loading-screen {
		width: min(100%, 420px);
		text-align: center;
	}

	.postgame-stats {
		margin-top: 1rem;
	}

	.streak-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.streak-grid div {
		background: #191919;
		border: 1px solid #333;
		padding: 0.75rem 0.4rem;
		text-align: center;
	}

	.streak-grid span {
		display: block;
		color: #777;
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		margin-bottom: 0.3rem;
	}

	.streak-grid strong {
		font-family: 'Courier New', monospace;
		font-size: 1.2rem;
	}

	.leaderboard {
		margin-top: 1rem;
		border: 1px solid #333;
		background: #151515;
	}

	.leaderboard-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.8rem;
		border-bottom: 1px solid #333;
	}

	.leaderboard-heading strong {
		font-size: 0.75rem;
		letter-spacing: 0.12em;
	}

	.leaderboard-heading span {
		color: #777;
		font-size: 0.65rem;
	}

	.leaderboard-row {
		display: grid;
		grid-template-columns: 44px 1fr auto auto;
		gap: 0.65rem;
		align-items: center;
		padding: 0.7rem 0.8rem;
		border-bottom: 1px solid #252525;
		font-size: 0.75rem;
	}

	.leaderboard-row:last-child {
		border-bottom: 0;
	}

	.leaderboard-row.you {
		background: #202020;
	}

	.rank {
		font-family: 'Courier New', monospace;
		font-weight: bold;
	}

	.player {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.player small {
		margin-left: 0.35rem;
		color: #888;
		font-size: 0.55rem;
		letter-spacing: 0.08em;
	}

	.leaderboard-time {
		font-family: 'Courier New', monospace;
	}

	.leaderboard-divider {
		text-align: center;
		color: #555;
		padding: 0.3rem;
		border-bottom: 1px solid #252525;
	}

	.share-result {
		width: 100%;
		margin-top: 1rem;
		padding: 0.9rem;
		background: #222;
		color: #eee;
		border: 1px solid #555;
		font-weight: bold;
		letter-spacing: 0.12em;
		cursor: pointer;
	}

	.share-result:hover {
		background: #2b2b2b;
	}

	.connecting-screen {
		position: fixed;
		inset: 0;
		overflow: hidden;

		display: flex;
		flex-direction: column;
		align-items: center;

		background:
			url('/images/connecting/Connecting_Background_1.png')
			center center / cover no-repeat;

		color: white;
	}

	.connecting-logo {
		position: absolute;

		top: 3.5%;
		left: 50%;

		width: clamp(320px, 39vw, 610px);
		height: auto;

		transform: translateX(-50%);

		user-select: none;
		pointer-events: none;
	}

	.connecting-spinner {
		position: absolute;

		top: 39%;
		left: 50%;

		width: clamp(115px, 13vw, 190px);
		height: auto;

		transform: translate(-50%, -50%);

		animation: connecting-spin 1.4s linear infinite;

		user-select: none;
		pointer-events: none;
	}

	.connecting-title {
		position: absolute;

		top: 52%;
		left: 50%;

		width: clamp(390px, 51vw, 800px);
		height: auto;

		transform: translateX(-50%);

		user-select: none;
		pointer-events: none;
	}

	.connecting-tip {
		position: absolute;

		left: 10.5%;
		right: 10.5%;
		bottom: 10.5%;

		margin: 0;

		color: #fff;

		font-family: 'Orbitron', sans-serif;
		src: url('/fonts/Orbitron-Regular.ttf') format('truetype');
		font-size: clamp(1.25rem, 1.75vw, 1.85rem);
		font-weight: 500;
		line-height: 36px;
		letter-spacing: 0;
		font-style: normal;
		font-display: swap;

		text-align: center;
	}

	.connecting-copyright {
		position: absolute;

		right: 1%;
		bottom: 0.8%;

		margin: 0;

		color: rgba(90, 105, 235, 0.9);

		font-family: 'Orbitron', sans-serif;
		font-weight: 500;
		font-size: clamp(0.75rem, 1.35vw, 1.15rem);
		letter-spacing: 0;

		white-space: nowrap;
	}

	@keyframes connecting-spin {
		from {
			transform: translate(-50%, -50%) rotate(0deg);
		}

		to {
			transform: translate(-50%, -50%) rotate(360deg);
		}
	}
</style>