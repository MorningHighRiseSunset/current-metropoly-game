// Simple Roulette Minigame
window.initRouletteMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- State ---
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBet = 100;
    let selectedBet = null;
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
            }
        }
    }

    function getRandomNumber() {
        return Math.floor(Math.random() * 37); // 0-36
    }

    function isRed(number) {
        const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        return redNumbers.includes(number);
    }

    function isBlack(number) {
        if (number === 0) return false;
        return !isRed(number);
    }

    function isEven(number) {
        if (number === 0) return false;
        return number % 2 === 0;
    }

    function isOdd(number) {
        if (number === 0) return false;
        return number % 2 === 1;
    }

    function spin() {
        if (isSpinning) return;
        if (!selectedBet) {
            showResult('Please select a bet type!');
            return;
        }
        if (balance < currentBet) {
            showResult('Not enough balance!');
            return;
        }

        balance -= currentBet;
        updateBalance();
        isSpinning = true;

        const spinBtn = q('#spin-btn');
        if (spinBtn) spinBtn.disabled = true;

        const wheel = q('#wheel');
        const resultNumber = q('#result-number');

        // Spin animation
        const rotation = 1800 + Math.random() * 360; // At least 5 full rotations
        if (wheel) {
            wheel.style.transform = `rotate(${rotation}deg)`;
        }

        showResult('Spinning...');

        // Get result after spin
        setTimeout(() => {
            const number = getRandomNumber();
            if (resultNumber) {
                resultNumber.textContent = number;
            }

            // Check win
            let won = false;
            let payout = 0;

            switch (selectedBet) {
                case 'red':
                    if (isRed(number)) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'black':
                    if (isBlack(number)) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'even':
                    if (isEven(number)) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'odd':
                    if (isOdd(number)) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
            }

            if (won) {
                balance += payout;
                updateBalance();
                showResult(`🎉 You won $${payout}! Ball landed on ${number}`, true);
            } else {
                showResult(`😢 You lost $${currentBet}. Ball landed on ${number}`, false);
            }

            isSpinning = false;

            if (spinBtn) spinBtn.disabled = false;

            // Reset wheel position
            setTimeout(() => {
                if (wheel) {
                    wheel.style.transition = 'none';
                    wheel.style.transform = 'rotate(0deg)';
                    setTimeout(() => {
                        wheel.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
                    }, 100);
                }
                if (resultNumber) {
                    resultNumber.textContent = '';
                }
            }, 3000);

            // Auto-reset after delay
            setTimeout(() => {
                showResult('Select a bet and spin again!');
            }, 4000);
        }, 3000);
    }

    // --- Event Listeners ---
    const betBtns = container.querySelectorAll('.bet-btn');
    betBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isSpinning) return;
            
            // Remove selected class from all buttons
            betBtns.forEach(b => b.classList.remove('selected'));
            
            // Add selected class to clicked button
            btn.classList.add('selected');
            selectedBet = btn.dataset.bet;
            
            showResult(`Selected: ${selectedBet.toUpperCase()}. Click Spin!`);
        });
    });

    const spinBtn = q('#spin-btn');
    if (spinBtn) {
        spinBtn.addEventListener('click', spin);
    }

    // --- Initialize ---
    updateBalance();
    showResult('Select a bet type to begin!');
};

// Auto-initialize for standalone usage
if (window.parent === window && document.currentScript && document.currentScript.src && document.currentScript.src.includes('Roulette/script.js')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.initRouletteMinigame(document.querySelector('.roulette-container'), window.playerMoney, window.updateMainGameBalance);
        });
    } else {
        window.initRouletteMinigame(document.querySelector('.roulette-container'), window.playerMoney, window.updateMainGameBalance);
    }
}
