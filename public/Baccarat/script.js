// Baccarat Minigame - Vanilla JS Version
window.initBaccaratMinigame = function(container, playerMoney, updateMainGameBalance) {
    // --- State ---
    let balance = typeof playerMoney === 'number' ? playerMoney : 2500;
    let currentBets = { PLAYER: 0, BANKER: 0, TIE: 0, PLAYER_PAIR: 0, BANKER_PAIR: 0 };
    let betChipValues = { PLAYER: 0, BANKER: 0, TIE: 0, PLAYER_PAIR: 0, BANKER_PAIR: 0 }; // Track which chip value was used for each bet
    let selectedChip = 25;
    let playerHand = [];
    let bankerHand = [];
    let shoe = [];
    let gameState = 'IDLE'; // IDLE, BETTING, DEALING, RESULT
    let commentary = "Place your bets.";

    const CHIP_VALUES = [1, 5, 25, 100, 500, 1000];
    const MIN_BET = 5;
    const MAX_BET = 5000;
    const PAYOUTS = { PLAYER: 1, BANKER: 1, TIE: 8, PAIR: 11 };

    // --- DOM helpers ---
    function q(sel) { return container.querySelector(sel); }
    function create(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    }

    // --- Card functions ---
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    function createDeck() {
        const deck = [];
        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({ suit, rank, value: getCardValue(rank) });
            }
        }
        return deck;
    }

    function getCardValue(rank) {
        if (rank === 'A') return 1;
        if (['K', 'Q', 'J', '10'].includes(rank)) return 10;
        return parseInt(rank);
    }

    function calculateScore(hand) {
        let score = 0;
        for (const card of hand) {
            score += card.value;
        }
        return score % 10;
    }

    function shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function isPair(hand) {
        if (hand.length < 2) return false;
        return hand[0].rank === hand[1].rank;
    }

    // --- Game logic ---
    function createShoe() {
        const shoe = [];
        for (let i = 0; i < 6; i++) {
            shoe.push(...createDeck());
        }
        return shuffle(shoe);
    }

    function determineWinner(playerScore, bankerScore) {
        if (playerScore > bankerScore) return 'PLAYER';
        if (bankerScore > playerScore) return 'BANKER';
        return 'TIE';
    }

    function calculatePayout(bets, result) {
        let totalPayout = 0;
        
        if (result.winner === 'PLAYER') {
            totalPayout += bets.PLAYER * (1 + PAYOUTS.PLAYER);
        } else if (result.winner === 'BANKER') {
            totalPayout += bets.BANKER * (1 + PAYOUTS.BANKER);
        } else if (result.winner === 'TIE') {
            totalPayout += bets.TIE * (1 + PAYOUTS.TIE);
            // Return original bets on tie
            totalPayout += bets.PLAYER + bets.BANKER;
        }

        if (result.isPlayerPair) {
            totalPayout += bets.PLAYER_PAIR * (1 + PAYOUTS.PAIR);
        }
        if (result.isBankerPair) {
            totalPayout += bets.BANKER_PAIR * (1 + PAYOUTS.PAIR);
        }

        return totalPayout;
    }

    function getDealerCommentary(result, pScore, bScore, payout) {
        const comments = {
            'PLAYER': ['Player wins!', 'Player takes it!', 'Player has the better hand!'],
            'BANKER': ['Banker wins!', 'Banker takes it!', 'Banker has the better hand!'],
            'TIE': ['It\'s a tie!', 'Push!', 'Standoff!']
        };
        const arr = comments[result.winner] || ['Game over'];
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // --- UI rendering ---
    function render() {
        container.innerHTML = `
            <div class="baccarat-container">
                <header class="baccarat-header">
                    <div class="balance-display">
                        <span class="balance-label">Balance</span>
                        <span class="balance-amount">$${balance.toLocaleString()}</span>
                    </div>
                </header>
                <main class="baccarat-main">
                    <div class="table-info">
                        <div class="player-score">
                            <h2>PLAYER</h2>
                            <div class="score">${gameState !== 'IDLE' && gameState !== 'BETTING' ? calculateScore(playerHand) : '-'}</div>
                        </div>
                        <div class="commentary">
                            <p>${commentary}</p>
                        </div>
                        <div class="banker-score">
                            <h2>BANKER</h2>
                            <div class="score">${gameState !== 'IDLE' && gameState !== 'BETTING' ? calculateScore(bankerHand) : '-'}</div>
                        </div>
                    </div>
                    <div class="cards-area">
                        <div class="hand player-hand">
                            ${playerHand.map(card => renderCard(card)).join('')}
                            ${playerHand.length === 0 ? '<div class="placeholder">PLAYER</div>' : ''}
                        </div>
                        <div class="hand banker-hand">
                            ${bankerHand.map(card => renderCard(card)).join('')}
                            ${bankerHand.length === 0 ? '<div class="placeholder">BANKER</div>' : ''}
                        </div>
                    </div>
                    <div class="betting-table">
                        ${renderBettingTable()}
                    </div>
                    <div class="controls">
                        <div class="chip-selector">
                            ${CHIP_VALUES.map(val => renderChip(val)).join('')}
                        </div>
                        <div class="action-buttons">
                            ${gameState === 'RESULT' ? 
                                `<button class="btn btn-primary" onclick="window.baccaratNewBet()">New Bet</button>` :
                                `<button class="btn btn-secondary" onclick="window.baccaratClearBets()" ${gameState !== 'BETTING' ? 'disabled' : ''}>Clear</button>
                                 <button class="btn btn-primary" onclick="window.baccaratDeal()" ${Object.values(currentBets).reduce((a,b) => a+b, 0) === 0 || gameState === 'DEALING' ? 'disabled' : ''}>Deal</button>`
                            }
                        </div>
                    </div>
                </main>
            </div>
        `;

        // Attach event handlers
        window.baccaratPlaceBet = (position) => placeBet(position);
        window.baccaratClearBets = clearBets;
        window.baccaratDeal = dealGame;
        window.baccaratNewBet = resetGame;
    }

    function renderCard(card) {
        const isRed = card.suit === '♥' || card.suit === '♦';
        return `
            <div class="card ${isRed ? 'red' : ''}">
                <div class="card-top">${card.rank}${card.suit}</div>
                <div class="card-center">${card.suit}</div>
                <div class="card-bottom">${card.rank}${card.suit}</div>
            </div>
        `;
    }

    function renderChip(value) {
        const colors = {
            1: 'white',
            5: 'red',
            25: 'green',
            100: 'blue',
            500: 'black',
            1000: 'yellow'
        };
        const color = colors[value] || 'white';
        return `
            <button class="chip chip-${color} ${selectedChip === value ? 'selected' : ''}" 
                    onclick="window.baccaratSelectChip(${value})" 
                    ${gameState === 'DEALING' ? 'disabled' : ''}>
                ${value >= 1000 ? '1K' : value}
            </button>
        `;
    }

    function renderBettingTable() {
        const spots = [
            { label: 'P. PAIR', position: 'PLAYER_PAIR', color: 'blue', multiplier: '11:1' },
            { label: 'TIE', position: 'TIE', color: 'green', multiplier: '8:1', wide: true },
            { label: 'B. PAIR', position: 'BANKER_PAIR', color: 'red', multiplier: '11:1' },
            { label: 'PLAYER', position: 'PLAYER', color: 'blue', multiplier: '1:1', wide: true },
            { label: 'BANKER', position: 'BANKER', color: 'red', multiplier: '1:1', wide: true }
        ];

        const getChipColor = (value) => {
            if (value < 5) return 'white';
            if (value < 25) return 'red';
            if (value < 100) return 'green';
            if (value < 500) return 'blue';
            if (value < 1000) return 'black';
            return 'yellow';
        };

        const renderChipStack = (amount, position) => {
            const chipCount = Math.min(Math.ceil(amount / 100), 5); // Max 5 chips in stack
            const color = getChipColor(betChipValues[position] || selectedChip);
            
            return `
                <div class="chip-stack">
                    ${Array(chipCount).fill(0).map((_, i) => `
                        <div class="stack-chip chip-${color}" style="z-index: ${i + 1};">
                            ${amount >= 1000 ? '1K' : amount}
                        </div>
                    `).join('')}
                </div>
            `;
        };

        return `
            <div class="betting-spots">
                ${spots.map(spot => `
                    <button class="betting-spot betting-spot-${spot.color} ${spot.wide ? 'wide' : ''}"
                            onclick="window.baccaratPlaceBet('${spot.position}')"
                            ${gameState === 'DEALING' || balance === 0 ? 'disabled' : ''}>
                        <span class="spot-label">${spot.label}</span>
                        <span class="spot-multiplier">${spot.multiplier}</span>
                        ${currentBets[spot.position] > 0 ? renderChipStack(currentBets[spot.position], spot.position) : ''}
                    </button>
                `).join('')}
            </div>
        `;
    }

    // --- Game actions ---
    window.baccaratSelectChip = (value) => {
        selectedChip = value;
        render();
    };

    function placeBet(position) {
        if (gameState !== 'IDLE' && gameState !== 'BETTING') return;
        if (gameState === 'IDLE') gameState = 'BETTING';

        const totalBet = Object.values(currentBets).reduce((a, b) => a + b, 0);
        if (totalBet + selectedChip > balance) {
            commentary = "Insufficient funds.";
            render();
            return;
        }
        if (currentBets[position] + selectedChip > MAX_BET) return;

        currentBets[position] += selectedChip;
        betChipValues[position] = selectedChip; // Track which chip value was used
        balance -= selectedChip;
        commentary = "Place your bets.";
        render();
    }

    function clearBets() {
        const totalRefund = Object.values(currentBets).reduce((a, b) => a + b, 0);
        balance += totalRefund;
        currentBets = { PLAYER: 0, BANKER: 0, TIE: 0, PLAYER_PAIR: 0, BANKER_PAIR: 0 };
        betChipValues = { PLAYER: 0, BANKER: 0, TIE: 0, PLAYER_PAIR: 0, BANKER_PAIR: 0 };
        gameState = 'IDLE';
        commentary = "Place your bets.";
        render();
    }

    async function dealGame() {
        const totalBet = Object.values(currentBets).reduce((a, b) => a + b, 0);
        if (totalBet < MIN_BET) {
            commentary = "Minimum bet is $" + MIN_BET;
            render();
            return;
        }
        if (shoe.length < 20) {
            commentary = "Reshuffling shoe...";
            render();
            await new Promise(r => setTimeout(r, 1000));
            shoe = createShoe();
        }

        gameState = 'DEALING';
        playerHand = [];
        bankerHand = [];
        commentary = "Dealing...";
        render();

        await new Promise(r => setTimeout(r, 800));

        // Deal first card to player
        const c1 = shoe.pop();
        playerHand = [c1];
        commentary = "Player receives first card...";
        render();
        await new Promise(r => setTimeout(r, 1000));

        // Deal first card to banker
        const c2 = shoe.pop();
        bankerHand = [c2];
        commentary = "Banker receives first card...";
        render();
        await new Promise(r => setTimeout(r, 1000));

        // Deal second card to player
        const c3 = shoe.pop();
        playerHand.push(c3);
        commentary = "Player receives second card...";
        render();
        await new Promise(r => setTimeout(r, 1000));

        // Deal second card to banker
        const c4 = shoe.pop();
        bankerHand.push(c4);
        commentary = "Banker receives second card...";
        render();
        await new Promise(r => setTimeout(r, 1200));

        // Calculate scores
        let pScore = calculateScore(playerHand);
        let bScore = calculateScore(bankerHand);

        // Check for natural (8 or 9)
        if (pScore >= 8 || bScore >= 8) {
            commentary = pScore >= 8 ? "Player has natural!" : "Banker has natural!";
            render();
            await new Promise(r => setTimeout(r, 1000));
        } else {
            // Third card logic
            if (pScore <= 5) {
                const pCard = shoe.pop();
                playerHand.push(pCard);
                pScore = calculateScore(playerHand);
                commentary = "Player draws third card...";
                render();
                await new Promise(r => setTimeout(r, 1200));

                // Banker third card rules based on player's third card
                const p3Val = pCard.value;
                let bankerDraws = false;
                
                if (bScore <= 2) bankerDraws = true;
                else if (bScore === 3 && p3Val !== 8) bankerDraws = true;
                else if (bScore === 4 && [2,3,4,5,6,7].includes(p3Val)) bankerDraws = true;
                else if (bScore === 5 && [4,5,6,7].includes(p3Val)) bankerDraws = true;
                else if (bScore === 6 && [6,7].includes(p3Val)) bankerDraws = true;

                if (bankerDraws) {
                    const bCard = shoe.pop();
                    bankerHand.push(bCard);
                    bScore = calculateScore(bankerHand);
                    commentary = "Banker draws third card...";
                    render();
                    await new Promise(r => setTimeout(r, 1200));
                }
            } else {
                // Player stood, banker rules
                if (bScore <= 5) {
                    const bCard = shoe.pop();
                    bankerHand.push(bCard);
                    bScore = calculateScore(bankerHand);
                    commentary = "Banker draws third card...";
                    render();
                    await new Promise(r => setTimeout(r, 1200));
                }
            }
        }

        // Determine winner
        const winner = determineWinner(pScore, bScore);
        const result = {
            winner,
            playerScore: pScore,
            bankerScore: bScore,
            isPlayerPair: isPair([c1, c3]),
            isBankerPair: isPair([c2, c4])
        };

        const totalPayout = calculatePayout(currentBets, result);
        balance += totalPayout;

        // Update main game balance
        if (updateMainGameBalance) {
            updateMainGameBalance(balance);
        }

        gameState = 'RESULT';
        commentary = getDealerCommentary(result, pScore, bScore, totalPayout);
        render();
    }

    function resetGame() {
        playerHand = [];
        bankerHand = [];
        currentBets = { PLAYER: 0, BANKER: 0, TIE: 0, PLAYER_PAIR: 0, BANKER_PAIR: 0 };
        betChipValues = { PLAYER: 0, BANKER: 0, TIE: 0, PLAYER_PAIR: 0, BANKER_PAIR: 0 };
        gameState = 'IDLE';
        commentary = "Place your bets.";
        render();
    }

    // --- Initialize ---
    shoe = createShoe();
    render();
    console.log('Baccarat minigame initialized with balance:', balance);
};
