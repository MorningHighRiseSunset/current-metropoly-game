// Simple Poker Minigame - Single Round Version
window.initPokerMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

    // --- State ---
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBet = 100;
    let playerHand = [];
    let aiHand = [];
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

    // --- Hand evaluation (simplified) ---
    function evaluateHand(hand) {
        const rankValues = ranks.map(r => r);
        const values = hand.map(c => rankValues.indexOf(c.rank) + 2);
        const suitCounts = {};
        const rankCounts = {};
        
        for (const card of hand) {
            suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
            rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
        }
        
        const isFlush = Object.values(suitCounts).some(count => count >= 5);
        const isStraight = checkStraight(values);
        const pairs = Object.values(rankCounts).filter(c => c === 2).length;
        const threes = Object.values(rankCounts).filter(c => c === 3).length;
        const fours = Object.values(rankCounts).filter(c => c === 4).length;
        
        // Hand rankings with multipliers
        if (isStraight && isFlush) return { rank: 8, name: 'Straight Flush', multiplier: 100 };
        if (fours > 0) return { rank: 7, name: 'Four of a Kind', multiplier: 30 };
        if (threes > 0 && pairs > 0) return { rank: 6, name: 'Full House', multiplier: 20 };
        if (isFlush) return { rank: 5, name: 'Flush', multiplier: 15 };
        if (isStraight) return { rank: 4, name: 'Straight', multiplier: 12 };
        if (threes > 0) return { rank: 3, name: 'Three of a Kind', multiplier: 8 };
        if (pairs >= 2) return { rank: 2, name: 'Two Pair', multiplier: 5 };
        if (pairs === 1) return { rank: 1, name: 'Pair', multiplier: 3 };
        return { rank: 0, name: 'High Card', multiplier: 2 };
    }
    
    function checkStraight(values) {
        const sorted = [...new Set(values)].sort((a, b) => a - b);
        if (sorted.length < 5) return false;
        
        for (let i = 0; i <= sorted.length - 5; i++) {
            let consecutive = true;
            for (let j = 0; j < 4; j++) {
                if (sorted[i + j + 1] - sorted[i + j] !== 1) {
                    consecutive = false;
                    break;
                }
            }
            if (consecutive) return true;
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

    function renderHands(revealAI = false) {
        const playerHandEl = q('#player-hand');
        const aiHandEl = q('#ai-hand');
        
        if (playerHandEl) {
            playerHandEl.innerHTML = '';
            playerHand.forEach(card => {
                playerHandEl.appendChild(renderCard(card));
            });
        }
        
        if (aiHandEl) {
            aiHandEl.innerHTML = '';
            if (revealAI) {
                aiHand.forEach(card => {
                    aiHandEl.appendChild(renderCard(card));
                });
            } else {
                // Show face-down cards
                for (let i = 0; i < 5; i++) {
                    const cardEl = document.createElement('div');
                    cardEl.className = 'card';
                    cardEl.style.background = 'linear-gradient(145deg, #8e44ad, #9b59b6)';
                    cardEl.style.borderColor = '#9b59b6';
                    cardEl.style.color = '#9b59b6';
                    cardEl.innerHTML = '<div style="font-size: 24px;">🂠</div>';
                    aiHandEl.appendChild(cardEl);
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

    function clearGame() {
        playerHand = [];
        aiHand = [];
        deck = createDeck();
        shuffle(deck);
        gamePhase = 'betting';
        
        const playerHandEl = q('#player-hand');
        const aiHandEl = q('#ai-hand');
        const playerResultEl = q('#player-hand-result');
        const aiResultEl = q('#ai-hand-result');
        const statusEl = q('#status-message');
        
        if (playerHandEl) playerHandEl.innerHTML = '';
        if (aiHandEl) aiHandEl.innerHTML = '';
        if (playerResultEl) playerResultEl.textContent = '';
        if (aiResultEl) aiResultEl.textContent = '';
        if (statusEl) statusEl.textContent = 'Click Deal to play';
        
        // Reset button
        const dealBtn = q('#deal-btn');
        if (dealBtn) dealBtn.disabled = false;
    }

    function deal() {
        if (gamePhase !== 'betting') return;
        if (currentBet > balance) {
            showStatus('Not enough balance!');
            return;
        }
        
        balance -= currentBet;
        updateBalance();
        
        // Deal 5 cards
        deck = createDeck();
        shuffle(deck);
        playerHand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
        aiHand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
        
        renderHands(false);
        gamePhase = 'playing';
        showStatus('Dealing 5 cards...');
        
        // Reveal and evaluate after delay
        setTimeout(() => {
            renderHands(true);
            showStatus('Revealing hands...');
            
            const playerEval = evaluateHand(playerHand);
            const aiEval = evaluateHand(aiHand);
            
            // Show hand rankings
            const playerResultEl = q('#player-hand-result');
            const aiResultEl = q('#ai-hand-result');
            if (playerResultEl) playerResultEl.textContent = playerEval.name;
            if (aiResultEl) aiResultEl.textContent = aiEval.name;
            
            setTimeout(() => {
                if (playerEval.rank > aiEval.rank) {
                    const winAmount = Math.floor(currentBet * playerEval.multiplier);
                    balance += winAmount;
                    showStatus(`You win! ${playerEval.name} beats ${aiEval.name}. +$${winAmount - currentBet}`);
                } else if (aiEval.rank > playerEval.rank) {
                    showStatus(`AI wins! ${aiEval.name} beats ${playerEval.name}. -$${currentBet}`);
                } else {
                    balance += currentBet; // Push
                    showStatus(`Tie! Both have ${playerEval.name}. Bet returned.`);
                }
                
                updateBalance();
                gamePhase = 'result';
                
                // Auto-reset after delay
                setTimeout(() => {
                    clearGame();
                }, 3000);
            }, 500);
        }, 1000);
    }

    // --- Event Listeners ---
    const dealBtn = q('#deal-btn');
    if (dealBtn) {
        dealBtn.addEventListener('click', deal);
    }

    // --- Initialize ---
    clearGame();
    updateBalance();
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
