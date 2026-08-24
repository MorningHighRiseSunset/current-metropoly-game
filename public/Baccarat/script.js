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
        const balanceEl = q('#money-display') || q('#balance');
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

    function showStatus(text) {
        const statusEl = q('#status-message');
        if (statusEl) {
            statusEl.textContent = text;
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
        const playerScoreEl = q('#player-score');
        const bankerScoreEl = q('#ai-score');
        const betDisplayEl = q('#current-bet-display');
        const statusEl = q('#status-message');
        
        if (playerHandEl) playerHandEl.innerHTML = '';
        if (bankerHandEl) bankerHandEl.innerHTML = '';
        if (playerScoreEl) playerScoreEl.textContent = '0';
        if (bankerScoreEl) bankerScoreEl.textContent = '0';
        if (betDisplayEl) betDisplayEl.textContent = '0';
        if (statusEl) statusEl.textContent = 'Place your bet and click Deal';
        
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
        
        showStatus(`Selected ${type.toUpperCase()}. Click Deal to begin.`);
    }

    function deal() {
        if (gamePhase !== 'betting') return;
        if (!betType) {
            showStatus('Please select a bet type!');
            return;
        }
        if (currentBet > balance) {
            showStatus('Not enough balance!');
            return;
        }
        
        balance -= currentBet;
        updateBalance();
        
        // Disable betting UI
        const betBtns = container.querySelectorAll('.bet-btn');
        betBtns.forEach(btn => btn.disabled = true);
        
        const dealBtn = q('#deal-btn');
        if (dealBtn) dealBtn.disabled = true;
        
        // Deal initial cards
        deck = createDeck();
        shuffle(deck);
        playerHand = [deck.pop(), deck.pop()];
        bankerHand = [deck.pop(), deck.pop()];
        
        renderHands();
        gamePhase = 'playing';
        showStatus('Dealing initial cards...');
        
        // Check for naturals (8 or 9)
        setTimeout(() => {
            const playerScore = handValue(playerHand);
            const bankerScore = handValue(bankerHand);
            
            if (playerScore >= 8 || bankerScore >= 8) {
                showStatus(`Natural! Player: ${playerScore}, Banker: ${bankerScore}`);
                resolveGame(playerScore, bankerScore);
                return;
            }
            
            // Player draws on 0-5
            if (playerScore <= 5) {
                showStatus(`Player has ${playerScore}. Drawing third card...`);
                setTimeout(() => {
                    playerHand.push(deck.pop());
                    renderHands();
                    const newPlayerScore = handValue(playerHand);
                    const playerThirdCard = playerHand[2];
                    
                    // Banker drawing rules based on Player's third card
                    determineBankerDraw(bankerScore, playerThirdCard, newPlayerScore);
                }, 800);
            } else {
                showStatus(`Player stands with ${playerScore}`);
                // Banker draws on 0-5, stands on 6-7
                if (bankerScore <= 5) {
                    showStatus(`Banker has ${bankerScore}. Drawing third card...`);
                    setTimeout(() => {
                        bankerHand.push(deck.pop());
                        renderHands();
                        const finalBankerScore = handValue(bankerHand);
                        showStatus(`Banker draws. Final: Player ${playerScore}, Banker ${finalBankerScore}`);
                        resolveGame(playerScore, finalBankerScore);
                    }, 800);
                } else {
                    showStatus(`Banker stands with ${bankerScore}`);
                    resolveGame(playerScore, bankerScore);
                }
            }
        }, 800);
    }
    
    function determineBankerDraw(bankerScore, playerThirdCard, playerScore) {
        // Banker always draws on 0-2
        if (bankerScore <= 2) {
            showStatus(`Banker has ${bankerScore}. Drawing third card...`);
            setTimeout(() => {
                bankerHand.push(deck.pop());
                renderHands();
                const finalBankerScore = handValue(bankerHand);
                showStatus(`Banker draws. Final: Player ${playerScore}, Banker ${finalBankerScore}`);
                resolveGame(playerScore, finalBankerScore);
            }, 800);
            return;
        }
        
        // Banker stands on 7
        if (bankerScore >= 7) {
            showStatus(`Banker stands with ${bankerScore}`);
            resolveGame(playerScore, bankerScore);
            return;
        }
        
        // Banker 3-6: depends on Player's third card
        const thirdCardValue = getCardValue(playerThirdCard);
        let shouldDraw = false;
        
        if (bankerScore === 3) {
            shouldDraw = thirdCardValue !== 8;
        } else if (bankerScore === 4) {
            shouldDraw = thirdCardValue >= 2 && thirdCardValue <= 7;
        } else if (bankerScore === 5) {
            shouldDraw = thirdCardValue >= 4 && thirdCardValue <= 7;
        } else if (bankerScore === 6) {
            shouldDraw = thirdCardValue === 6 || thirdCardValue === 7;
        }
        
        if (shouldDraw) {
            showStatus(`Banker has ${bankerScore}. Drawing third card...`);
            setTimeout(() => {
                bankerHand.push(deck.pop());
                renderHands();
                const finalBankerScore = handValue(bankerHand);
                showStatus(`Banker draws. Final: Player ${playerScore}, Banker ${finalBankerScore}`);
                resolveGame(playerScore, finalBankerScore);
            }, 800);
        } else {
            showStatus(`Banker stands with ${bankerScore}`);
            resolveGame(playerScore, bankerScore);
        }
    }
    
    function getCardValue(card) {
        if (card.rank === 'A') return 1;
        if (['K', 'Q', 'J', '10'].includes(card.rank)) return 0;
        return parseInt(card.rank);
    }
    
    function resolveGame(playerScore, bankerScore) {
        setTimeout(() => {
            if (playerScore > bankerScore) {
                if (betType === 'player') {
                    balance += currentBet * 2;
                    showStatus(`Player wins! +$${currentBet}`);
                } else {
                    showStatus(`Player wins. You lost $${currentBet}`);
                }
            } else if (bankerScore > playerScore) {
                if (betType === 'banker') {
                    balance += Math.floor(currentBet * 1.95);
                    showStatus(`Banker wins! +$${Math.floor(currentBet * 0.95)}`);
                } else {
                    showStatus(`Banker wins. You lost $${currentBet}`);
                }
            } else {
                if (betType === 'tie') {
                    balance += currentBet * 8;
                    showStatus(`Tie! +$${currentBet * 7}`);
                } else {
                    balance += currentBet;
                    showStatus(`Tie! Bet returned`);
                }
            }
            
            updateBalance();
            gamePhase = 'result';
            
            setTimeout(() => {
                clearGame();
                showStatus('Place your bet and click Deal');
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
