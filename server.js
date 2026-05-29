const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGINS || 'https://vegas-metropoly.vercel.app,http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

/** While testing turns / Chance / Community Chest — AI passes on purchasable spaces. */
const DISABLE_AI_PROPERTY_PURCHASES = true;

// Get local IP addresses for external access
function getLocalIPAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    function isLanIPv4(address) {
        if (!address || typeof address !== 'string') return false;
        const octets = address.split('.').map(Number);
        if (octets.length !== 4 || octets.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
            return false;
        }

        const [a, b] = octets;

        // Exclude unusable/virtual ranges for sharing with friends.
        if (a === 169 && b === 254) return false; // APIPA link-local
        if (a === 127) return false; // loopback
        if (a === 0) return false; // invalid network

        // Prefer private LAN ranges that are routable on home/school networks.
        return (
            a === 10 ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168)
        );
    }
    
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal && isLanIPv4(interface.address)) {
                addresses.push(interface.address);
            }
        }
    }
    return addresses;
}

// Get board spaces configuration
function getBoardSpaces() {
    return [
        { name: 'GO', type: 'corner', position: 0 },
        { name: 'Las Vegas Raiders', type: 'property', color: '#8B4513', group: 'brown', price: 350, rent: [35, 70, 200, 550, 750, 950], position: 1 },
        { name: 'Community Cards', type: 'community-chest', position: 2 },
        { name: 'Las Vegas Grand Prix', type: 'property', color: '#8B4513', group: 'brown', price: 300, rent: [30, 60, 180, 500, 700, 900], position: 3 },
        { name: 'Income Tax', type: 'tax', amount: 200, position: 4 },
        { name: 'Las Vegas Monorail', type: 'railroad', group: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 5 },
        { name: 'Speed Vegas Off Roading', type: 'property', color: '#87CEEB', group: 'lightBlue', price: 250, rent: [25, 50, 150, 450, 625, 750], position: 6 },
        { name: 'Chance', type: 'chance', position: 7 },
        { name: 'Las Vegas Golden Knights', type: 'property', color: '#87CEEB', group: 'lightBlue', price: 275, rent: [28, 55, 165, 495, 700, 850], position: 8 },
        { name: 'Maverick Helicopter Rides', type: 'property', color: '#87CEEB', group: 'lightBlue', price: 320, rent: [32, 65, 195, 580, 800, 950], position: 9 },
        { name: 'JAIL', type: 'corner', position: 10 },
        { name: 'Brothel', type: 'property', color: '#FF69B4', group: 'pink', price: 200, rent: [20, 40, 120, 360, 500, 600], position: 11 },
        { name: 'Electric Company', type: 'utility', group: 'utility', price: 180, rent: [0, 0], position: 12 },
        { name: 'Bet MGM', type: 'property', color: '#FF69B4', group: 'pink', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 13 },
        { name: 'Las Vegas Monorail', type: 'railroad', group: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 14 },
        { name: 'Bellagio', type: 'property', color: '#FFA500', group: 'orange', price: 400, rent: [40, 80, 240, 720, 1000, 1200], position: 15 },
        { name: 'Las Vegas Aces', type: 'property', color: '#FFA500', group: 'orange', price: 300, rent: [30, 60, 180, 540, 750, 900], position: 16 },
        { name: 'Community Cards', type: 'community-chest', position: 17 },
        { name: 'Horseback Riding', type: 'property', color: '#FF0000', group: 'red', price: 260, rent: [26, 52, 156, 468, 650, 780], position: 18 },
        { name: 'Resorts World Theatre', type: 'property', color: '#FF0000', group: 'red', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 19 },
        { name: 'FREE PARKING', type: 'corner', position: 20 },
        { name: 'Hard Rock Hotel', type: 'property', color: '#FFFF00', group: 'yellow', price: 280, rent: [28, 56, 168, 504, 700, 840], position: 21 },
        { name: 'Chance', type: 'chance', position: 22 },
        { name: 'Wynn Las Vegas', type: 'property', color: '#FFFF00', group: 'yellow', price: 320, rent: [32, 65, 195, 580, 800, 950], position: 23 },
        { name: 'Shriners Children\'s Open', type: 'property', color: '#FFFF00', group: 'yellow', price: 300, rent: [30, 60, 180, 540, 750, 900], position: 24 },
        { name: 'Bachelor & Bachelorette Parties', type: 'property', color: '#008000', group: 'green', price: 320, rent: [32, 65, 195, 580, 800, 950], position: 25 },
        { name: 'Las Vegas Little White Wedding Chapel', type: 'property', color: '#008000', group: 'green', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 26 },
        { name: 'Community Cards', type: 'community-chest', position: 27 },
        { name: 'Sphere', type: 'property', color: '#008000', group: 'green', price: 400, rent: [40, 80, 240, 720, 1000, 1200], position: 28 },
        { name: 'Water Works', type: 'utility', group: 'utility', price: 200, rent: [0, 0], position: 29 },
        { name: 'Caesars Palace', type: 'property', color: '#0000FF', group: 'darkBlue', price: 420, rent: [42, 84, 252, 756, 1050, 1260], position: 30 },
        { name: 'GO TO JAIL', type: 'corner', position: 31 },
        { name: 'Santa Fe Hotel and Casino', type: 'property', color: '#0000FF', group: 'darkBlue', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 32 },
        { name: 'Luxury Tax', type: 'tax', amount: 100, position: 33 },
        { name: 'Chance', type: 'chance', position: 34 },
        { name: 'House of Blues', type: 'property', color: '#0000FF', group: 'darkBlue', price: 300, rent: [30, 60, 180, 540, 750, 900], position: 35 },
        { name: 'Community Cards', type: 'community-chest', position: 36 },
        { name: 'The Cosmopolitan', type: 'property', color: '#4B0082', group: 'special', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 37 },
        { name: 'Las Vegas Monorail', type: 'railroad', group: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 38 },
        { name: 'Speed Vegas Off Roading', type: 'property', color: '#4B0082', group: 'special', price: 275, rent: [28, 55, 165, 495, 700, 850], position: 39 }
    ];
}

// Get color groups
function getColorGroups() {
    return {
        brown: [1, 3],
        lightBlue: [6, 8, 9],
        pink: [11, 13],
        orange: [15, 16],
        red: [18, 19],
        yellow: [21, 23, 24],
        green: [25, 26, 28],
        darkBlue: [30, 32, 35],
        special: [37, 39],
        railroad: [5, 14, 38],
        utility: [12, 29]
    };
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/Models', express.static(path.join(__dirname, 'Models')));

// Game state storage
const games = {};
const players = {};
const disconnectTimers = {};

function countGamePlayers(game) {
    return game.players.filter(p => p !== null).length;
}

/** After lobby → game page redirect, socket id changes; keep the same logical player. */
function relinkPlayerSocket(game, existingPlayer, newSocketId) {
    const oldSocketId = existingPlayer.id;
    if (oldSocketId === newSocketId) return existingPlayer;

    game.players = game.players.map((p) => {
        if (p && p.id === oldSocketId) return { ...p, id: newSocketId };
        return p;
    });
    if (game.host === oldSocketId) game.host = newSocketId;
    if (game.originalHost === oldSocketId) game.originalHost = newSocketId;
    if (game.gameState && game.gameState.currentPlayer === oldSocketId) {
        game.gameState.currentPlayer = newSocketId;
    }
    return game.players.find((p) => p && p.id === newSocketId);
}

// Populated inside io.on('connection') so top-level AI helpers can call game logic
const gameRuntime = {
    checkRentPayment: null,
    drawChanceCard: null,
    drawCommunityChestCard: null,
    sendToJail: null,
    advanceTurn: null
};

function updateGameState(game) {
    if (!game || !game.id) return;
    io.to(game.id).emit('playersUpdated', {
        players: game.players,
        gameState: game.gameState,
        message: 'Game state updated'
    });
}

// Client dice roll + token step animation (must match public/dice-glb-config + game.js)
function getRollAnimationMs(rollTotal) {
    const diceRollMs = 4500;
    const tokenStartAfterDiceMs = 200;
    const perTileMs = 320;
    return diceRollMs + tokenStartAfterDiceMs + Math.max(0, rollTotal) * perTileMs;
}

// Delay before auto-ending turn (after roll + land-on-tile animations finish)
function getPostRollTurnDelay(rollTotal) {
    return getRollAnimationMs(rollTotal) + 600;
}

function getCardEffectAnimationMs() {
    return 1200;
}

function cancelScheduledTurnEnd(game, playerId) {
    if (!game._pendingTurnEnd || !playerId) return;
    if (game._pendingTurnEnd[playerId]) {
        clearTimeout(game._pendingTurnEnd[playerId]);
        delete game._pendingTurnEnd[playerId];
    }
}

// Find next active player index (skips null slots and bankrupt players)
function getNextPlayerIndex(game, fromIndex) {
    const len = game.players.length;
    for (let i = 1; i <= len; i++) {
        const idx = (fromIndex + i) % len;
        const player = game.players[idx];
        if (player && !player.isBankrupt) {
            return idx;
        }
    }
    return fromIndex;
}

// AI Helper Functions
function checkAndExecuteAITurn(game) {
    if (!game || !game.gameState || game.status !== 'playing') return;

    const currentPlayerId = game.gameState.currentPlayer;
    const currentPlayer = game.players.find(p => p && p.id === currentPlayerId);

    if (!currentPlayer || !currentPlayer.isAI) return;
    if (game.gameState.diceRolled) return;

    if (game._aiTurnScheduled) return;
    game._aiTurnScheduled = true;

    console.log(`AI turn detected for ${currentPlayer.name}, executing AI logic`);

    setTimeout(() => {
        game._aiTurnScheduled = false;
        if (game.status !== 'playing' || !game.gameState) return;
        const stillCurrent = game.players.find(p => p && p.id === game.gameState.currentPlayer);
        if (!stillCurrent || !stillCurrent.isAI || game.gameState.diceRolled) return;
        executeAIRollDice(game, stillCurrent);
    }, 1500);
}

function executeAIRollDice(game, aiPlayer) {
    if (!game || !aiPlayer || !game.gameState) return;
    if (game.gameState.currentPlayer !== aiPlayer.id) return;
    if (game.gameState.diceRolled) return;

    console.log(`AI ${aiPlayer.name} is rolling dice`);

    // Handle jail dice rolling for AI
    if (aiPlayer.inJail) {
        // AI should use jail-free card if available
        if (aiPlayer.jailFreeCards && aiPlayer.jailFreeCards.length > 0) {
            aiPlayer.jailFreeCards.pop();
            aiPlayer.inJail = false;
            aiPlayer.jailTurns = 0;

            io.to(game.id).emit('playerOutOfJail', {
                playerId: aiPlayer.id,
                method: 'card',
                players: game.players
            });

            // Roll dice and move after using card
            setTimeout(() => {
                const dice1 = Math.floor(Math.random() * 6) + 1;
                const dice2 = Math.floor(Math.random() * 6) + 1;
                const total = dice1 + dice2;
                const isDoubles = dice1 === dice2;

                game.gameState.diceRolled = true;
                game.gameState.lastRoll = { dice1, dice2, total };

                // Check for doubles (extra turn)
                if (isDoubles) {
                    game.gameState.diceRolled = false; // Allow rolling again
                    io.to(game.id).emit('doublesRolled', {
                        playerId: aiPlayer.id,
                        dice1: dice1,
                        dice2: dice2,
                        message: `${aiPlayer.name} rolled doubles! Roll again!`
                    });
                }

                // Update AI player position
                const oldPosition = aiPlayer.position;
                const newPosition = (aiPlayer.position + total) % 40;

                // Check if AI passed GO
                if (oldPosition + total >= 40) {
                    aiPlayer.money += 200;
                    io.to(game.id).emit('passedGo', {
                        playerId: aiPlayer.id,
                        amount: 200,
                        newMoney: aiPlayer.money
                    });
                }

                aiPlayer.position = newPosition;

                io.to(game.id).emit('diceRolled', {
                    playerId: aiPlayer.id,
                    roll: { dice1, dice2, total },
                    oldPosition: oldPosition,
                    newPosition: aiPlayer.position,
                    gameState: game.gameState,
                    players: game.players,
                    message: isDoubles ? `${aiPlayer.name} rolled doubles!` : `${aiPlayer.name} rolled ${dice1} and ${dice2}`
                });

                // Only check for rent and special spaces if NOT doubles
                if (!isDoubles) {
                    setTimeout(() => {
                        gameRuntime.checkRentPayment(game, aiPlayer, oldPosition);

                        // Check for special spaces
                        const boardSpaces = getBoardSpaces();
                        const landedSpace = boardSpaces[aiPlayer.position];

                        if (landedSpace.type === 'chance') {
                            gameRuntime.drawChanceCard(game, aiPlayer);
                            setTimeout(() => gameRuntime.advanceTurn(game), getCardEffectAnimationMs());
                        } else if (landedSpace.type === 'community-chest') {
                            gameRuntime.drawCommunityChestCard(game, aiPlayer);
                            setTimeout(() => gameRuntime.advanceTurn(game), getCardEffectAnimationMs());
                        } else if (landedSpace.type === 'tax') {
                            // Pay tax
                            if (aiPlayer.money >= landedSpace.amount) {
                                aiPlayer.money -= landedSpace.amount;
                                io.to(game.id).emit('taxPaid', {
                                    playerId: aiPlayer.id,
                                    amount: landedSpace.amount,
                                    taxName: landedSpace.name,
                                    newMoney: aiPlayer.money,
                                    players: game.players
                                });
                            }
                            setTimeout(() => gameRuntime.advanceTurn(game), 500);
                        } else if (landedSpace.position === 31) { // Go to Jail
                            gameRuntime.sendToJail(game, aiPlayer);
                            // sendToJail already calls advanceTurn internally
                        } else if (landedSpace.type === 'property' || landedSpace.type === 'railroad' || landedSpace.type === 'utility') {
                            if (DISABLE_AI_PROPERTY_PURCHASES) {
                                setTimeout(() => gameRuntime.advanceTurn(game), 500);
                            } else {
                                setTimeout(() => executeAIPropertyDecision(game, aiPlayer, landedSpace), 1000);
                            }
                        } else {
                            setTimeout(() => gameRuntime.advanceTurn(game), 500);
                        }
                    }, getRollAnimationMs(total));
                } else {
                    // Doubles - check for next AI turn after delay
                    setTimeout(() => checkAndExecuteAITurn(game), 2000);
                }
            }, 500);
            return;
        }

        // No jail-free card, try rolling or paying
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2;
        const isDoubles = dice1 === dice2;

        aiPlayer.jailTurns++;

        io.to(game.id).emit('diceRolled', {
            playerId: aiPlayer.id,
            roll: { dice1, dice2, total },
            oldPosition: aiPlayer.position,
            newPosition: aiPlayer.position,
            gameState: game.gameState,
            players: game.players
        });

        if (isDoubles) {
            // Got out of jail with doubles
            aiPlayer.inJail = false;
            aiPlayer.jailTurns = 0;

            io.to(game.id).emit('playerOutOfJail', {
                playerId: aiPlayer.id,
                method: 'roll',
                players: game.players
            });

            // Move AI player
            const oldPosition = aiPlayer.position;
            aiPlayer.position = (aiPlayer.position + total) % 40;

            // Check for GO bonus
            if (oldPosition > aiPlayer.position || aiPlayer.position === 0) {
                aiPlayer.money += 200;
                io.to(game.id).emit('goBonus', {
                    playerId: aiPlayer.id,
                    amount: 200,
                    newMoney: aiPlayer.money
                });
            }

            setTimeout(() => {
                gameRuntime.checkRentPayment(game, aiPlayer, oldPosition);
                setTimeout(() => gameRuntime.advanceTurn(game), 500);
            }, 600);
        } else if (aiPlayer.jailTurns >= 3) {
            // Failed 3 times, must pay $50
            if (aiPlayer.money >= 50) {
                aiPlayer.money -= 50;
                aiPlayer.inJail = false;
                aiPlayer.jailTurns = 0;

                io.to(game.id).emit('playerOutOfJail', {
                    playerId: aiPlayer.id,
                    method: 'forced-pay',
                    players: game.players
                });

                // Move AI player
                const oldPosition = aiPlayer.position;
                aiPlayer.position = (aiPlayer.position + total) % 40;

                setTimeout(() => {
                    gameRuntime.checkRentPayment(game, aiPlayer, oldPosition);
                    setTimeout(() => gameRuntime.advanceTurn(game), 500);
                }, 600);
            } else {
                // Can't pay, end turn
                io.to(game.id).emit('stillInJail', {
                    playerId: aiPlayer.id,
                    jailTurns: aiPlayer.jailTurns
                });
                setTimeout(() => gameRuntime.advanceTurn(game), 500);
            }
        } else {
            // Still in jail, end turn
            io.to(game.id).emit('stillInJail', {
                playerId: aiPlayer.id,
                jailTurns: aiPlayer.jailTurns
            });
            setTimeout(() => gameRuntime.advanceTurn(game), 500);
        }

        game.gameState.diceRolled = true;
        return;
    }

    // Normal dice roll for AI
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;
    const isDoubles = dice1 === dice2;

    game.gameState.diceRolled = true;
    game.gameState.lastRoll = { dice1, dice2, total };

    // Check for doubles (extra turn)
    if (isDoubles) {
        game.gameState.diceRolled = false; // Allow rolling again
        io.to(game.id).emit('doublesRolled', {
            playerId: aiPlayer.id,
            dice1: dice1,
            dice2: dice2,
            message: `${aiPlayer.name} rolled doubles! Roll again!`
        });
    }

    // Update AI player position
    const oldPosition = aiPlayer.position;
    const newPosition = (aiPlayer.position + total) % 40;

    // Check if AI passed GO
    if (oldPosition + total >= 40) {
        aiPlayer.money += 200;
        io.to(game.id).emit('passedGo', {
            playerId: aiPlayer.id,
            amount: 200,
            newMoney: aiPlayer.money
        });
    }

    aiPlayer.position = newPosition;

    io.to(game.id).emit('diceRolled', {
        playerId: aiPlayer.id,
        roll: { dice1, dice2, total },
        oldPosition: oldPosition,
        newPosition: aiPlayer.position,
        gameState: game.gameState,
        players: game.players,
        message: isDoubles ? `${aiPlayer.name} rolled doubles!` : `${aiPlayer.name} rolled ${dice1} and ${dice2}`
    });

    // Only check for rent and special spaces if NOT doubles
    if (!isDoubles) {
        setTimeout(() => {
            gameRuntime.checkRentPayment(game, aiPlayer, oldPosition);

            // Check for special spaces
            const boardSpaces = getBoardSpaces();
            const landedSpace = boardSpaces[aiPlayer.position];

            if (landedSpace.type === 'chance') {
                gameRuntime.drawChanceCard(game, aiPlayer);
                setTimeout(() => gameRuntime.advanceTurn(game), getCardEffectAnimationMs());
            } else if (landedSpace.type === 'community-chest') {
                gameRuntime.drawCommunityChestCard(game, aiPlayer);
                setTimeout(() => gameRuntime.advanceTurn(game), getCardEffectAnimationMs());
            } else if (landedSpace.type === 'tax') {
                // Pay tax
                if (aiPlayer.money >= landedSpace.amount) {
                    aiPlayer.money -= landedSpace.amount;
                    io.to(game.id).emit('taxPaid', {
                        playerId: aiPlayer.id,
                        amount: landedSpace.amount,
                        taxName: landedSpace.name,
                        newMoney: aiPlayer.money,
                        players: game.players
                    });
                }
                setTimeout(() => gameRuntime.advanceTurn(game), 500);
            } else if (landedSpace.position === 31) { // Go to Jail
                gameRuntime.sendToJail(game, aiPlayer);
                // sendToJail already calls advanceTurn internally
            } else if (landedSpace.type === 'property' || landedSpace.type === 'railroad' || landedSpace.type === 'utility') {
                if (DISABLE_AI_PROPERTY_PURCHASES) {
                    setTimeout(() => gameRuntime.advanceTurn(game), 500);
                } else {
                    setTimeout(() => executeAIPropertyDecision(game, aiPlayer, landedSpace), 1000);
                }
            } else {
                setTimeout(() => gameRuntime.advanceTurn(game), 500);
            }
        }, getRollAnimationMs(total));
    } else {
        // Doubles - check for next AI turn after delay
        setTimeout(() => checkAndExecuteAITurn(game), 2000);
    }
}

function executeAIPropertyDecision(game, aiPlayer, property) {
    if (DISABLE_AI_PROPERTY_PURCHASES) {
        setTimeout(() => gameRuntime.advanceTurn(game), 500);
        return;
    }
    if (!game || !aiPlayer || !property) return;

    // Check if property is already owned
    const existingOwner = game.players.find(p => p && p.properties.includes(aiPlayer.position));
    if (existingOwner) {
        setTimeout(() => gameRuntime.advanceTurn(game), 500);
        return;
    }

    // Simple AI logic: Buy if affordable and has enough money left over
    const canAfford = aiPlayer.money >= property.price;
    const moneyAfterPurchase = aiPlayer.money - property.price;

    if (canAfford && moneyAfterPurchase >= 200) {
        // Buy the property
        aiPlayer.money -= property.price;
        if (!aiPlayer.properties) aiPlayer.properties = [];
        aiPlayer.properties.push(aiPlayer.position);

        io.to(game.id).emit('propertyPurchased', {
            playerId: aiPlayer.id,
            position: aiPlayer.position,
            propertyName: property.name,
            newMoney: aiPlayer.money
        });

        updateGameState(game);
        console.log(`AI ${aiPlayer.name} bought ${property.name}`);
    } else {
        // Pass on the property
        io.to(game.id).emit('propertyPassed', {
            playerId: aiPlayer.id,
            position: aiPlayer.position,
            propertyName: property.name
        });

        console.log(`AI ${aiPlayer.name} passed on ${property.name}`);
    }

    setTimeout(() => gameRuntime.advanceTurn(game), 500);
}

// Socket connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new game lobby
    socket.on('createLobby', (data) => {
        const { gameId, playerName } = data;
        
        // Create new game
        games[gameId] = {
            id: gameId,
            players: [],
            host: socket.id,
            originalHost: socket.id, // Store original host socket ID
            hostName: playerName,    // Store host name for persistence
            status: 'lobby',
            gameState: null
        };

        const game = games[gameId];
        
        const player = {
            id: socket.id,
            uid: uuidv4(),
            name: playerName,
            money: 1500,
            position: 0,
            properties: [],
            inJail: false,
            isBankrupt: false,
            isHost: true, // Mark as host
            isAI: false
        };
        
        // Make players array 1-based by adding dummy at index 0
        if (game.players.length === 0) {
            game.players.push(null); // Index 0 dummy
        }
        game.players.push(player);
        players[socket.id] = { gameId, playerName, playerUid: player.uid };
        socket.join(gameId);
        
        socket.emit('gameCreated', { gameId, players: game.players, playerUid: player.uid });
        
        console.log(`Game ${gameId} created by ${playerName}`);
    });

    // Join an existing game lobby
    socket.on('joinLobby', (data) => {
        const { gameId, playerName } = data;

        // Check if game exists, if not return error
        if (!games[gameId]) {
            socket.emit('lobbyError', 'Game not found. Please check the game ID and try again.');
            return;
        }

        const game = games[gameId];

        if (countGamePlayers(game) >= 4) {
            socket.emit('lobbyError', 'Game is full');
            return;
        }

        const nameTaken = game.players.some(
            (p) => p && !p.isAI && p.name.toLowerCase() === playerName.toLowerCase()
        );
        if (nameTaken) {
            socket.emit('lobbyError', 'That name is already taken in this game. Choose a different name.');
            return;
        }

        const player = {
            id: socket.id,
            uid: uuidv4(),
            name: playerName,
            money: 1500,
            position: 0,
            properties: [],
            inJail: false,
            isBankrupt: false,
            isHost: false, // Mark as non-host
            isAI: false
        };

        // Make players array 1-based by adding dummy at index 0 if not already there
        if (game.players.length === 0) {
            game.players.push(null); // Index 0 dummy
        }
        game.players.push(player);
        players[socket.id] = { gameId, playerName, playerUid: player.uid, player };

        if (!game.host) {
            game.host = socket.id;
        }

        socket.join(gameId);

        console.log(`Player ${playerName} joined game ${gameId}`);
        console.log('Current players:', game.players.filter(p => p !== null).map(p => p.name));
        console.log('Host:', game.host);

        socket.emit('lobbyJoined', {
            gameId,
            playerId: socket.id,
            playerUid: player.uid,
            isHost: game.host === socket.id,
            players: game.players
        });

        console.log('Emitting playerJoined to all players in room including host');
        io.to(gameId).emit('playerJoined', { player, players: game.players });
    });

    // Add AI player
    socket.on('addAIPlayer', (data) => {
        const { gameId } = data;

        if (!games[gameId]) {
            socket.emit('gameError', 'Game not found');
            return;
        }

        const game = games[gameId];

        // Check if game is full (max 4 players)
        if (countGamePlayers(game) >= 4) {
            socket.emit('gameError', 'Game is full (max 4 players)');
            return;
        }

        // Generate AI player
        const aiPlayerCount = game.players.filter(p => p && p.isAI).length + 1;
        const aiPlayer = {
            id: `ai-${gameId}-${Date.now()}`,
            uid: uuidv4(),
            name: `AI Player ${aiPlayerCount}`,
            money: 1500,
            position: 0,
            properties: [],
            inJail: false,
            isBankrupt: false,
            isHost: false,
            isAI: true
        };

        // Make players array 1-based by adding dummy at index 0 if not already there
        if (game.players.length === 0) {
            game.players.push(null); // Index 0 dummy
        }
        game.players.push(aiPlayer);

        console.log(`AI player ${aiPlayer.name} added to game ${gameId}`);
        console.log('Current players:', game.players.filter(p => p !== null).map(p => p.name));

        io.to(gameId).emit('aiPlayerAdded', { players: game.players });
    });

    // Remove AI player
    socket.on('removeAIPlayer', (data) => {
        const { gameId } = data;

        if (!games[gameId]) {
            socket.emit('gameError', 'Game not found');
            return;
        }

        const game = games[gameId];

        // Find and remove the last AI player
        const aiPlayers = game.players.filter(p => p && p.isAI);
        if (aiPlayers.length === 0) {
            socket.emit('gameError', 'No AI players to remove');
            return;
        }

        const lastAIPlayer = aiPlayers[aiPlayers.length - 1];
        const playerIndex = game.players.findIndex(p => p && p.id === lastAIPlayer.id);

        if (playerIndex !== -1) {
            game.players[playerIndex] = null;
            // Clean up the array by removing nulls and re-adding dummy at index 0
            const actualPlayers = game.players.filter(p => p !== null);
            game.players = [null, ...actualPlayers];
        }

        console.log(`AI player ${lastAIPlayer.name} removed from game ${gameId}`);
        console.log('Current players:', game.players.filter(p => p !== null).map(p => p.name));

        io.to(gameId).emit('aiPlayerRemoved', { players: game.players });
    });

    // Start the game
    socket.on('startGame', () => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        if (game.host !== socket.id) {
            socket.emit('gameError', 'Only the host can start the game');
            return;
        }

        const actualPlayerCount = game.players.filter(p => p !== null).length;
        const hasAIPlayers = game.players.some(p => p && p.isAI);

        // Allow starting with 1 player if there are AI players, otherwise need at least 2
        if (actualPlayerCount < 2 && !hasAIPlayers) {
            socket.emit('gameError', 'Need at least 2 players to start (or add AI players for single player)');
            return;
        }

        game.status = 'playing';
        const actualPlayers = game.players.filter(p => p !== null);
        // Find the host and set them as current player
        const hostPlayer = actualPlayers.find(p => p.isHost);
        const firstPlayer = hostPlayer || actualPlayers[0];
        const firstPlayerIndex = game.players.findIndex(p => p && p.id === firstPlayer.id);
        game.currentPlayerIndex = firstPlayerIndex >= 0 ? firstPlayerIndex : 1;

        game.gameState = {
            status: 'playing',
            currentPlayer: firstPlayer.id,
            diceRolled: false,
            turnPhase: 'roll' // roll, action, end
        };

        console.log(`GAME START: Host ${firstPlayer.name} (${firstPlayer.id}) will roll first`);
        console.log(`GAME START: Players in order:`, actualPlayers.map(p => ({ name: p.name, id: p.id, isHost: p.isHost })));

        // Initialize card decks
        initializeCardDecks(game);

        // Mark game as starting
        game.status = 'starting';
        game.acknowledgments = 0;
        game.totalPlayers = actualPlayerCount;

        // NOTE: AI tokens will be assigned AFTER human players select theirs
        // This is done in the selectToken handler when all human players have selected

        // Auto-acknowledge AI players (they don't have socket connections)
        const aiPlayerCount = game.players.filter(p => p && p.isAI).length;
        game.acknowledgments = aiPlayerCount;
        console.log(`Auto-acknowledged ${aiPlayerCount} AI players. Starting with ${game.acknowledgments}/${game.totalPlayers} acknowledgments`);

        console.log(`Starting game with ${game.totalPlayers} players. Waiting for acknowledgments...`);

        // Don't send gameStarted immediately - wait for players to join game page
        console.log('Game started, waiting for players to join game page...');
        console.log('Players should redirect to game page and receive gameStarted there');

        // Mark game as ready to send gameStarted when players join game page
        game.readyToSendGameStarted = true;
    });

    // Handle acknowledgments from game page
    socket.on('gameStartedAck', () => {
        const playerData = players[socket.id];
        if (!playerData || !playerData.gameId) return;

        const game = games[playerData.gameId];
        if (!game || game.status !== 'starting') return;

        game.acknowledgments++;
        console.log(`Acknowledgment received from ${socket.id}. ${game.acknowledgments}/${game.totalPlayers}`);

        if (game.acknowledgments === game.totalPlayers) {
            // All players acknowledged, game is ready
            game.status = 'playing';
            console.log('All players acknowledged. Game is now ready to play!');

            // Ensure diceRolled is false when game is ready
            game.gameState.diceRolled = false;
            game.gameState.turnPhase = 'roll';

            // Notify all players that game is ready with full game state
            io.to(playerData.gameId).emit('gameReady', {
                message: 'All players connected! Game started.',
                gameState: game.gameState,
                players: game.players
            });

            // Check if first player is AI and trigger AI turn
            setTimeout(() => {
                checkAndExecuteAITurn(game);
            }, 1000);
        }
    });

    // Handle acknowledgments from game page when joining
    socket.on('gameJoinedAck', () => {
        const playerData = players[socket.id];
        if (!playerData || !playerData.gameId) return;

        console.log(`Player ${playerData.name} acknowledged connection to game ${playerData.gameId}`);
        
        // Update game status for all players in the room
        const game = games[playerData.gameId];
        if (game && countGamePlayers(game) >= 2) {
            io.to(playerData.gameId).emit('updateGameStatus', {
                status: 'Players Connected',
                playerCount: countGamePlayers(game)
            });
        }
    });

    // Join existing game (for game page)
    socket.on('joinGame', (data) => {
        const { gameId, playerUid } = data;
        
        if (!games[gameId]) {
            socket.emit('gameError', 'Game not found');
            return;
        }

        const game = games[gameId];
        
        // Allow players to join regardless of game status
        // They need to be in the room to receive gameStarted event

        let player = game.players.find((p) => p && p.id === socket.id);

        if (!player && playerUid) {
            const byUid = game.players.find((p) => p && p.uid === playerUid);
            if (byUid) {
                const oldSocketId = byUid.id;
                player = relinkPlayerSocket(game, byUid, socket.id);
                if (oldSocketId !== socket.id) {
                    delete players[oldSocketId];
                }
                console.log(`RECONNECT: ${player.name} (${playerUid}) relinked ${oldSocketId} → ${socket.id}`);
            }
        }

        if (!player) {
            console.log(`JOIN GAME: No player for socket ${socket.id}, uid=${playerUid || 'none'}`);
            socket.emit('gameError', 'You are not in this game. Join from the lobby with the same game ID first.');
            return;
        }

        if (!player.uid) {
            player.uid = uuidv4();
        }

        players[socket.id] = {
            gameId,
            playerName: player.name,
            playerUid: player.uid,
            player
        };
        socket.join(gameId);
        // If this player had a pending disconnect timeout, cancel it (reconnected quickly).
        if (disconnectTimers[socket.id]) {
            clearTimeout(disconnectTimers[socket.id]);
            delete disconnectTimers[socket.id];
        }
        
        // Send updated player list to all clients to ensure UI is in sync
        console.log('SERVER: Sending playersUpdated event with players:');
        game.players.forEach((player, index) => {
            if (player) {
                console.log(`  - Player ${index}: ID=${player.id}, Name=${player.name}, isHost=${player.isHost}`);
            } else {
                console.log(`  - Player ${index}: null (dummy)`);
            }
        });
        console.log(`  - Current socket ID: ${socket.id}`);
        
        io.to(gameId).emit('playersUpdated', {
            players: game.players,
            message: 'Player list updated'
        });
        
        // Send gameStarted if game is ready and this is the first player joining game page
        console.log('Checking gameStarted conditions:');
        console.log('game.readyToSendGameStarted:', game.readyToSendGameStarted);
        console.log('game.status:', game.status);
        console.log('socket.id:', socket.id);
        
        if (game.readyToSendGameStarted && game.status === 'starting') {
            console.log('Sending gameStarted to player joining game page:', socket.id);
            
            socket.emit('gameStarted', {
                players: game.players,
                gameState: game.gameState
            });
            
            console.log('gameStarted event sent successfully');
            
            // Also send to lobby to redirect other players
            io.to(gameId).emit('gameStarted', {
                players: game.players,
                gameState: game.gameState
            });
            console.log('gameStarted event also sent to lobby');
        } else {
            console.log('Conditions not met for sending gameStarted');
        }
        
        // Find the actual player in the game to get their correct ID
        console.log(`SERVER: Looking for player with socket ID ${socket.id} in game.players`);
        const actualPlayer = game.players.find(p => p && p.id === socket.id);
        const correctPlayerId = actualPlayer ? actualPlayer.id : socket.id;
        
        console.log(`SERVER: actualPlayer:`, actualPlayer ? actualPlayer.name : 'NOT FOUND');
        console.log(`SERVER: Using playerId: ${correctPlayerId}`);
        
        socket.emit('gameJoined', {
            gameId,
            playerId: correctPlayerId,
            playerUid: player.uid,
            players: game.players,
            gameState: game.gameState
        });
        
        console.log(`SERVER: Sent gameJoined to socket ${socket.id} with playerId ${correctPlayerId}`);
        console.log('SERVER: Players in gameJoined:', game.players.filter(p => p).map(p => ({ id: p.id, name: p.name })));
    });

    // Select token
    socket.on('selectToken', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player) return;
        
        const { tokenIndex } = data;
        
        // Set player's token
        player.tokenIndex = tokenIndex;
        
        console.log(`SERVER: Player ${player.name} selected token ${tokenIndex}`);

        // Broadcast token selection to all players
        io.to(game.id).emit('tokenSelected', {
            playerId: socket.id,
            player: player.name,
            tokenIndex: tokenIndex,
            players: game.players
        });
        
        // Check if all HUMAN players have selected tokens
        const humanPlayers = game.players.filter(p => p && !p.isAI);
        const allHumanPlayersReady = humanPlayers.every(p => p.tokenIndex !== undefined);
        if (allHumanPlayersReady && humanPlayers.length >= 1) {
            console.log(`SERVER: All human players have selected tokens, assigning AI tokens`);

            // Assign tokens to AI players now that humans have selected
            const takenTokens = humanPlayers.map(p => p.tokenIndex);
            const availableTokens = [0, 1, 2, 3].filter(token => !takenTokens.includes(token));
            let tokenIndex = 0;

            game.players.forEach(player => {
                if (player && player.isAI && player.tokenIndex === undefined) {
                    if (availableTokens.length > 0) {
                        player.tokenIndex = availableTokens[tokenIndex % availableTokens.length];
                        tokenIndex++;
                        console.log(`AI player ${player.name} assigned token ${player.tokenIndex}`);

                        // Broadcast AI token selection
                        io.to(game.id).emit('tokenSelected', {
                            playerId: player.id,
                            player: player.name,
                            tokenIndex: player.tokenIndex,
                            players: game.players
                        });
                    } else {
                        console.error(`No available tokens for AI player ${player.name}`);
                    }
                }
            });

            console.log(`SERVER: All human players have selected tokens, AI tokens assigned`);
        }
    });

    // Buy property
    socket.on('buyProperty', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player) return;
        
        const boardSpaces = getBoardSpaces();
        const property = boardSpaces[player.position];
        
        if (property.type !== 'property' && property.type !== 'railroad' && property.type !== 'utility') {
            socket.emit('gameError', 'Cannot buy this property');
            return;
        }
        
        if (player.money < property.price) {
            socket.emit('gameError', 'Not enough money to buy this property');
            return;
        }
        
        // Check if property is already owned
        const existingOwner = game.players.find(p => p && p.properties && p.properties.includes(player.position));
        if (existingOwner) {
            socket.emit('gameError', 'Property is already owned');
            return;
        }
        
        // Buy property
        player.money -= property.price;
        if (!player.properties) player.properties = [];
        player.properties.push(player.position);
        
        // Update game state
        io.to(game.id).emit('propertyPurchased', {
            playerId: player.id,
            position: player.position,
            propertyName: property.name,
            newMoney: player.money
        });
        
        updateGameState(game);
    });

    // Pass on property
    socket.on('passProperty', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player) return;
        
        const boardSpaces = getBoardSpaces();
        const property = boardSpaces[player.position];
        
        if (property.type !== 'property' && property.type !== 'railroad' && property.type !== 'utility') {
            socket.emit('gameError', 'Cannot pass on this property');
            return;
        }
        
        // Notify all players that player passed
        io.to(game.id).emit('propertyPassed', {
            playerId: player.id,
            position: player.position,
            propertyName: property.name
        });
        
        addChatMessage(game.id, 'System', `${player.name} passed on ${property.name}`);
    });

    // Decline property (start auction)
    socket.on('declineProperty', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player) return;
        
        const boardSpaces = getBoardSpaces();
        const property = boardSpaces[player.position];
        
        if (property.type !== 'property' && property.type !== 'railroad' && property.type !== 'utility') {
            socket.emit('gameError', 'Cannot auction this property');
            return;
        }
        
        // Start auction
        game.auction = {
            property: property,
            position: player.position,
            currentBid: 0,
            currentBidder: null,
            bidders: [],
            timeLeft: 30 // 30 seconds
        };
        
        io.to(playerData.gameId).emit('auctionStarted', {
            property: property,
            position: player.position,
            timeLeft: 30
        });
        
        // Start auction timer
        const auctionInterval = setInterval(() => {
            game.auction.timeLeft--;
            
            io.to(playerData.gameId).emit('auctionUpdate', {
                currentBid: game.auction.currentBid,
                currentBidder: game.auction.currentBidder,
                timeLeft: game.auction.timeLeft
            });
            
            if (game.auction.timeLeft <= 0) {
                clearInterval(auctionInterval);
                endAuction(game);
            }
        }, 1000);
    });

    // Place bid in auction
    socket.on('placeBid', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!game.auction) {
            socket.emit('gameError', 'No active auction');
            return;
        }
        
        const { amount } = data;
        
        if (amount <= game.auction.currentBid) {
            socket.emit('gameError', 'Bid must be higher than current bid');
            return;
        }
        
        if (player.money < amount) {
            socket.emit('gameError', 'Not enough money for this bid');
            return;
        }
        
        game.auction.currentBid = amount;
        game.auction.currentBidder = socket.id;
        
        if (!game.auction.bidders.includes(socket.id)) {
            game.auction.bidders.push(socket.id);
        }
        
        io.to(playerData.gameId).emit('bidPlaced', {
            playerId: socket.id,
            playerName: player.name,
            amount: amount
        });
    });

    // End auction and award property
    function endAuction(game) {
        if (game.auction.currentBidder) {
            const winner = game.players.find(p => p && p.id === game.auction.currentBidder);
            if (!winner) {
                game.auction = null;
                return;
            }
            winner.money -= game.auction.currentBid;
            winner.properties.push(game.auction.position);
            
            io.to(game.id).emit('auctionEnded', {
                winnerId: game.auction.currentBidder,
                winnerName: winner.name,
                property: game.auction.property,
                finalBid: game.auction.currentBid,
                players: game.players
            });
        } else {
            io.to(game.id).emit('auctionEnded', {
                winnerId: null,
                property: game.auction.property,
                finalBid: 0
            });
        }
        
        game.auction = null;
    }

    // Roll dice
    socket.on('rollDice', () => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        if (game.status !== 'playing' && game.status !== 'starting') {
            socket.emit('gameError', `Game is not ready yet (status: ${game.status})`);
            return;
        }

        if (game.gameState.currentPlayer !== socket.id) {
            socket.emit('gameError', 'Not your turn');
            return;
        }

        if (game.gameState.diceRolled) {
            socket.emit('gameError', 'Already rolled dice this turn');
            return;
        }

        const currentPlayer = game.players.find(p => p && p.id === socket.id);
        if (!currentPlayer) {
            socket.emit('gameError', 'Current player not found');
            return;
        }
        
        // Handle jail dice rolling
        if (currentPlayer.inJail) {
            const dice1 = Math.floor(Math.random() * 6) + 1;
            const dice2 = Math.floor(Math.random() * 6) + 1;
            const total = dice1 + dice2;
            const isDoubles = dice1 === dice2;

            currentPlayer.jailTurns++;
            
            io.to(playerData.gameId).emit('diceRolled', {
                playerId: socket.id,
                roll: { dice1, dice2, total },
                oldPosition: currentPlayer.position,
                newPosition: currentPlayer.position,
                gameState: game.gameState,
                players: game.players
            });

            if (isDoubles) {
                // Got out of jail with doubles
                currentPlayer.inJail = false;
                currentPlayer.jailTurns = 0;
                
                io.to(game.id).emit('playerOutOfJail', {
                    playerId: socket.id,
                    method: 'roll',
                    players: game.players
                });
                
                // Move player
                const jailOldPosition = currentPlayer.position;
                currentPlayer.position = (currentPlayer.position + total) % 40;
                
                // Check for GO bonus (passed or landed on GO)
                if (jailOldPosition > currentPlayer.position || currentPlayer.position === 0) {
                    currentPlayer.money += 200;
                    io.to(game.id).emit('goBonus', {
                        playerId: socket.id,
                        amount: 200,
                        newMoney: currentPlayer.money
                    });
                }

                io.to(game.id).emit('playerMoved', {
                    playerId: socket.id,
                    oldPosition: jailOldPosition,
                    newPosition: currentPlayer.position,
                    players: game.players,
                    message: `${currentPlayer.name} rolled doubles and left jail!`
                });
                
                setTimeout(() => {
                    checkRentPayment(game, currentPlayer, jailOldPosition);
                    scheduleAutoAdvanceTurn(game, socket.id, getPostRollTurnDelay(total));
                }, 600);
            } else if (currentPlayer.jailTurns >= 3) {
                // Failed 3 times, must pay $50
                if (currentPlayer.money >= 50) {
                    currentPlayer.money -= 50;
                    currentPlayer.inJail = false;
                    currentPlayer.jailTurns = 0;
                    
                    io.to(game.id).emit('playerOutOfJail', {
                        playerId: socket.id,
                        method: 'forced-pay',
                        players: game.players
                    });
                    
                    // Move player
                    const oldPosition = currentPlayer.position;
                    currentPlayer.position = (currentPlayer.position + total) % 40;
                    
                    setTimeout(() => {
                        checkRentPayment(game, currentPlayer, oldPosition);
                        scheduleAutoAdvanceTurn(game, socket.id, getPostRollTurnDelay(total));
                    }, 600);
                } else {
                    socket.emit('gameError', 'Must pay $50 to get out of jail but you don\'t have enough money!');
                }
            } else {
                io.to(playerData.gameId).emit('stillInJail', {
                    playerId: socket.id,
                    jailTurns: currentPlayer.jailTurns
                });
                scheduleAutoAdvanceTurn(game, socket.id, 1500);
            }
            
            game.gameState.diceRolled = true;
            return;
        }

        // Normal dice roll
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2;
        const isDoubles = dice1 === dice2;

        game.gameState.diceRolled = true;
        game.gameState.lastRoll = { dice1, dice2, total };
        
        // Check for doubles (extra turn)
        if (isDoubles) {
            game.gameState.diceRolled = false; // Allow rolling again
            io.to(game.id).emit('doublesRolled', {
                playerId: socket.id,
                dice1: dice1,
                dice2: dice2,
                message: `${currentPlayer.name} rolled doubles! Roll again!`
            });
        }

        // Update player position
        const oldPosition = currentPlayer.position;
        const newPosition = (currentPlayer.position + total) % 40;
        
        // Check if player passed GO
        if (oldPosition + total >= 40) {
            currentPlayer.money += 200;
            io.to(game.id).emit('passedGo', {
                playerId: socket.id,
                amount: 200,
                newMoney: currentPlayer.money
            });
        }
        
        currentPlayer.position = newPosition;

        io.to(playerData.gameId).emit('diceRolled', {
            playerId: socket.id,
            roll: { dice1, dice2, total },
            oldPosition: oldPosition,
            newPosition: currentPlayer.position,
            gameState: game.gameState,
            players: game.players,
            message: isDoubles ? `${currentPlayer.name} rolled doubles!` : `${currentPlayer.name} rolled ${dice1} and ${dice2}`
        });

        // Only check for rent and special spaces if NOT doubles (after roll animation)
        if (!isDoubles) {
            const landActionDelay = getRollAnimationMs(total);
            setTimeout(() => {
                checkRentPayment(game, currentPlayer, oldPosition);

                const boardSpaces = getBoardSpaces();
                const landedSpace = boardSpaces[currentPlayer.position];

                if (landedSpace.type === 'chance') {
                    drawChanceCard(game, currentPlayer);
                    scheduleAutoAdvanceTurn(game, socket.id, getCardEffectAnimationMs());
                } else if (landedSpace.type === 'community-chest') {
                    drawCommunityChestCard(game, currentPlayer);
                    scheduleAutoAdvanceTurn(game, socket.id, getCardEffectAnimationMs());
                } else if (landedSpace.type === 'tax') {
                    if (currentPlayer.money >= landedSpace.amount) {
                        currentPlayer.money -= landedSpace.amount;
                        io.to(game.id).emit('taxPaid', {
                            playerId: socket.id,
                            amount: landedSpace.amount,
                            taxName: landedSpace.name,
                            newMoney: currentPlayer.money,
                            players: game.players
                        });
                    } else {
                        socket.emit('gameError', `Not enough money to pay ${landedSpace.name} of $${landedSpace.amount}`);
                    }
                    scheduleAutoAdvanceTurn(game, socket.id, 600);
                } else if (landedSpace.position === 30) {
                    sendToJail(game, currentPlayer);
                } else if (
                    landedSpace.type === 'property' ||
                    landedSpace.type === 'railroad' ||
                    landedSpace.type === 'utility'
                ) {
                    // Unowned: client shows buy modal. Owned: rent handled above.
                    // Turn ends only when the player clicks End Turn (or buy/pass then End Turn).
                } else {
                    scheduleAutoAdvanceTurn(game, socket.id, 600);
                }
            }, landActionDelay);
        }
    });

    // Check and handle rent payments
    function checkRentPayment(game, player, oldPosition) {
        const newPosition = player.position;
        const boardSpaces = getBoardSpaces();
        const landedSpace = boardSpaces[newPosition];

        if (landedSpace.type === 'property' || landedSpace.type === 'railroad' || landedSpace.type === 'utility') {
            // Find property owner
            const owner = game.players.find(p => p &&
                p.properties.includes(newPosition) && p.id !== player.id
            );

            if (owner) {
                // Calculate rent
                let rent = calculateRent(landedSpace, owner, game);
                
                // Special handling for utilities - need dice roll
                if (landedSpace.type === 'utility') {
                    const dice1 = Math.floor(Math.random() * 6) + 1;
                    const dice2 = Math.floor(Math.random() * 6) + 1;
                    const diceTotal = dice1 + dice2;
                    rent = rent * diceTotal; // Apply multiplier to dice roll
                    
                    io.to(game.id).emit('utilityRentCalculated', {
                        playerId: player.id,
                        ownerId: owner.id,
                        dice1: dice1,
                        dice2: dice2,
                        multiplier: rent / diceTotal,
                        finalRent: rent
                    });
                }
                
                // Check if player can pay rent
                if (player.money >= rent) {
                    player.money -= rent;
                    owner.money += rent;

                    io.to(game.id).emit('rentPaid', {
                        payerId: player.id,
                        ownerId: owner.id,
                        amount: rent,
                        property: landedSpace,
                        players: game.players
                    });
                } else {
                    // Player goes bankrupt
                    handleBankruptcy(game, player, owner, rent);
                }
            }
        }
    }

    // Handle bankruptcy
    function handleBankruptcy(game, bankruptPlayer, creditor, debt) {
        bankruptPlayer.isBankrupt = true;
        
        // Transfer all properties to creditor
        bankruptPlayer.properties.forEach(propertyPos => {
            creditor.properties.push(propertyPos);
            
            // Transfer houses too
            if (bankruptPlayer.houses && bankruptPlayer.houses[propertyPos]) {
                creditor.houses = creditor.houses || {};
                creditor.houses[propertyPos] = bankruptPlayer.houses[propertyPos];
                delete bankruptPlayer.houses[propertyPos];
            }
        });
        
        // Clear bankrupt player's assets
        bankruptPlayer.properties = [];
        bankruptPlayer.houses = {};
        bankruptPlayer.money = 0;
        
        // Remove bankrupt player from current turn if needed
        if (game.gameState.currentPlayer === bankruptPlayer.id) {
            endTurnForBankruptPlayer(game);
        }
        
        io.to(game.id).emit('playerBankrupt', {
            bankruptPlayerId: bankruptPlayer.id,
            creditorId: creditor.id,
            debt: debt,
            players: game.players
        });
        
        // Check for game winner
        checkGameWinner(game);
    }

    // Auto-end turn after roll (when buy/pass UI is not used)
    function scheduleAutoAdvanceTurn(game, playerId, delayMs) {
        if (!game || !playerId) return;
        cancelScheduledTurnEnd(game, playerId);
        if (!game._pendingTurnEnd) game._pendingTurnEnd = {};
        game._pendingTurnEnd[playerId] = setTimeout(() => {
            delete game._pendingTurnEnd[playerId];
            if (game.status !== 'playing') return;
            if (game.gameState.currentPlayer !== playerId) return;
            if (!game.gameState.diceRolled) return;
            console.log(`AUTO TURN END: ${playerId}`);
            advanceTurn(game);
        }, delayMs);
    }

    // Advance turn to next player (strict round-robin by array order, skips null/bankrupt)
    function advanceTurn(game) {
        if (game.status !== 'playing') return;
        if (game._advancingTurn) return;
        cancelScheduledTurnEnd(game, game.gameState.currentPlayer);
        game._advancingTurn = true;

        let currentIndex = game.players.findIndex(
            p => p && p.id === game.gameState.currentPlayer
        );
        if (currentIndex < 0) {
            currentIndex = typeof game.currentPlayerIndex === 'number'
                ? game.currentPlayerIndex
                : 1;
        }

        const nextIndex = getNextPlayerIndex(game, currentIndex);
        const nextPlayer = game.players[nextIndex];

        if (!nextPlayer) {
            game._advancingTurn = false;
            return;
        }

        // Same player only if nobody else is active (should not happen in normal play)
        if (nextPlayer.id === game.gameState.currentPlayer) {
            game._advancingTurn = false;
            return;
        }

        game.currentPlayerIndex = nextIndex;
        game.gameState.currentPlayer = nextPlayer.id;
        game.gameState.diceRolled = false;
        game.gameState.turnPhase = 'roll';

        console.log(`TURN: ${nextPlayer.name} (index ${nextIndex})`);

        io.to(game.id).emit('turnChanged', {
            nextPlayer: nextPlayer.id,
            gameState: game.gameState
        });

        game._advancingTurn = false;

        setTimeout(() => {
            checkAndExecuteAITurn(game);
        }, 1200);
    }

    // End turn for bankrupt player — use same advance path as normal end turn
    function endTurnForBankruptPlayer(game) {
        advanceTurn(game);
    }

    // Check for game winner
    function checkGameWinner(game) {
        const activePlayers = game.players.filter(p => p && !p.isBankrupt);
        
        if (activePlayers.length === 1) {
            const winner = activePlayers[0];
            game.status = 'finished';
            game.winner = winner.id;
            
            io.to(game.id).emit('gameWon', {
                winnerId: winner.id,
                winnerName: winner.name,
                players: game.players
            });
        }
    }

    // Card decks
    const chanceCards = [
        { type: 'money', amount: 200, message: 'Bank pays you dividend of $200' },
        { type: 'money', amount: -50, message: 'Pay poor tax of $50' },
        { type: 'move', position: 0, message: 'Advance to GO' },
        { type: 'jail', message: 'Go to Jail' },
        { type: 'money', amount: 100, message: 'Your building loan matures - collect $100' },
        { type: 'money', amount: -100, message: 'Pay hospital $100' },
        { type: 'money', amount: 50, message: 'You have won a competition - collect $50' },
        { type: 'money', amount: -150, message: 'Pay school tax of $150' },
        { type: 'move', position: 5, message: 'Advance to nearest Railroad' },
        { type: 'moveRelative', delta: -3, message: 'Go back 3 spaces' },
        { type: 'money', amount: -20, message: 'Pay doctor fee $20' },
        { type: 'money', amount: 25, message: 'Receive for services $25' },
        { type: 'jail-free', message: 'Get Out of Jail Free' },
        { type: 'move', position: 15, message: 'Advance to nearest Railroad' },
        { type: 'money', amount: 100, message: 'Interest on 7% preference shares - collect $100' },
        { type: 'money', amount: -80, message: 'Pay insurance premium $80' }
    ];

    const communityCards = [
        { type: 'money', amount: 100, message: 'You have won second prize in a beauty contest - collect $100' },
        { type: 'money', amount: -50, message: 'Doctor fees - pay $50' },
        { type: 'money', amount: 200, message: 'From sale of stock you get $200' },
        { type: 'money', amount: -100, message: 'Pay school tax of $100' },
        { type: 'money', amount: 50, message: 'You inherit $50' },
        { type: 'jail-free', message: 'Get out of jail free - keep this card' },
        { type: 'money', amount: 25, message: 'Receive $25 consultation fee' },
        { type: 'money', amount: -40, message: 'Pay hospital $40' },
        { type: 'money', amount: 10, message: 'Bank error in your favor - collect $10' },
        { type: 'money', amount: 100, message: 'Life insurance matures - collect $100' },
        { type: 'money', amount: -50, message: 'Pay hospital $50' },
        { type: 'money', amount: 20, message: 'You have won $20 in a contest' },
        { type: 'money', amount: -80, message: 'Pay for repairs $80' },
        { type: 'money', amount: 100, message: 'Holiday fund matures - collect $100' },
        { type: 'money', amount: -150, message: 'Pay tax of $150' },
        { type: 'money', amount: 25, message: 'Receive $25 from sale' }
    ];

    // Shuffle cards
    function shuffleCards(cards) {
        const shuffled = [...cards];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Initialize card decks for game
    function initializeCardDecks(game) {
        game.chanceDeck = shuffleCards(chanceCards);
        game.communityDeck = shuffleCards(communityCards);
        game.chanceIndex = 0;
        game.communityIndex = 0;
    }

    // Draw Chance card
    function drawChanceCard(game, player) {
        if (!game.chanceDeck) initializeCardDecks(game);
        
        const card = game.chanceDeck[game.chanceIndex];
        game.chanceIndex = (game.chanceIndex + 1) % game.chanceDeck.length;
        
        executeCardAction(game, player, card, 'Chance');
    }

    // Draw Community Chest card
    function drawCommunityChestCard(game, player) {
        if (!game.communityDeck) initializeCardDecks(game);
        
        const card = game.communityDeck[game.communityIndex];
        game.communityIndex = (game.communityIndex + 1) % game.communityDeck.length;
        
        executeCardAction(game, player, card, 'Community Chest');
    }

    // Execute card action
    function executeCardAction(game, player, card, cardType) {
        io.to(game.id).emit('cardDrawn', {
            playerId: player.id,
            cardType: cardType,
            card: card
        });

        switch (card.type) {
            case 'money':
                player.money += card.amount;
                io.to(game.id).emit('playerMoneyChanged', {
                    playerId: player.id,
                    amount: card.amount,
                    newTotal: player.money
                });
                break;
                
            case 'move':
                movePlayerToPosition(game, player, card.position);
                break;

            case 'moveRelative':
                movePlayerByDelta(game, player, card.delta);
                break;

            case 'jail':
                sendToJail(game, player, { advanceTurn: false });
                break;
                
            case 'jail-free':
                player.jailFreeCards = player.jailFreeCards || [];
                player.jailFreeCards.push(cardType);
                io.to(game.id).emit('jailFreeCardReceived', {
                    playerId: player.id,
                    cardType: cardType
                });
                break;
        }
    }

    // Move player to specific position (always forward along the board)
    function movePlayerToPosition(game, player, position) {
        const oldPosition = player.position;
        player.position = position;

        io.to(game.id).emit('playerMoved', {
            playerId: player.id,
            oldPosition: oldPosition,
            newPosition: position,
            direction: 'forward',
            players: game.players
        });

        setTimeout(() => {
            checkRentPayment(game, player, oldPosition);
        }, 300);
    }

    // Move player by a relative number of spaces (negative = backward)
    function movePlayerByDelta(game, player, delta) {
        const oldPosition = player.position;
        const newPosition = (oldPosition + delta + 40) % 40;
        player.position = newPosition;

        io.to(game.id).emit('playerMoved', {
            playerId: player.id,
            oldPosition: oldPosition,
            newPosition: newPosition,
            direction: delta < 0 ? 'backward' : 'forward',
            players: game.players
        });

        setTimeout(() => {
            checkRentPayment(game, player, oldPosition);
        }, 300);
    }

    // Send player to jail
    function sendToJail(game, player, options = {}) {
        const oldPosition = player.position;
        player.position = 10; // Jail position
        player.inJail = true;
        player.jailTurns = 0;
        
        // End the player's turn after sending to jail
        game.gameState.diceRolled = true;
        
        io.to(game.id).emit('playerSentToJail', {
            playerId: player.id,
            oldPosition: oldPosition,
            newPosition: 10,
            players: game.players
        });
        
        if (options.advanceTurn !== false) {
            setTimeout(() => {
                advanceTurn(game);
            }, 1000);
        }
    }

    gameRuntime.checkRentPayment = checkRentPayment;
    gameRuntime.drawChanceCard = drawChanceCard;
    gameRuntime.drawCommunityChestCard = drawCommunityChestCard;
    gameRuntime.sendToJail = sendToJail;
    gameRuntime.advanceTurn = advanceTurn;

    // Get out of jail options
    socket.on('getOutOfJail', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player.inJail) {
            socket.emit('gameError', 'You are not in jail');
            return;
        }

        const { method } = data; // 'pay', 'card', 'roll'
        
        switch (method) {
            case 'pay':
                if (player.money >= 50) {
                    player.money -= 50;
                    player.inJail = false;
                    player.jailTurns = 0;
                    
                    io.to(game.id).emit('playerOutOfJail', {
                        playerId: socket.id,
                        method: 'pay',
                        players: game.players
                    });
                } else {
                    socket.emit('gameError', 'Not enough money to pay $50');
                }
                break;
                
            case 'card':
                if (player.jailFreeCards && player.jailFreeCards.length > 0) {
                    player.jailFreeCards.pop();
                    player.inJail = false;
                    player.jailTurns = 0;
                    
                    io.to(game.id).emit('playerOutOfJail', {
                        playerId: socket.id,
                        method: 'card',
                        players: game.players
                    });
                } else {
                    socket.emit('gameError', 'You do not have a Get Out of Jail Free card');
                }
                break;
                
            case 'roll':
                // This is handled in the dice roll logic
                break;
        }
    });

    // Helper function for chat messages
    function addChatMessage(gameId, sender, message) {
        const game = games[gameId];
        if (game) {
            const timestamp = new Date().toISOString();
            const chatMessage = { sender, message, timestamp };
            game.chatLog.push(chatMessage);
            io.to(gameId).emit('chatMessage', chatMessage);
        }
    }

    // Chat system
    socket.on('sendChat', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player) return;
        
        const { message } = data;
        
        // Add message to chat log
        addChatMessage(game.id, player.name, message);
    });

    // Get game statistics
    socket.on('getStatistics', () => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player) return;

        // Calculate player statistics
        const stats = {
            money: player.money,
            propertiesOwned: player.properties.length,
            mortgagedProperties: (player.mortgagedProperties || []).length,
            houses: Object.values(player.houses || {}).reduce((sum, count) => sum + count, 0),
            netWorth: player.money + (player.properties.reduce((sum, pos) => {
                const property = getBoardSpaces()[pos];
                return sum + (property ? property.price : 0);
            }, 0)) + Object.entries(player.houses || {}).reduce((sum, [pos, count]) => sum + (count * Math.floor((getBoardSpaces()[pos]?.price || 0) * 0.5)), 0)
        };

        socket.emit('statisticsResponse', { stats, players: game.players });
    });

    // Trading system
    socket.on('initiateTrade', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player || player.isBankrupt) return;

        const { targetPlayerId, offer, request } = data;
        const targetPlayer = game.players.find(p => p && p.id === targetPlayerId);
        
        if (!targetPlayer) {
            socket.emit('gameError', 'Target player not found');
            return;
        }

        // Create trade offer
        const tradeOffer = {
            id: Date.now().toString(),
            fromPlayer: socket.id,
            fromPlayerName: player.name,
            toPlayer: targetPlayerId,
            toPlayerName: targetPlayer.name,
            offer: {
                money: offer.money || 0,
                properties: offer.properties || [],
                jailFreeCards: offer.jailFreeCards || 0
            },
            request: {
                money: request.money || 0,
                properties: request.properties || [],
                jailFreeCards: request.jailFreeCards || 0
            },
            status: 'pending',
            timestamp: new Date().toISOString()
        };

        // Store trade in game state
        game.trades = game.trades || [];
        game.trades.push(tradeOffer);

        // Notify target player
        io.to(targetPlayerId).emit('tradeReceived', tradeOffer);
        
        // Notify initiator
        socket.emit('tradeInitiated', tradeOffer);
        
        // Notify all players
        io.to(game.id).emit('tradeAnnouncement', {
            message: `${player.name} has proposed a trade to ${targetPlayer.name}`,
            tradeId: tradeOffer.id
        });
    });

    socket.on('respondToTrade', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player || player.isBankrupt) return;

        const { tradeId, response } = data; // 'accept' or 'reject'
        const trade = game.trades.find(t => t.id === tradeId);
        
        if (!trade) {
            socket.emit('gameError', 'Trade not found');
            return;
        }

        if (trade.toPlayer !== socket.id) {
            socket.emit('gameError', 'You are not the recipient of this trade');
            return;
        }

        if (response === 'accept') {
            // Validate trade
            const fromPlayer = game.players.find(p => p && p.id === trade.fromPlayer);
            const toPlayer = game.players.find(p => p && p.id === trade.toPlayer);
            
            if (!fromPlayer || !toPlayer) {
                socket.emit('gameError', 'Players not found');
                return;
            }

            // Check if players have the offered items
            if (fromPlayer.money < trade.offer.money) {
                socket.emit('gameError', 'Offerer does not have enough money');
                return;
            }

            for (const propertyId of trade.offer.properties) {
                if (!fromPlayer.properties.includes(propertyId)) {
                    socket.emit('gameError', 'Offerer does not own all offered properties');
                    return;
                }
            }

            if (toPlayer.money < trade.request.money) {
                socket.emit('gameError', 'You do not have enough money');
                return;
            }

            for (const propertyId of trade.request.properties) {
                if (!toPlayer.properties.includes(propertyId)) {
                    socket.emit('gameError', 'You do not own all requested properties');
                    return;
                }
            }

            // Execute trade
            // Transfer money
            fromPlayer.money -= trade.offer.money;
            toPlayer.money += trade.offer.money;
            fromPlayer.money += trade.request.money;
            toPlayer.money -= trade.request.money;

            // Transfer properties
            fromPlayer.properties = fromPlayer.properties.filter(p => !trade.offer.properties.includes(p));
            toPlayer.properties = toPlayer.properties.filter(p => !trade.request.properties.includes(p));
            fromPlayer.properties.push(...trade.request.properties);
            toPlayer.properties.push(...trade.offer.properties);

            // Transfer houses
            fromPlayer.houses = fromPlayer.houses || {};
            toPlayer.houses = toPlayer.houses || {};
            
            for (const propertyId of trade.offer.properties) {
                if (fromPlayer.houses[propertyId]) {
                    toPlayer.houses[propertyId] = fromPlayer.houses[propertyId];
                    delete fromPlayer.houses[propertyId];
                }
            }
            
            for (const propertyId of trade.request.properties) {
                if (toPlayer.houses[propertyId]) {
                    fromPlayer.houses[propertyId] = toPlayer.houses[propertyId];
                    delete toPlayer.houses[propertyId];
                }
            }

            // Transfer jail free cards
            fromPlayer.jailFreeCards = fromPlayer.jailFreeCards || [];
            toPlayer.jailFreeCards = toPlayer.jailFreeCards || [];
            
            for (let i = 0; i < trade.offer.jailFreeCards; i++) {
                const card = fromPlayer.jailFreeCards.pop();
                if (card) toPlayer.jailFreeCards.push(card);
            }
            
            for (let i = 0; i < trade.request.jailFreeCards; i++) {
                const card = toPlayer.jailFreeCards.pop();
                if (card) fromPlayer.jailFreeCards.push(card);
            }

            trade.status = 'accepted';

            // Notify all players
            io.to(game.id).emit('tradeCompleted', {
                trade: trade,
                players: game.players
            });
            
            io.to(game.id).emit('tradeAnnouncement', {
                message: `Trade accepted between ${fromPlayer.name} and ${toPlayer.name}!`
            });

        } else {
            trade.status = 'rejected';
            
            // Notify players
            io.to(trade.fromPlayer).emit('tradeRejected', trade);
            socket.emit('tradeRejected', trade);
            
            io.to(game.id).emit('tradeAnnouncement', {
                message: `Trade rejected between ${trade.fromPlayerName} and ${trade.toPlayerName}`
            });
        }
    });

    // Calculate rent based on property and ownership
    function calculateRent(property, owner, game) {
        if (property.type === 'railroad') {
            const railroadCount = owner.properties.filter(p => {
                const space = getBoardSpaces()[p];
                return space && space.type === 'railroad';
            }).length;
            return property.rent[railroadCount - 1] || property.rent[0];
        }
        
        if (property.type === 'utility') {
            const utilityCount = owner.properties.filter(p => {
                const space = getBoardSpaces()[p];
                return space && space.type === 'utility';
            }).length;
            // Return multiplier, actual rent will be calculated with dice roll
            return utilityCount === 2 ? 10 : 4;
        }
        
        // Check for complete color set
        const colorGroups = getColorGroups();
        const groupProperties = colorGroups[property.group] || [];
        const ownsCompleteSet = groupProperties.every(pos => 
            owner.properties.includes(pos)
        );
        
        // Check for houses/hotels
        owner.houses = owner.houses || {};
        const houseCount = owner.houses[property.position] || 0;
        
        if (houseCount > 0 && property.rent[houseCount]) {
            // Use house/hotel rent levels
            return property.rent[houseCount];
        }
        
        if (ownsCompleteSet) {
            return property.rent[0] * 2; // Double rent for complete set
        }
        
        return property.rent[0];
    }

    // Mortgage property
    socket.on('mortgageProperty', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player.properties.includes(data.position)) {
            socket.emit('gameError', 'You don\'t own this property');
            return;
        }

        const boardSpaces = getBoardSpaces();
        const property = boardSpaces[data.position];
        const mortgageValue = Math.floor(property.price / 2);

        player.money += mortgageValue;
        player.mortgagedProperties = player.mortgagedProperties || [];
        player.mortgagedProperties.push(data.position);

        io.to(playerData.gameId).emit('propertyMortgaged', {
            playerId: socket.id,
            position: data.position,
            mortgageValue,
            players: game.players
        });
    });

    // Unmortgage property
    socket.on('unmortgageProperty', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player.mortgagedProperties || !player.mortgagedProperties.includes(data.position)) {
            socket.emit('gameError', 'This property is not mortgaged');
            return;
        }

        const boardSpaces = getBoardSpaces();
        const property = boardSpaces[data.position];
        const unmortgageCost = Math.floor(property.price * 0.55); // Mortgage + 10% interest

        if (player.money < unmortgageCost) {
            socket.emit('gameError', `Not enough money to unmortgage (need $${unmortgageCost})`);
            return;
        }

        player.money -= unmortgageCost;
        player.mortgagedProperties = player.mortgagedProperties.filter(pos => pos !== data.position);

        io.to(playerData.gameId).emit('propertyUnmortgaged', {
            playerId: socket.id,
            position: data.position,
            unmortgageCost,
            players: game.players
        });
    });

    // Sell house/hotel
    socket.on('sellHouse', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player.properties.includes(data.position)) {
            socket.emit('gameError', 'You don\'t own this property');
            return;
        }

        player.houses = player.houses || {};
        const currentHouses = player.houses[data.position] || 0;
        
        if (currentHouses === 0) {
            socket.emit('gameError', 'No houses to sell on this property');
            return;
        }

        const boardSpaces = getBoardSpaces();
        const property = boardSpaces[data.position];
        const sellPrice = Math.floor(property.price * 0.5); // Sell back for half price

        player.houses[data.position] = currentHouses - 1;
        player.money += sellPrice;

        io.to(playerData.gameId).emit('houseSold', {
            playerId: socket.id,
            position: data.position,
            houseCount: player.houses[data.position],
            sellPrice,
            players: game.players
        });
    });

    // Build house/hotel
    socket.on('buildHouse', (data) => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        const player = game.players.find(p => p && p.id === socket.id);
        
        if (!player.properties.includes(data.position)) {
            socket.emit('gameError', 'You don\'t own this property');
            return;
        }

        const boardSpaces = getBoardSpaces();
        const property = boardSpaces[data.position];
        
        if (property.type !== 'property') {
            socket.emit('gameError', 'Can only build houses on properties');
            return;
        }

        // Check if player owns complete set
        const colorGroups = getColorGroups();
        const groupProperties = colorGroups[property.group] || [];
        const ownsCompleteSet = groupProperties.every(pos => 
            player.properties.includes(pos)
        );

        if (!ownsCompleteSet) {
            socket.emit('gameError', 'You must own all properties in this color group to build houses');
            return;
        }

        // Check for even distribution rule
        player.houses = player.houses || {};
        const currentHouses = player.houses[data.position] || 0;
        
        // Check if any property in the group has fewer houses
        const canBuild = groupProperties.every(pos => {
            const housesOnProperty = player.houses[pos] || 0;
            return housesOnProperty >= currentHouses;
        });

        if (!canBuild) {
            socket.emit('gameError', 'Must build houses evenly across all properties in the color group');
            return;
        }

        // Check if already has hotel (5 houses)
        if (currentHouses >= 5) {
            socket.emit('gameError', 'Maximum houses/hotels already built on this property');
            return;
        }

        // Check for mortgaged properties in group
        const hasMortgaged = groupProperties.some(pos => {
            return (player.mortgagedProperties || []).includes(pos);
        });

        if (hasMortgaged) {
            socket.emit('gameError', 'Cannot build houses on color group with mortgaged properties. Unmortgage all properties in this color group First.');
            return;
        }

        const houseCost = Math.floor(property.price / 2);
        io.to(playerData.gameId).emit('houseBuilt', {
            playerId: socket.id,
            position: data.position,
            houseCount: player.houses[data.position],
            isHotel: player.houses[data.position] === 5,
            players: game.players
        });
    });

    // Pay to get out of jail
    socket.on('payJail', () => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        if (game.status !== 'playing') return;

        const player = game.players.find(p => p && p.id === socket.id);
        if (!player || !player.inJail) return;

        if (player.money >= 50) {
            player.money -= 50;
            player.inJail = false;
            player.jailTurns = 0;
            
            io.to(game.id).emit('playerOutOfJail', {
                playerId: socket.id,
                method: 'pay',
                players: game.players
            });
            
            updateGameState(game);
        } else {
            socket.emit('gameError', 'Not enough money to pay $50 to get out of jail');
        }
    });

    // End turn
    socket.on('endTurn', () => {
        const playerData = players[socket.id];
        if (!playerData) return;

        const game = games[playerData.gameId];
        if (game.status !== 'playing') return;

        if (game.gameState.currentPlayer !== socket.id) {
            socket.emit('gameError', 'Not your turn');
            return;
        }

        cancelScheduledTurnEnd(game, socket.id);
        advanceTurn(game);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`DISCONNECT: User disconnected: ${socket.id}`);
        
        const playerData = players[socket.id];
        if (playerData) {
            console.log(`DISCONNECT: Found player data - Game: ${playerData.gameId}, Name: ${playerData.playerName}`);
            const game = games[playerData.gameId];
            if (game) {
                console.log(`DISCONNECT: Game found - Status: ${game.status}, Players in game: ${game.players.filter(p => p).length}`);
                // Don't immediately remove player - they might be reconnecting
                // Just mark as disconnected and notify other players
                const disconnectedPlayer = game.players.find(p => p && p.id === socket.id);
                
                if (disconnectedPlayer) {
                    console.log(`DISCONNECT: Player ${disconnectedPlayer.name} (ID: ${socket.id}) disconnected, keeping in game for potential reconnection`);
                    console.log(`DISCONNECT: Game players after disconnect:`, game.players.filter(p => p).map(p => ({ name: p.name, id: p.id })));

                    // Grace window for reconnects: avoid false "disconnected" chat noise on fast refresh/redirect.
                    disconnectTimers[socket.id] = setTimeout(() => {
                        const stillMapped = players[socket.id];
                        if (stillMapped) {
                            io.to(playerData.gameId).emit('playerDisconnected', {
                                playerId: socket.id,
                                playerName: disconnectedPlayer.name,
                                players: game.players
                            });
                        }
                        delete disconnectTimers[socket.id];
                    }, 5000);
                }
                
                // Only remove player if game is not active (lobby stage) or if they've been gone for a while
                if (game.status === 'lobby') {
                    game.players = game.players.filter(p => p && p.id !== socket.id);
                    
                    if (game.host === socket.id && game.players.length > 0) {
                        // Find first non-null player
                        const firstPlayer = game.players.find(p => p);
                        if (firstPlayer) {
                            game.host = firstPlayer.id;
                        }
                    }

                    if (game.players.length === 0) {
                        delete games[playerData.gameId];
                    } else {
                        io.to(playerData.gameId).emit('playerLeft', {
                            playerId: socket.id,
                            players: game.players,
                            newHost: game.host
                        });
                    }
                }
            }
            
            // Don't remove from players mapping - preserve for reconnection
            // The mapping will be cleaned up when the player successfully reconnects
            console.log(`DISCONNECT: Preserving player data for potential reconnection: ${playerData.playerName}`);
        }
    });
});

// Route for serving the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for joining a specific game
app.get('/game/:gameId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// Route to get server info for external connections
app.get('/server-info', (req, res) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    const localIPs = getLocalIPAddresses();
    res.json({
        port: PORT,
        localIPs: localIPs,
        localhost: `http://localhost:${PORT}`,
        externalIPs: localIPs.map(ip => `http://${ip}:${PORT}`)
    });
});

server.listen(PORT, HOST, () => {
    const localIPs = getLocalIPAddresses();
    const primaryIP = localIPs.length > 0 ? localIPs[0] : 'localhost';
    
    console.log(`🎮 Base Metropoly Server Started!`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://${primaryIP}:${PORT}`);
});
