// Modern Blackjack Minigame - Simplified One-Round Version
window.initBlackjackMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

    // --- State ---
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBet = 0;
    let playerHand = [];
    let dealerHand = [];
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
        let aces = 0;
        for (const card of hand) {
            if (card.rank === 'A') {
                value += 11;
                aces++;
            } else if (['K', 'Q', 'J'].includes(card.rank)) {
                value += 10;
            } else {
                value += parseInt(card.rank);
            }
        }
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }
        return value;
    }

    // --- UI Functions ---
    function updateBalance() {
        const balanceEl = q('#balance');
        if (balanceEl) balanceEl.textContent = `$${balance}`;
        if (typeof updateMainGameBalance === 'function') {
            updateMainGameBalance(balance);
        } else if (container && typeof CustomEvent === 'function') {
            container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance}}));
        }
    }

    function renderCard(card, isPlayer, index) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        cardEl.style.cssText = `
            width: 80px;
            height: 120px;
            background: linear-gradient(145deg, #1a1a2e, #16213e);
            border: 2px solid ${card.suit === '♥' || card.suit === '♦' ? '#e74c3c' : '#27ae60'};
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 5px;
            color: ${card.suit === '♥' || card.suit === '♦' ? '#e74c3c' : '#27ae60'};
            font-size: 24px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            animation: dealCard 0.3s ease-out;
            position: relative;
        `;
        
        cardEl.innerHTML = `
            <div style="font-size: 18px; position: absolute; top: 8px; left: 8px;">${card.rank}</div>
            <div style="font-size: 32px;">${card.suit}</div>
            <div style="font-size: 18px; position: absolute; bottom: 8px; right: 8px; transform: rotate(180deg);">${card.rank}</div>
        `;
        
        return cardEl;
    }

    function renderHands(revealDealer = false) {
        const playerHandEl = q('#player-hand');
        const dealerHandEl = q('#dealer-hand');
        
        if (playerHandEl) {
            playerHandEl.innerHTML = '';
            playerHand.forEach((card, index) => {
                const cardEl = renderCard(card, true, index);
                cardEl.style.animationDelay = `${index * 0.1}s`;
                playerHandEl.appendChild(cardEl);
            });
        }
        
        if (dealerHandEl) {
            dealerHandEl.innerHTML = '';
            dealerHand.forEach((card, index) => {
                if (index === 1 && !revealDealer) {
                    // Face down card
                    const cardEl = document.createElement('div');
                    cardEl.className = 'card face-down';
                    cardEl.style.cssText = `
                        width: 80px;
                        height: 120px;
                        background: linear-gradient(145deg, #8e44ad, #9b59b6);
                        border: 2px solid #9b59b6;
                        border-radius: 12px;
                        margin: 5px;
                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    `;
                    cardEl.innerHTML = '<div style="font-size: 24px;">🂠</div>';
                    dealerHandEl.appendChild(cardEl);
                } else {
                    const cardEl = renderCard(card, false, index);
                    cardEl.style.animationDelay = `${index * 0.1}s`;
                    dealerHandEl.appendChild(cardEl);
                }
            });
        }
        
        // Update scores
        const playerScoreEl = q('#player-score');
        const dealerScoreEl = q('#dealer-score');
        if (playerScoreEl) playerScoreEl.textContent = handValue(playerHand);
        if (dealerScoreEl && revealDealer) dealerScoreEl.textContent = handValue(dealerHand);
        else if (dealerScoreEl) dealerScoreEl.textContent = '?';
    }

    function clearGame() {
        playerHand = [];
        dealerHand = [];
        deck = createDeck();
        shuffle(deck);
        gamePhase = 'betting';
        
        const playerHandEl = q('#player-hand');
        const dealerHandEl = q('#dealer-hand');
        const resultEl = q('#result');
        const playerScoreEl = q('#player-score');
        const dealerScoreEl = q('#dealer-score');
        
        if (playerHandEl) playerHandEl.innerHTML = '';
        if (dealerHandEl) dealerHandEl.innerHTML = '';
        if (resultEl) resultEl.textContent = '';
        if (playerScoreEl) playerScoreEl.textContent = '0';
        if (dealerScoreEl) dealerScoreEl.textContent = '0';
        
        // Reset buttons
        const hitBtn = q('#hit-btn');
        const standBtn = q('#stand-btn');
        const dealBtn = q('#deal-btn');
        
        if (hitBtn) hitBtn.disabled = true;
        if (standBtn) standBtn.disabled = true;
        if (dealBtn) dealBtn.disabled = false;
    }

    function placeBet(amount) {
        if (gamePhase !== 'betting') return;
        if (amount > balance) {
            showResult('Not enough balance!');
            return;
        }
        
        currentBet = amount;
        balance -= amount;
        updateBalance();
        
        const betEl = q('#current-bet');
        if (betEl) betEl.textContent = `$${currentBet}`;
        
        // Start game
        gamePhase = 'playing';
        startRound();
    }

    function startRound() {
        // Deal initial cards
        playerHand = [deck.pop(), deck.pop()];
        dealerHand = [deck.pop(), deck.pop()];
        
        renderHands(false);
        
        // Enable hit/stand buttons
        const hitBtn = q('#hit-btn');
        const standBtn = q('#stand-btn');
        const dealBtn = q('#deal-btn');
        
        if (hitBtn) hitBtn.disabled = false;
        if (standBtn) standBtn.disabled = false;
        if (dealBtn) dealBtn.disabled = true;
        
        // Check for blackjack
        const playerScore = handValue(playerHand);
        if (playerScore === 21) {
            endRound();
        }
    }

    function hit() {
        if (gamePhase !== 'playing') return;
        
        const card = deck.pop();
        playerHand.push(card);
        renderHands(false);
        
        const playerScore = handValue(playerHand);
        if (playerScore > 21) {
            endRound();
        } else if (playerScore === 21) {
            stand();
        }
    }

    function stand() {
        if (gamePhase !== 'playing') return;
        
        // Dealer plays
        let dealerScore = handValue(dealerHand);
        while (dealerScore < 17) {
            dealerHand.push(deck.pop());
            dealerScore = handValue(dealerHand);
        }
        
        renderHands(true);
        endRound();
    }

    function endRound() {
        gamePhase = 'result';
        
        const playerScore = handValue(playerHand);
        const dealerScore = handValue(dealerHand);
        
        let result = '';
        let win = false;
        
        if (playerScore > 21) {
            result = 'Bust! You lose.';
            win = false;
        } else if (dealerScore > 21) {
            result = 'Dealer busts! You win!';
            balance += currentBet * 2;
            win = true;
        } else if (playerScore > dealerScore) {
            result = 'You win!';
            balance += currentBet * 2;
            win = true;
        } else if (playerScore === dealerScore) {
            result = 'Push!';
            balance += currentBet;
        } else {
            result = 'Dealer wins.';
            win = false;
        }
        
        updateBalance();
        showResult(result, win);
        
        // Reset for next round
        setTimeout(() => {
            clearGame();
            currentBet = 0;
            const betEl = q('#current-bet');
            if (betEl) betEl.textContent = '$0';
        }, 3000);
    }

    function showResult(text, isWin = null) {
        const resultEl = q('#result');
        if (resultEl) {
            resultEl.textContent = text;
            resultEl.classList.remove('win', 'lose');
            if (isWin === true) {
                resultEl.classList.add('win');
            } else if (isWin === false) {
                resultEl.classList.add('lose');
            }
            resultEl.style.animation = 'none';
            resultEl.offsetHeight; // Trigger reflow
            resultEl.style.animation = 'fadeIn 0.5s ease-out';
        }
    }

    // --- Event Listeners ---
    const dealBtn = q('#deal-btn');
    const hitBtn = q('#hit-btn');
    const standBtn = q('#stand-btn');
    
    if (dealBtn) {
        dealBtn.addEventListener('click', () => placeBet(100));
    }
    
    if (hitBtn) {
        hitBtn.addEventListener('click', hit);
    }
    
    if (standBtn) {
        standBtn.addEventListener('click', stand);
    }

    // --- Initialize ---
    clearGame();
    updateBalance();
};