// Simple Slot Machine Minigame
window.initSlotMachine = function(container, playerMoney, updateMainGameBalance) {
    // --- State ---
    const symbols = ['🍒', '7️⃣', '💎', '🍋', '🍊'];
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBet = 100;
    let isSpinning = false;

    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

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

    function showResult(text, isWin = false) {
        const resultEl = q('#result');
        if (resultEl) {
            resultEl.textContent = text;
            resultEl.classList.remove('win');
            if (isWin) {
                resultEl.classList.add('win');
                createSparkles();
            }
        }
    }

    function createSparkles() {
        const reelsContainer = q('.reels');
        if (!reelsContainer) return;
        
        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('div');
                sparkle.className = 'sparkle';
                sparkle.style.left = Math.random() * 100 + '%';
                sparkle.style.top = Math.random() * 100 + '%';
                reelsContainer.appendChild(sparkle);
                
                setTimeout(() => sparkle.remove(), 1000);
            }, i * 100);
        }
    }

    function getRandomSymbol() {
        return symbols[Math.floor(Math.random() * symbols.length)];
    }

    function spin() {
        if (isSpinning) return;
        if (balance < currentBet) {
            showResult('Not enough balance!');
            return;
        }

        balance -= currentBet;
        updateBalance();
        isSpinning = true;

        const spinBtn = q('#spin-btn');
        if (spinBtn) spinBtn.disabled = true;

        const reel1 = q('#reel1');
        const reel2 = q('#reel2');
        const reel3 = q('#reel3');

        // Add spinning animation
        if (reel1) reel1.classList.add('spinning');
        if (reel2) reel2.classList.add('spinning');
        if (reel3) reel3.classList.add('spinning');

        showResult('Spinning...');

        // Spin for 2 seconds
        setTimeout(() => {
            // Remove spinning animation
            if (reel1) reel1.classList.remove('spinning');
            if (reel2) reel2.classList.remove('spinning');
            if (reel3) reel3.classList.remove('spinning');

            // Generate final symbols
            const symbol1 = getRandomSymbol();
            const symbol2 = getRandomSymbol();
            const symbol3 = getRandomSymbol();

            if (reel1) reel1.textContent = symbol1;
            if (reel2) reel2.textContent = symbol2;
            if (reel3) reel3.textContent = symbol3;

            // Check for wins
            let result = '';
            let winAmount = 0;
            let isWin = false;

            if (symbol1 === symbol2 && symbol2 === symbol3) {
                // Three of a kind
                isWin = true;
                if (reel1) reel1.classList.add('winner');
                if (reel2) reel2.classList.add('winner');
                if (reel3) reel3.classList.add('winner');
                
                if (symbol1 === '💎') {
                    winAmount = currentBet * 10;
                    result = `💎 JACKPOT! Three Diamonds! Win $${winAmount}!`;
                } else if (symbol1 === '7️⃣') {
                    winAmount = currentBet * 7;
                    result = `🎰 Lucky Sevens! Win $${winAmount}!`;
                } else {
                    winAmount = currentBet * 5;
                    result = `🎉 Three ${symbol1}! Win $${winAmount}!`;
                }
            } else if (symbol1 === symbol2 || symbol2 === symbol3 || symbol1 === symbol3) {
                // Two of a kind
                isWin = true;
                winAmount = currentBet * 2;
                result = `Nice! Two matching symbols! Win $${winAmount}!`;
            } else {
                result = 'Try again!';
            }

            if (winAmount > 0) {
                balance += winAmount;
                updateBalance();
                showResult(result, true);
            } else {
                showResult(result);
            }
            isSpinning = false;

            if (spinBtn) spinBtn.disabled = false;

            // Auto-reset after delay
            setTimeout(() => {
                showResult('Click Spin to play again!');
                if (reel1) reel1.classList.remove('winner');
                if (reel2) reel2.classList.remove('winner');
                if (reel3) reel3.classList.remove('winner');
            }, 3000);
        }, 2000);
    }

    // --- Event Listeners ---
    const spinBtn = q('#spin-btn');
    if (spinBtn) {
        spinBtn.addEventListener('click', spin);
    }

    // --- Initialize ---
    updateBalance();
    showResult('Click Spin to play!');
};

// Auto-initialize for standalone usage
if (window.parent === window && document.currentScript && document.currentScript.src && document.currentScript.src.includes('slotMachine/script.js')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.initSlotMachine(document.querySelector('.slot-container'), window.playerMoney, window.updateMainGameBalance);
        });
    } else {
        window.initSlotMachine(document.querySelector('.slot-container'), window.playerMoney, window.updateMainGameBalance);
    }
}
