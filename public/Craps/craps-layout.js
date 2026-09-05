// Craps Game JavaScript
class CrapsGame {
  constructor() {
    this.balance = 1000;
    this.currentBet = 0;
    this.selectedChip = 0;
    this.bets = {};
    this.point = null;
    this.gamePhase = 'come-out'; // 'come-out' or 'point'
    this.dice1 = 0;
    this.dice2 = 0;
    this.totalWinLoss = 0;
    this.updateMainGameBalance = null;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateUI();
  }

  // Initialize craps minigame for integration with main game
  initGame(playerMoney, syncCasinoBalance) {
    this.balance = typeof playerMoney === 'number' ? playerMoney : 1000;
    this.updateMainGameBalance = typeof syncCasinoBalance === 'function' ? syncCasinoBalance : null;
    
    // Expose balance for main game to read
    window.__casinoBalance = this.balance;
    
    // Add iframe mode class to body if embedded
    try {
      if (window.self !== window.top) {
        document.body.classList.add('iframe-mode');
      }
    } catch (e) {
      // If we can't access window.top, we're likely in an iframe
      document.body.classList.add('iframe-mode');
    }
    
    // Update UI with new balance
    this.updateUI();
  }

  setupEventListeners() {
    // Chip selection
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.selectedChip = parseInt(chip.dataset.value);
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Betting areas
    document.querySelectorAll('.betting-area').forEach(area => {
      area.addEventListener('click', () => this.placeBet(area));
    });

    // Roll button
    document.getElementById('roll-btn').addEventListener('click', () => this.rollDice());

    // Clear bets button
    document.getElementById('clear-bets-btn').addEventListener('click', () => this.clearBets());

    // Instructions button
    document.getElementById('instructions-btn').addEventListener('click', () => this.openInstructions());

    // Close instructions button
    document.getElementById('close-instructions').addEventListener('click', () => this.closeInstructions());

    // Close modal when clicking outside
    document.getElementById('instructions-modal').addEventListener('click', (e) => {
      if (e.target.id === 'instructions-modal') {
        this.closeInstructions();
      }
    });
  }

  openInstructions() {
    document.getElementById('instructions-modal').style.display = 'block';
  }

  closeInstructions() {
    document.getElementById('instructions-modal').style.display = 'none';
  }

  placeBet(area) {
    if (this.selectedChip === 0) {
      this.clearBetFromArea(area);
      return;
    }

    if (this.selectedChip > this.balance) {
      this.updateStatus('Insufficient balance!');
      return;
    }

    // Prevent betting if balance would go negative
    if (this.balance - this.selectedChip < 0) {
      this.updateStatus('Insufficient balance!');
      return;
    }

    const betType = area.dataset.betType;
    if (!betType) {
      console.log('No bet type found on area');
      return;
    }

    this.balance -= this.selectedChip;
    this.currentBet += this.selectedChip;

    if (!this.bets[betType]) {
      this.bets[betType] = 0;
    }
    this.bets[betType] += this.selectedChip;

    area.classList.add('has-bet');
    area.dataset.bet = this.bets[betType];
    area.dataset.chipValue = this.selectedChip; // Track the chip value for coloring

    console.log(`Placed bet: $${this.bets[betType]} on ${betType} with $${this.selectedChip} chip`);
    this.updateUI();
    this.updateStatus(`Bet $${this.selectedChip} on ${betType}`);
  }

  clearBetFromArea(area) {
    const betType = area.dataset.betType;
    if (!betType || !this.bets[betType]) return;

    this.balance += this.bets[betType];
    this.currentBet -= this.bets[betType];
    delete this.bets[betType];

    area.classList.remove('has-bet');
    area.dataset.bet = '';

    this.updateUI();
    this.updateStatus('Bet cleared');
  }

  clearBets() {
    // Return all bets to balance
    for (const betType in this.bets) {
      this.balance += this.bets[betType];
    }
    this.bets = {};
    this.currentBet = 0;

    // Clear visual indicators
    document.querySelectorAll('.betting-area').forEach(area => {
      area.classList.remove('has-bet');
      area.dataset.bet = '';
    });

    this.updateUI();
    this.updateStatus('All bets cleared');
  }

  rollDice() {
    if (this.currentBet === 0) {
      this.updateStatus('Place a bet first!');
      return;
    }

    // Animate dice
    this.animateDice();

    setTimeout(() => {
      this.dice1 = Math.floor(Math.random() * 6) + 1;
      this.dice2 = Math.floor(Math.random() * 6) + 1;
      const total = this.dice1 + this.dice2;

      this.updateDiceDisplay(this.dice1, this.dice2, total);
      this.processRoll(total);
    }, 500);
  }

  animateDice() {
    const dice1 = document.getElementById('dice1');
    const dice2 = document.getElementById('dice2');
    
    let rolls = 0;
    const interval = setInterval(() => {
      const randomRotateX = Math.random() * 720 - 360;
      const randomRotateY = Math.random() * 720 - 360;
      const randomRotateZ = Math.random() * 720 - 360;
      
      dice1.style.transform = `rotateX(${randomRotateX}deg) rotateY(${randomRotateY}deg) rotateZ(${randomRotateZ}deg)`;
      dice2.style.transform = `rotateX(${randomRotateX}deg) rotateY(${randomRotateY}deg) rotateZ(${randomRotateZ}deg)`;
      
      rolls++;
      
      if (rolls >= 15) {
        clearInterval(interval);
        // Call updateDiceDisplay after animation to set final position
        setTimeout(() => {
          this.updateDiceDisplay(this.dice1, this.dice2, this.dice1 + this.dice2);
        }, 50);
      }
    }, 50);
  }

  updateDiceDisplay(d1, d2, total) {
    const dice1 = document.getElementById('dice1');
    const dice2 = document.getElementById('dice2');
    
    // Map dice values to face rotations - rotate cube so desired face faces front
    const faceRotations = {
      1: 'rotateX(0deg) rotateY(0deg)',        // front (1 dot) - no rotation needed
      6: 'rotateX(0deg) rotateY(180deg)',     // back (6 dots) - rotate 180° Y
      2: 'rotateX(0deg) rotateY(90deg)',      // left (2 dots) - rotate 90° Y
      5: 'rotateX(0deg) rotateY(-90deg)',     // right (5 dots) - rotate -90° Y
      3: 'rotateX(-90deg) rotateY(0deg)',     // top (3 dots) - rotate -90° X
      4: 'rotateX(90deg) rotateY(0deg)'       // bottom (4 dots) - rotate 90° X
    };
    
    console.log(`Dice 1: ${d1}, rotation: ${faceRotations[d1]}`);
    console.log(`Dice 2: ${d2}, rotation: ${faceRotations[d2]}`);
    
    dice1.style.transform = faceRotations[d1];
    dice2.style.transform = faceRotations[d2];
    
    document.getElementById('total').textContent = total;
  }

  processRoll(total) {
    let winnings = 0;
    let losses = 0;
    let message = '';
    let passLineResolved = false;
    let dontPassResolved = false;

    if (this.gamePhase === 'come-out') {
      // Come-out roll rules
      if (total === 7 || total === 11) {
        // Pass line wins
        if (this.bets['pass-line']) {
          winnings += this.bets['pass-line'] * 2;
          message = 'Pass Line wins! ';
          passLineResolved = true;
        }
        // Don't pass loses
        if (this.bets['dont-pass']) {
          losses += this.bets['dont-pass'];
          message += "Don't Pass loses. ";
          dontPassResolved = true;
        }
        this.gamePhase = 'come-out';
        this.point = null;
      } else if (total === 2 || total === 3 || total === 12) {
        // Pass line loses (craps)
        if (this.bets['pass-line']) {
          losses += this.bets['pass-line'];
          message = 'Craps! Pass Line loses. ';
          passLineResolved = true;
        }
        // Don't pass wins (except 12 is push)
        if (this.bets['dont-pass']) {
          if (total === 12) {
            winnings += this.bets['dont-pass']; // Push
            message += "Don't Pass pushes. ";
            dontPassResolved = true;
          } else {
            winnings += this.bets['dont-pass'] * 2;
            message += "Don't Pass wins! ";
            dontPassResolved = true;
          }
        }
        this.gamePhase = 'come-out';
        this.point = null;
      } else {
        // Point established - bets stay on table
        this.point = total;
        this.gamePhase = 'point';
        message = `Point is ${total}. Pass Line bet stays on table.`;
      }
    } else {
      // Point phase rules
      if (total === this.point) {
        // Point made - pass line wins
        if (this.bets['pass-line']) {
          winnings += this.bets['pass-line'] * 2;
          message = 'Point made! Pass Line wins! ';
          passLineResolved = true;
        }
        // Don't pass loses
        if (this.bets['dont-pass']) {
          losses += this.bets['dont-pass'];
          message += "Don't Pass loses. ";
          dontPassResolved = true;
        }
        this.gamePhase = 'come-out';
        this.point = null;
      } else if (total === 7) {
        // Seven out - pass line loses, don't pass wins
        if (this.bets['pass-line']) {
          losses += this.bets['pass-line'];
          message = 'Seven out! Pass Line loses. ';
          passLineResolved = true;
        }
        if (this.bets['dont-pass']) {
          winnings += this.bets['dont-pass'] * 2;
          message += "Don't Pass wins! ";
          dontPassResolved = true;
        }
        this.gamePhase = 'come-out';
        this.point = null;
      } else {
        message = `Point is ${this.point}. Roll again to make point!`;
      }
    }

    // Process other bets
    const sideBetResult = this.processSideBets(total);
    winnings += sideBetResult.winnings;
    losses += sideBetResult.losses;

    // Calculate net result
    const netResult = winnings - losses;
    this.totalWinLoss += netResult;

    // Apply winnings to balance
    if (winnings > 0) {
      this.balance += winnings;
    }

    // Build result message - separate side bet results from main game
    let sideBetMessage = '';
    if (sideBetResult.winnings > 0 || sideBetResult.losses > 0) {
      if (sideBetResult.winnings > 0) {
        sideBetMessage += `Side bets won $${sideBetResult.winnings}. `;
      }
      if (sideBetResult.losses > 0) {
        sideBetMessage += `Side bets lost $${sideBetResult.losses}. `;
      }
    }

    // Combine messages
    if (sideBetMessage) {
      message = `${message} ${sideBetMessage}`;
    }
    
    // Add net result if there was any side bet action
    if (sideBetResult.winnings > 0 || sideBetResult.losses > 0) {
      message += `Net: $${netResult > 0 ? '+' : ''}${netResult}`;
    }

    // Clear resolved bets
    this.clearResolvedBets(passLineResolved, dontPassResolved);

    this.updateUI();
    this.updateStatus(message);
  }

  processSideBets(total) {
    let winnings = 0;
    let losses = 0;

    // Field bets
    if (this.bets['field']) {
      if ([2, 3, 4, 9, 10, 11, 12].includes(total)) {
        const multiplier = (total === 2 || total === 12) ? 2 : 1;
        winnings += this.bets['field'] * (multiplier + 1);
      } else {
        losses += this.bets['field'];
      }
    }

    // Any seven
    if (this.bets['any-seven']) {
      if (total === 7) {
        winnings += this.bets['any-seven'] * 5; // 4-1 payout
      } else {
        losses += this.bets['any-seven'];
      }
    }

    // Any craps
    if (this.bets['any-craps']) {
      if ([2, 3, 12].includes(total)) {
        winnings += this.bets['any-craps'] * 8; // 7-1 payout
      } else {
        losses += this.bets['any-craps'];
      }
    }

    // Hard ways
    if (this.dice1 === this.dice2) {
      const hardNumber = this.dice1 * 2;
      if (this.bets[`hard-${hardNumber}`]) {
        if (total === hardNumber) {
          const payout = hardNumber === 4 || hardNumber === 10 ? 8 : 10;
          winnings += this.bets[`hard-${hardNumber}`] * (payout + 1);
        } else {
          losses += this.bets[`hard-${hardNumber}`];
        }
      }
    } else {
      // If not hard way, all hard way bets lose
      for (const betType in this.bets) {
        if (betType.startsWith('hard-')) {
          losses += this.bets[betType];
        }
      }
    }

    // Horn bet (2, 3, 11, 12)
    if (this.bets['horn']) {
      if ([2, 3, 11, 12].includes(total)) {
        winnings += this.bets['horn'] * 4; // Simplified horn payout
      } else {
        losses += this.bets['horn'];
      }
    }

    // Place bets (4, 5, 6, 8, 9, 10)
    const placeBets = ['place-4', 'place-5', 'place-6', 'place-8', 'place-9', 'place-10'];
    placeBets.forEach(betType => {
      if (this.bets[betType]) {
        const number = parseInt(betType.split('-')[1]);
        if (total === number) {
          // Place bet payouts: 6/8 = 7:6, 5/9 = 7:5, 4/10 = 9:5
          let payout;
          if (number === 6 || number === 8) {
            payout = this.bets[betType] * (7/6 + 1);
          } else if (number === 5 || number === 9) {
            payout = this.bets[betType] * (7/5 + 1);
          } else {
            payout = this.bets[betType] * (9/5 + 1);
          }
          winnings += Math.floor(payout);
        } else if (total === 7) {
          losses += this.bets[betType];
        }
      }
    });

    return { winnings, losses };
  }

  clearResolvedBets(passLineResolved = false, dontPassResolved = false) {
    // Only clear bets that are resolved
    // Pass Line and Don't Pass stay on table during point phase
    const betsToClear = [];
    
    // Always clear one-roll bets
    betsToClear.push('field', 'any-seven', 'any-craps', 'horn');
    
    // Clear hard ways unless point is established
    if (this.gamePhase !== 'point') {
      betsToClear.push('hard-4', 'hard-6', 'hard-8', 'hard-10');
    }
    
    // Clear place bets on 7-out
    if (this.gamePhase === 'come-out') {
      betsToClear.push('place-4', 'place-5', 'place-6', 'place-8', 'place-9', 'place-10');
    }
    
    // Clear Pass Line and Don't Pass only when resolved
    if (passLineResolved) {
      betsToClear.push('pass-line');
    }
    if (dontPassResolved) {
      betsToClear.push('dont-pass');
    }
    
    // Clear the resolved bets
    betsToClear.forEach(betType => {
      if (this.bets[betType]) {
        this.currentBet -= this.bets[betType];
        delete this.bets[betType];
        
        // Clear visual indicators
        const area = document.querySelector(`[data-bet-type="${betType}"]`);
        if (area) {
          area.classList.remove('has-bet');
          area.dataset.bet = '';
          delete area.dataset.chipValue;
        }
      }
    });
    
    // During point phase, keep Pass Line and Don't Pass bets
    // They're only resolved when point is made or 7 is rolled
  }

  updateUI() {
    // Update main balance elements (in game-controls)
    const balanceEl = document.getElementById('balance');
    const currentBetEl = document.getElementById('current-bet');
    const winLossEl = document.getElementById('win-loss');
    
    if (balanceEl) balanceEl.textContent = this.balance;
    if (currentBetEl) currentBetEl.textContent = this.currentBet;
    
    if (winLossEl) {
      winLossEl.textContent = this.totalWinLoss;
      
      // Remove existing classes
      winLossEl.classList.remove('positive', 'negative');
      
      // Add appropriate class based on win/loss
      if (this.totalWinLoss > 0) {
        winLossEl.classList.add('positive');
      } else if (this.totalWinLoss < 0) {
        winLossEl.classList.add('negative');
      }
    }
    
    // Update game-info elements (for standalone mode)
    const gameInfoBalanceEl = document.getElementById('game-info-balance');
    const gameInfoCurrentBetEl = document.getElementById('game-info-current-bet');
    const gameInfoWinLossEl = document.getElementById('game-info-win-loss');
    
    if (gameInfoBalanceEl) gameInfoBalanceEl.textContent = this.balance;
    if (gameInfoCurrentBetEl) gameInfoCurrentBetEl.textContent = this.currentBet;
    if (gameInfoWinLossEl) gameInfoWinLossEl.textContent = this.totalWinLoss;

    // Update exposed balance for main game to read
    window.__casinoBalance = this.balance;

    // Sync balance with main game
    if (typeof this.updateMainGameBalance === 'function') {
      this.updateMainGameBalance(this.balance);
    } else if (typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance: this.balance}}));
    }
  }

  updateStatus(message) {
    document.getElementById('game-status').textContent = message;
  }
}

// Global initialization function for main game integration
window.initCrapsMinigame = function(container, playerMoney, syncCasinoBalance) {
  // Create or get existing game instance
  if (!window.crapsGameInstance) {
    window.crapsGameInstance = new CrapsGame();
  }
  
  // Initialize with main game balance
  window.crapsGameInstance.initGame(playerMoney, syncCasinoBalance);
  
  return window.crapsGameInstance;
};

// Auto-play function for AI integration
window.__crapsAutoPlay = function(betAmount) {
  if (!window.crapsGameInstance) return;
  
  const game = window.crapsGameInstance;
  
  // Select a chip value based on the bet amount
  let chipValue = 5;
  if (betAmount >= 100) chipValue = 100;
  else if (betAmount >= 25) chipValue = 25;
  else if (betAmount >= 10) chipValue = 10;
  
  // Set the selected chip
  game.selectedChip = chipValue;
  
  // Place a bet on Pass Line
  const passLineArea = document.querySelector('[data-bet-type="pass-line"]');
  if (passLineArea) {
    game.placeBet(passLineArea);
  }
  
  // Roll the dice
  setTimeout(() => {
    game.rollDice();
  }, 500);
};

// Initialize game when DOM is loaded (for standalone usage)
document.addEventListener('DOMContentLoaded', function() {
  // Only initialize if not already initialized by main game
  if (!window.crapsGameInstance) {
    window.crapsGameInstance = new CrapsGame();
  }
});
