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
        currentBet = 100;
        currentBetType = null;
        updateMoneyUI();
        // Enable betting UI
        setBettingUIEnabled(true);
        roundInProgress = false;
    }
    function deal() {
        if (roundInProgress) return;
        if (!currentBetType) {
            alert('Please select a bet type (Player, Banker, or Tie)!');
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
        // Single round only - reset game after delay
        roundInProgress = false;
        setTimeout(() => {
            resetGame();
        }, 3000);
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
    
    // Set default bet to 100 for simplicity
    currentBet = 100;
    updateMoneyUI();
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
};

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