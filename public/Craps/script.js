// Simple Craps Minigame - Single Round Version
window.initCrapsMinigame = function(container, bankroll = 2500, updateMainGameBalance) {
    // Create simple UI
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
        color: white;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        padding: 20px;
    `;
    
    // Only create UI if container is empty
    if (container.children.length === 0) {
        wrapper.innerHTML = `
            <h1 style="margin-bottom: 20px; font-size: 2.5em; background: linear-gradient(45deg, #9b59b6, #8e44ad, #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 0 30px rgba(155, 89, 182, 0.5); animation: titleGlow 2s ease-in-out infinite; letter-spacing: 2px;">🎲 Craps</h1>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, rgba(155, 89, 182, 0.15), rgba(142, 68, 173, 0.15)); border: 2px solid rgba(155, 89, 182, 0.4); border-radius: 15px; backdrop-filter: blur(10px); box-shadow: 0 8px 32px rgba(155, 89, 182, 0.3);">
                <div style="font-size: 1.2em; font-weight: bold; text-shadow: 0 0 10px rgba(155, 89, 182, 0.5);">Balance: $<span id="craps-balance">${bankroll}</span></div>
                <div style="font-size: 1.2em; font-weight: bold; text-shadow: 0 0 10px rgba(155, 89, 182, 0.5);">Current Bet: $<span id="craps-bet">0</span></div>
            </div>
            
            <div style="font-size: 1.2em; margin-bottom: 15px; color: #9b59b6;">Phase: <span id="craps-phase">Come Out</span> | Point: <span id="craps-point">-</span></div>
            
            <div style="font-size: 4em; margin: 25px 0; min-height: 80px; display: flex; align-items: center; justify-content: center; gap: 20px;">
                <div class="dice" id="dice1" style="width: 80px; height: 80px; background: linear-gradient(145deg, #ffffff, #f0f0f0); border-radius: 15px; display: flex; align-items: center; justify-content: center; font-size: 2.5em; box-shadow: 0 8px 20px rgba(0,0,0,0.3); color: #1a1a2e; transition: transform 0.3s ease;">🎲</div>
                <div class="dice" id="dice2" style="width: 80px; height: 80px; background: linear-gradient(145deg, #ffffff, #f0f0f0); border-radius: 15px; display: flex; align-items: center; justify-content: center; font-size: 2.5em; box-shadow: 0 8px 20px rgba(0,0,0,0.3); color: #1a1a2e; transition: transform 0.3s ease;">🎲</div>
            </div>
            
            <div id="craps-result" style="font-size: 1.5em; margin: 20px 0; padding: 20px; background: linear-gradient(135deg, rgba(155, 89, 182, 0.2), rgba(142, 68, 173, 0.2)); border: 2px solid rgba(155, 89, 182, 0.5); border-radius: 15px; min-height: 60px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); box-shadow: 0 8px 32px rgba(155, 89, 182, 0.2); transition: all 0.3s ease;"></div>
            
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button id="bet-pass" style="padding: 15px 30px; font-size: 1.1em; font-weight: bold; border: none; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; box-shadow: 0 8px 20px rgba(39, 174, 96, 0.4); text-transform: uppercase; letter-spacing: 1px;">� Pass Line ($100)</button>
                <button id="bet-dont" style="padding: 15px 30px; font-size: 1.1em; font-weight: bold; border: none; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; box-shadow: 0 8px 20px rgba(231, 76, 60, 0.4); text-transform: uppercase; letter-spacing: 1px;">❌ Don't Pass ($100)</button>
                <button id="roll-btn" style="padding: 15px 30px; font-size: 1.1em; font-weight: bold; border: none; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: white; box-shadow: 0 8px 20px rgba(155, 89, 182, 0.4); text-transform: uppercase; letter-spacing: 1px;" disabled>🎲 Roll Dice</button>
            </div>
        `;
        container.appendChild(wrapper);
    }
    
    // Game state
    let balance = bankroll;
    let currentBet = 0;
    let betType = null; // 'pass' or 'dont'
    let phase = 'comeout'; // 'comeout' or 'point'
    let point = null;
    
    // DOM elements
    const balanceEl = container.querySelector('#craps-balance');
    const betEl = container.querySelector('#craps-bet');
    const phaseEl = container.querySelector('#craps-phase');
    const pointEl = container.querySelector('#craps-point');
    const rollBtn = container.querySelector('#roll-btn');
    const diceDisplay = container.querySelector('#craps-result');
    const dice1 = container.querySelector('#dice1');
    const dice2 = container.querySelector('#dice2');
    const passBtn = container.querySelector('#bet-pass');
    const dontBtn = container.querySelector('#bet-dont');
    
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
    
    function showResult(text, isWin = false) {
        diceDisplay.textContent = text;
        diceDisplay.classList.remove('win');
        if (isWin) {
            diceDisplay.classList.add('win');
        }
    }
    
    // Bet functions
    passBtn.addEventListener('click', () => {
        if (balance < 100) {
            showResult('Not enough balance!');
            return;
        }
        currentBet = 100;
        betType = 'pass';
        balance -= 100;
        updateUI();
        showResult('Pass Line bet placed. Roll the dice!');
    });
    
    dontBtn.addEventListener('click', () => {
        if (balance < 100) {
            showResult('Not enough balance!');
            return;
        }
        currentBet = 100;
        betType = 'dont';
        balance -= 100;
        updateUI();
        showResult("Don't Pass bet placed. Roll the dice!");
    });
    
    // Roll dice
    rollBtn.addEventListener('click', () => {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2;
        
        // Add rolling animation
        dice1.classList.add('rolling');
        dice2.classList.add('rolling');
        dice1.textContent = '🎲';
        dice2.textContent = '🎲';
        
        setTimeout(() => {
            dice1.classList.remove('rolling');
            dice2.classList.remove('rolling');
            dice1.textContent = d1;
            dice2.textContent = d2;
            
            if (phase === 'comeout') {
                if (total === 7 || total === 11) {
                    // Pass wins, Don't Pass loses
                    if (betType === 'pass') {
                        balance += currentBet * 2;
                        showResult(`🎉 Natural ${total}! Pass Line wins! +$${currentBet}`, true);
                    } else if (betType === 'dont') {
                        showResult(`❌ Natural ${total}! Don't Pass loses. -$${currentBet}`, false);
                    }
                    endRound();
                } else if (total === 2 || total === 3 || total === 12) {
                    // Pass loses, Don't Pass wins (except 12 is push)
                    if (betType === 'pass') {
                        showResult(`❌ Craps ${total}! Pass Line loses. -$${currentBet}`, false);
                    } else if (betType === 'dont') {
                        if (total === 12) {
                            balance += currentBet; // Push
                            showResult(`🤝 12 is push. Bet returned.`, false);
                        } else {
                            balance += currentBet * 2;
                            showResult(`🎉 Craps ${total}! Don't Pass wins! +$${currentBet}`, true);
                        }
                    }
                    endRound();
                } else {
                    // Point established
                    point = total;
                    phase = 'point';
                    showResult(`Point is ${point}. Keep rolling!`, false);
                    updateUI();
                }
            } else {
                // Point phase
                if (total === 7) {
                    // Seven out - Pass loses, Don't Pass wins
                    if (betType === 'pass') {
                        showResult(`❌ Seven out! Pass Line loses. -$${currentBet}`, false);
                    } else if (betType === 'dont') {
                        balance += currentBet * 2;
                        showResult(`🎉 Seven out! Don't Pass wins! +$${currentBet}`, true);
                    }
                    endRound();
                } else if (total === point) {
                    // Point made - Pass wins, Don't Pass loses
                    if (betType === 'pass') {
                        balance += currentBet * 2;
                        showResult(`🎉 Point ${point} made! Pass Line wins! +$${currentBet}`, true);
                    } else if (betType === 'dont') {
                        showResult(`❌ Point ${point} made! Don't Pass loses. -$${currentBet}`, false);
                    }
                    endRound();
                } else {
                    showResult(`Rolled ${total}. Point is ${point}. Roll again!`, false);
                }
            }
            
            updateUI();
            syncBalance();
        }, 500);
    });
    
    function endRound() {
        setTimeout(() => {
            currentBet = 0;
            betType = null;
            phase = 'comeout';
            point = null;
            dice1.textContent = '🎲';
            dice2.textContent = '🎲';
            showResult('Place your bet for the next round!', false);
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
    syncBalance();
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
