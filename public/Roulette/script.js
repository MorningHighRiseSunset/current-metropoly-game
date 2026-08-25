// American Roulette Minigame with proper betting
window.initRouletteMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- State ---
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBet = 100;
    let selectedBet = null;
    let isSpinning = false;

    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }

    // --- Roulette wheel numbers in order (American style) ---
    const wheelNumbers = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
    
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

    // --- Helper functions ---
    function isRed(number) {
        if (number === 0 || number === '00') return false;
        return redNumbers.includes(number);
    }

    function isBlack(number) {
        if (number === 0 || number === '00') return false;
        return !isRed(number);
    }

    function getColor(number) {
        if (number === 0 || number === '00') return 'green';
        return isRed(number) ? 'red' : 'black';
    }

    function getRandomNumber() {
        return wheelNumbers[Math.floor(Math.random() * wheelNumbers.length)];
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

    // --- Spin function ---
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

        const spinBtn = q('#spin');
        const resetBtn = q('#reset');
        const inner = q('.inner');
        const mask = q('.mask');
        const data = q('.data');

        if (spinBtn) spinBtn.style.display = 'none';
        if (resetBtn) {
            resetBtn.style.display = 'inline-block';
            resetBtn.classList.add('disabled');
            resetBtn.disabled = true;
        }

        const placeholder = q('.placeholder');
        if (placeholder) placeholder.remove();

        const randomNumber = getRandomNumber();
        const color = getColor(randomNumber);

        // Find the index in wheel numbers
        const numberIndex = wheelNumbers.indexOf(randomNumber);
        
        // Set the spin animation
        if (inner) {
            inner.setAttribute('data-spinto', randomNumber.toString());
        }

        // Check the corresponding radio button
        const radioInput = q(`input[value="${randomNumber}"]`);
        if (radioInput) radioInput.checked = true;

        if (mask) mask.textContent = '';

        setTimeout(() => {
            if (mask) mask.textContent = '';
        }, 4500);

        setTimeout(() => {
            if (resetBtn) {
                resetBtn.classList.remove('disabled');
                resetBtn.disabled = false;
            }

            const resultNumber = q('.result-number');
            const resultColor = q('.result-color');
            const resultDiv = q('.result');

            if (resultNumber) resultNumber.textContent = randomNumber;
            if (resultColor) resultColor.textContent = color;
            if (resultDiv) resultDiv.style.backgroundColor = color;
            
            if (data) data.classList.add('reveal');
            if (inner) inner.classList.add('rest');

            // Add to previous results
            const previousList = q('.previous-list');
            if (previousList) {
                const resultItem = document.createElement('li');
                resultItem.className = `previous-result color-${color}`;
                resultItem.innerHTML = `<span class="previous-number">${randomNumber}</span><span class="previous-color">${color}</span>`;
                previousList.prepend(resultItem);
            }

            // Check win
            let won = false;
            let payout = 0;

            switch (selectedBet) {
                case 'red':
                    if (isRed(randomNumber)) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'black':
                    if (isBlack(randomNumber)) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'even':
                    if (randomNumber !== 0 && randomNumber !== '00' && randomNumber % 2 === 0) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'odd':
                    if (randomNumber !== 0 && randomNumber !== '00' && randomNumber % 2 === 1) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'low':
                    if (randomNumber >= 1 && randomNumber <= 18) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case 'high':
                    if (randomNumber >= 19 && randomNumber <= 36) {
                        won = true;
                        payout = currentBet * 2;
                    }
                    break;
                case '0':
                    if (randomNumber === 0) {
                        won = true;
                        payout = currentBet * 36;
                    }
                    break;
                case '00':
                    if (randomNumber === '00') {
                        won = true;
                        payout = currentBet * 36;
                    }
                    break;
            }

            if (won) {
                balance += payout;
                updateBalance();
                showResult(`🎉 You won $${payout}! Ball landed on ${randomNumber}`, true);
            } else {
                showResult(`😢 You lost $${currentBet}. Ball landed on ${randomNumber}`, false);
            }

            isSpinning = false;

        }, 9000);
    }

    // --- Reset function ---
    function reset() {
        const inner = q('.inner');
        const spinBtn = q('#spin');
        const resetBtn = q('#reset');
        const data = q('.data');

        if (inner) {
            inner.removeAttribute('data-spinto');
            inner.classList.remove('rest');
        }
        
        if (spinBtn) spinBtn.style.display = 'inline-block';
        if (resetBtn) resetBtn.style.display = 'none';
        if (data) data.classList.remove('reveal');
    }

    // --- Event Listeners ---
    const spinBtn = q('#spin');
    const resetBtn = q('#reset');
    const betBtns = container.querySelectorAll('.bet-btn');

    if (spinBtn) spinBtn.addEventListener('click', spin);
    if (resetBtn) resetBtn.addEventListener('click', reset);

    // Bet button selection
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

    // --- Initialize ---
    const mask = q('.mask');
    if (mask) mask.textContent = '';
    
    if (resetBtn) resetBtn.style.display = 'none';
    
    updateBalance();
    showResult('Select a bet type to begin!');
};

// Auto-initialize for standalone usage
if (window.parent === window && document.currentScript && document.currentScript.src && document.currentScript.src.includes('Roulette/script.js')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.initRouletteMinigame(document.querySelector('.main'), window.playerMoney, window.updateMainGameBalance);
        });
    } else {
        window.initRouletteMinigame(document.querySelector('.main'), window.playerMoney, window.updateMainGameBalance);
    }
}
