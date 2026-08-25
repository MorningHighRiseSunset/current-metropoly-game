// Simple Baccarat Minigame with Pair Bets
window.initBaccaratMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

    // --- State ---
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let bets = []; // Array of active bets: {type, amount}
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
    function getTotalBets() {
        return bets.reduce((sum, bet) => sum + bet.amount, 0);
    }

    function updateBalance() {
        const balanceEl = q('#money-display') || q('#balance');
        if (balanceEl) balanceEl.textContent = balance;
        const betDisplayEl = q('#current-bet-display');
        if (betDisplayEl) betDisplayEl.textContent = getTotalBets();
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
        bets = [];
        
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
        
        // Reset bet areas
        const betAreas = container.querySelectorAll('.bet-area');
        betAreas.forEach(area => {
            area.classList.remove('selected');
        });
        
        const dealBtn = q('#deal-btn');
        if (dealBtn) dealBtn.disabled = false;
        
        updateBalance();
    }

    function selectBet(type) {
        if (gamePhase !== 'betting') return;
        
        // Check if bet already exists
        if (bets.some(b => b.type === type)) {
            showStatus('Bet already placed!');
            return;
        }
        
        if (balance < 100) {
            showStatus('Not enough balance!');
            return;
        }
        
        balance -= 100;
        bets.push({ type, amount: 100 });
        
        // Update UI
        const betAreas = container.querySelectorAll('.bet-area');
        betAreas.forEach(area => {
            if (area.dataset.bet === type) {
                area.classList.add('selected');
            }
        });
        
        updateBalance();
        showStatus(`${type.toUpperCase()} bet placed. Click Deal to begin.`);
    }

    function deal() {
        if (gamePhase !== 'betting') return;
        if (bets.length === 0) {
            showStatus('Please place a bet!');
            return;
        }
        
        // Disable betting UI
        const betAreas = container.querySelectorAll('.bet-area');
        betAreas.forEach(area => area.style.pointerEvents = 'none');
        
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
    
    function hasPair(hand) {
        if (hand.length < 2) return false;
        return hand[0].rank === hand[1].rank;
    }

    function resolveGame(playerScore, bankerScore) {
        setTimeout(() => {
            let winnings = 0;
            let results = [];

            // Check for pairs first
            const playerHasPair = hasPair(playerHand);
            const bankerHasPair = hasPair(bankerHand);

            bets.forEach(bet => {
                let won = false;
                let payout = 0;

                // Player Pair
                if (bet.type === 'player-pair') {
                    if (playerHasPair) {
                        won = true;
                        payout = bet.amount * 12; // 11:1 + original bet
                        results.push('Player Pair wins!');
                    }
                }
                // Banker Pair
                else if (bet.type === 'banker-pair') {
                    if (bankerHasPair) {
                        won = true;
                        payout = bet.amount * 12;
                        results.push('Banker Pair wins!');
                    }
                }
                // Player
                else if (bet.type === 'player') {
                    if (playerScore > bankerScore) {
                        won = true;
                        payout = bet.amount * 2;
                        results.push('Player wins!');
                    } else if (playerScore === bankerScore) {
                        // Tie - return bet
                        payout = bet.amount;
                        results.push('Tie - bet returned');
                    }
                }
                // Banker
                else if (bet.type === 'banker') {
                    if (bankerScore > playerScore) {
                        won = true;
                        payout = Math.floor(bet.amount * 1.95); // 5% commission
                        results.push('Banker wins!');
                    } else if (playerScore === bankerScore) {
                        payout = bet.amount;
                        results.push('Tie - bet returned');
                    }
                }
                // Tie
                else if (bet.type === 'tie') {
                    if (playerScore === bankerScore) {
                        won = true;
                        payout = bet.amount * 9; // 8:1 + original bet
                        results.push('Tie wins!');
                    }
                }

                winnings += payout;
            });

            balance += winnings;
            updateBalance();

            if (results.length > 0) {
                showStatus(results.join(' | '));
            } else {
                showStatus('No wins this round');
            }

            gamePhase = 'result';

            setTimeout(() => {
                clearGame();
                showStatus('Place your bet and click Deal');
            }, 3000);
        }, 1000);
    }

    // --- Event Listeners ---
    const betAreas = container.querySelectorAll('.bet-area');
    betAreas.forEach(area => {
        area.addEventListener('click', () => {
            selectBet(area.dataset.bet);
        });
    });

    const dealBtn = q('#deal-btn');
    if (dealBtn) {
        dealBtn.addEventListener('click', deal);
    }

    const clearBtn = q('#clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (gamePhase === 'betting' && bets.length > 0) {
                const total = getTotalBets();
                balance += total;
                bets = [];
                
                betAreas.forEach(area => {
                    area.classList.remove('selected');
                });
                
                updateBalance();
                showStatus('Bets cleared');
            }
        });
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
