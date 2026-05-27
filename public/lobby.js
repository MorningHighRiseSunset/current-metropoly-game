function getConfiguredSocketServerUrl() {
    const params = new URLSearchParams(window.location.search);
    const urlParamServer = params.get('server');
    const runtimeUrl = window.RUNTIME_CONFIG && window.RUNTIME_CONFIG.socketServerUrl;
    const storedUrl = localStorage.getItem('metropoly_socket_server_url');
    const configuredUrl = urlParamServer || runtimeUrl || storedUrl || window.location.origin;
    if (urlParamServer) {
        localStorage.setItem('metropoly_socket_server_url', urlParamServer);
    }
    return configuredUrl.replace(/\/$/, '');
}

const SOCKET_SERVER_URL = getConfiguredSocketServerUrl();
const socket = io(SOCKET_SERVER_URL, {
    transports: ['websocket', 'polling']
});

// DOM Elements
const createGameBtn = document.getElementById('createGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');
const copyIdBtn = document.getElementById('copyIdBtn');
const startGameBtn = document.getElementById('startGameBtn');
const modalOkBtn = document.getElementById('modalOkBtn');
const modalClose = document.querySelector('.close');
const addAiBtn = document.getElementById('addAiBtn');
const removeAiBtn = document.getElementById('removeAiBtn');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsModalClose = document.querySelector('.modal-close');

const gameMenu = document.querySelector('.game-menu');
const gameCreatedSection = document.getElementById('gameCreatedSection');
const lobbySection = document.getElementById('lobbySection');
const messageModal = document.getElementById('messageModal');
const modalMessage = document.getElementById('modalMessage');

let currentGameId = null;
let isHost = false;
const PUBLIC_SHARE_ORIGIN = 'https://vegas-metropoly.vercel.app';

function buildJoinLink(gameId) {
    const baseOrigin = PUBLIC_SHARE_ORIGIN || `${window.location.protocol}//${window.location.host}`;
    return `${baseOrigin}/?gameId=${encodeURIComponent(gameId)}`;
}

function saveLastPlayerName() {
    const createName = document.getElementById('playerName').value.trim();
    const joinName = document.getElementById('joinPlayerName').value.trim();
    const preferred = joinName || createName;
    if (preferred) {
        localStorage.setItem('metropoly_player_name', preferred);
    }
}

function autoJoinFromUrlIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const gameIdFromUrl = (params.get('gameId') || '').trim().toUpperCase();
    if (!gameIdFromUrl) return;

    const gameIdInput = document.getElementById('gameId');
    const joinNameInput = document.getElementById('joinPlayerName');
    const savedName = localStorage.getItem('metropoly_player_name') || '';
    const nameFromUrl = (params.get('name') || '').trim();

    gameIdInput.value = gameIdFromUrl;
    if (!joinNameInput.value) {
        // Make the invite link truly one-click even when the user didn't provide a name.
        joinNameInput.value = nameFromUrl || savedName || 'Player';
    }

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

// Generate random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
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
        const playerName = player.isAI ? `AI ${playerNumber}` : player.name;

        playerDiv.innerHTML = `
            <span class="player-name">Player ${playerNumber}: ${playerName}</span>
            <span class="player-badge">${badgeText}</span>
        `;

        listElement.appendChild(playerDiv);
    });
}

// Create game
createGameBtn.addEventListener('click', () => {
    const playerName = document.getElementById('playerName').value.trim();
    
    if (!playerName) {
        showModal('Please enter your name');
        return;
    }
    saveLastPlayerName();
    currentGameId = generateGameId();
    
    socket.emit('createLobby', {
        gameId: currentGameId,
        playerName: playerName
    });
});

// Join game
joinGameBtn.addEventListener('click', () => {
    const gameId = document.getElementById('gameId').value.trim().toUpperCase();
    const playerName = document.getElementById('joinPlayerName').value.trim();
    
    if (!gameId || !playerName) {
        showModal('Please enter both game ID and your name');
        return;
    }
    saveLastPlayerName();
    currentGameId = gameId;
    
    socket.emit('joinLobby', {
        gameId: gameId,
        playerName: playerName
    });
});

// Copy game ID
copyIdBtn.addEventListener('click', () => {
    const gameIdText = document.getElementById('generatedGameId').textContent;
    navigator.clipboard.writeText(gameIdText).then(() => {
        // Visual feedback - change button text temporarily
        const originalText = copyIdBtn.textContent;
        copyIdBtn.textContent = 'Copied!';
        copyIdBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        setTimeout(() => {
            copyIdBtn.textContent = originalText;
            copyIdBtn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Show error state
        const originalText = copyIdBtn.textContent;
        copyIdBtn.textContent = 'Failed!';
        copyIdBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        
        setTimeout(() => {
            copyIdBtn.textContent = originalText;
            copyIdBtn.style.background = '';
        }, 2000);
    });
});

// Load server info and display connection URLs
function loadServerInfo() {
    const connectionUrlsDiv = document.getElementById('connectionUrls');
    connectionUrlsDiv.innerHTML = '';

    // Primary share URL for online players.
    if (PUBLIC_SHARE_ORIGIN) {
        connectionUrlsDiv.appendChild(createUrlItem('Online', PUBLIC_SHARE_ORIGIN));
    }

    // One-click invite URL for online players.
    if (currentGameId) {
        connectionUrlsDiv.appendChild(createUrlItem('Join Link', buildJoinLink(currentGameId)));
    }

    // Keep current URL for convenience when host is not on the deployed domain.
    const currentUrl = `${window.location.protocol}//${window.location.host}`;
    if (!PUBLIC_SHARE_ORIGIN || PUBLIC_SHARE_ORIGIN !== currentUrl) {
        connectionUrlsDiv.appendChild(createUrlItem('Current', currentUrl));
    }

    fetch(`${SOCKET_SERVER_URL}/server-info`)
        .then(response => response.json())
        .then(data => {
            // Add primary network URL if server reported one.
            if (data.externalIPs.length > 0) {
                const primaryUrl = data.externalIPs[0];
                if (primaryUrl !== currentUrl && primaryUrl !== PUBLIC_SHARE_ORIGIN) {
                    const urlItem = createUrlItem('Network', primaryUrl);
                    connectionUrlsDiv.appendChild(urlItem);
                }
            }
        })
        .catch(error => {
            console.error('Failed to load server info:', error);
        });
}

function createUrlItem(label, url) {
    const item = document.createElement('div');
    item.className = 'url-item';
    
    const labelSpan = document.createElement('span');
    labelSpan.className = 'url-label';
    labelSpan.textContent = label;
    
    const urlSpan = document.createElement('span');
    urlSpan.className = 'url-text';
    urlSpan.textContent = url;
    urlSpan.style.cursor = 'pointer';
    urlSpan.addEventListener('click', () => {
        navigator.clipboard.writeText(url).then(() => {
            urlSpan.style.color = '#28a745';
            setTimeout(() => {
                urlSpan.style.color = '';
            }, 2000);
        });
    });
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-url-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(url).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.style.backgroundColor = '#28a745';
            setTimeout(() => {
                copyBtn.textContent = 'Copy';
                copyBtn.style.backgroundColor = '';
            }, 2000);
        });
    });
    
    item.appendChild(labelSpan);
    item.appendChild(urlSpan);
    item.appendChild(copyBtn);
    
    return item;
}

// Start game
startGameBtn.addEventListener('click', () => {
    console.log('Start game button clicked!');
    console.log('isHost:', isHost);
    console.log('currentGameId:', currentGameId);

    // Only host can start the game
    if (!isHost) {
        showModal('Only the host can start the game!');
        return;
    }

    // Disable button to prevent multiple clicks
    startGameBtn.disabled = true;
    startGameBtn.textContent = 'Starting...';

    socket.emit('startGame');

    // Force immediate redirect without waiting for gameStarted
    console.log('LOBBY: Forcing immediate redirect to game page');
    setTimeout(() => {
        window.location.href = `/game/${currentGameId}`;
    }, 500);
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
    const { gameId, players } = data;
    
    isHost = true;
    currentGameId = gameId;
    
    // Hide menu and lobby, show game created section
    gameMenu.classList.add('hidden');
    lobbySection.classList.add('hidden');
    gameCreatedSection.classList.remove('hidden');
    document.getElementById('generatedGameId').textContent = gameId;
    updatePlayersList(players, document.getElementById('playersList'));
    
    // Load and display connection URLs
    loadServerInfo();
    
    // Show start game button if there are at least 2 players OR 1 player + AI
    const actualPlayerCount = players.filter(p => p !== null).length;
    const hasAIPlayers = players.some(p => p && p.isAI);
    if ((actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) && isHost) {
        startGameBtn.classList.remove('hidden');
    }
});

socket.on('lobbyJoined', (data) => {
    const { gameId, playerId, isHost: hostStatus, players } = data;
    
    isHost = hostStatus;
    currentGameId = gameId;
    
    // Hide menu
    gameMenu.classList.add('hidden');
    
    if (isHost) {
        // Hide lobby and show game created section
        lobbySection.classList.add('hidden');
        gameCreatedSection.classList.remove('hidden');
        document.getElementById('generatedGameId').textContent = gameId;
        updatePlayersList(players, document.getElementById('playersList'));
        
        // Load and display connection URLs
        loadServerInfo();

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
        document.getElementById('lobbyGameId').textContent = gameId;
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
    
    // Acknowledge receipt to server
    socket.emit('gameStartedAck');
    console.log('LOBBY: Sent gameStartedAck');
    
    // Add small delay to allow acknowledgment to be processed before redirect
    setTimeout(() => {
        console.log('LOBBY: Redirecting to game page...');
        window.location.href = `/game/${currentGameId}`;
    }, 500);
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

// Handle connection errors
socket.on('connect_error', () => {
    showModal('Failed to connect to server. Please refresh the page.');
});

socket.on('disconnect', () => {
    showModal('Disconnected from server. Please refresh the page.');
});

autoJoinFromUrlIfPresent();
