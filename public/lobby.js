function getConfiguredSocketServerUrl() {
    const params = new URLSearchParams(window.location.search);
    const urlParamServer = params.get('server');
    const runtimeUrl = window.RUNTIME_CONFIG && window.RUNTIME_CONFIG.socketServerUrl;
    const storedUrl = localStorage.getItem('metropoly_socket_server_url');
    // Prefer local origin for local development, fall back to remote backend
    const configuredUrl = urlParamServer || runtimeUrl || storedUrl || window.location.origin || 'https://current-metropoly-game.onrender.com';
    if (urlParamServer) {
        localStorage.setItem('metropoly_socket_server_url', urlParamServer);
    }
    return configuredUrl.replace(/\/$/, '');
}

const SOCKET_SERVER_URL = getConfiguredSocketServerUrl();
console.log('Connecting to socket server:', SOCKET_SERVER_URL);
const socket = io(SOCKET_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
});

// DOM Elements
const createGameBtn = document.getElementById('createGameBtn');
const startGameBtn = document.getElementById('startGameBtn');
const modalOkBtn = document.getElementById('modalOkBtn');
const modalClose = document.querySelector('.close');
const addAiBtn = document.getElementById('addAiBtn');
const removeAiBtn = document.getElementById('removeAiBtn');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsModalClose = document.querySelector('.modal-close');
const refreshLobbiesBtn = document.getElementById('refreshLobbiesBtn');
const lobbiesList = document.getElementById('lobbiesList');

const gameMenu = document.querySelector('.lobby-container');
const gameCreatedSection = document.getElementById('gameCreatedSection');
const lobbySection = document.getElementById('lobbySection');
const messageModal = document.getElementById('messageModal');
const modalMessage = document.getElementById('modalMessage');

let currentGameId = null;
let isHost = false;
let availableLobbies = [];
const PUBLIC_SHARE_ORIGIN = 'https://vegas-metropoly.vercel.app';

// Console command for testing: create AI vs AI game (2 AIs only — you spectate)
// Usage in browser console: createAiVsAiGame()
window.createAiVsAiGame = function() {
    console.log('createAiVsAiGame called');
    console.log('Socket connected:', socket.connected);
    console.log('Socket ID:', socket.id);
    
    const createGame = () => {
        console.log('Creating AI vs AI game (2 AIs, no human players)...');

        const spectatorName = generateRandomPlayerName();
        const gameId = generateGameId();
        console.log('Generated gameId:', gameId, 'spectatorName:', spectatorName);
        
        sessionStorage.setItem('metropoly_spectator_name', spectatorName);

        socket.once('aiVsAiGameCreated', (data) => {
            console.log('AI vs AI game ready:', data);
            sessionStorage.setItem('metropoly_ai_vs_ai', '1');
            persistSpectatorIdentity(data.gameId, null);
            console.log('Redirecting to game page...');
            window.location.href = `/game/${data.gameId}?spectate=1`;
        });
        
        // Add timeout to detect if server doesn't respond
        setTimeout(() => {
            console.warn('No response from server after 5 seconds. Check server logs for errors.');
        }, 5000);

        console.log('Emitting createAiVsAiGame event...');
        socket.emit('createAiVsAiGame', { gameId, spectatorName });
    };

    if (socket.connected) {
        createGame();
    } else {
        console.log('Socket not connected yet, waiting for connection...');
        socket.once('connect', () => {
            console.log('Socket connected! Proceeding with game creation...');
            createGame();
        });
        
        // Fallback timeout if connection takes too long
        setTimeout(() => {
            if (!socket.connected) {
                console.error('Socket connection timeout. Please refresh the page and try again.');
            }
        }, 10000);
    }
};

// Console commands to load minigames directly
// Usage in browser console: loadBlackjack(), loadBaccarat(), loadRoulette(), loadPoker(), loadSlots(), loadCraps()

window.loadBlackjack = function() {
    console.log('Loading Blackjack minigame...');
    window.location.href = '/BlackJack/index.html';
};

window.loadBaccarat = function() {
    console.log('Loading Baccarat minigame...');
    window.location.href = '/Baccarat/index.html';
};

window.loadRoulette = function() {
    console.log('Loading Roulette minigame...');
    window.location.href = '/Roulette/index.html';
};

window.loadPoker = function() {
    console.log('Loading Poker minigame...');
    window.location.href = '/PokerFP/index.html';
};

window.loadSlots = function() {
    console.log('Loading Slot Machine minigame...');
    window.location.href = '/slotMachine/index.html';
};

window.loadCraps = function() {
    console.log('Loading Craps minigame...');
    window.location.href = '/Craps/index.html';
};

function buildJoinLink(gameId) {
    const baseOrigin = PUBLIC_SHARE_ORIGIN || `${window.location.protocol}//${window.location.host}`;
    return `${baseOrigin}/?gameId=${encodeURIComponent(gameId)}`;
}

function persistLobbyIdentity(gameId, playerUid) {
    clearSpectatorIdentity();
    if (gameId) {
        sessionStorage.setItem('metropoly_game_id', gameId);
    }
    if (playerUid) {
        sessionStorage.setItem('metropoly_player_uid', playerUid);
    }
}

function saveLastPlayerName() {
    // No longer needed since names are auto-generated
}

function autoJoinFromUrlIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const gameIdFromUrl = (params.get('gameId') || '').trim().toUpperCase();
    if (!gameIdFromUrl) return;

    const gameIdInput = document.getElementById('gameId');
    gameIdInput.value = gameIdFromUrl;
    joinGameBtn.click();
}

// Theme toggle functionality
function initThemeToggle() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }

    // Settings modal
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
    }

    if (settingsModalClose) {
        settingsModalClose.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    // Close modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode';
    }
}

// Initialize theme toggle on page load
initThemeToggle();

// Fetch lobbies on page load
fetchLobbies();

// Refresh lobbies button
refreshLobbiesBtn.addEventListener('click', () => {
    fetchLobbies();
});

// Make joinLobby available globally for onclick handlers
window.joinLobby = joinLobby;

// Generate random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Generate random player name
function generateRandomPlayerName() {
    const adjectives = ['Swift', 'Brave', 'Clever', 'Bold', 'Quick', 'Wise', 'Lucky', 'Happy', 'Epic', 'Royal'];
    const nouns = ['Tiger', 'Dragon', 'Phoenix', 'Knight', 'Wizard', 'Hero', 'Champion', 'Legend', 'Star', 'Master'];
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 1000);
    return `${randomAdjective}${randomNoun}${randomNoun}`;
}

// Fetch available lobbies
function fetchLobbies() {
    socket.emit('getLobbies');
}

// Render lobby list (open lobbies + live games to watch)
function renderLobbies(gameList) {
    availableLobbies = gameList || [];

    const openLobbies = availableLobbies.filter(g => g.isJoinable);
    const liveGames = availableLobbies.filter(g => g.isWatchable);

    if (openLobbies.length === 0 && liveGames.length === 0) {
        lobbiesList.innerHTML = `
            <div class="no-lobbies">
                <div class="no-lobbies-icon">🎯</div>
                <p>No active games</p>
                <p class="no-lobbies-subtitle">Be the first to create a game!</p>
            </div>
        `;
        return;
    }

    let html = '';

    if (openLobbies.length > 0) {
        html += `<div class="lobby-section-label">Open Lobbies</div>`;
        html += openLobbies.map(lobby => renderLobbyCard(lobby)).join('');
    }

    if (liveGames.length > 0) {
        html += `<div class="lobby-section-label lobby-section-label--live">Games In Progress</div>`;
        html += liveGames.map(game => renderLiveGameCard(game)).join('');
    }

    lobbiesList.innerHTML = html;
}

function renderLobbyCard(lobby) {
    const playerCount = lobby.players ? lobby.players.length : 0;
    const maxPlayers = lobby.maxPlayers || 4;
    const isFull = playerCount >= maxPlayers;
    const hostName = lobby.hostName || (lobby.players && lobby.players[0] ? lobby.players[0].name : 'Host');

    return `
        <div class="lobby-card ${isFull ? 'lobby-full' : ''}" data-game-id="${lobby.gameId}">
            <div class="lobby-card-header">
                <span class="lobby-game-id">${lobby.gameId}</span>
                <span class="lobby-status ${isFull ? 'status-full' : 'status-open'}">${isFull ? 'Full' : 'Open'}</span>
            </div>
            <div class="lobby-card-body">
                <div class="lobby-info">
                    <div class="lobby-info-item">
                        <span class="lobby-info-icon">👥</span>
                        <span class="lobby-info-text">${playerCount}/${maxPlayers} Players</span>
                    </div>
                    <div class="lobby-info-item">
                        <span class="lobby-info-icon">👑</span>
                        <span class="lobby-info-text">Host: ${hostName}</span>
                    </div>
                </div>
                <button class="btn btn-join ${isFull ? 'btn-disabled' : ''}"
                        ${isFull ? 'disabled' : ''}
                        onclick="joinLobby('${lobby.gameId}')">
                    ${isFull ? 'Full' : 'Join Lobby'}
                </button>
            </div>
        </div>
    `;
}

function renderLiveGameCard(game) {
    const playerCount = game.players ? game.players.length : 0;
    const spectatorCount = game.spectatorCount || 0;
    const hostName = game.hostName || (game.players && game.players[0] ? game.players[0].name : 'Host');
    const statusLabel = game.status === 'starting' ? 'Starting' : 'In Progress';

    return `
        <div class="lobby-card lobby-card--live" data-game-id="${game.gameId}">
            <div class="lobby-card-header">
                <span class="lobby-game-id">${game.gameId}</span>
                <span class="lobby-status status-live">${statusLabel}</span>
            </div>
            <div class="lobby-card-body">
                <div class="lobby-info">
                    <div class="lobby-info-item">
                        <span class="lobby-info-icon">👥</span>
                        <span class="lobby-info-text">${playerCount} Players</span>
                    </div>
                    <div class="lobby-info-item">
                        <span class="lobby-info-icon">👑</span>
                        <span class="lobby-info-text">Host: ${hostName}</span>
                    </div>
                    ${spectatorCount > 0 ? `
                    <div class="lobby-info-item">
                        <span class="lobby-info-icon">👁️</span>
                        <span class="lobby-info-text">${spectatorCount} Watching</span>
                    </div>` : ''}
                </div>
                <button class="btn btn-watch" onclick="watchGame('${game.gameId}')">
                    Watch Game
                </button>
            </div>
        </div>
    `;
}

// Join lobby from list
function joinLobby(gameId) {
    const playerName = generateRandomPlayerName();
    currentGameId = gameId;
    
    socket.emit('joinLobby', {
        gameId: gameId,
        playerName: playerName
    });
}

function persistSpectatorIdentity(gameId, spectatorUid) {
    sessionStorage.setItem('metropoly_is_spectator', '1');
    sessionStorage.removeItem('metropoly_player_uid');
    if (gameId) {
        sessionStorage.setItem('metropoly_game_id', gameId);
    }
    if (spectatorUid) {
        sessionStorage.setItem('metropoly_spectator_uid', spectatorUid);
    }
}

function clearSpectatorIdentity() {
    sessionStorage.removeItem('metropoly_is_spectator');
    sessionStorage.removeItem('metropoly_spectator_uid');
    sessionStorage.removeItem('metropoly_spectator_name');
    sessionStorage.removeItem('metropoly_ai_vs_ai');
}

// Watch an in-progress game as a spectator
function watchGame(gameId) {
    const spectatorName = generateRandomPlayerName();
    sessionStorage.setItem('metropoly_spectator_name', spectatorName);
    currentGameId = gameId;
    socket.emit('joinAsSpectator', {
        gameId,
        spectatorName
    });
}

// Show modal message
function showModal(message) {
    modalMessage.textContent = message;
    messageModal.classList.remove('hidden');
}

// Hide modal
function hideModal() {
    messageModal.classList.add('hidden');
}

// Update players list
function updatePlayersList(players, listElement) {
    listElement.innerHTML = '';

    // Filter out null players (index 0 dummy) to get 1-based indexing
    const actualPlayers = players.filter(p => p !== null);

    actualPlayers.forEach((player, index) => {
        const playerNumber = index + 1; // Convert to 1-based
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        if (player.id === socket.id) {
            playerDiv.classList.add('host');
        }
        if (player.isAI) {
            playerDiv.classList.add('ai-player');
        }

        const badgeText = player.isAI ? '🤖 AI' : (player.id === socket.id ? 'You' : '');
        const playerName = player.isAI ? `AI ${playerNumber}` : `Player ${playerNumber}`;

        playerDiv.innerHTML = `
            <span class="player-name">${playerName}</span>
            <span class="player-badge">${badgeText}</span>
        `;

        listElement.appendChild(playerDiv);
    });
}

// Create game
createGameBtn.addEventListener('click', () => {
    const playerName = generateRandomPlayerName();
    currentGameId = generateGameId();
    
    socket.emit('createLobby', {
        gameId: currentGameId,
        playerName: playerName
    });
});





// Fallback copy function for browsers without clipboard API
function copyToClipboard(text, button) {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess(button);
        }).catch(err => {
            console.error('Clipboard API failed, trying fallback:', err);
            fallbackCopy(text, button);
        });
    } else {
        // Use fallback method
        fallbackCopy(text, button);
    }
}

function fallbackCopy(text, button) {
    // Create a temporary textarea to copy from
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(button);
        } else {
            showCopyError(button);
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showCopyError(button);
    }
    
    document.body.removeChild(textarea);
}

function showCopySuccess(button) {
    const originalText = button.textContent;
    const originalBackground = button.style.background;
    button.textContent = 'Copied!';
    button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    
    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = originalBackground;
    }, 2000);
}

function showCopyError(button) {
    const originalText = button.textContent;
    const originalBackground = button.style.background;
    button.textContent = 'Failed!';
    button.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    
    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = originalBackground;
    }, 2000);
}

// Start game
startGameBtn.addEventListener('click', () => {
    console.log('Start game button clicked!');
    
    // Disable button to prevent multiple clicks
    startGameBtn.disabled = true;
    startGameBtn.textContent = 'Starting...';

    socket.emit('startGame');

    // Redirect immediately to game page
    // Server will send gameStarted event once we join the game page
    setTimeout(() => {
        console.log('LOBBY: Redirecting to game page...');
        window.location.href = `/game/${currentGameId}`;
    }, 50);
});

// Add AI player
addAiBtn.addEventListener('click', () => {
    if (!isHost) {
        showModal('Only the host can add AI players!');
        return;
    }

    if (!currentGameId) {
        showModal('No game created yet!');
        return;
    }

    socket.emit('addAIPlayer', { gameId: currentGameId });
});

// Remove AI player
removeAiBtn.addEventListener('click', () => {
    if (!isHost) {
        showModal('Only the host can remove AI players!');
        return;
    }

    if (!currentGameId) {
        showModal('No game created yet!');
        return;
    }

    socket.emit('removeAIPlayer', { gameId: currentGameId });
});

// Modal close handlers
modalClose.addEventListener('click', hideModal);
modalOkBtn.addEventListener('click', hideModal);

// Socket event handlers
socket.on('gameCreated', (data) => {
    const { gameId, players, playerUid } = data;
    
    isHost = true;
    currentGameId = gameId;
    persistLobbyIdentity(gameId, playerUid);
    
    // Hide menu and lobby, show game created section
    if (gameMenu) gameMenu.classList.add('hidden');
    if (lobbySection) lobbySection.classList.add('hidden');
    gameCreatedSection.classList.remove('hidden');
    updatePlayersList(players, document.getElementById('playersList'));
    
    // Show start game button if there are at least 2 players OR 1 player + AI
    const actualPlayerCount = players.filter(p => p !== null).length;
    const hasAIPlayers = players.some(p => p && p.isAI);
    if ((actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) && isHost) {
        startGameBtn.classList.remove('hidden');
    }
});

socket.on('lobbyJoined', (data) => {
    const { gameId, playerId, playerUid, isHost: hostStatus, players } = data;
    
    isHost = hostStatus;
    currentGameId = gameId;
    persistLobbyIdentity(gameId, playerUid);
    
    // Hide menu
    if (gameMenu) gameMenu.classList.add('hidden');
    
    if (isHost) {
        // Hide lobby and show game created section
        if (lobbySection) lobbySection.classList.add('hidden');
        gameCreatedSection.classList.remove('hidden');
        updatePlayersList(players, document.getElementById('playersList'));

        // Show start game button if there are at least 2 players OR 1 player + AI
        const actualPlayerCount = players.filter(p => p !== null).length;
        const hasAIPlayers = players.some(p => p && p.isAI);
        if ((actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) && isHost) {
            startGameBtn.classList.remove('hidden');
        }
    } else {
        // Hide game created section and show lobby
        gameCreatedSection.classList.add('hidden');
        lobbySection.classList.remove('hidden');
        updatePlayersList(players, document.getElementById('lobbyPlayersList'));
    }
});

socket.on('playerJoined', (data) => {
    console.log('playerJoined received:', data);
    console.log('isHost:', isHost);
    console.log('currentGameId:', currentGameId);
    
    const { player, players } = data;
    
    if (isHost) {
        console.log('Updating host player list with:', players);
        const playersListElement = document.getElementById('playersList');
        console.log('playersList element:', playersListElement);
        updatePlayersList(players, playersListElement);

        const actualPlayerCount = players.filter(p => p !== null).length;
        const hasAIPlayers = players.some(p => p && p.isAI);
        if ((actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) && isHost) {
            console.log('Showing start game button');
            startGameBtn.classList.remove('hidden');
        }
    } else {
        console.log('Not host, not updating');
        // Also update non-host player list
        const lobbyPlayersListElement = document.getElementById('lobbyPlayersList');
        if (lobbyPlayersListElement) {
            updatePlayersList(players, lobbyPlayersListElement);
        }
    }
});

socket.on('playerLeft', (data) => {
    const { playerId, players, newHost } = data;
    
    if (isHost) {
        updatePlayersList(players, document.getElementById('playersList'));
        
        const actualPlayerCount = players.filter(p => p !== null).length;
        if (actualPlayerCount < 2 || !isHost) {
            startGameBtn.classList.add('hidden');
        }
    } else {
        updatePlayersList(players, document.getElementById('lobbyPlayersList'));
        
        if (playerId === socket.id) {
            // We were kicked or something went wrong
            location.reload();
        }
    }
});

socket.on('gameStarted', (data) => {
    console.log('LOBBY: Received gameStarted event:', data);
    console.log('LOBBY: Current game ID:', currentGameId);
    console.log('LOBBY: Socket ID:', socket.id);
    
    // Non-host players need to redirect when they receive gameStarted
    // The host already redirected when clicking the start button
    if (!isHost) {
        console.log('LOBBY: Non-host player redirecting to game page...');
        setTimeout(() => {
            window.location.href = `/game/${currentGameId}`;
        }, 50);
    } else {
        console.log('LOBBY: Host already redirected, ignoring gameStarted in lobby');
    }
});

socket.on('spectatorJoined', (data) => {
    persistSpectatorIdentity(data.gameId, data.spectatorUid);
    window.location.href = `/game/${data.gameId}?spectate=1`;
});

socket.on('lobbyError', (error) => {
    showModal(error);
});

socket.on('gameError', (error) => {
    showModal(error);
});

socket.on('aiPlayerAdded', (data) => {
    const { players } = data;
    if (isHost) {
        updatePlayersList(players, document.getElementById('playersList'));

        const actualPlayerCount = players.filter(p => p !== null).length;
        const hasAIPlayers = players.some(p => p && p.isAI);
        if ((actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) && isHost) {
            startGameBtn.classList.remove('hidden');
        }
    } else {
        const lobbyPlayersListElement = document.getElementById('lobbyPlayersList');
        if (lobbyPlayersListElement) {
            updatePlayersList(players, lobbyPlayersListElement);
        }
    }
});

socket.on('aiPlayerRemoved', (data) => {
    const { players } = data;
    if (isHost) {
        updatePlayersList(players, document.getElementById('playersList'));

        const actualPlayerCount = players.filter(p => p !== null).length;
        if (actualPlayerCount < 2 || !isHost) {
            startGameBtn.classList.add('hidden');
        }
    } else {
        const lobbyPlayersListElement = document.getElementById('lobbyPlayersList');
        if (lobbyPlayersListElement) {
            updatePlayersList(players, lobbyPlayersListElement);
        }
    }
});

// Handle connection errors - allow reconnection attempts before showing error
let connectionErrorCount = 0;
socket.on('connect_error', (error) => {
    connectionErrorCount++;
    console.log(`Connection attempt ${connectionErrorCount} failed:`, error.message);
    // Only show modal after multiple failed attempts
    if (connectionErrorCount >= 3) {
        showModal('Failed to connect to server. Please refresh the page.');
    }
});

// Reset error count on successful connection
socket.on('connect', () => {
    connectionErrorCount = 0;
    console.log('Socket connected, checking for auto-join...');
    autoJoinFromUrlIfPresent();
});

socket.on('disconnect', () => {
    showModal('Disconnected from server. Please refresh the page.');
});

// Handle lobbies list
socket.on('lobbiesList', (lobbies) => {
    renderLobbies(lobbies);
});
