
// Texas Hold'em Poker - Single Player vs AI (Modular)

window.initPokerMinigame = function(container, playerMoney, updateMainGameBalance) {
	// --- Card and Deck Utilities ---
	const SUITS = ['♠', '♥', '♦', '♣'];
	const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

	function createDeck() {
		const deck = [];
		for (const suit of SUITS) {
			for (const rank of RANKS) {
				deck.push({ suit, rank });
			}
		}
		return deck;
	}

	function shuffle(deck) {
		for (let i = deck.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[deck[i], deck[j]] = [deck[j], deck[i]];
		}
	}

	function cardToString(card) {
		return card ? `${card.rank}${card.suit}` : '';
	}

	// --- Game State ---
	let playerChips = (typeof playerMoney === 'number' && !isNaN(playerMoney)) ? playerMoney : 25000;
	let startingChips = playerChips;
	let aiChips = 25000;
	let pot = 0;
	let deck = [];
	let playerHand = [];
	let aiHand = [];
	let communityCards = [];
	let currentBet = 0;
	let playerBet = 0;
	let aiBet = 0;
	let stage = 'preflop'; // preflop, flop, turn, river, showdown
	let playerFolded = false;
	let aiFolded = false;
	let playerActed = false;
	let aiActed = false;
	let message = '';

	// --- DOM Elements (scoped to container) ---
	function q(sel) { return container.querySelector(sel); }
	function qa(sel) { return container.querySelectorAll(sel); }
	const playerCardEls = [q('#player-card-1'), q('#player-card-2')];
	const aiCardEls = qa('.ai-cards .card');
	const commCardEls = [
		q('#comm-card-1'),
		q('#comm-card-2'),
		q('#comm-card-3'),
		q('#comm-card-4'),
		q('#comm-card-5')
	];
	const potEl = q('#pot');
	const playerChipsEl = q('#player-chips');
	const aiChipsEl = q('#ai-chips');
	const messageEl = q('#message');
	const btnFold = q('#btn-fold');
	const btnCheck = q('#btn-check');
	const btnCall = q('#btn-call');
	const btnBet = q('#btn-bet');
	const btnNewGame = q('#btn-newgame');
	const betAmountInput = q('#bet-amount');

	// --- Game Logic ---
	function startNewGame() {
		deck = createDeck();
		shuffle(deck);
		playerHand = [deck.pop(), deck.pop()];
		aiHand = [deck.pop(), deck.pop()];
		communityCards = [];
		pot = 0;
		currentBet = 0;
		playerBet = 0;
		aiBet = 0;
		stage = 'preflop';
		playerFolded = false;
		aiFolded = false;
		playerActed = false;
		aiActed = false;
		message = "";
		updateUI();
		setControls(true);
		if (Math.random() < 0.5) {
			// AI acts first
			setTimeout(aiAction, 700);
		}
	}

	function updateUI(showSummary = false) {
		// Player cards
		for (let i = 0; i < 2; i++) {
			if (playerHand[i]) {
				playerCardEls[i].textContent = cardToString(playerHand[i]);
				playerCardEls[i].classList.remove('back');
			} else {
				playerCardEls[i].textContent = '';
				playerCardEls[i].classList.add('back');
			}
		}
		// AI cards (hidden unless showdown)
		for (let i = 0; i < 2; i++) {
			if (stage === 'showdown' && aiHand[i]) {
				aiCardEls[i].textContent = cardToString(aiHand[i]);
				aiCardEls[i].classList.remove('back');
			} else {
				aiCardEls[i].textContent = '';
				aiCardEls[i].classList.add('back');
			}
		}
		// Community cards
		for (let i = 0; i < 5; i++) {
			if (communityCards[i]) {
				commCardEls[i].textContent = cardToString(communityCards[i]);
				commCardEls[i].classList.remove('back');
			} else {
				commCardEls[i].textContent = '';
				commCardEls[i].classList.add('back');
			}
		}
		// Chips and pot
		playerChipsEl.textContent = playerChips;
		aiChipsEl.textContent = aiChips;
		potEl.textContent = pot;
		// Message or summary
		if (showSummary) {
			let diff = playerChips - startingChips;
			let summary = `You finished with $${playerChips}. `;
			if (diff > 0) summary += `You won $${diff}!`;
			else if (diff < 0) summary += `You lost $${-diff}.`;
			else summary += `You broke even.`;
			messageEl.textContent = summary;
		} else {
			messageEl.textContent = message;
		}
	}

	function setControls(enabled) {
		btnFold.disabled = !enabled;
		btnCheck.disabled = !enabled;
		btnCall.disabled = !enabled;
		btnBet.disabled = !enabled;
		betAmountInput.disabled = !enabled;
	}

	function nextStage() {
		if (stage === 'preflop') {
			communityCards = [deck.pop(), deck.pop(), deck.pop()];
			stage = 'flop';
		} else if (stage === 'flop') {
			communityCards.push(deck.pop());
			stage = 'turn';
		} else if (stage === 'turn') {
			communityCards.push(deck.pop());
			stage = 'river';
		} else if (stage === 'river') {
			stage = 'showdown';
		}
		playerBet = 0;
		aiBet = 0;
		currentBet = 0;
		playerActed = false;
		aiActed = false;
		updateUI();
		if (stage !== 'showdown') {
			setControls(true);
		} else {
			setControls(false);
			setTimeout(showdown, 800);
		}
	}

	function playerFold() {
		playerFolded = true;
		aiChips += pot;
		message = 'You folded. AI wins the pot!';
		setControls(false);
		updateUI();
	}

	function playerCheck() {
		playerActed = true;
		message = 'You check.';
		updateUI();
		setControls(false);
		setTimeout(aiAction, 700);
	}

	function playerCall() {
		const callAmt = currentBet - playerBet;
		if (playerChips < callAmt) return;
		playerChips -= callAmt;
		pot += callAmt;
		playerBet += callAmt;
		playerActed = true;
		message = `You call ${callAmt}.`;
		updateUI();
		setControls(false);
		setTimeout(aiAction, 700);
	}

	function playerBetAction() {
		let betAmt = parseInt(betAmountInput.value, 10);
		if (isNaN(betAmt) || betAmt < 1) return;
		betAmt = Math.min(betAmt, playerChips);
		playerChips -= betAmt;
		pot += betAmt;
		playerBet += betAmt;
		currentBet = playerBet;
		playerActed = true;
		message = `You bet ${betAmt}.`;
		updateUI();
		setControls(false);
		setTimeout(aiAction, 700);
	}

	function aiAction() {
		if (aiFolded || playerFolded) return;
		// Simple AI: random or call/check/fold based on hand strength
		let action = 'call';
		let betAmt = 0;
		if (currentBet === 0) {
			// Randomly check or bet
			if (Math.random() < 0.5 && aiChips > 0) {
				betAmt = Math.min(50, aiChips);
				aiChips -= betAmt;
				pot += betAmt;
				aiBet += betAmt;
				currentBet = aiBet;
				message = `AI bets ${betAmt}.`;
			} else {
				message = 'AI checks.';
			}
		} else {
			// Call or fold
			const callAmt = currentBet - aiBet;
			if (aiChips < callAmt || Math.random() < 0.2) {
				aiFolded = true;
				playerChips += pot;
				message = 'AI folds. You win the pot!';
				setControls(false);
				updateUI();
				return;
			} else {
				aiChips -= callAmt;
				pot += callAmt;
				aiBet += callAmt;
				message = `AI calls ${callAmt}.`;
			}
		}
		updateUI();
		setTimeout(() => {
			if (stage === 'river' || (playerActed && aiActed)) {
				nextStage();
			} else {
				setControls(true);
			}
		}, 700);
		aiActed = true;
	}

	function showdown() {
		// Evaluate hands
		const playerBest = bestHand(playerHand.concat(communityCards));
		const aiBest = bestHand(aiHand.concat(communityCards));
		let winner = '';
		if (playerBest.rank > aiBest.rank) {
			playerChips += pot;
			winner = 'You win the pot!';
		} else if (aiBest.rank > playerBest.rank) {
			aiChips += pot;
			winner = 'AI wins the pot!';
		} else {
			// Tie: split pot
			playerChips += Math.floor(pot / 2);
			aiChips += Math.ceil(pot / 2);
			winner = 'It\'s a tie! Pot is split.';
		}
		message = `Showdown! ${winner}`;
		updateUI();
	}

	// --- Poker Hand Evaluation (simple, not all tiebreakers) ---
	function bestHand(cards) {
		// Returns {rank: number, name: string}
		// 9: Royal Flush, 8: Straight Flush, 7: Four of a Kind, 6: Full House, 5: Flush, 4: Straight, 3: Three of a Kind, 2: Two Pair, 1: Pair, 0: High Card
		// Only for 7 cards, simple version
		const values = cards.map(c => RANKS.indexOf(c.rank));
		const suits = cards.map(c => c.suit);
		// Count occurrences
		const counts = {};
		for (const v of values) counts[v] = (counts[v] || 0) + 1;
		const pairs = Object.values(counts).filter(x => x === 2).length;
		const threes = Object.values(counts).filter(x => x === 3).length;
		const fours = Object.values(counts).filter(x => x === 4).length;
		// Flush
		let flushSuit = null;
		for (const s of SUITS) {
			if (suits.filter(x => x === s).length >= 5) flushSuit = s;
		}
		// Straight
		const uniqVals = [...new Set(values)].sort((a, b) => a - b);
		let straight = false;
		for (let i = 0; i <= uniqVals.length - 5; i++) {
			if (uniqVals[i + 4] - uniqVals[i] === 4) straight = true;
		}
		// Ace-low straight
		if (uniqVals.includes(12) && uniqVals.includes(0) && uniqVals.includes(1) && uniqVals.includes(2) && uniqVals.includes(3)) straight = true;
		// Straight flush
		let straightFlush = false;
		if (flushSuit) {
			const flushCards = cards.filter(c => c.suit === flushSuit).map(c => RANKS.indexOf(c.rank)).sort((a, b) => a - b);
			for (let i = 0; i <= flushCards.length - 5; i++) {
				if (flushCards[i + 4] - flushCards[i] === 4) straightFlush = true;
			}
			// Ace-low straight flush
			if (flushCards.includes(12) && flushCards.includes(0) && flushCards.includes(1) && flushCards.includes(2) && flushCards.includes(3)) straightFlush = true;
		}
		// Royal flush
		let royal = false;
		if (straightFlush && uniqVals.includes(8) && uniqVals.includes(9) && uniqVals.includes(10) && uniqVals.includes(11) && uniqVals.includes(12)) royal = true;
		if (royal) return { rank: 9, name: 'Royal Flush' };
		if (straightFlush) return { rank: 8, name: 'Straight Flush' };
		if (fours) return { rank: 7, name: 'Four of a Kind' };
		if (threes && pairs) return { rank: 6, name: 'Full House' };
		if (flushSuit) return { rank: 5, name: 'Flush' };
		if (straight) return { rank: 4, name: 'Straight' };
		if (threes) return { rank: 3, name: 'Three of a Kind' };
		if (pairs >= 2) return { rank: 2, name: 'Two Pair' };
		if (pairs === 1) return { rank: 1, name: 'Pair' };
		return { rank: 0, name: 'High Card' };
	}

	// --- Event Listeners (scoped) ---
	btnFold.addEventListener('click', playerFold);
	btnCheck.addEventListener('click', playerCheck);
	btnCall.addEventListener('click', playerCall);
	btnBet.addEventListener('click', playerBetAction);
	btnNewGame.addEventListener('click', startNewGame);

	// --- Minigame close: export balance and show summary ---
	function showEndSummaryAndExport() {
		updateUI(true);
		if (typeof updateMainGameBalance === 'function') {
			updateMainGameBalance(playerChips);
		} else if (container && typeof CustomEvent === 'function') {
			container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance: playerChips}}));
		}
		// Send winnings to parent window via postMessage
		if (window.parent !== window) {
			const initialBalance = (typeof playerMoney === 'number' && !isNaN(playerMoney)) ? playerMoney : 25000;
			const winnings = playerChips - initialBalance;
			if (winnings !== 0) {
				window.parent.postMessage({ type: 'casinoWinnings', amount: winnings }, '*');
			}
		}
	}

	// Listen for removal of minigame container to export balance
	const observer = new MutationObserver(() => {
		if (!document.body.contains(container)) {
			showEndSummaryAndExport();
			observer.disconnect();
		}
	});
	observer.observe(document.body, {childList: true});

	// --- Start Game ---
	startNewGame();
};

// Auto-initialize for standalone usage
if (document.currentScript && document.currentScript.src && document.currentScript.src.includes('PokerFP/script.js')) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function() {
			window.initPokerMinigame();
		});
	} else {
		window.initPokerMinigame();
	}
}
