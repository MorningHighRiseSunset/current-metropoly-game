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

// Helper function to get model path (using CDN if configured)
function getModelPath(localPath) {
    const USE_CDN = window.USE_CDN !== false; // Default to true unless explicitly disabled
    const CDN_BASE_URL = window.CDN_BASE_URL;
    
    if (USE_CDN && CDN_BASE_URL) {
        // Convert local path like '/Models/Helicopter/helicopter.glb' to CDN URL
        return localPath.replace('/Models', CDN_BASE_URL);
    }
    return localPath;
}

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
const gameLinkDisplay = document.getElementById('gameLinkDisplay');
const copyLinkBtn = document.getElementById('copyLinkBtn');

const gameMenu = document.querySelector('.lobby-container');
const gameLobbySection = document.getElementById('gameLobbySection');
const lobbySection = document.getElementById('lobbySection');
const messageModal = document.getElementById('messageModal');
const modalMessage = document.getElementById('modalMessage');

let currentGameId = null;
let isHost = false;
let availableLobbies = [];
let autoStartOnJoin = false;
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
            socket.emit('addAIPlayer', { gameId });
            console.log('Added AI player 1');

            // Add second AI
            setTimeout(() => {
                socket.emit('addAIPlayer', { gameId });
                console.log('Added AI player 2');

                // Start game
                setTimeout(() => {
                    socket.emit('startGame');
                    console.log('Game started! Redirecting to game page...');

                    // Redirect to game page as spectator
                    setTimeout(() => {
                        window.location.href = `/game/${gameId}`;
                    }, 500);
                }, 500);
            }, 500);
        }, 500);
    };

    createGame();
};

// Console command to add AI player to current game (host only)
// Usage in browser console: addAI()
window.addAI = function() {
    if (!currentGameId) {
        console.error('No game created yet! Create a game first.');
        return;
    }
    if (!isHost) {
        console.error('Only the host can add AI players!');
        return;
    }
    console.log('Adding AI player to game:', currentGameId);
    socket.emit('addAIPlayer', { gameId: currentGameId });
};

// Console command to remove AI player from current game (host only)
// Usage in browser console: removeAI()
window.removeAI = function() {
    if (!currentGameId) {
        console.error('No game created yet!');
        return;
    }
    if (!isHost) {
        console.error('Only the host can remove AI players!');
        return;
    }
    console.log('Removing AI player from game:', currentGameId);
    socket.emit('removeAIPlayer', { gameId: currentGameId });
};

// Alias for common typo
window.createAIVsAIGame = window.createAiVsAiGame;

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
    const gameIdFromUrl = (params.get('game') || '').trim().toUpperCase();
    if (!gameIdFromUrl) return;

    console.log('Auto-joining lobby from URL:', gameIdFromUrl);
    
    // Emit join lobby event
    socket.emit('joinLobby', { gameId: gameIdFromUrl });
    
    // Set flag to auto-start game when player joins
    autoStartOnJoin = true;
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

// Initialize helicopter animation
initHelicopterAnimation();

// Fetch lobbies on page load (commented out since we removed lobbies list)
// fetchLobbies();

// Refresh lobbies button (commented out since we removed lobbies list)
// if (refreshLobbiesBtn) {
//     refreshLobbiesBtn.addEventListener('click', () => {
//         fetchLobbies();
//     });
// }

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
    // Spectate ability commented out
    // const liveGames = availableLobbies.filter(g => g.isWatchable);

    if (openLobbies.length === 0) {
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

    // Spectate ability commented out
    // if (liveGames.length > 0) {
    //     html += `<div class="lobby-section-label lobby-section-label--live">Games In Progress</div>`;
    //     html += liveGames.map(game => renderLiveGameCard(game)).join('');
    // }

    // Only update if lobbiesList exists (we removed it from the new layout)
    if (lobbiesList) {
        lobbiesList.innerHTML = html;
    }
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

// Spectate ability commented out
// function renderLiveGameCard(game) {
//     const playerCount = game.players ? game.players.length : 0;
//     const spectatorCount = game.spectatorCount || 0;
//     const hostName = game.hostName || (game.players && game.players[0] ? game.players[0].name : 'Host');
//     const statusLabel = game.status === 'starting' ? 'Starting' : 'In Progress';

//     return `
//         <div class="lobby-card lobby-card--live" data-game-id="${game.gameId}">
//             <div class="lobby-card-header">
//                 <span class="lobby-game-id">${game.gameId}</span>
//                 <span class="lobby-status status-live">${statusLabel}</span>
//             </div>
//             <div class="lobby-card-body">
//                 <div class="lobby-info">
//                     <div class="lobby-info-item">
//                         <span class="lobby-info-icon">👥</span>
//                         <span class="lobby-info-text">${playerCount} Players</span>
//                     </div>
//                     <div class="lobby-info-item">
//                         <span class="lobby-info-icon">👑</span>
//                         <span class="lobby-info-text">Host: ${hostName}</span>
//                     </div>
//                     ${spectatorCount > 0 ? `
//                     <div class="lobby-info-item">
//                         <span class="lobby-info-icon">👁️</span>
//                         <span class="lobby-info-text">${spectatorCount} Watching</span>
//                     </div>` : ''}
//                 </div>
//                 <button class="btn btn-watch" onclick="watchGame('${game.gameId}')">
//                     Watch Game
//                 </button>
//             </div>
//         </div>
//     `;
// }

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

// Spectate ability commented out
// function watchGame(gameId) {
//     const spectatorName = generateRandomPlayerName();
//     sessionStorage.setItem('metropoly_spectator_name', spectatorName);
//     currentGameId = gameId;
//     socket.emit('joinAsSpectator', {
//         gameId,
//         spectatorName
//     });
// }

// Copy game link button
copyLinkBtn.addEventListener('click', () => {
    if (currentGameId) {
        const lobbyLink = `${window.location.origin}/?game=${currentGameId}`;
        copyToClipboard(lobbyLink, copyLinkBtn);
    }
});

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

// AI add/remove buttons (now in settings modal)
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

    // Display direct link to lobby
    if (gameLinkDisplay) {
        const lobbyLink = `${window.location.origin}/?game=${gameId}`;
        gameLinkDisplay.textContent = lobbyLink;
    }

    // Show game lobby section in middle
    gameLobbySection.classList.remove('hidden');
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

    // Show game lobby section in middle for both host and non-host
    gameLobbySection.classList.remove('hidden');
    updatePlayersList(players, document.getElementById('playersList'));

    if (isHost) {
        // Show start game button if there are at least 2 players OR 1 player + AI
        const actualPlayerCount = players.filter(p => p !== null).length;
        const hasAIPlayers = players.some(p => p && p.isAI);
        if ((actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) && isHost) {
            startGameBtn.classList.remove('hidden');
        }

        // Auto-start game if player joined via direct link
        if (autoStartOnJoin) {
            console.log('Auto-starting game after joining via direct link...');
            autoStartOnJoin = false;
            setTimeout(() => {
                startGameBtn.click();
            }, 500);
        }
    } else {
        // Hide start button for non-host
        startGameBtn.classList.add('hidden');

        // Auto-start game if this player joined via direct link and there are enough players
        if (autoStartOnJoin) {
            console.log('Auto-starting game after second player joined via direct link...');
            autoStartOnJoin = false;
            // Notify host to start game
            socket.emit('requestStartGame', { gameId });
        }
    }
});

socket.on('lobbyDeleted', (data) => {
    const { gameId, reason } = data;
    showModal(`Lobby deleted: ${reason}`);

    // Clear game state
    currentGameId = null;
    isHost = false;
    clearSpectatorIdentity();

    // Return to lobby menu
    setTimeout(() => {
        hideModal();
        gameLobbySection.classList.add('hidden');
        lobbySection.classList.add('hidden');
        fetchLobbies();
    }, 2000);
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

            // Auto-start game if a player joined via direct link
            if (autoStartOnJoin) {
                console.log('Auto-starting game after player joined via direct link...');
                autoStartOnJoin = false;
                setTimeout(() => {
                    startGameBtn.click();
                }, 500);
            }
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
        // Check if host left
        if (newHost === null || players.length === 0) {
            // Host left, close lobby box
            showModal('The host has left the lobby. Returning to main menu.');
            setTimeout(() => {
                hideModal();
                gameLobbySection.classList.add('hidden');
                lobbySection.classList.add('hidden');
                currentGameId = null;
                isHost = false;
                clearSpectatorIdentity();
            }, 2000);
            return;
        }

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

// Helicopter Animation
function initHelicopterAnimation() {
    const container = document.getElementById('helicopter-container');
    if (!container) return;

    // Set up Three.js scene for helicopter
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // Transparent background
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Camera position
    camera.position.z = 200;

    // Load helicopter model
    const helicopterModelPath = getModelPath('/Models/Helicopter/helicopter.glb');
    console.log('Loading helicopter model from:', helicopterModelPath);
    let helicopterModel = null;
    let mixer = null;

    const loader = new THREE.GLTFLoader();
    loader.load(helicopterModelPath,
        function(gltf) {
            helicopterModel = gltf.scene;
            helicopterModel.scale.set(0.5, 0.5, 0.5); // Adjusted scale for lobby
            helicopterModel.visible = false;
            scene.add(helicopterModel);

            // Set up animation mixer for rotor spinning
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(helicopterModel);
                helicopterModel.animations = gltf.animations;
                
                // Play all animations (rotor spinning)
                gltf.animations.forEach((anim) => {
                    const action = mixer.clipAction(anim);
                    action.timeScale = 3.0; // Spin 3x faster
                    action.play();
                });
            }

            // Start helicopter animation loop
            animateHelicopter();
        },
        function(xhr) {
            if (xhr.lengthComputable) {
                const percentComplete = xhr.loaded / xhr.total * 100;
                console.log(`Loading helicopter: ${percentComplete.toFixed(2)}%`);
            }
        },
        function(error) {
            console.error('Error loading helicopter model:', error);
        }
    );

    // Animation state
    let animationState = {
        active: false,
        type: 'flyby', // 'flyby', 'circle', 'figure8', 'spiral', 'hover'
        direction: 'right', // 'left' or 'right'
        progress: 0,
        duration: 8000, // 8 seconds
        startTime: 0
    };

    function animateHelicopter() {
        if (!helicopterModel) {
            requestAnimationFrame(animateHelicopter);
            return;
        }

        // Update animation mixer for rotor spinning
        if (mixer) {
            mixer.update(0.016);
        }

        // Handle helicopter flight animation
        if (animationState.active) {
            const elapsed = performance.now() - animationState.startTime;
            const t = Math.min(elapsed / animationState.duration, 1);

            if (animationState.type === 'flyby') {
                // Original flyby animation
                if (animationState.direction === 'right') {
                    helicopterModel.position.x = -600 + t * 800;
                    helicopterModel.position.y = 5 + t * 35;
                    helicopterModel.position.z = -120 + Math.sin(t * Math.PI) * 90;
                    helicopterModel.scale.setScalar(0.25 + Math.sin(t * Math.PI) * 0.7);
                    helicopterModel.rotation.y = t * 45 * (Math.PI / 180);
                } else {
                    helicopterModel.position.x = 600 - t * 800;
                    helicopterModel.position.y = 5 + t * 35;
                    helicopterModel.position.z = -120 + Math.sin(t * Math.PI) * 90;
                    helicopterModel.scale.setScalar(0.25 + Math.sin(t * Math.PI) * 0.7);
                    helicopterModel.rotation.y = 180 * (Math.PI / 180) - t * 45 * (Math.PI / 180);
                }
            } else if (animationState.type === 'circle') {
                // Circular flight pattern
                const radius = 150;
                const angle = t * Math.PI * 2;
                helicopterModel.position.x = Math.cos(angle) * radius;
                helicopterModel.position.y = 30 + Math.sin(angle * 2) * 10;
                helicopterModel.position.z = Math.sin(angle) * radius;
                helicopterModel.scale.setScalar(0.4);
                helicopterModel.rotation.y = angle + Math.PI / 2;
            } else if (animationState.type === 'figure8') {
                // Figure-8 pattern
                const scale = 120;
                helicopterModel.position.x = Math.sin(t * Math.PI * 2) * scale;
                helicopterModel.position.y = 30 + Math.sin(t * Math.PI * 4) * 15;
                helicopterModel.position.z = Math.sin(t * Math.PI * 4) * scale * 0.5;
                helicopterModel.scale.setScalar(0.4);
                helicopterModel.rotation.y = Math.atan2(
                    Math.cos(t * Math.PI * 2) * scale * Math.PI * 2,
                    Math.cos(t * Math.PI * 4) * scale * Math.PI * 2
                );
            } else if (animationState.type === 'spiral') {
                // Spiral ascent/descent
                const radius = 100 - t * 50;
                const angle = t * Math.PI * 4;
                helicopterModel.position.x = Math.cos(angle) * radius;
                helicopterModel.position.y = 10 + t * 40;
                helicopterModel.position.z = Math.sin(angle) * radius;
                helicopterModel.scale.setScalar(0.3 + t * 0.2);
                helicopterModel.rotation.y = angle + Math.PI / 2;
            } else if (animationState.type === 'hover') {
                // Hover with gentle movement
                helicopterModel.position.x = Math.sin(t * Math.PI * 2) * 30;
                helicopterModel.position.y = 40 + Math.sin(t * Math.PI * 3) * 5;
                helicopterModel.position.z = Math.sin(t * Math.PI * 2.5) * 20;
                helicopterModel.scale.setScalar(0.5);
                helicopterModel.rotation.y = Math.sin(t * Math.PI) * 0.2;
            }

            helicopterModel.visible = true;

            // End animation
            if (t >= 1) {
                animationState.active = false;
                helicopterModel.visible = false;

                // Schedule next flight
                const nextFlight = Math.random() * 15000 + 15000;
                setTimeout(triggerHelicopter, nextFlight);
            }
        }

        renderer.render(scene, camera);
        requestAnimationFrame(animateHelicopter);
    }

    function triggerHelicopter() {
        if (!helicopterModel) return;

        // Randomly choose animation type
        const types = ['flyby', 'flyby', 'circle', 'figure8', 'spiral', 'hover'];
        animationState.type = types[Math.floor(Math.random() * types.length)];

        if (animationState.type === 'flyby') {
            animationState.direction = Math.random() > 0.5 ? 'right' : 'left';
        }

        animationState.active = true;
        animationState.startTime = performance.now();

        console.log(`Helicopter animation: ${animationState.type}${animationState.type === 'flyby' ? ' ' + animationState.direction : ''}`);
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start first helicopter after model loads
    setTimeout(triggerHelicopter, 5000);
}

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
