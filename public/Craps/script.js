// Craps Minigame with Full Casino Rules
window.initCrapsMinigame = function(container, bankroll = 2500, updateMainGameBalance) {
    // Game state
    let balance = bankroll;
    let selectedBetAmount = 100; // Default bet amount
    let phase = 'comeout';
    let point = null;
    let bets = []; // Array of active bets: {type, amount, point, number}
    
    // Payout multipliers
    const payouts = {
        'pass': 1,
        'dont-pass': 1,
        'come': 1,
        'dont-come': 1,
        'place-4': 9/5,
        'place-5': 7/5,
        'place-6': 7/6,
        'place-8': 7/6,
        'place-9': 7/5,
        'place-10': 9/5,
        'field': 1,
        'field-2': 2,
        'field-12': 2,
        'any-craps': 7,
        '7': 4,
        'hard-4': 7,
        'hard-6': 9,
        'hard-8': 9,
        'hard-10': 7
    };
    
    // DOM elements
    const balanceEl = container.querySelector('#balance');
    const betEl = container.querySelector('#current-bet');
    const phaseEl = container.querySelector('#phase');
    const pointEl = container.querySelector('#point');
    const rollBtn = container.querySelector('#roll-btn');
    const clearBtn = container.querySelector('#clear-btn');
    const resultEl = container.querySelector('#result');
    const dice1 = container.querySelector('#dice1');
    const dice2 = container.querySelector('#dice2');
    const betAreas = container.querySelectorAll('.bet-area');
    
    function getTotalBets() {
        return bets.reduce((sum, bet) => sum + bet.amount, 0);
    }
    
    function updateUI() {
        balanceEl.textContent = balance;
        betEl.textContent = getTotalBets();
        phaseEl.textContent = phase === 'comeout' ? 'Come Out' : 'Point';
        pointEl.textContent = point ? point : '-';
        
        rollBtn.disabled = bets.length === 0;
        
        betAreas.forEach(area => {
            area.classList.remove('selected');
            const betType = area.dataset.bet;
            const hasBet = bets.some(b => b.type === betType || (b.type.startsWith('place-') && b.type === `place-${betType}`));
            if (hasBet) {
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
    
    function addBet(type, amount = null) {
        const betAmount = amount || selectedBetAmount;
        if (balance < betAmount) {
            showResult('Not enough balance!');
            return false;
        }
        
        balance -= betAmount;
        
        // Handle place bets
        if (['4', '5', '6', '8', '9', '10'].includes(type)) {
            bets.push({ type: `place-${type}`, amount: betAmount, number: parseInt(type) });
        } else {
            bets.push({ type, amount: betAmount });
        }
        
        updateUI();
        syncBalance();
        return true;
    }
    
    function isHardWay(total, d1, d2) {
        return (total === 4 && d1 === 2 && d2 === 2) ||
               (total === 6 && d1 === 3 && d2 === 3) ||
               (total === 8 && d1 === 4 && d2 === 4) ||
               (total === 10 && d1 === 5 && d2 === 5);
    }
    
    // Bet area click handlers
    betAreas.forEach(area => {
        area.addEventListener('click', () => {
            const betType = area.dataset.bet;
            
            // Check if bet already exists
            const existingBetIndex = bets.findIndex(b => 
                b.type === betType || 
                (b.type.startsWith('place-') && b.type === `place-${betType}`)
            );
            
            if (existingBetIndex !== -1) {
                showResult('Bet already placed!');
                return;
            }
            
            const betName = area.querySelector('.bet-label')?.textContent || betType;
            if (addBet(betType)) {
                showResult(`${betName} bet placed. Roll the dice!`);
            }
        });
    });
    
    // Clear bets
    clearBtn.addEventListener('click', () => {
        if (bets.length > 0) {
            const total = getTotalBets();
            balance += total;
            bets = [];
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
        let winnings = 0;
        let results = [];
        
        dice1.classList.add('rolling');
        dice2.classList.add('rolling');
        dice1.textContent = '🎲';
        dice2.textContent = '🎲';
        
        setTimeout(() => {
            dice1.classList.remove('rolling');
            dice2.classList.remove('rolling');
            dice1.textContent = d1;
            dice2.textContent = d2;
            
            // Process each bet
            bets.forEach((bet, index) => {
                let won = false;
                let lost = false;
                let payout = 0;
                
                // Pass Line
                if (bet.type === 'pass') {
                    if (phase === 'comeout') {
                        if (total === 7 || total === 11) {
                            won = true;
                            payout = bet.amount * (1 + payouts.pass);
                            results.push('Pass Line wins!');
                        } else if (total === 2 || total === 3 || total === 12) {
                            lost = true;
                            results.push('Pass Line loses');
                        }
                    } else {
                        if (total === point) {
                            won = true;
                            payout = bet.amount * (1 + payouts.pass);
                            results.push('Pass Line wins!');
                        } else if (total === 7) {
                            lost = true;
                            results.push('Pass Line loses');
                        }
                    }
                }
                
                // Don't Pass
                else if (bet.type === 'dont-pass') {
                    if (phase === 'comeout') {
                        if (total === 2 || total === 3) {
                            won = true;
                            payout = bet.amount * (1 + payouts['dont-pass']);
                            results.push("Don't Pass wins!");
                        } else if (total === 12) {
                            // Push - return bet
                            payout = bet.amount;
                            results.push("Don't Pass push");
                        } else if (total === 7 || total === 11) {
                            lost = true;
                            results.push("Don't Pass loses");
                        }
                    } else {
                        if (total === 7) {
                            won = true;
                            payout = bet.amount * (1 + payouts['dont-pass']);
                            results.push("Don't Pass wins!");
                        } else if (total === point) {
                            lost = true;
                            results.push("Don't Pass loses");
                        }
                    }
                }
                
                // Come
                else if (bet.type === 'come') {
                    if (phase === 'comeout') {
                        if (total === 7 || total === 11) {
                            won = true;
                            payout = bet.amount * (1 + payouts.come);
                            results.push('Come wins!');
                        } else if (total === 2 || total === 3 || total === 12) {
                            lost = true;
                            results.push('Come loses');
                        } else {
                            // Establish come point
                            bet.point = total;
                            bet.type = `come-${total}`;
                            results.push(`Come point is ${total}`);
                        }
                    } else {
                        // Come bets with established points
                        if (bet.type.startsWith('come-')) {
                            const comePoint = parseInt(bet.type.split('-')[1]);
                            if (total === comePoint) {
                                won = true;
                                payout = bet.amount * (1 + payouts.come);
                                results.push(`Come ${comePoint} wins!`);
                            } else if (total === 7) {
                                lost = true;
                                results.push(`Come ${comePoint} loses`);
                            }
                        }
                    }
                }
                
                // Don't Come
                else if (bet.type === 'dont-come') {
                    if (phase === 'comeout') {
                        if (total === 2 || total === 3) {
                            won = true;
                            payout = bet.amount * (1 + payouts['dont-come']);
                            results.push("Don't Come wins!");
                        } else if (total === 12) {
                            payout = bet.amount;
                            results.push("Don't Come push");
                        } else if (total === 7 || total === 11) {
                            lost = true;
                            results.push("Don't Come loses");
                        } else {
                            bet.point = total;
                            bet.type = `dont-come-${total}`;
                            results.push(`Don't Come point is ${total}`);
                        }
                    } else {
                        if (bet.type.startsWith('dont-come-')) {
                            const dontComePoint = parseInt(bet.type.split('-')[2]);
                            if (total === 7) {
                                won = true;
                                payout = bet.amount * (1 + payouts['dont-come']);
                                results.push(`Don't Come ${dontComePoint} wins!`);
                            } else if (total === dontComePoint) {
                                lost = true;
                                results.push(`Don't Come ${dontComePoint} loses`);
                            }
                        }
                    }
                }
                
                // Place bets
                else if (bet.type.startsWith('place-')) {
                    const placeNum = parseInt(bet.type.split('-')[1]);
                    if (total === placeNum) {
                        won = true;
                        payout = bet.amount * (1 + payouts[bet.type]);
                        results.push(`Place ${placeNum} wins!`);
                    } else if (total === 7) {
                        lost = true;
                        results.push(`Place ${placeNum} loses`);
                    }
                }
                
                // Field
                else if (bet.type === 'field') {
                    if ([2, 3, 4, 9, 10, 11, 12].includes(total)) {
                        won = true;
                        if (total === 2 || total === 12) {
                            payout = bet.amount * (1 + payouts[`field-${total}`]);
                            results.push(`Field ${total} wins (2:1)!`);
                        } else {
                            payout = bet.amount * (1 + payouts.field);
                            results.push(`Field wins!`);
                        }
                    } else {
                        lost = true;
                        results.push('Field loses');
                    }
                }
                
                // Any Craps
                else if (bet.type === 'any-craps') {
                    if ([2, 3, 12].includes(total)) {
                        won = true;
                        payout = bet.amount * (1 + payouts['any-craps']);
                        results.push('Any Craps wins!');
                    } else {
                        lost = true;
                        results.push('Any Craps loses');
                    }
                }
                
                // 7 bet
                else if (bet.type === '7') {
                    if (total === 7) {
                        won = true;
                        payout = bet.amount * (1 + payouts['7']);
                        results.push('7 wins!');
                    } else {
                        lost = true;
                        results.push('7 loses');
                    }
                }
                
                // Hard ways
                else if (bet.type.startsWith('hard-')) {
                    const hardNum = parseInt(bet.type.split('-')[1]);
                    if (total === hardNum && isHardWay(total, d1, d2)) {
                        won = true;
                        payout = bet.amount * (1 + payouts[bet.type]);
                        results.push(`Hard ${hardNum} wins!`);
                    } else if (total === hardNum && !isHardWay(total, d1, d2)) {
                        // Easy way - loses
                        lost = true;
                        results.push(`Hard ${hardNum} loses (easy way)`);
                    } else if (total === 7) {
                        lost = true;
                        results.push(`Hard ${hardNum} loses (7 out)`);
                    }
                }
                
                if (won) {
                    winnings += payout;
                } else if (lost) {
                    // Bet is lost, no payout
                }
                
                // Mark bet for removal if won or lost (except place/hard bets which stay until 7)
                if ((won || lost) && !bet.type.startsWith('place-') && !bet.type.startsWith('hard-') && !bet.type.startsWith('come-') && !bet.type.startsWith('dont-come-')) {
                    bet.remove = true;
                }
                // Come bets with points are resolved
                if ((won || lost) && (bet.type.startsWith('come-') || bet.type.startsWith('dont-come-'))) {
                    bet.remove = true;
                }
            });
            
            // Update main point phase
            if (phase === 'comeout') {
                if (total === 7 || total === 11 || total === 2 || total === 3 || total === 12) {
                    // Round ends, reset phase
                    phase = 'comeout';
                    point = null;
                } else {
                    point = total;
                    phase = 'point';
                }
            } else {
                if (total === 7 || total === point) {
                    // Round ends
                    phase = 'comeout';
                    point = null;
                    // Remove all place and hard bets on 7 out
                    if (total === 7) {
                        bets.forEach(bet => {
                            if (bet.type.startsWith('place-') || bet.type.startsWith('hard-')) {
                                bet.remove = true;
                            }
                        });
                    }
                }
            }
            
            // Remove resolved bets
            bets = bets.filter(bet => !bet.remove);
            
            balance += winnings;
            
            if (results.length > 0) {
                showResult(results.join(' | '), winnings > 0);
            } else {
                showResult(`Rolled ${total}. Point is ${point}. Roll again!`);
            }
            
            updateUI();
            syncBalance();
        }, 500);
    });
    
    function syncBalance() {
        if (typeof updateMainGameBalance === 'function') {
            updateMainGameBalance(balance);
        } else if (container && typeof CustomEvent === 'function') {
            container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance}}));
        }
    }
    
    // Bet amount selector
    const betAmountSelector = container.querySelector('#bet-amount-selector');
    if (betAmountSelector) {
        betAmountSelector.addEventListener('change', (e) => {
            selectedBetAmount = parseInt(e.target.value);
        });
    }
    
    updateUI();
    syncBalance();
};