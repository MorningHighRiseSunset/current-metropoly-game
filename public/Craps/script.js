// Craps Minigame with Professional Table Layout
window.initCrapsMinigame = function(container, bankroll = 2500, updateMainGameBalance) {
    // Game state
    let balance = bankroll;
    let currentBet = 0;
    let betType = null; // 'pass', 'dont', or specific bets
    let phase = 'comeout'; // 'comeout' or 'point'
    let point = null;
    
    // DOM elements (using existing HTML structure)
    const balanceEl = container.querySelector('#craps-balance');
    const betEl = container.querySelector('#craps-bet');
    const phaseEl = container.querySelector('#craps-phase');
    const pointEl = container.querySelector('#craps-point');
    const rollBtn = container.querySelector('#roll-btn');
    const clearBtn = container.querySelector('#clear-bets');
    const resultEl = container.querySelector('#craps-result');
    const dice1 = container.querySelector('#dice1');
    const dice2 = container.querySelector('#dice2');
    const betAreas = container.querySelectorAll('.bet-area');
    
    // Update UI
    function updateUI() {
        balanceEl.textContent = balance;
        betEl.textContent = currentBet;
        phaseEl.textContent = phase === 'comeout' ? 'Come Out' : 'Point';
        pointEl.textContent = point ? point : '-';
        
        // Enable/disable buttons
        rollBtn.disabled = currentBet === 0;
        
        // Update bet area selection
        betAreas.forEach(area => {
            area.classList.remove('selected');
            if (area.dataset.bet === betType) {
                area.classList.add('selected');
            }
        });
    }
    
    function showResult(text, isWin = false) {
        resultEl.textContent = text;
        resultEl.classList.remove('win');
        if (isWin) {
            resultEl.classList.add('win');
        }
    }
    
    // Bet area click handlers
    betAreas.forEach(area => {
        area.addEventListener('click', () => {
            if (currentBet > 0) {
                showResult('Clear current bet first!');
                return;
            }
            
            if (balance < 100) {
                showResult('Not enough balance!');
                return;
            }
            
            const bet = area.dataset.bet;
            currentBet = 100;
            betType = bet;
            balance -= 100;
            updateUI();
            
            const betName = area.querySelector('.label')?.textContent || bet;
            showResult(`${betName} bet placed. Roll the dice!`);
        });
    });
    
    // Clear bets
    clearBtn.addEventListener('click', () => {
        if (currentBet > 0) {
            balance += currentBet;
            currentBet = 0;
            betType = null;
            updateUI();
            showResult('Bets cleared.');
            syncBalance();
        }
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
                    } else if (betType === 'dont-pass') {
                        showResult(`❌ Natural ${total}! Don't Pass loses. -$${currentBet}`, false);
                    } else {
                        showResult(`Rolled ${total}. No bet placed.`, false);
                    }
                    endRound();
                } else if (total === 2 || total === 3 || total === 12) {
                    // Pass loses, Don't Pass wins (except 12 is push)
                    if (betType === 'pass') {
                        showResult(`❌ Craps ${total}! Pass Line loses. -$${currentBet}`, false);
                    } else if (betType === 'dont-pass') {
                        if (total === 12) {
                            balance += currentBet; // Push
                            showResult(`🤝 12 is push. Bet returned.`, false);
                        } else {
                            balance += currentBet * 2;
                            showResult(`🎉 Craps ${total}! Don't Pass wins! +$${currentBet}`, true);
                        }
                    } else {
                        showResult(`Rolled ${total}. No bet placed.`, false);
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
                    } else if (betType === 'dont-pass') {
                        balance += currentBet * 2;
                        showResult(`🎉 Seven out! Don't Pass wins! +$${currentBet}`, true);
                    } else {
                        showResult(`Seven out! No bet placed.`, false);
                    }
                    endRound();
                } else if (total === point) {
                    // Point made - Pass wins, Don't Pass loses
                    if (betType === 'pass') {
                        balance += currentBet * 2;
                        showResult(`🎉 Point ${point} made! Pass Line wins! +$${currentBet}`, true);
                    } else if (betType === 'dont-pass') {
                        showResult(`❌ Point ${point} made! Don't Pass loses. -$${currentBet}`, false);
                    } else {
                        showResult(`Point ${point} made! No bet placed.`, false);
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