// Texas Hold'em Poker - Full Game Implementation
window.initPokerMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

    // --- State ---
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBet = 100;
    let pot = 0;
    let playerHand = [];
    let aiHand = [];
    let communityCards = [];
    let deck = [];
    let gamePhase = 'idle'; // 'idle', 'dealt', 'bet', 'turn', 'river', 'showdown'
    let playerBet = 0;
    let aiBet = 0;

    // --- Deck functions ---
    function createDeck() {
        const deck = [];
        for (const suit of suits) {
            for (const rank of ranks) {
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

    // --- Card value mapping ---
    function getCardValue(rank) {
        const valueMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        return valueMap[rank];
    }

    // --- 7-card hand evaluation for Texas Hold'em ---
    function evaluate7CardHand(holeCards, community) {
        const allCards = [...holeCards, ...community];
        const allCombinations = getCombinations(allCards, 5);
        
        let bestHand = null;
        let bestRank = -1;
        
        for (const combo of allCombinations) {
            const evaluation = evaluate5CardHand(combo);
            if (evaluation.rank > bestRank) {
                bestRank = evaluation.rank;
                bestHand = evaluation;
            }
        }
        
        return bestHand;
    }

    function getCombinations(arr, size) {
        if (size === 1) return arr.map(el => [el]);
        const result = [];
        arr.forEach((el, i) => {
            const remaining = arr.slice(i + 1);
            const combinations = getCombinations(remaining, size - 1);
            combinations.forEach(combo => result.push([el, ...combo]));
        });
        return result;
    }

    function evaluate5CardHand(hand) {
        const values = hand.map(c => getCardValue(c.rank)).sort((a, b) => b - a);
        const suitCounts = {};
        const rankCounts = {};
        
        for (const card of hand) {
            suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
            rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
        }
        
        const isFlush = Object.values(suitCounts).some(count => count >= 5);
        const isStraight = checkStraight(values);
        const counts = Object.values(rankCounts).sort((a, b) => b - a);
        
        // Royal Flush
        if (isFlush && isStraight && values[0] === 14 && values[4] === 10) {
            return { rank: 9, name: 'Royal Flush', multiplier: 100 };
        }
        // Straight Flush
        if (isFlush && isStraight) {
            return { rank: 8, name: 'Straight Flush', multiplier: 75 };
        }
        // Four of a Kind
        if (counts[0] === 4) {
            return { rank: 7, name: 'Four of a Kind', multiplier: 50 };
        }
        // Full House
        if (counts[0] === 3 && counts[1] === 2) {
            return { rank: 6, name: 'Full House', multiplier: 25 };
        }
        // Flush
        if (isFlush) {
            return { rank: 5, name: 'Flush', multiplier: 15 };
        }
        // Straight
        if (isStraight) {
            return { rank: 4, name: 'Straight', multiplier: 10 };
        }
        // Three of a Kind
        if (counts[0] === 3) {
            return { rank: 3, name: 'Three of a Kind', multiplier: 8 };
        }
        // Two Pair
        if (counts[0] === 2 && counts[1] === 2) {
            return { rank: 2, name: 'Two Pair', multiplier: 5 };
        }
        // One Pair
        if (counts[0] === 2) {
            return { rank: 1, name: 'Pair', multiplier: 3 };
        }
        // High Card
        return { rank: 0, name: 'High Card', multiplier: 2 };
    }

    function checkStraight(values) {
        const sorted = [...new Set(values)].sort((a, b) => b - a);
        if (sorted.length < 5) return false;
        
        // Check for regular straight
        for (let i = 0; i <= sorted.length - 5; i++) {
            let consecutive = true;
            for (let j = 0; j < 4; j++) {
                if (sorted[i + j] - sorted[i + j + 1] !== 1) {
                    consecutive = false;
                    break;
                }
            }
            if (consecutive) return true;
        }
        
        // Check for wheel (A-2-3-4-5)
        if (sorted.includes(14) && sorted.includes(2) && sorted.includes(3) && sorted.includes(4) && sorted.includes(5)) {
            return true;
        }
        
        return false;
    }

    // --- UI Functions ---
    function updateBalance() {
        const balanceEl = q('#balance');
        if (balanceEl) balanceEl.textContent = balance;
        if (typeof updateMainGameBalance === 'function') {
            updateMainGameBalance(balance);
        } else if (container && typeof CustomEvent === 'function') {
            container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance}}));
        }
    }

    function updatePot() {
        const potEl = q('#pot');
        if (potEl) potEl.textContent = pot;
    }

    function updateCurrentBet() {
        const betEl = q('#current-bet');
        if (betEl) betEl.textContent = currentBet;
    }

    function renderCard(card, faceDown = false) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        
        if (faceDown) {
            cardEl.classList.add('face-down');
        } else {
            if (card.suit === '♥' || card.suit === '♦') {
                cardEl.classList.add('red');
            }
            cardEl.innerHTML = `
                <div style="font-size: 12px; font-weight: bold;">${card.rank}</div>
                <div style="font-size: 20px;">${card.suit}</div>
            `;
        }
        
        return cardEl;
    }

    function renderHands(revealAI = false) {
        const playerHandEl = q('#player-hand');
        const aiHandEl = q('#ai-hand');
        const communityEl = q('#community-cards');
        
        // Render player hand
        if (playerHandEl) {
            playerHandEl.innerHTML = '';
            playerHand.forEach(card => {
                playerHandEl.appendChild(renderCard(card));
            });
        }
        
        // Render AI hand
        if (aiHandEl) {
            aiHandEl.innerHTML = '';
            aiHand.forEach(card => {
                aiHandEl.appendChild(renderCard(card, !revealAI));
            });
        }
        
        // Render community cards
        if (communityEl) {
            communityEl.innerHTML = '';
            for (let i = 0; i < 5; i++) {
                if (i < communityCards.length) {
                    communityEl.appendChild(renderCard(communityCards[i]));
                } else {
                    const slot = document.createElement('div');
                    slot.className = 'card-slot';
                    communityEl.appendChild(slot);
                }
            }
        }
    }

    function showStatus(text) {
        const statusEl = q('#status-message');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    function updateButtons() {
        const actionBtn = q('#action-btn');
        if (!actionBtn) return;
        
        switch (gamePhase) {
            case 'idle':
                actionBtn.textContent = 'Deal';
                actionBtn.disabled = false;
                break;
            case 'dealt':
                actionBtn.textContent = 'Bet';
                actionBtn.disabled = false;
                break;
            case 'bet':
                actionBtn.textContent = 'Turn';
                actionBtn.disabled = false;
                break;
            case 'turn':
                actionBtn.textContent = 'River';
                actionBtn.disabled = false;
                break;
            case 'river':
                actionBtn.textContent = 'Deal';
                actionBtn.disabled = false;
                break;
            case 'showdown':
                actionBtn.textContent = 'Deal';
                actionBtn.disabled = false;
                break;
        }
    }

    function clearGame() {
        playerHand = [];
        aiHand = [];
        communityCards = [];
        deck = createDeck();
        shuffle(deck);
        gamePhase = 'idle';
        pot = 0;
        playerBet = 0;
        aiBet = 0;
        
        const playerResultEl = q('#player-hand-result');
        const aiResultEl = q('#ai-hand-result');
        
        if (playerResultEl) playerResultEl.textContent = '';
        if (aiResultEl) aiResultEl.textContent = '';
        
        // Start with 3 community cards (flop) already visible
        communityCards = [deck.pop(), deck.pop(), deck.pop()];
        
        renderHands(false);
        updatePot();
        updateButtons();
        showStatus('Click Deal to get your cards');
    }

    // --- Game Flow ---
    function handleAction() {
        switch (gamePhase) {
            case 'idle':
                deal();
                break;
            case 'dealt':
                placeBet();
                break;
            case 'bet':
                dealTurn();
                break;
            case 'turn':
                dealRiver();
                break;
            case 'river':
                showdown();
                break;
            case 'showdown':
                clearGame();
                break;
        }
    }

    function deal() {
        if (currentBet > balance) {
            showStatus('Not enough balance!');
            return;
        }
        
        // Deal 2 cards to player and AI
        playerHand = [deck.pop(), deck.pop()];
        aiHand = [deck.pop(), deck.pop()];
        
        renderHands(false);
        gamePhase = 'dealt';
        showStatus('Cards dealt! Click Bet to continue');
        updateButtons();
    }

    function placeBet() {
        balance -= currentBet;
        pot = currentBet * 2; // Player and AI both bet
        updateBalance();
        updatePot();
        
        gamePhase = 'bet';
        showStatus('Bet placed! Click Turn for next card');
        updateButtons();
    }

    function dealTurn() {
        communityCards.push(deck.pop());
        renderHands(false);
        
        gamePhase = 'turn';
        showStatus('Turn dealt! Click River for final card');
        updateButtons();
    }

    function dealRiver() {
        communityCards.push(deck.pop());
        renderHands(false);
        
        gamePhase = 'river';
        showStatus('River dealt! Showdown...');
        updateButtons();
        
        // Auto-trigger showdown after a short delay
        setTimeout(() => {
            showdown();
        }, 1000);
    }

    function showdown() {
        renderHands(true);
        
        const playerEval = evaluate7CardHand(playerHand, communityCards);
        const aiEval = evaluate7CardHand(aiHand, communityCards);
        
        const playerResultEl = q('#player-hand-result');
        const aiResultEl = q('#ai-hand-result');
        
        if (playerResultEl) playerResultEl.textContent = playerEval.name;
        if (aiResultEl) aiResultEl.textContent = aiEval.name;
        
        setTimeout(() => {
            if (playerEval.rank > aiEval.rank) {
                const winAmount = pot;
                balance += winAmount;
                showStatus(`You win! ${playerEval.name} beats ${aiEval.name}. +$${winAmount}`);
            } else if (aiEval.rank > playerEval.rank) {
                showStatus(`AI wins! ${aiEval.name} beats ${playerEval.name}. -$${currentBet}`);
            } else {
                balance += currentBet;
                showStatus(`Tie! Bet returned. Both have ${playerEval.name}.`);
            }
            
            updateBalance();
            pot = 0;
            updatePot();
            gamePhase = 'showdown';
            updateButtons();
        }, 1000);
    }

    // --- Event Listeners ---
    const actionBtn = q('#action-btn');
    if (actionBtn) actionBtn.addEventListener('click', handleAction);

    // --- Initialize ---
    clearGame();
    updateBalance();
    updateCurrentBet();
};

// Auto-initialize for standalone usage
if (window.parent === window && document.currentScript && document.currentScript.src && document.currentScript.src.includes('PokerFP/script.js')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.initPokerMinigame(document.querySelector('.poker-container'), window.playerMoney, window.updateMainGameBalance);
        });
    } else {
        window.initPokerMinigame(document.querySelector('.poker-container'), window.playerMoney, window.updateMainGameBalance);
    }
}
