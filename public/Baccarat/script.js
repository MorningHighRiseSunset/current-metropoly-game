// Simple Baccarat Minigame
window.initBaccaratMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

    // --- State ---
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBet = 100;
    let betType = null; // 'player', 'banker', 'tie'
    let playerHand = [];
    let bankerHand = [];
    let deck = [];
    let gamePhase = 'betting'; // 'betting', 'playing', 'result'

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

    function handValue(hand) {
        let value = 0;
        for (const card of hand) {
            if (card.rank === 'A') {
                value += 1;
            } else if (['K', 'Q', 'J', '10'].includes(card.rank)) {
                value += 0;
            } else {
                value += parseInt(card.rank);
            }
        }
        return value % 10; // Baccarat only uses last digit
    }

    // --- UI Functions ---
    function updateBalance() {
        const balanceEl = q('#money-display');
        if (balanceEl) balanceEl.textContent = balance;
        if (typeof updateMainGameBalance === 'function') {
            updateMainGameBalance(balance);
        } else if (container && typeof CustomEvent === 'function') {
            container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance}}));
        }
    }

    function renderCard(card) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        if (card.suit === '♥' || card.suit === '♦') {
            cardEl.classList.add('red');
        }
        cardEl.innerHTML = `
            <div style="font-size: 16px;">${card.rank}</div>
            <div style="font-size: 28px;">${card.suit}</div>
        `;
        return cardEl;
    }

    function renderHands() {
        const playerHandEl = q('#player-cards');
        const bankerHandEl = q('#ai-cards');
        
        if (playerHandEl) {
            playerHandEl.innerHTML = '';
            playerHand.forEach(card => {
                playerHandEl.appendChild(renderCard(card));
            });
        }
        
        if (bankerHandEl) {
            bankerHandEl.innerHTML = '';
            bankerHand.forEach(card => {
                bankerHandEl.appendChild(renderCard(card));
            });
        }
        
        // Update scores
        const playerScoreEl = q('#player-score');
        const bankerScoreEl = q('#ai-score');
        if (playerScoreEl) playerScoreEl.textContent = handValue(playerHand);
        if (bankerScoreEl) bankerScoreEl.textContent = handValue(bankerHand);
    }

    function showResult(text, isWin = false) {
        const resultEl = q('#result');
        if (resultEl) {
            resultEl.textContent = text;
            resultEl.classList.remove('win');
            if (isWin) {
                resultEl.classList.add('win');
            }
        }
    }

    function clearGame() {
        playerHand = [];
        bankerHand = [];
        deck = createDeck();
        shuffle(deck);
        gamePhase = 'betting';
        
        const playerHandEl = q('#player-cards');
        const bankerHandEl = q('#ai-cards');
        const resultEl = q('#result');
        const playerScoreEl = q('#player-score');
        const bankerScoreEl = q('#ai-score');
        const betDisplayEl = q('#current-bet-display');
        
        if (playerHandEl) playerHandEl.innerHTML = '';
        if (bankerHandEl) bankerHandEl.innerHTML = '';
        if (resultEl) resultEl.textContent = '';
        if (playerScoreEl) playerScoreEl.textContent = '0';
        if (bankerScoreEl) bankerScoreEl.textContent = '0';
        if (betDisplayEl) betDisplayEl.textContent = '0';
        
        // Reset buttons
        const betBtns = container.querySelectorAll('.bet-btn');
        betBtns.forEach(btn => {
            btn.classList.remove('selected');
            btn.disabled = false;
        });
        
        const dealBtn = q('#deal-btn');
        if (dealBtn) dealBtn.disabled = false;
    }

    function selectBet(type) {
        if (gamePhase !== 'betting') return;
        
        betType = type;
        
        // Update UI
        const betBtns = container.querySelectorAll('.bet-btn');
        betBtns.forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.type === type) {
                btn.classList.add('selected');
            }
        });
        
        const betDisplayEl = q('#current-bet-display');
        if (betDisplayEl) betDisplayEl.textContent = `$${currentBet}`;
        
        showResult(`Selected ${type.toUpperCase()}. Click Deal!`);
    }

    function deal() {
        if (gamePhase !== 'betting') return;
        if (!betType) {
            showResult('Please select a bet type!');
            return;
        }
        if (currentBet > balance) {
            showResult('Not enough balance!');
            return;
        }
        
        balance -= currentBet;
        updateBalance();
        
        // Disable betting UI
        const betBtns = container.querySelectorAll('.bet-btn');
        betBtns.forEach(btn => btn.disabled = true);
        
        const dealBtn = q('#deal-btn');
        if (dealBtn) dealBtn.disabled = true;
        
        // Deal cards
        deck = createDeck();
        shuffle(deck);
        playerHand = [deck.pop(), deck.pop()];
        bankerHand = [deck.pop(), deck.pop()];
        
        renderHands();
        gamePhase = 'playing';
        
        // Resolve after delay
        setTimeout(() => {
            const playerScore = handValue(playerHand);
            const bankerScore = handValue(bankerHand);
            
            let result = '';
            let isWin = false;
            
            if (playerScore > bankerScore) {
                if (betType === 'player') {
                    balance += currentBet * 2;
                    result = `Player wins! +$${currentBet}`;
                    isWin = true;
                } else {
                    result = `Player wins. You lost $${currentBet}`;
                    isWin = false;
                }
            } else if (bankerScore > playerScore) {
                if (betType === 'banker') {
                    balance += Math.floor(currentBet * 1.95);
                    result = `Banker wins! +$${Math.floor(currentBet * 0.95)}`;
                    isWin = true;
                } else {
                    result = `Banker wins. You lost $${currentBet}`;
                    isWin = false;
                }
            } else {
                // Tie
                if (betType === 'tie') {
                    balance += currentBet * 8;
                    result = `Tie! +$${currentBet * 7}`;
                    isWin = true;
                } else {
                    balance += currentBet; // Push
                    result = `Tie! Bet returned`;
                    isWin = false;
                }
            }
            
            showResult(result, isWin);
            updateBalance();
            gamePhase = 'result';
            
            // Auto-reset after delay
            setTimeout(() => {
                clearGame();
                showResult('Select a bet type to begin!');
            }, 3000);
        }, 1000);
    }

    // --- Event Listeners ---
    const betBtns = container.querySelectorAll('.bet-btn');
    betBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectBet(btn.dataset.type);
        });
    });

    const dealBtn = q('#deal-btn');
    if (dealBtn) {
        dealBtn.addEventListener('click', deal);
    }

    // --- Initialize ---
    clearGame();
    updateBalance();
    showResult('Select a bet type to begin!');
};

// Auto-initialize for standalone usage
if (window.parent === window && document.currentScript && document.currentScript.src && document.currentScript.src.includes('Baccarat/script.js')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.initBaccaratMinigame(document.querySelector('.baccarat-container'), window.playerMoney, window.updateMainGameBalance);
        });
    } else {
        window.initBaccaratMinigame(document.querySelector('.baccarat-container'), window.playerMoney, window.updateMainGameBalance);
    }
}
