<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { authenticateDiscord } from '$lib/discord';

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
	
	let serverSessionVerified = $state(false);

	function startTimer() {
		if (startedAt !== null) return;

		startedAt = Date.now();

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

    async function submitGuess() {
        if (cracked) return;
        if (!guess) return;

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

        startTimer();
        attempts++;

        // Clear immediately so the game stays fast and responsive.
        guess = '';

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
            showFeedback('ERROR');
            return;
        }

        const data = await response.json();

        if (data.result === 'cracked') {
            cracked = true;

            if (startedAt !== null) {
                elapsed = Date.now() - startedAt;
            }

            stopTimer();
            feedback = 'SAFE CRACKED';
            return;
        }

        if (data.result === 'higher') {
            showFeedback('HIGHER ↑');
            return;
        }

        showFeedback('LOWER ↓');
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

    onMount(() => {
		void loadDaily();

		// Discord Activities run inside an iframe.
		// Keep the normal web version usable during development.
		if (window.self !== window.top) {
			void setupDiscord();
		}
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
		{/if}
	</section>
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
</style>