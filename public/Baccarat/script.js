// Baccarat Game Logic (Modular)
window.initBaccaratMinigame = function(container, playerMoneyInit, updateMainGameBalance) {
    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

    // --- State ---
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = [
        {name: 'A', value: 1},
        {name: '2', value: 2},
        {name: '3', value: 3},
        {name: '4', value: 4},
        {name: '5', value: 5},
        {name: '6', value: 6},
        {name: '7', value: 7},
        {name: '8', value: 8},
        {name: '9', value: 9},
        {name: '10', value: 0},
        {name: 'J', value: 0},
        {name: 'Q', value: 0},
        {name: 'K', value: 0}
    ];
    let deck = [];
    let playerHand = [];
    let aiHand = [];
    let playerMoney = typeof playerMoneyInit === 'number' ? playerMoneyInit : 1000;
    let currentBet = 0;
    let currentBetType = null;
    let gameHistory = [];
    let roundInProgress = false;

    function createDeck() {
        let d = [];
        for (let suit of suits) {
            for (let rank of ranks) {
                d.push({
                    suit: suit,
                    name: rank.name,
                    value: rank.value
                });
            }
        }
        return d;
    }
    function shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }
    function handValue(hand) {
        let sum = hand.reduce((acc, card) => acc + card.value, 0);
        return sum % 10;
    }
    function drawCard() {
        if (!deck || deck.length === 0) {
            deck = createDeck();
            shuffle(deck);
        }
        return deck.pop();
    }
    function renderHand(hand, elementId) {
        const el = q('#' + elementId);
        if (!el) return;
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
        hand.forEach((card, idx) => {
            const div = document.createElement('div');
            div.className = 'card';
            div.textContent = card.name + card.suit;
            // 3D perspective: player cards at bottom, AI at top
            if (elementId === 'player-cards') {
                div.style.boxShadow = '0 8px 32px 0 #000a, 0 2px 8px #b48a3e99';
                div.style.transform = (div.style.transform || '') + ' translateY(20px)';
            } else if (elementId === 'ai-cards') {
                div.style.boxShadow = '0 8px 32px 0 #000a, 0 2px 8px #b48a3e99';
                div.style.transform = (div.style.transform || '') + ' translateY(-20px)';
            }
            // Animate card flying from shoe
            div.style.opacity = 0;
            setTimeout(() => {
                div.classList.add('animated');
                div.style.opacity = 1;
                div.animate([
                    { transform: 'translateX(-200px) scale(0.7) rotate(-20deg)', opacity: 0 },
                    { transform: div.style.transform || 'translateX(0)', opacity: 1 }
                ], {
                    duration: 350 + idx * 80,
                    fill: 'forwards',
                    easing: 'cubic-bezier(.4,0,.2,1)'
                });
            }, 120 * idx + 80);
            el.appendChild(div);
        });
    }
    function updateScores() {
        const pScoreEl = q('#player-score');
        const aScoreEl = q('#ai-score');
        if (pScoreEl) pScoreEl.textContent = playerHand.length ? handValue(playerHand) : '';
        if (aScoreEl) aScoreEl.textContent = aiHand.length ? handValue(aiHand) : '';
    }
    function updateMoneyUI() {
        const moneyEl = q('#money-display');
        const betEl = q('#current-bet-display');
        const typeEl = q('#current-bet-type');
        if (moneyEl) moneyEl.textContent = `$${playerMoney}`;
        if (betEl) betEl.textContent = `$${currentBet}`;
        if (typeEl) typeEl.textContent = currentBetType ? currentBetType.charAt(0).toUpperCase() + currentBetType.slice(1) : '-';
        if (typeof updateMainGameBalance === 'function') {
            updateMainGameBalance(playerMoney);
        } else if (container && typeof CustomEvent === 'function') {
            container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance: playerMoney}}));
        }
    }
    function resetGame() {
        deck = createDeck();
        shuffle(deck);
        playerHand = [];
        aiHand = [];
        const resultEl = q('#result');
        if (resultEl) resultEl.textContent = '';
        renderHand(playerHand, 'player-cards');
        renderHand(aiHand, 'ai-cards');
        updateScores();
        // Reset bet
        currentBet = 0;
        currentBetType = null;
        updateMoneyUI();
        // Enable betting UI
        setBettingUIEnabled(true);
        // Hide next round button
        const nextRoundContainer = q('.next-round-container');
        if (nextRoundContainer) nextRoundContainer.style.display = 'none';
        roundInProgress = false;
    }
    function deal() {
        if (roundInProgress) return;
        if (!currentBet || !currentBetType) {
            alert('Please select a bet amount and type!');
            return;
        }
        if (currentBet > playerMoney) {
            alert('Not enough money!');
            return;
        }
        playerMoney -= currentBet;
        updateMoneyUI();
        // Disable betting UI
        setBettingUIEnabled(false);
        // Initial 2 cards each, animate dealing
        deck = createDeck();
        shuffle(deck);
        playerHand = [];
        aiHand = [];
        const resultEl = q('#result');
        if (resultEl) resultEl.textContent = '';
        renderHand(playerHand, 'player-cards');
        renderHand(aiHand, 'ai-cards');
        updateScores();
        roundInProgress = true;
        setTimeout(() => {
            playerHand.push(drawCard());
            renderHand(playerHand, 'player-cards');
            updateScores();
        }, 300);
        setTimeout(() => {
            aiHand.push(drawCard());
            renderHand(aiHand, 'ai-cards');
            updateScores();
        }, 600);
        setTimeout(() => {
            playerHand.push(drawCard());
            renderHand(playerHand, 'player-cards');
            updateScores();
        }, 900);
        setTimeout(() => {
            aiHand.push(drawCard());
            renderHand(aiHand, 'ai-cards');
            updateScores();
        }, 1200);
        setTimeout(() => {
            playBaccarat();
        }, 1600);
    }
    function playBaccarat() {
        // Natural win check
        let playerScore = handValue(playerHand);
        let aiScore = handValue(aiHand);
        if (playerScore >= 8 || aiScore >= 8) {
            setTimeout(endGame, 600);
            return;
        }
        // Player draws third card if 0-5
        let playerThird = false;
        if (playerScore <= 5) {
            setTimeout(() => {
                playerHand.push(drawCard());
                renderHand(playerHand, 'player-cards');
                updateScores();
            }, 400);
            playerThird = true;
        }
        // AI (banker) drawing rules
        setTimeout(() => {
            aiScore = handValue(aiHand);
            let aiDraw = false;
            let playerThirdCard = playerHand[2] ? playerHand[2].value : null;
            if (!playerThird) {
                if (aiScore <= 5) aiDraw = true;
            } else {
                // Simplified AI draw logic
                if (aiScore <= 2) aiDraw = true;
                else if (aiScore === 3 && playerThirdCard !== 8) aiDraw = true;
                else if (aiScore === 4 && playerThirdCard >= 2 && playerThirdCard <= 7) aiDraw = true;
                else if (aiScore === 5 && playerThirdCard >= 4 && playerThirdCard <= 7) aiDraw = true;
                else if (aiScore === 6 && playerThirdCard >= 6 && playerThirdCard <= 7) aiDraw = true;
            }
            if (aiDraw) {
                aiHand.push(drawCard());
                renderHand(aiHand, 'ai-cards');
                updateScores();
            }
            setTimeout(endGame, 600);
        }, playerThird ? 900 : 400);
    }
    function endGame() {
        let playerScore = handValue(playerHand);
        let aiScore = handValue(aiHand);
        let result = '';
        let win = false;
        let payout = 0;
        let winner = '';
        if (playerScore > aiScore) {
            result = 'Player Wins!';
            winner = 'player';
            if (currentBetType === 'player') { win = true; payout = currentBet * 2; }
        } else if (aiScore > playerScore) {
            result = 'Banker Wins!';
            winner = 'banker';
            if (currentBetType === 'banker') { win = true; payout = Math.floor(currentBet * 1.95); }
        } else {
            result = "It's a Tie!";
            winner = 'tie';
            if (currentBetType === 'tie') { win = true; payout = currentBet * 8; }
        }
        if (win) {
            playerMoney += payout;
            result += ` You win $${payout - currentBet}!`;
            showWinAnimation();
        } else {
            result += ' You lose your bet.';
            showLoseAnimation();
        }
        updateMoneyUI();
        const resultEl = q('#result');
        if (resultEl) resultEl.textContent = result;
        // Add to history
        gameHistory.push(winner);
        renderHistory();
        // Show next round button
        const nextRoundContainer = q('.next-round-container');
        if (nextRoundContainer) nextRoundContainer.style.display = 'block';
        roundInProgress = false;
    }
    function renderHistory() {
        const historyEl = q('#history');
        if (!historyEl) return;
        historyEl.innerHTML = '';
        gameHistory.slice(-20).forEach(res => {
            const div = document.createElement('div');
            div.className = 'history-item ' + res;
            if (res === 'player') div.textContent = 'P';
            else if (res === 'banker') div.textContent = 'B';
            else if (res === 'tie') div.textContent = 'T';
            historyEl.appendChild(div);
        });
    }
    function showWinAnimation() {
        const result = q('#result');
        if (!result) return;
        result.style.color = '#2ecc40';
        result.animate([
            { transform: 'scale(1)', color: '#2ecc40' },
            { transform: 'scale(1.15)', color: '#f7d774' },
            { transform: 'scale(1)', color: '#2ecc40' }
        ], {
            duration: 900,
            fill: 'forwards',
            easing: 'cubic-bezier(.4,0,.2,1)'
        });
    }
    function showLoseAnimation() {
        const result = q('#result');
        if (!result) return;
        result.style.color = '#e74c3c';
        result.animate([
            { transform: 'scale(1)', color: '#e74c3c' },
            { transform: 'scale(0.95)', color: '#f7d774' },
            { transform: 'scale(1)', color: '#e74c3c' }
        ], {
            duration: 900,
            fill: 'forwards',
            easing: 'cubic-bezier(.4,0,.2,1)'
        });
    }
    function setBettingUIEnabled(enabled) {
        container.querySelectorAll('.chip').forEach(btn => btn.disabled = !enabled);
        container.querySelectorAll('.bet-type').forEach(btn => btn.disabled = !enabled);
        const dealBtn = q('#deal-btn');
        if (dealBtn) dealBtn.disabled = !enabled;
    }
    // --- Wire up DOM listeners ---
    container.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', function() {
            container.querySelectorAll('.chip').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            currentBet = parseInt(this.getAttribute('data-value')) || 0;
            updateMoneyUI();
        });
    });
    container.querySelectorAll('.bet-type').forEach(btn => {
        btn.addEventListener('click', function() {
            container.querySelectorAll('.bet-type').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            currentBetType = this.getAttribute('data-type');
            updateMoneyUI();
        });
    });
    const dealBtn = q('#deal-btn');
    if (dealBtn) dealBtn.addEventListener('click', deal);
    const resetBtn = q('#reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetGame);
    // Next round button logic
    const nextRoundBtn = q('#next-round-btn');
    if (nextRoundBtn) {
        nextRoundBtn.addEventListener('click', () => {
            // Keep bet and bet type, just clear hands and result
            playerHand = [];
            aiHand = [];
            const resultEl = q('#result');
            if (resultEl) resultEl.textContent = '';
            renderHand(playerHand, 'player-cards');
            renderHand(aiHand, 'ai-cards');
            updateScores();
            setBettingUIEnabled(true);
            const nextRoundContainer = q('.next-round-container');
            if (nextRoundContainer) nextRoundContainer.style.display = 'none';
            roundInProgress = false;
        });
    }
    // Instructions modal logic
    const instructionsBtn = q('#instructions-btn');
    const instructionsModal = q('#instructions-modal');
    const closeInstructions = q('#close-instructions');
    if (instructionsBtn && instructionsModal && closeInstructions) {
        instructionsBtn.addEventListener('click', () => {
            instructionsModal.style.display = 'flex';
        });
        closeInstructions.addEventListener('click', () => {
            instructionsModal.style.display = 'none';
        });
        window.addEventListener('click', (event) => {
            if (event.target === instructionsModal) {
                instructionsModal.style.display = 'none';
            }
        });
    }
    // Initial state
    resetGame();
    renderHistory();
};

function renderHand(hand, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
    hand.forEach((card, idx) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.textContent = card.name + card.suit;
        // 3D perspective: player cards at bottom, AI at top
        if (elementId === 'player-cards') {
            div.style.boxShadow = '0 8px 32px 0 #000a, 0 2px 8px #b48a3e99';
            div.style.transform = (div.style.transform || '') + ' translateY(20px)';
        } else if (elementId === 'ai-cards') {
            div.style.boxShadow = '0 8px 32px 0 #000a, 0 2px 8px #b48a3e99';
            div.style.transform = (div.style.transform || '') + ' translateY(-20px)';
        }
        // Animate card flying from shoe
        div.style.opacity = 0;
        setTimeout(() => {
            div.classList.add('animated');
            div.style.opacity = 1;
            div.animate([
                { transform: 'translateX(-200px) scale(0.7) rotate(-20deg)', opacity: 0 },
                { transform: div.style.transform || 'translateX(0)', opacity: 1 }
            ], {
                duration: 350 + idx * 80,
                fill: 'forwards',
                easing: 'cubic-bezier(.4,0,.2,1)'
            });
        }, 120 * idx + 80);
        el.appendChild(div);
    });
}

function updateScores() {
    const pScoreEl = document.getElementById('player-score');
    const aScoreEl = document.getElementById('ai-score');
    if (pScoreEl) pScoreEl.textContent = playerHand.length ? handValue(playerHand) : '';
    if (aScoreEl) aScoreEl.textContent = aiHand.length ? handValue(aiHand) : '';
}

function updateMoneyUI() {
    const moneyEl = document.getElementById('money-display');
    const betEl = document.getElementById('current-bet-display');
    const typeEl = document.getElementById('current-bet-type');
    if (moneyEl) moneyEl.textContent = `$${playerMoney}`;
    if (betEl) betEl.textContent = `$${currentBet}`;
    if (typeEl) typeEl.textContent = currentBetType ? currentBetType.charAt(0).toUpperCase() + currentBetType.slice(1) : '-';
    // Animate chips to betting area
    const betArea = document.querySelector('.betting-area');
    if (!betArea) return;
    betArea.innerHTML = '';
    if (currentBet > 0 && currentBetType) {
        const chip = document.createElement('div');
        chip.className = 'chip bet-chip';
        chip.textContent = `$${currentBet}`;
        chip.style.pointerEvents = 'none';
        chip.style.margin = '0 auto';
        chip.style.position = 'relative';
        chip.style.zIndex = 10;
        betArea.appendChild(chip);
    } else {
        betArea.textContent = 'BETTING AREA';
    }
}

function resetGame() {
    deck = createDeck();
    shuffle(deck);
    playerHand = [];
    aiHand = [];
    const resultEl = document.getElementById('result');
    if (resultEl) resultEl.textContent = '';
    renderHand(playerHand, 'player-cards');
    renderHand(aiHand, 'ai-cards');
    updateScores();
    // Reset bet
    currentBet = 0;
    currentBetType = null;
    updateMoneyUI();
    // Enable betting UI
    setBettingUIEnabled(true);
    // Hide next round button
    const nextRoundContainer = document.querySelector('.next-round-container');
    if (nextRoundContainer) nextRoundContainer.style.display = 'none';
    roundInProgress = false;
}

function deal() {
    if (roundInProgress) return;
    if (!currentBet || !currentBetType) {
        alert('Please select a bet amount and type!');
        return;
    }
    if (currentBet > playerMoney) {
        alert('Not enough money!');
        return;
    }
    playerMoney -= currentBet;
    updateMoneyUI();
    // Disable betting UI
    setBettingUIEnabled(false);
    // Initial 2 cards each, animate dealing
    deck = createDeck();
    shuffle(deck);
    playerHand = [];
    aiHand = [];
    const resultEl = document.getElementById('result');
    if (resultEl) resultEl.textContent = '';
    renderHand(playerHand, 'player-cards');
    renderHand(aiHand, 'ai-cards');
    updateScores();
    roundInProgress = true;
    setTimeout(() => {
        playerHand.push(drawCard());
        renderHand(playerHand, 'player-cards');
        updateScores();
    }, 300);
    setTimeout(() => {
        aiHand.push(drawCard());
        renderHand(aiHand, 'ai-cards');
        updateScores();
    }, 600);
    setTimeout(() => {
        playerHand.push(drawCard());
        renderHand(playerHand, 'player-cards');
        updateScores();
    }, 900);
    setTimeout(() => {
        aiHand.push(drawCard());
        renderHand(aiHand, 'ai-cards');
        updateScores();
    }, 1200);
    setTimeout(() => {
        playBaccarat();
    }, 1600);
}

function playBaccarat() {
    // Natural win check
    let playerScore = handValue(playerHand);
    let aiScore = handValue(aiHand);
    if (playerScore >= 8 || aiScore >= 8) {
        setTimeout(endGame, 600);
        return;
    }
    // Player draws third card if 0-5
    let playerThird = false;
    if (playerScore <= 5) {
        setTimeout(() => {
            playerHand.push(drawCard());
            renderHand(playerHand, 'player-cards');
            updateScores();
        }, 400);
        playerThird = true;
    }
    // AI (banker) drawing rules
    setTimeout(() => {
        aiScore = handValue(aiHand);
        let aiDraw = false;
        let playerThirdCard = playerHand[2] ? playerHand[2].value : null;
        if (!playerThird) {
            if (aiScore <= 5) aiDraw = true;
        } else {
            // Simplified AI draw logic
            if (aiScore <= 2) aiDraw = true;
            else if (aiScore === 3 && playerThirdCard !== 8) aiDraw = true;
            else if (aiScore === 4 && playerThirdCard >= 2 && playerThirdCard <= 7) aiDraw = true;
            else if (aiScore === 5 && playerThirdCard >= 4 && playerThirdCard <= 7) aiDraw = true;
            else if (aiScore === 6 && playerThirdCard >= 6 && playerThirdCard <= 7) aiDraw = true;
        }
        if (aiDraw) {
            aiHand.push(drawCard());
            renderHand(aiHand, 'ai-cards');
            updateScores();
        }
        setTimeout(endGame, 600);
    }, playerThird ? 900 : 400);
} // <-- Missing closing brace fixed here

function endGame() {
    let playerScore = handValue(playerHand);
    let aiScore = handValue(aiHand);
    let result = '';
    let win = false;
    let payout = 0;
    let winner = '';
    if (playerScore > aiScore) {
        result = 'Player Wins!';
        winner = 'player';
        if (currentBetType === 'player') { win = true; payout = currentBet * 2; }
    } else if (aiScore > playerScore) {
        result = 'Banker Wins!';
        winner = 'banker';
        if (currentBetType === 'banker') { win = true; payout = Math.floor(currentBet * 1.95); }
    } else {
        result = "It's a Tie!";
        winner = 'tie';
        if (currentBetType === 'tie') { win = true; payout = currentBet * 8; }
    }
    if (win) {
        playerMoney += payout;
        result += ` You win $${payout - currentBet}!`;
        showWinAnimation();
    } else {
        result += ' You lose your bet.';
        showLoseAnimation();
    }
    updateMoneyUI();
    const resultEl = document.getElementById('result');
    if (resultEl) resultEl.textContent = result;
    // Add to history
    gameHistory.push(winner);
    renderHistory();
    // Show next round button
    const nextRoundContainer = document.querySelector('.next-round-container');
    if (nextRoundContainer) nextRoundContainer.style.display = 'block';
    roundInProgress = false;
function renderHistory() {
    const historyEl = document.getElementById('history');
    if (!historyEl) return;
    historyEl.innerHTML = '';
    gameHistory.slice(-20).forEach(res => {
        const div = document.createElement('div');
        div.className = 'history-item ' + res;
        if (res === 'player') div.textContent = 'P';
        else if (res === 'banker') div.textContent = 'B';
        else if (res === 'tie') div.textContent = 'T';
        historyEl.appendChild(div);
    });
}
}

// Animate shoe (dealer hand)
function animateShoe() {
    let shoe = document.getElementById('dealer-shoe');
    if (!shoe) {
        shoe = document.createElement('div');
        shoe.id = 'dealer-shoe';
        shoe.style.position = 'absolute';
        shoe.style.left = '30px'; // Move to left side
        shoe.style.top = '60px'; // Lower down, out of the way
        shoe.style.width = '60px';
        shoe.style.height = '38px';
        shoe.style.background = 'linear-gradient(120deg, #222 60%, #444 100%)';
        shoe.style.border = '3px solid #b48a3e';
        shoe.style.borderRadius = '10px';
        shoe.style.boxShadow = '0 2px 12px #000a';
        shoe.style.zIndex = 20;
        shoe.style.display = 'flex';
        shoe.style.flexDirection = 'column';
        shoe.style.alignItems = 'center';
        shoe.style.justifyContent = 'center';
        shoe.innerHTML = '<div style="width:40px;height:18px;background:#fff;border-radius:4px;opacity:0.7;margin-bottom:2px;"></div>' +
            '<span style="font-size:0.85em;color:#f7d774;font-weight:bold;letter-spacing:1px;">Shoe</span>';
        const table = document.querySelector('.table-3d');
        if (table) table.appendChild(shoe);
    }
    shoe.animate([
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.05)', opacity: 1 },
        { transform: 'scale(1)', opacity: 1 }
    ], {
        duration: 600,
        fill: 'forwards',
        easing: 'cubic-bezier(.4,0,.2,1)'
    });
}

function showWinAnimation() {
    const result = document.getElementById('result');
    if (!result) return;
    result.style.color = '#2ecc40';
    result.animate([
        { transform: 'scale(1)', color: '#2ecc40' },
        { transform: 'scale(1.15)', color: '#f7d774' },
        { transform: 'scale(1)', color: '#2ecc40' }
    ], {
        duration: 900,
        fill: 'forwards',
        easing: 'cubic-bezier(.4,0,.2,1)'
    });
}
function showLoseAnimation() {
    const result = document.getElementById('result');
    if (!result) return;
    result.style.color = '#e74c3c';
    result.animate([
        { transform: 'scale(1)', color: '#e74c3c' },
        { transform: 'scale(0.95)', color: '#f7d774' },
        { transform: 'scale(1)', color: '#e74c3c' }
    ], {
        duration: 900,
        fill: 'forwards',
        easing: 'cubic-bezier(.4,0,.2,1)'
    });
}

// Betting UI logic
function setBettingUIEnabled(enabled) {
    document.querySelectorAll('.chip').forEach(btn => btn.disabled = !enabled);
    document.querySelectorAll('.bet-type').forEach(btn => btn.disabled = !enabled);
    const dealBtn = document.getElementById('deal-btn');
    if (dealBtn) dealBtn.disabled = !enabled;
}

// Wire up DOM listeners after load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chip').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            currentBet = parseInt(this.getAttribute('data-value')) || 0;
            updateMoneyUI();
        });
    });
    document.querySelectorAll('.bet-type').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.bet-type').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            currentBetType = this.getAttribute('data-type');
            updateMoneyUI();
        });
    });

    const dealBtn = document.getElementById('deal-btn');
    if (dealBtn) dealBtn.addEventListener('click', deal);
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetGame);

    // Next round button logic
    const nextRoundBtn = document.getElementById('next-round-btn');
    if (nextRoundBtn) {
        nextRoundBtn.addEventListener('click', () => {
            // Keep bet and bet type, just clear hands and result
            playerHand = [];
            aiHand = [];
            const resultEl = document.getElementById('result');
            if (resultEl) resultEl.textContent = '';
            renderHand(playerHand, 'player-cards');
            renderHand(aiHand, 'ai-cards');
            updateScores();
            setBettingUIEnabled(true);
            const nextRoundContainer = document.querySelector('.next-round-container');
            if (nextRoundContainer) nextRoundContainer.style.display = 'none';
            roundInProgress = false;
        });
    }

    // Instructions modal logic
    const instructionsBtn = document.getElementById('instructions-btn');
    const instructionsModal = document.getElementById('instructions-modal');
    const closeInstructions = document.getElementById('close-instructions');
    if (instructionsBtn && instructionsModal && closeInstructions) {
        instructionsBtn.addEventListener('click', () => {
            instructionsModal.style.display = 'flex';
        });
        closeInstructions.addEventListener('click', () => {
            instructionsModal.style.display = 'none';
        });
        window.addEventListener('click', (event) => {
            if (event.target === instructionsModal) {
                instructionsModal.style.display = 'none';
            }
        });
    }

    // Initial state
    resetGame();
    renderHistory();
});



// Auto-initialize for standalone usage (skip when embedded in main game iframe)
if (window.parent === window && document.currentScript && document.currentScript.src && document.currentScript.src.includes('Baccarat/script.js')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            const container = document.querySelector('.container');
            if (container) {
                window.initBaccaratMinigame(container, window.playerMoney, window.updateMainGameBalance);
            }
        });
    } else {
        const container = document.querySelector('.container');
        if (container) {
            window.initBaccaratMinigame(container, window.playerMoney, window.updateMainGameBalance);
        }
    }
}
