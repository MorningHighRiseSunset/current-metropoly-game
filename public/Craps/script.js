// Simple Craps Minigame - Single Round Version
window.initCrapsMinigame = function(container, bankroll = 2500, updateMainGameBalance) {
    // Clear container
    container.innerHTML = '';
    
    // Create simple UI
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: white;
        font-family: Arial, sans-serif;
        padding: 20px;
    `;
    
    wrapper.innerHTML = `
        <h1 style="margin-bottom: 20px; font-size: 2.5em;">🎲 Craps</h1>
        <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 12px; margin-bottom: 20px; width: 100%; max-width: 400px;">
            <div style="font-size: 1.3em; margin-bottom: 10px;">Balance: $<span id="craps-balance">${bankroll}</span></div>
            <div style="font-size: 1.3em; margin-bottom: 10px;">Current Bet: $<span id="craps-bet">0</span></div>
            <div style="font-size: 1.2em; margin-bottom: 10px;">Phase: <span id="craps-phase">Come Out</span></div>
            <div style="font-size: 1.2em; margin-bottom: 10px;">Point: <span id="craps-point">-</span></div>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center;">
            <button id="bet-pass" style="padding: 12px 24px; font-size: 1.1em; background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; border: none; border-radius: 8px; cursor: pointer;">Bet Pass Line ($100)</button>
            <button id="bet-dont" style="padding: 12px 24px; font-size: 1.1em; background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; border: none; border-radius: 8px; cursor: pointer;">Bet Don't Pass ($100)</button>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <button id="roll-btn" style="padding: 15px 40px; font-size: 1.3em; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: white; border: none; border-radius: 12px; cursor: pointer;" disabled>🎲 Roll Dice</button>
        </div>
        <div id="dice-display" style="font-size: 3em; margin-bottom: 20px; height: 60px;"></div>
        <div id="craps-result" style="font-size: 1.5em; margin-bottom: 20px; min-height: 40px; text-align: center;"></div>
    `;
    
    container.appendChild(wrapper);
    
    // Game state
    let balance = bankroll;
    let currentBet = 0;
    let betType = null; // 'pass' or 'dont'
    let phase = 'comeout'; // 'comeout' or 'point'
    let point = null;
    
    // DOM elements
    const balanceEl = wrapper.querySelector('#craps-balance');
    const betEl = wrapper.querySelector('#craps-bet');
    const phaseEl = wrapper.querySelector('#craps-phase');
    const pointEl = wrapper.querySelector('#craps-point');
    const rollBtn = wrapper.querySelector('#roll-btn');
    const diceDisplay = wrapper.querySelector('#dice-display');
    const resultEl = wrapper.querySelector('#craps-result');
    const passBtn = wrapper.querySelector('#bet-pass');
    const dontBtn = wrapper.querySelector('#bet-dont');
    
    // Update UI
    function updateUI() {
        balanceEl.textContent = balance;
        betEl.textContent = currentBet;
        phaseEl.textContent = phase === 'comeout' ? 'Come Out' : 'Point';
        pointEl.textContent = point ? point : '-';
        
        // Enable/disable buttons
        passBtn.disabled = currentBet > 0 || phase === 'point';
        dontBtn.disabled = currentBet > 0 || phase === 'point';
        rollBtn.disabled = currentBet === 0;
    }
    
    // Bet functions
    passBtn.addEventListener('click', () => {
        if (balance < 100) {
            resultEl.textContent = 'Not enough balance!';
            return;
        }
        currentBet = 100;
        betType = 'pass';
        balance -= 100;
        updateUI();
        resultEl.textContent = 'Pass Line bet placed. Roll the dice!';
    });
    
    dontBtn.addEventListener('click', () => {
        if (balance < 100) {
            resultEl.textContent = 'Not enough balance!';
            return;
        }
        currentBet = 100;
        betType = 'dont';
        balance -= 100;
        updateUI();
        resultEl.textContent = "Don't Pass bet placed. Roll the dice!";
    });
    
    // Roll dice
    rollBtn.addEventListener('click', () => {
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2;
        
        diceDisplay.textContent = `🎲 ${dice1} + ${dice2} = ${total}`;
        
        if (phase === 'comeout') {
            if (total === 7 || total === 11) {
                // Pass wins, Don't Pass loses
                if (betType === 'pass') {
                    balance += currentBet * 2;
                    resultEl.textContent = `🎉 Natural ${total}! Pass Line wins! +$${currentBet}`;
                } else if (betType === 'dont') {
                    resultEl.textContent = `❌ Natural ${total}! Don't Pass loses. -$${currentBet}`;
                }
                endRound();
            } else if (total === 2 || total === 3 || total === 12) {
                // Pass loses, Don't Pass wins (except 12 is push)
                if (betType === 'pass') {
                    resultEl.textContent = `❌ Craps ${total}! Pass Line loses. -$${currentBet}`;
                } else if (betType === 'dont') {
                    if (total === 12) {
                        balance += currentBet; // Push
                        resultEl.textContent = `🤝 12 is push. Bet returned.`;
                    } else {
                        balance += currentBet * 2;
                        resultEl.textContent = `🎉 Craps ${total}! Don't Pass wins! +$${currentBet}`;
                    }
                }
                endRound();
            } else {
                // Point established
                point = total;
                phase = 'point';
                resultEl.textContent = `Point is ${point}. Keep rolling!`;
                updateUI();
            }
        } else {
            // Point phase
            if (total === 7) {
                // Seven out - Pass loses, Don't Pass wins
                if (betType === 'pass') {
                    resultEl.textContent = `❌ Seven out! Pass Line loses. -$${currentBet}`;
                } else if (betType === 'dont') {
                    balance += currentBet * 2;
                    resultEl.textContent = `🎉 Seven out! Don't Pass wins! +$${currentBet}`;
                }
                endRound();
            } else if (total === point) {
                // Point made - Pass wins, Don't Pass loses
                if (betType === 'pass') {
                    balance += currentBet * 2;
                    resultEl.textContent = `🎉 Point ${point} made! Pass Line wins! +$${currentBet}`;
                } else if (betType === 'dont') {
                    resultEl.textContent = `❌ Point ${point} made! Don't Pass loses. -$${currentBet}`;
                }
                endRound();
            } else {
                resultEl.textContent = `Rolled ${total}. Point is ${point}. Roll again!`;
            }
        }
        
        updateUI();
        syncBalance();
    });
    
    function endRound() {
        setTimeout(() => {
            currentBet = 0;
            betType = null;
            phase = 'comeout';
            point = null;
            diceDisplay.textContent = '';
            resultEl.textContent = 'Place your bet for the next round!';
            updateUI();
            syncBalance();
        }, 3000);
    }
    
    function syncBalance() {
        if (typeof updateMainGameBalance === 'function') {
            updateMainGameBalance(balance);
        } else if (container && typeof CustomEvent === 'function') {
            container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance}}));
        }
    }
    
    // Initialize
    updateUI();
};

// Auto-initialize for standalone usage
if (window.parent === window && document.currentScript && document.currentScript.src && document.currentScript.src.includes('Craps/script.js')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.initCrapsMinigame(document.querySelector('.craps-table-container'), window.playerMoney, window.updateMainGameBalance);
        });
    } else {
        window.initCrapsMinigame(document.querySelector('.craps-table-container'), window.playerMoney, window.updateMainGameBalance);
    }
}
