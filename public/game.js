// Game state
function getConfiguredSocketServerUrl() {
    const params = new URLSearchParams(window.location.search);
    const urlParamServer = params.get('server');
    const runtimeUrl = window.RUNTIME_CONFIG && window.RUNTIME_CONFIG.socketServerUrl;
    const storedUrl = localStorage.getItem('metropoly_socket_server_url');
    // If runtime-config.js fails to load on the frontend host (e.g. Vercel rewrite -> HTML),
    // we still want a working default Socket.IO backend.
    const defaultBackendUrl = 'https://current-metropoly-game.onrender.com';
    const configuredUrl = urlParamServer || runtimeUrl || storedUrl || defaultBackendUrl || window.location.origin;
    if (urlParamServer) {
        localStorage.setItem('metropoly_socket_server_url', urlParamServer);
    }
    return configuredUrl.replace(/\/$/, '');
}

const SOCKET_SERVER_URL = getConfiguredSocketServerUrl();
const socket = io(SOCKET_SERVER_URL, {
    transports: ['websocket', 'polling']
});
let gameState = null;
let myPlayerId = null;
let players = [];
let currentPlayer = null;
let boardSpaces = [];
let canRollDice = false;
let currentGameId = null;
let lastTurnAnnouncementPlayerId = null;
let propertyDecisionTimer = null;
let propertyDecisionEndsAt = null;
let activePropertyDecision = null;
let waitingForBuyResult = false;
let casinoMessageListenerAttached = false;

// ========== DICE ROLL SEQUENCE STATE MACHINE ==========
// Manages the complete flow: DICE_ROLLING → TOKEN_MOVING → UI_OPENING → COMPLETE
const DiceRollSequenceManager = (() => {
    const PHASES = {
        IDLE: 'idle',
        DICE_ROLLING: 'dice_rolling',
        TOKEN_MOVING: 'token_moving',
        UI_OPENING: 'ui_opening',
        COMPLETE: 'complete'
    };

    const sequences = {}; // Track active sequences by playerId

    function startSequence(playerId) {
        sequences[playerId] = {
            phase: PHASES.DICE_ROLLING,
            playerId,
            startTime: Date.now(),
            oldPosition: null,
            newPosition: null,
            diceData: null
        };
        logSequence(playerId, `Started sequence (${PHASES.DICE_ROLLING})`);
    }

    function updatePhase(playerId, newPhase) {
        if (!sequences[playerId]) return;
        const oldPhase = sequences[playerId].phase;
        sequences[playerId].phase = newPhase;
        logSequence(playerId, `Phase transition: ${oldPhase} → ${newPhase}`);
    }

    function markDiceRolled(playerId, oldPosition, newPosition, diceData) {
        if (!sequences[playerId]) return;
        sequences[playerId].oldPosition = oldPosition;
        sequences[playerId].newPosition = newPosition;
        sequences[playerId].diceData = diceData;
        updatePhase(playerId, PHASES.TOKEN_MOVING);
    }

    function markTokenMoving(playerId) {
        updatePhase(playerId, PHASES.TOKEN_MOVING);
    }

    function markUIOpening(playerId) {
        updatePhase(playerId, PHASES.UI_OPENING);
    }

    function completeSequence(playerId) {
        if (!sequences[playerId]) return;
        updatePhase(playerId, PHASES.COMPLETE);
        const duration = Date.now() - sequences[playerId].startTime;
        logSequence(playerId, `Completed (${duration}ms)`);
        delete sequences[playerId];
    }

    function cancelSequence(playerId) {
        if (sequences[playerId]) {
            logSequence(playerId, `Cancelled at phase ${sequences[playerId].phase}`);
            delete sequences[playerId];
        }
    }

    function getSequence(playerId) {
        return sequences[playerId] || null;
    }

    function isActive(playerId) {
        return !!sequences[playerId];
    }

    function logSequence(playerId, message) {
        const playerName = players.find(p => p && p.id === playerId)?.name || playerId;
        console.log(`[DiceRollSeq:${playerName}] ${message}`);
    }

    return {
        PHASES,
        startSequence,
        updatePhase,
        markDiceRolled,
        markTokenMoving,
        markUIOpening,
        completeSequence,
        cancelSequence,
        getSequence,
        isActive,
        logSequence
    };
})();

// Token data
const tokenData = [
    { name: 'Burger', model: getModelPath('/Models/Cheeseburger/cheeseburger.glb'), image: '/images/Burger.png', scale: 0.42 },
    { name: 'Football', model: getModelPath('/Models/Football/football.glb'), image: '/images/football.png', scale: 0.03 },
    { name: 'Helicopter', model: getModelPath('/Models/Helicopter/helicopter.glb'), image: '/images/helicopter.png', scale: 0.002 },
    { name: 'Rolls Royce', model: getModelPath('/Models/RollsRoyce/rollsRoyceCarAnim.glb'), image: '/images/rolls royce.png', scale: 0.14, facingOffset: Math.PI / 2 },
    { name: 'Shoe', model: getModelPath('/Models/Shoe/shoe.glb'), image: '/images/Shoe.png', scale: 0.25 },
    { name: 'Top Hat', model: getModelPath('/Models/TopHat/tophat.glb'), image: '/images/top hat.png', scale: 0.22 },
    { name: 'White Girl', model: getModelPath('/Models/WhiteGirlIdle/Standing Idle.fbx'), walkModel: getModelPath('/Models/WhiteGirlWalk/Walking.fbx'), image: '/images/female model.png', scale: 0.06 },
    { name: 'Coffee Cup', model: getModelPath('/Models/CoffeeCup/coffee.gltf'), image: '/tokenimages/coffee%20image.png', scale: 0.25 }
];

// Helper function to get model path (supports CDN)
function getModelPath(localPath) {
    const USE_CDN = window.USE_CDN || false;
    const CDN_BASE_URL = window.CDN_BASE_URL || '';
    
    if (USE_CDN && CDN_BASE_URL) {
        // CDN_BASE_URL already includes /Models, so just replace the leading /Models
        return localPath.replace('/Models', CDN_BASE_URL);
    }
    return localPath;
}

// Dice initialization (no longer needed - procedurally generated)

// Dice roll sound (Web Audio API)
function playDiceRollSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const rollMs = getDiceRollDurationMs();
        const clatterCount = Math.max(6, Math.floor(rollMs / 280));

        const rumbleOsc = audioContext.createOscillator();
        const rumbleGain = audioContext.createGain();
        rumbleOsc.type = 'triangle';
        rumbleOsc.frequency.setValueAtTime(180, audioContext.currentTime);
        rumbleOsc.frequency.exponentialRampToValueAtTime(55, audioContext.currentTime + rollMs / 1000);
        rumbleGain.gain.setValueAtTime(0.22, audioContext.currentTime);
        rumbleGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + rollMs / 1000);
        rumbleOsc.connect(rumbleGain);
        rumbleGain.connect(audioContext.destination);
        rumbleOsc.start();
        rumbleOsc.stop(audioContext.currentTime + rollMs / 1000);

        for (let i = 0; i < clatterCount; i++) {
            setTimeout(() => {
                const clickOsc = audioContext.createOscillator();
                const clickGain = audioContext.createGain();
                clickOsc.type = 'square';
                clickOsc.frequency.setValueAtTime(180 + Math.random() * 420, audioContext.currentTime);
                clickGain.gain.setValueAtTime(0.08 + Math.random() * 0.06, audioContext.currentTime);
                clickGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.06);
                clickOsc.connect(clickGain);
                clickGain.connect(audioContext.destination);
                clickOsc.start();
                clickOsc.stop(audioContext.currentTime + 0.06);
            }, i * (rollMs / clatterCount) * 0.85);
        }
    } catch (e) {
        console.log('Could not play dice sound:', e);
    }
}

// Create a simple cube die with pip dots on each face using canvas textures
function createDiceTexture(value) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // White background with subtle gradient for depth
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#f0f0f0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Black border with rounded corners effect
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, size - 8, size - 8);

    // Inner border for depth
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    // Draw pips for the value with shading
    const pipRadius = size / 14;
    const pipPositions = {
        1: [[0.5, 0.5]],
        2: [[0.25, 0.25], [0.75, 0.75]],
        3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
        4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
        5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
        6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]]
    };

    const positions = pipPositions[value] || pipPositions[1];
    positions.forEach(([x, y]) => {
        const px = x * size;
        const py = y * size;
        
        // Shadow for depth
        ctx.beginPath();
        ctx.arc(px + 3, py + 3, pipRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();
        
        // Main pip with gradient
        const pipGradient = ctx.createRadialGradient(px - pipRadius * 0.3, py - pipRadius * 0.3, 0, px, py, pipRadius);
        pipGradient.addColorStop(0, '#444444');
        pipGradient.addColorStop(1, '#000000');
        ctx.beginPath();
        ctx.arc(px, py, pipRadius, 0, Math.PI * 2);
        ctx.fillStyle = pipGradient;
        ctx.fill();
        
        // Highlight
        ctx.beginPath();
        ctx.arc(px - pipRadius * 0.3, py - pipRadius * 0.3, pipRadius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    return texture;
}

// Create a single die mesh with properly oriented faces
function createDiceMesh() {
    const size = 0.15;
    // Use higher segment count for smoother appearance
    const geometry = new THREE.BoxGeometry(size, size, size, 4, 4, 4);
    
    // Create materials for each face (order: +X, -X, +Y, -Y, +Z, -Z)
    // Dice face mapping: faces are in order of BoxGeometry [right, left, top, bottom, front, back]
    // We need: 1=top(+Y), 6=bottom(-Y), 2=right(+X), 5=left(-X), 4=front(+Z), 3=back(-Z)
    const materials = [
        new THREE.MeshStandardMaterial({ map: createDiceTexture(2), roughness: 0.2, metalness: 0.15 }), // +X (right) = 2
        new THREE.MeshStandardMaterial({ map: createDiceTexture(5), roughness: 0.2, metalness: 0.15 }), // -X (left) = 5
        new THREE.MeshStandardMaterial({ map: createDiceTexture(1), roughness: 0.2, metalness: 0.15 }), // +Y (top) = 1
        new THREE.MeshStandardMaterial({ map: createDiceTexture(6), roughness: 0.2, metalness: 0.15 }), // -Y (bottom) = 6
        new THREE.MeshStandardMaterial({ map: createDiceTexture(4), roughness: 0.2, metalness: 0.15 }), // +Z (front) = 4
        new THREE.MeshStandardMaterial({ map: createDiceTexture(3), roughness: 0.2, metalness: 0.15 })  // -Z (back) = 3
    ];

    const dice = new THREE.Mesh(geometry, materials);
    dice.castShadow = true;
    dice.receiveShadow = true;
    return dice;
}

function spawnDiceOnBoard(playerPosition) {
    if (!scene) return;

    // Remove existing dice if any
    if (dice1Mesh && scene) scene.remove(dice1Mesh);
    if (dice2Mesh && scene) scene.remove(dice2Mesh);

    const sep = DICE_GLB_CONFIG.separation * 0.5;
    // Always spawn at board center (0, 0) not at player position
    const boardCenterY = BOARD_LAYOUT.tokenY;

    dice1Mesh = createDiceMesh();
    dice2Mesh = createDiceMesh();

    // Enhance dice materials for better 3D appearance
    dice1Mesh.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                child.material.envMapIntensity = 1.5;
                child.material.roughness = 0.15;
                child.material.metalness = 0.25;
            }
        }
    });

    dice2Mesh.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                child.material.envMapIntensity = 1.5;
                child.material.roughness = 0.15;
                child.material.metalness = 0.25;
            }
        }
    });

    // Position dice at board center, above the board surface
    dice1Mesh.position.set(-sep, boardCenterY + 0.4, 0);
    dice2Mesh.position.set(sep, boardCenterY + 0.4, 0);

    scene.add(dice1Mesh);
    scene.add(dice2Mesh);
    dice1Mesh.visible = false;
    dice2Mesh.visible = false;
}

/** Roll two dice (all clients: human + AI via diceRolled socket). Optional onLand when roll finishes. */
function roll3DDice(dice1Value, dice2Value, playerPosition, callbacks) {
    if (!scene) {
        setTimeout(() => roll3DDice(dice1Value, dice2Value, playerPosition, callbacks), 100);
        return;
    }

    if (diceRollAnimFrame) {
        cancelAnimationFrame(diceRollAnimFrame);
        diceRollAnimFrame = null;
    }

    spawnDiceOnBoard(playerPosition);
    // Always roll dice at board center (0, 0)
    const anchor = { x: 0, y: BOARD_LAYOUT.tokenY, z: 0 };

    diceRolling = true;
    dice1Mesh.visible = true;
    dice2Mesh.visible = true;

    playDiceRollSound();

    let rollTick = runDiceRollAnimation({
        meshes: [dice1Mesh, dice2Mesh],
        values: [dice1Value, dice2Value],
        duration: getDiceRollDurationMs(),
        anchor,
        onComplete: () => {
            setTimeout(() => {
                diceRolling = false;
                if (callbacks && typeof callbacks.onLand === 'function') {
                    callbacks.onLand();
                }
                setTimeout(() => {
                    if (dice1Mesh) dice1Mesh.visible = false;
                    if (dice2Mesh) dice2Mesh.visible = false;
                }, 350);
            }, getDiceSettleHoldMs());
        }
    });

    function animateDiceFrame(now) {
        if (rollTick && rollTick(now)) {
            diceRollAnimFrame = requestAnimationFrame(animateDiceFrame);
        } else {
            rollTick = null;
            diceRollAnimFrame = null;
        }
    }

    diceRollAnimFrame = requestAnimationFrame(animateDiceFrame);
}

// Map board index to grid cell (must match create3DBoard row/col logic)
function positionToGrid(position) {
    const pos = ((position % 40) + 40) % 40;
    if (pos <= 10) return { row: 0, col: pos };
    if (pos <= 20) return { row: pos - 10, col: 10 };
    if (pos <= 30) return { row: 10, col: 10 - (pos - 20) };
    return { row: 40 - pos, col: 0 };
}

// Board position -> 3D world coordinates (same formula as board tiles)
function get3DBoardCoords(position) {
    const { step, tokenY } = BOARD_LAYOUT;
    const { row, col } = positionToGrid(position);
    const x = (col - 5) * step;
    const z = (row - 5) * step;
    return { x, y: tokenY, z };
}

function getTokenYawOffset(player) {
    if (!player || player.tokenIndex === undefined) return 0;
    const tokenInfo = tokenData[player.tokenIndex];
    return tokenInfo && tokenInfo.facingOffset != null ? tokenInfo.facingOffset : 0;
}

/** Y rotation toward a target tile (Three.js default model forward = -Z). */
function getTokenFacingRotationBetween(fromPos, toPos, yawOffset = 0) {
    const from = get3DBoardCoords(fromPos);
    const to = get3DBoardCoords(toPos);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (dx === 0 && dz === 0) return yawOffset;
    // Calculate angle to face movement direction
    const angle = Math.atan2(dx, dz) + Math.PI; // Add 180° to fix orientation
    return angle + yawOffset;
}

/** Y rotation so token faces the next space along the board path. */
function getTokenFacingRotationY(position, direction = 'forward', yawOffset = 0) {
    const pos = ((position % 40) + 40) % 40;
    const nextPos = direction === 'backward'
        ? (pos - 1 + 40) % 40
        : (pos + 1) % 40;
    return getTokenFacingRotationBetween(pos, nextPos, yawOffset);
}

function lerpAngleY(fromY, toY, t) {
    let diff = toY - fromY;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return fromY + diff * t;
}

function applyTokenFacing(model, position, direction = 'forward', player = null) {
    if (!model) return;
    // Face direction of movement (next tile)
    const rotation = getTokenFacingRotationY(position, direction, getTokenYawOffset(player));
    model.rotation.y = rotation;
}

function applyTokenFacingBetween(model, fromPos, toPos, player = null) {
    if (!model) return;
    model.rotation.y = getTokenFacingRotationBetween(fromPos, toPos, getTokenYawOffset(player));
}

function getMoveStepCount(oldPosition, newPosition, direction = 'forward') {
    if (oldPosition === newPosition) return 0;
    let steps = 0;
    let pos = oldPosition;
    if (direction === 'backward') {
        while (pos !== newPosition) {
            pos = (pos - 1 + 40) % 40;
            steps++;
            if (steps > 40) break;
        }
    } else {
        while (pos !== newPosition) {
            pos = (pos + 1) % 40;
            steps++;
            if (steps > 40) break;
        }
    }
    return steps;
}

/** Shortest path around the board (e.g. go to jail from behind). Dice rolls always use forward. */
function getBestMoveDirection(oldPosition, newPosition) {
    const fwd = getMoveStepCount(oldPosition, newPosition, 'forward');
    const back = getMoveStepCount(oldPosition, newPosition, 'backward');
    if (back > 0 && back < fwd) return 'backward';
    return 'forward';
}

function isTokenVisible(playerId) {
    return revealedPlayerIds.has(playerId);
}

function revealPlayerToken(playerId) {
    if (!playerId) return;
    revealedPlayerIds.add(playerId);
    const player = players.find(p => p && p.id === playerId);
    if (player && player.tokenIndex !== undefined) {
        loadTokenModel(player.tokenIndex, player);
    }
    updateTokenVisibility();
}

function initRevealedPlayersForTurn() {
    revealedPlayerIds.clear();
    // Reveal all players who have moved (position > 0 or have rolled)
    players.forEach(player => {
        if (player && player.id && player.position > 0) {
            revealedPlayerIds.add(player.id);
        }
    });
    // Also reveal current player even if they haven't moved yet
    if (gameState && gameState.currentPlayer) {
        revealedPlayerIds.add(gameState.currentPlayer);
    }
    updateTokenVisibility();
}

function updateTokenVisibility() {
    players.forEach(player => {
        if (!player || !player.id) return;
        const model = tokenModels[player.id];
        if (model) {
            model.visible = isTokenVisible(player.id);
        }
    });
}

function cancelTokenAnimation(playerId) {
    if (tokenAnimationHandles[playerId]) {
        tokenAnimationHandles[playerId].cancelled = true;
        delete tokenAnimationHandles[playerId];
    }
}

// Update 3D token positions (skips tokens mid-animation so they don't teleport)
function update3DTokenPositions() {
    if (!players || !Array.isArray(players)) {
        return;
    }

    players.forEach(player => {
        if (!player || !player.name || !player.id) {
            return;
        }

        if (tokenAnimatingIds.has(player.id)) {
            return;
        }

        if (pendingRollTokenMoves[player.id]) {
            return;
        }

        const model = tokenModels[player.id];
        if (!model) {
            return;
        }

        const coords = get3DBoardCoords(player.position || 0);
        model.position.set(coords.x, coords.y, coords.z);
        applyTokenFacing(model, player.position || 0, 'forward', player);
        model.visible = isTokenVisible(player.id);

        if (model.mixer) {
            model.mixer.update(0.016);
        }
    });
}

// DOM Elements
const gameBoard = document.getElementById('gameBoard');
const tokensLayer = document.getElementById('tokens');
const token3DScene = document.getElementById('token3DScene');
const playerMoneyEl = document.getElementById('playerMoney');
const playerNameEl = document.getElementById('playerName');
const gameCodeEl = document.getElementById('gameCode');
const tokenModal = document.getElementById('tokenModal');
const tokenSelectionEl = document.getElementById('tokenSelection');

// Three.js variables for 3D tokens and board
let scene, camera, renderer;
let tokenModels = {};
let tokenMeshes = {};
let tokenLoading = {};
let boardMeshes = {}; // Store board space meshes
let boardEnvironmentGroup = null;
let scene3DInitialized = false;
let resizeObserver = null;

// 3D Dice variables
let dice1Mesh, dice2Mesh;
let diceRolling = false;
let diceRollAnimFrame = null;
const revealedPlayerIds = new Set();
const tokenAnimatingIds = new Set();
const tokenAnimationHandles = {};
const pendingRollTokenMoves = {};
const TOKEN_STEP_DURATION_MS = typeof getTokenStepDurationMs === 'function'
    ? getTokenStepDurationMs()
    : 150;

function markPendingRollTokenMove(playerId) {
    if (!playerId) return;
    pendingRollTokenMoves[playerId] = { cancelled: false };
}

function cancelPendingRollTokenMove(playerId) {
    if (!playerId) return;
    if (pendingRollTokenMoves[playerId]) {
        pendingRollTokenMoves[playerId].cancelled = true;
        delete pendingRollTokenMoves[playerId];
    }
    cancelTokenAnimation(playerId);
}

// Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
// 3D board layout (matches CSS 11×11 grid proportions)
const BOARD_LAYOUT = {
    tileSize: 1.0,
    gap: 0.05,
    tileHeight: 0.08,
    get step() { return this.tileSize + this.gap; },
    get tokenY() { return this.tileHeight + 0.22; }
};

// Always use premium 3D card-style tiles (slab + drawn face)
const playersListEl = document.getElementById('playersList');
const myPropertiesEl = document.getElementById('myProperties');
let chatMessagesEl = null;
let chatInputEl = null;
let sendChatBtn = null;

// 3D View Controls
const boardContainer = document.querySelector('.board-container');
const boardViewport = document.querySelector('.board-viewport');

// Three.js orbit camera (degrees / distance — shared by board + token models)
let cameraDistance = 10;
const CAMERA_DISTANCE_MIN = 6;
const CAMERA_DISTANCE_MAX = 55;
const CAMERA_DISTANCE_DEFAULT = 10;
let cameraPolarDeg = 90;
let cameraAzimuthDeg = 0;
let cameraTargetX = 0;
let cameraTargetY = 0;
let cameraTargetZ = 0;
let isRightMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Modal elements
const propertyModal = document.getElementById('propertyModal');
const buyModal = document.getElementById('buyModal');
const gameOverModal = document.getElementById('gameOverModal');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverContent = document.getElementById('gameOverContent');
let cardModal = null;
let cardTitle = null;
let cardContent = null;
let cardOkBtn = null;
const confirmTokenBtn = document.getElementById('confirmTokenBtn');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsModalClose = document.querySelector('#settingsModal .modal-close');

// Video cleanup
let currentPropertyVideo = null;
let pendingPropertyVideo = null;
let propertyMediaSession = 0;

function stopVideoElement(video) {
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    video.loop = false;
    video.autoplay = false;
    video.removeAttribute('src');
    video.querySelectorAll('source').forEach(source => source.remove());
    video.load();
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

// Token selection state
let pendingTokenSelection = null;

// Board configuration - Las Vegas Monopoly themed
const boardConfig = [
    { name: 'GO', type: 'corner', position: 0 },
    { name: 'Las Vegas Raiders', type: 'property', color: '#8B4513', price: 350, rent: [17, 85, 255, 765, 1360, 2125], position: 1, address: '3333 Al Davis Way, Las Vegas, NV 89118 (Allegiant Stadium)' },
    { name: 'Community Cards', type: 'community-chest', position: 2 },
    { name: 'Las Vegas Grand Prix', type: 'property', color: '#8B4513', price: 300, rent: [15, 75, 225, 675, 1200, 1875], position: 3, address: '7000 Las Vegas Blvd N, Las Vegas, NV 89115 (Las Vegas Motor Speedway)' },
    { name: 'Income Tax', type: 'tax', amount: 200, position: 4 },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 5, address: '2535 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Speed Vegas Off Roading', type: 'property', color: '#87CEEB', price: 250, rent: [25, 50, 150, 450, 625, 750], position: 6, address: '14200 S Las Vegas Blvd, Las Vegas, NV 89054 (SPEEDVEGAS)' },
    { name: 'Chance', type: 'chance', position: 7 },
    { name: 'Las Vegas Golden Knights', type: 'property', color: '#87CEEB', price: 275, rent: [28, 55, 165, 495, 700, 850], position: 8, address: '3780 S Las Vegas Blvd, Las Vegas, NV 89158 (T-Mobile Arena)' },
    { name: 'Maverick Helicopter Rides', type: 'property', color: '#87CEEB', price: 320, rent: [32, 65, 195, 580, 800, 950], position: 9, address: '6075 S Las Vegas Blvd, Las Vegas, NV 89119' },
    { name: 'JAIL', type: 'corner', position: 10, address: 'Jail Square' },
    { name: 'Brothel', type: 'property', color: '#FF69B4', price: 200, rent: [20, 40, 120, 360, 500, 600], position: 11, address: 'Nevada Brothel' },
    { name: 'Electric Company', type: 'utility', price: 180, position: 12 },
    { name: 'Bet MGM', type: 'property', color: '#FF69B4', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 13, address: '3799 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 14, address: '2535 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Bellagio', type: 'property', color: '#FFA500', price: 400, rent: [40, 80, 240, 720, 1000, 1200], position: 15, address: '3600 S Las Vegas Blvd, Las Vegas, NV 89115', isCasino: true, casinoGame: 'PokerFP' },
    { name: 'Las Vegas Aces', type: 'property', color: '#FFA500', price: 300, rent: [30, 60, 180, 540, 750, 900], position: 16, address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119 (Michelob ULTRA Arena)' },
    { name: 'Community Cards', type: 'community-chest', position: 17 },
    { name: 'Horseback Riding', type: 'property', color: '#FF0000', price: 260, rent: [26, 52, 156, 468, 650, 780], position: 18, address: 'Red Rock Canyon National Conservation Area, Las Vegas, NV' },
    { name: 'Resorts World Theatre', type: 'property', color: '#FF0000', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 19, address: '3000 S Las Vegas Blvd, Las Vegas, NV 89109 (Resorts World)' },
    { name: 'FREE PARKING', type: 'corner', position: 20 },
    { name: 'Hard Rock Hotel', type: 'property', color: '#FFFF00', price: 280, rent: [28, 56, 168, 504, 700, 840], position: 21, address: '3400 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'slotMachine' },
    { name: 'Chance', type: 'chance', position: 22 },
    { name: 'Wynn Las Vegas', type: 'property', color: '#FFFF00', price: 320, rent: [32, 65, 195, 580, 800, 950], position: 23, address: '3131 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'Roulette' },
    { name: 'County Fair', type: 'property', color: '#FFFF00', price: 300, rent: [30, 60, 180, 540, 750, 900], position: 24, address: '1301 W Whipple Ave, Logandale, NV 89021' },
    { name: 'Shriners Children\'s Open', type: 'property', color: '#008000', price: 320, rent: [32, 65, 195, 580, 800, 950], position: 25, address: '' },
    { name: 'Las Vegas Little White Wedding Chapel', type: 'property', color: '#008000', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 26, address: '1301 Las Vegas Blvd S, Las Vegas, NV 89104 (Little White Wedding Chapel)' },
    { name: 'Community Cards', type: 'community-chest', position: 27 },
    { name: 'Sphere', type: 'property', color: '#008000', price: 400, rent: [40, 80, 240, 720, 1000, 1200], position: 28, address: '255 Sands Ave, Las Vegas, NV 89169 (The Sphere)' },
    { name: 'Water Works', type: 'utility', price: 200, position: 29 },
    { name: 'GO TO JAIL', type: 'corner', position: 30 },
    { name: 'Caesars Palace', type: 'property', color: '#0000FF', price: 420, rent: [42, 84, 252, 756, 1050, 1260], position: 31, address: '3570 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'BlackJack' },
    { name: 'Santa Fe Hotel and Casino', type: 'property', color: '#0000FF', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 32, address: '4949 N Rancho Dr, Las Vegas, NV 89130', isCasino: true, casinoGame: 'Craps' },
    { name: 'Luxury Tax', type: 'tax', amount: 100, position: 33 },
    { name: 'Chance', type: 'chance', position: 34 },
    { name: 'House of Blues', type: 'property', color: '#0000FF', price: 300, rent: [30, 60, 180, 540, 750, 900], position: 35, address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119 (inside Mandalay Bay)' },
    { name: 'Venetian', type: 'property', color: '#4B0082', price: 400, rent: [40, 80, 240, 720, 1000, 1200], position: 36, address: '3355 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'Baccarat' },
    { name: 'The Cosmopolitan', type: 'property', color: '#4B0082', price: 350, rent: [35, 70, 210, 630, 875, 1050], position: 37, address: '3708 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'Roulette' },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 38, address: '2535 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Speed Vegas Off Roading', type: 'property', color: '#4B0082', price: 275, rent: [28, 55, 165, 495, 700, 850], position: 39, address: '14200 S Las Vegas Blvd, Las Vegas, NV 89054 (SPEEDVEGAS)' }
];

// Initialize game board
function initializeBoard() {
    if (!gameBoard) return;

    gameBoard.innerHTML = '';
    boardSpaces = [];
    
    // CSS board is now hidden, using Three.js board instead
    // Still create the DOM elements for click detection and property info
    for (let row = 0; row < 11; row++) {
        for (let col = 0; col < 11; col++) {
            let position = null;
            
            // Top row (GO to JAIL)
            if (row === 0) {
                position = col;
            }
            // Bottom row (GO TO JAIL to FREE PARKING, reverse)
            else if (row === 10) {
                position = 20 + (10 - col);
            }
            // Left column (FREE PARKING to GO, reverse)
            else if (col === 0) {
                position = 30 + (10 - row);
            }
            // Right column (JAIL to GO TO JAIL)
            else if (col === 10) {
                position = 10 + row;
            }
            // Center - leave empty
            else {
                continue;
            }
            
            const spaceData = boardConfig[position];
            if (!spaceData) continue;
            
            // Create invisible click target (disabled - using 3D raycasting instead for accuracy with camera rotation)
            // const space = document.createElement('div');
            // space.className = 'board-space';
            // space.dataset.position = position;
            // space.style.gridRow = row + 1;
            // space.style.gridColumn = col + 1;
            // space.style.visibility = 'hidden'; // Invisible, just for click detection
            // 
            // space.addEventListener('click', () => {
            //     showPropertyInfo(boardConfig[position]);
            // });
            // gameBoard.appendChild(space);
            // boardSpaces[position] = space;
        }
    }
    
    // Initialize game log in sidebar
    const gameLog = document.getElementById('gameLog');
    if (gameLog) {
        gameLog.innerHTML = '<div class="log-entry">Welcome to Metropoly!</div><div class="log-entry">Waiting for players...</div>';
    }
}

function updateThreeCamera() {
    if (!camera) return;

    const polar = (cameraPolarDeg * Math.PI) / 180;
    const azimuth = (cameraAzimuthDeg * Math.PI) / 180;

    camera.position.x = cameraTargetX + cameraDistance * Math.cos(polar) * Math.sin(azimuth);
    camera.position.y = cameraTargetY + cameraDistance * Math.sin(polar);
    camera.position.z = cameraTargetZ + cameraDistance * Math.cos(polar) * Math.cos(azimuth);
    camera.lookAt(cameraTargetX, cameraTargetY, cameraTargetZ);
}

function on3DBoardClick(event) {
    if (!renderer || !camera || !boardMeshes) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Create a plane at y=0 to detect where on the board we clicked
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (!intersectionPoint) return;

    // Convert world position to grid coordinates
    const { step } = BOARD_LAYOUT;
    const col = Math.round(intersectionPoint.x / step) + 5;
    const row = Math.round(intersectionPoint.z / step) + 5;

    // Calculate position from grid coordinates
    let position = null;
    if (row === 0) position = col;
    else if (row === 10) position = 20 + (10 - col);
    else if (col === 0) position = 30 + (10 - row);
    else if (col === 10) position = 10 + row;
    
    if (position !== undefined && position !== null && boardConfig[position]) {
        showPropertyInfo(boardConfig[position]);
    }
}

function getUnownedPurchasableSpace(position) {
    const spaceData = boardConfig[position];
    if (!spaceData) return null;
    const isPurchasable = spaceData.type === 'property' || spaceData.type === 'railroad' || spaceData.type === 'utility';
    if (!isPurchasable) return null;
    const owner = players.find(p => p && p.properties && p.properties.includes(position));
    return owner ? null : spaceData;
}

function tileHasLandingMedia(position) {
    if (typeof tileMedia === 'undefined' || !tileMedia[position]) return false;
    const media = tileMedia[position];
    return media.videos.length > 0 || media.images.length > 0;
}

function handlePlayerLanding(playerId, newPosition) {
    console.log('handlePlayerLanding called:', { playerId, newPosition, myPlayerId, isCurrentPlayer: playerId === myPlayerId });
    
    // Show buy modal for unowned properties (this will show after property modal)
    if (playerId === myPlayerId) {
        const spaceData = getUnownedPurchasableSpace(newPosition);
        if (spaceData) {
            console.log('Starting property decision for:', spaceData.name);
            startPropertyDecision(spaceData, newPosition);
        }
        // Rent payment UI is now handled by server via showRentPayment event
    }
}

function getOwnedPropertySpace(position) {
    const spaceData = boardConfig[position];
    if (!spaceData) return null;
    const isPurchasable = spaceData.type === 'property' || spaceData.type === 'railroad' || spaceData.type === 'utility';
    if (!isPurchasable) return null;
    const owner = players.find(p => p && p.properties && p.properties.includes(position) && p.id !== myPlayerId);
    return owner ? { spaceData, owner } : null;
}

function clearPropertyDecisionTimer() {
    if (propertyDecisionTimer) {
        clearInterval(propertyDecisionTimer);
        propertyDecisionTimer = null;
    }
    propertyDecisionEndsAt = null;
}

function getStoredPlayerUid() {
    return sessionStorage.getItem('metropoly_player_uid');
}

function persistPlayerIdentity(gameId, playerUid) {
    if (gameId) sessionStorage.setItem('metropoly_game_id', gameId);
    if (playerUid) sessionStorage.setItem('metropoly_player_uid', playerUid);
}

/** Match this browser tab to a row in the server players array (survives socket reconnect). */
function resolveLocalPlayer(playersList) {
    if (!playersList || !Array.isArray(playersList)) return null;
    const uid = getStoredPlayerUid();
    if (uid) {
        const byUid = playersList.find((p) => p && p.uid === uid);
        if (byUid) return byUid;
    }
    if (myPlayerId) {
        const byId = playersList.find((p) => p && p.id === myPlayerId);
        if (byId) return byId;
    }
    return playersList.find((p) => p && p.id === socket.id) || null;
}

function endTurnNow() {
    socket.emit('endTurn');
}

function canEndTurnNow() {
    if (!gameState || !myPlayerId) return false;
    if (gameState.currentPlayer !== myPlayerId) return false;
    if (!gameState.diceRolled) return false;
    if (waitingForBuyResult) return false;
    return true;
}

function dismissPropertyDecisionUI() {
    clearPropertyDecisionTimer();
    activePropertyDecision = null;
    waitingForBuyResult = false;
    if (buyModal) buyModal.classList.add('hidden');
}

let clientAutoEndTurnTimer = null;

function cancelClientAutoEndTurn() {
    if (clientAutoEndTurnTimer) {
        clearTimeout(clientAutoEndTurnTimer);
        clientAutoEndTurnTimer = null;
    }
}

// Backup: end turn after roll when property/buy UI is not active
function scheduleClientAutoEndTurn(playerId, oldPosition, newPosition) {
    // Testing-mode behavior: previously we auto-ended turns client-side.
    // For full gameplay (trading/building/etc.), turns should only end when the
    // player explicitly clicks "End Turn" (or the server advances the turn).
    return;
    if (playerId !== myPlayerId) return;
    cancelClientAutoEndTurn();

    const moveSteps = getMoveStepCount(oldPosition, newPosition);
    const delay = getDiceRollDurationMs() + 50 + moveSteps * TOKEN_STEP_DURATION_MS + 50;

    clientAutoEndTurnTimer = setTimeout(() => {
        clientAutoEndTurnTimer = null;
        if (!gameState || gameState.currentPlayer !== myPlayerId) return;
        if (!gameState.diceRolled) return;
        if (activePropertyDecision || waitingForBuyResult) return;
        endTurnNow();
    }, delay);
}

function updateBuyModalContent() {
    if (!activePropertyDecision) return;
    const buyContent = document.getElementById('buyContent');
    const confirmBuyBtn = document.getElementById('confirmBuyBtn');
    const cancelBuyBtn = document.getElementById('cancelBuyBtn');
    if (!buyContent) return;

    const isRentDecision = activePropertyDecision.isRent;
    const canAfford = currentPlayer && currentPlayer.money >= activePropertyDecision.spaceData.price;
    const isCasino = activePropertyDecision.spaceData.isCasino;

    let html = `<p><strong>${activePropertyDecision.spaceData.name}</strong></p>`;
    
    if (isRentDecision) {
        const owner = activePropertyDecision.owner;
        const rent = calculateRentAmount(activePropertyDecision.spaceData, owner);
        html += `<p>Owned by: <strong>${owner.name}</strong></p>`;
        html += `<p>Rent due: <strong>$${rent}</strong></p>`;
        html += `<p>You must pay rent to continue.</p>`;
        
        // Update button text for rent
        if (confirmBuyBtn) {
            confirmBuyBtn.textContent = 'Pay Rent';
            confirmBuyBtn.onclick = () => {
                if (currentPlayer && currentPlayer.money >= rent) {
                    socket.emit('payRent', { position: activePropertyDecision.position, amount: rent });
                    closeBuyModal();
                    endTurnNow();
                } else {
                    alert('Not enough money to pay rent!');
                }
            };
        }
    } else {
        html += `<p>Price: <strong>$${activePropertyDecision.spaceData.price}</strong></p>`;
        html += `<p>Rent: <strong>$${activePropertyDecision.spaceData.rent ? activePropertyDecision.spaceData.rent[0] : 0}</strong></p>`;
        html += `<p>${canAfford ? 'Buy this property or click End Turn when you are done.' : 'Not enough money to buy. Click End Turn.'}</p>`;
        
        // Reset button text for buy
        if (confirmBuyBtn) {
            confirmBuyBtn.textContent = 'Buy Property';
            confirmBuyBtn.onclick = () => {
                if (canAfford) {
                    waitingForBuyResult = true;
                    socket.emit('buyProperty', { position: activePropertyDecision.position });
                    if (!isCasino) {
                        setTimeout(() => {
                            if (gameState && gameState.currentPlayer === myPlayerId) {
                                endTurnNow();
                            }
                        }, 500);
                    }
                }
            };
        }
    }
    
    buyContent.innerHTML = html;
}

function startPropertyDecision(spaceData, position) {
    if (!spaceData || !buyModal || !currentPlayer) return;
    cancelClientAutoEndTurn();
    clearPropertyDecisionTimer();
    waitingForBuyResult = false;
    activePropertyDecision = { spaceData, position, isRent: false };
    
    // Auto-open casino if this is a casino property
    if (spaceData.isCasino) {
        openCasinoGame(spaceData.casinoGame);
    } else {
        updateBuyModalContent();
        buyModal.classList.remove('hidden');
    }
    
    updateUI();
}

function startRentDecision(ownedData, position) {
    if (!ownedData || !buyModal || !currentPlayer) return;
    cancelClientAutoEndTurn();
    clearPropertyDecisionTimer();
    waitingForBuyResult = false;
    activePropertyDecision = { spaceData: ownedData.spaceData, position, owner: ownedData.owner, isRent: true };
    updateBuyModalContent();
    
    buyModal.classList.remove('hidden');
    updateUI();
}

function calculateRentAmount(spaceData, owner) {
    if (!spaceData || !spaceData.rent) return 0;
    
    // Calculate rent based on property type and buildings
    let rent = spaceData.rent[0] || 0;
    
    // Check for houses/hotels
    if (owner.houses && owner.houses[spaceData.position]) {
        const houseCount = owner.houses[spaceData.position];
        if (houseCount === 5) {
            rent = spaceData.rent[5] || rent; // Hotel
        } else {
            rent = spaceData.rent[houseCount] || rent; // Houses
        }
    }
    
    // Check for monopoly bonus (all properties in color group owned)
    const colorGroup = boardConfig.filter(p => p && p.color === spaceData.color);
    const ownsAllInGroup = colorGroup.every(p => owner.properties.includes(p.position));
    if (ownsAllInGroup && (!owner.houses || !owner.houses[spaceData.position] || owner.houses[spaceData.position] === 0)) {
        rent = rent * 2; // Double rent for monopoly with no buildings
    }
    
    return rent;
}

// Open casino game modal
function openCasinoGame(gameName) {
    const casinoModal = document.getElementById('casinoGameModal');
    const casinoTitle = document.getElementById('casinoGameTitle');
    const casinoContainer = document.getElementById('casinoGameContainer');

    if (!casinoModal || !casinoContainer) return;

    casinoTitle.textContent = `Play ${gameName}`;

    // Load casino game in iframe
    const gamePath = `/${gameName}/index.html`;
    casinoContainer.innerHTML = `<iframe src="${gamePath}" class="casino-iframe" frameborder="0"></iframe>`;

    casinoModal.classList.remove('hidden');

    // Hide buy modal
    if (buyModal) {
        buyModal.classList.add('hidden');
    }

    // Listen for messages from the casino game iframe (only add listener once)
    if (!casinoMessageListenerAttached) {
        window.addEventListener('message', handleCasinoGameMessage);
        casinoMessageListenerAttached = true;
    }
}

// Handle messages from casino game iframe
function handleCasinoGameMessage(event) {
    if (event.data && event.data.type === 'casinoWinnings') {
        const winnings = event.data.amount || 0;
        if (winnings !== 0 && socket) {
            socket.emit('casinoWinnings', { amount: winnings });
        }
        
        // Auto-close casino game after one hand
        setTimeout(() => {
            closeCasinoGame();
        }, 500);
    }
}

// Close casino game modal
function closeCasinoGame() {
    const casinoModal = document.getElementById('casinoGameModal');
    const casinoContainer = document.getElementById('casinoGameContainer');
    
    if (casinoModal) {
        casinoModal.classList.add('hidden');
    }
    
    if (casinoContainer) {
        casinoContainer.innerHTML = '';
    }
    
    // Remove message listener
    window.removeEventListener('message', handleCasinoGameMessage);
    casinoMessageListenerAttached = false;
    
    // Show buy modal after casino game ends for property purchase
    // Only if it's still the current player's turn and the property decision is still active
    if (activePropertyDecision && 
        activePropertyDecision.spaceData.isCasino && 
        gameState && 
        gameState.currentPlayer === myPlayerId) {
        updateBuyModalContent();
        buyModal.classList.remove('hidden');
    } else {
        // Clean up stale property decision state
        if (activePropertyDecision) {
            dismissPropertyDecisionUI();
        }
    }
}

function lerpCoords(from, to, t) {
    return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        z: from.z + (to.z - from.z) * t
    };
}

function easeOutQuad(t) {
    return t * (2 - t);
}

// Smooth tile-by-tile movement (all clients)
function animateTokenMove(playerId, oldPosition, newPosition, onComplete, direction = 'forward') {
    const player = players.find(p => p && p.id === playerId);
    if (!player) {
        if (onComplete) onComplete();
        return;
    }

    const runAnimation = () => {
        const model = tokenModels[playerId];
        if (!model) {
            player.position = newPosition;
            update3DTokenPositions();
            if (onComplete) onComplete();
            return;
        }

        cancelTokenAnimation(playerId);

        const steps = [];
        let currentPos = oldPosition;
        while (currentPos !== newPosition) {
            if (direction === 'backward') {
                currentPos = (currentPos - 1 + 40) % 40;
            } else {
                currentPos = (currentPos + 1) % 40;
            }
            steps.push(currentPos);
        }

        tokenAnimatingIds.add(playerId);
        revealPlayerToken(playerId);
        model.visible = true;

        // Switch to walk animation if available
        setTokenAnimation(playerId, 'walk');

        if (steps.length === 0) {
            player.position = newPosition;
            tokenAnimatingIds.delete(playerId);
            update3DTokenPositions();
            // Switch back to idle animation
            setTokenAnimation(playerId, 'idle');
            if (onComplete) onComplete();
            return;
        }

        player.position = oldPosition;
        const handle = { cancelled: false };
        tokenAnimationHandles[playerId] = handle;

        let fromPos = oldPosition;
        let stepIndex = 0;

        const animateNextStep = () => {
            if (handle.cancelled) {
                tokenAnimatingIds.delete(playerId);
                delete tokenAnimationHandles[playerId];
                return;
            }

            if (stepIndex >= steps.length) {
                player.position = newPosition;
                tokenAnimatingIds.delete(playerId);
                delete tokenAnimationHandles[playerId];
                update3DTokenPositions();
                // Switch back to idle animation
                setTokenAnimation(playerId, 'idle');
                if (onComplete) onComplete();
                return;
            }

            const targetPos = steps[stepIndex];
            const fromCoords = get3DBoardCoords(fromPos);
            const toCoords = get3DBoardCoords(targetPos);
            const startRotY = model.rotation.y;
            const endRotY = getTokenFacingRotationBetween(fromPos, targetPos, getTokenYawOffset(player));
            const startTime = performance.now();

            const tick = (now) => {
                if (handle.cancelled) {
                    tokenAnimatingIds.delete(playerId);
                    delete tokenAnimationHandles[playerId];
                    return;
                }

                const elapsed = now - startTime;
                const rawT = Math.min(1, elapsed / TOKEN_STEP_DURATION_MS);
                const t = easeOutQuad(rawT);
                const coords = lerpCoords(fromCoords, toCoords, t);
                model.position.set(coords.x, coords.y, coords.z);
                model.rotation.y = lerpAngleY(startRotY, endRotY, t);

                if (rawT < 1) {
                    requestAnimationFrame(tick);
                    return;
                }

                player.position = targetPos;
                fromPos = targetPos;
                stepIndex++;
                animateNextStep();
            };

            requestAnimationFrame(tick);
        };

        const startCoords = get3DBoardCoords(oldPosition);
        model.position.set(startCoords.x, startCoords.y, startCoords.z);
        animateNextStep();
    };

    if (tokenModels[playerId]) {
        runAnimation();
        return;
    }

    if (player.tokenIndex !== undefined) {
        loadTokenModel(player.tokenIndex, player);
    }

    let attempts = 0;
    const waitForModel = () => {
        if (tokenModels[playerId]) {
            runAnimation();
            return;
        }
        if (attempts++ < 80) {
            setTimeout(waitForModel, 10);
            return;
        }
        player.position = newPosition;
        update3DTokenPositions();
        if (onComplete) onComplete();
    };
    waitForModel();
}

// Get tile coordinates for smooth positioning - follows actual board layout
function getTileCoordinates(position) {
    let x, y;
    
    // Account for board container padding (20px) and centering
    const padding = 20;
    const boardOffset = padding;
    
    if (position >= 0 && position <= 10) {
        // Top row: GO (0) to JAIL (10) - left to right
        x = boardOffset + position * 105 + 50; // 100px + 5px gap, center of tile
        y = boardOffset + 50; // Top row position
    } else if (position >= 11 && position <= 20) {
        // Right column: JAIL+1 (11) to FREE PARKING (20) - top to bottom
        x = boardOffset + 1050; // Right column position
        y = boardOffset + (position - 10) * 105 + 50; // Top to bottom
    } else if (position >= 21 && position <= 30) {
        // Bottom row: FREE PARKING+1 (21) to GO TO JAIL (30) - right to left
        x = boardOffset + (40 - position) * 105 + 50; // Reverse: right to left
        y = boardOffset + 1050; // Bottom row position
    } else if (position >= 31 && position <= 39) {
        // Left column: GO TO JAIL+1 (31) to GO (39) - bottom to top
        x = boardOffset + 50; // Left column position
        y = boardOffset + (40 - position) * 105 + 50; // Reverse: bottom to top
    } else {
        // Default to GO for any invalid position
        x = boardOffset + 50;
        y = boardOffset + 50;
    }
    
    return { x, y };
}

// Load 3D token model
function loadWalkModel(tokenInfo, player, idleModel) {
    const loader = new THREE.FBXLoader();
    loader.load(tokenInfo.walkModel,
        function(fbx) {
            console.log(`Walk model loaded for ${player.name}`);
            idleModel.walkModel = fbx;
            idleModel.walkAnimations = fbx.animations;
        },
        function(xhr) {
            if (xhr.lengthComputable) {
                const percentComplete = xhr.loaded / xhr.total * 100;
                console.log(`Loading walk model: ${percentComplete.toFixed(2)}%`);
            }
        },
        function(error) {
            console.error(`Error loading walk model for ${player.name}:`, error);
        }
    );
}

function setTokenAnimation(playerId, animType) {
    const model = tokenModels[playerId];
    if (!model || !model.mixer || !model.animations) return;
    
    if (model.currentAnim === animType) return;
    
    // Stop current animation
    model.mixer.stopAllAction();
    
    let animations = model.animations;
    
    // If switching to walk and we have a walk model with its own animations
    if (animType === 'walk' && model.walkAnimations) {
        animations = model.walkAnimations;
    }
    
    if (animations.length > 0) {
        const action = model.mixer.clipAction(animations[0]);
        action.play();
        model.currentAnim = animType;
    }
}

function loadTokenModel(tokenIndex, player) {
    const tokenInfo = tokenData[tokenIndex];
    if (!tokenInfo || !tokenInfo.model) {
        console.log(`No model found for token ${tokenIndex} - ${player.name}`);
        return;
    }

    // Check if already loading or loaded
    if (tokenLoading[player.id] || tokenModels[player.id]) {
        console.log(`Model already loading or loaded for ${player.name}, skipping`);
        return;
    }

    tokenLoading[player.id] = true;
    console.log(`Loading 3D model for ${player.name} from: ${tokenInfo.model}`);

    // Check file extension to determine loader
    const isFBX = tokenInfo.model.toLowerCase().endsWith('.fbx');

    if (isFBX) {
        // Use FBX loader for FBX files
        const loader = new THREE.FBXLoader();
        loader.load(tokenInfo.model,
            function(fbx) {
                console.log(`FBX model loaded for ${player.name}:`, fbx);

                const model = fbx;
                const scale = tokenInfo.scale || 0.08;
                model.scale.set(scale, scale, scale);

                // Store model reference
                tokenModels[player.id] = model;
                tokenMeshes[player.id] = model;
                delete tokenLoading[player.id];

                if (scene) {
                    scene.add(model);
                    model.visible = isTokenVisible(player.id);
                    applyTokenFacing(model, player.position || 0, 'forward', player);
                    console.log(`3D Token loaded and added to scene for ${player.name}`);

                    update3DTokenPositions();
                    updateTokenVisibility();
                }

                // Check if model has animations
                if (fbx.animations && fbx.animations.length > 0) {
                    console.log(`FBX model has ${fbx.animations.length} animations`);
                    // Set up animation mixer
                    const mixer = new THREE.AnimationMixer(model);
                    model.mixer = mixer;
                    model.animations = fbx.animations;
                    model.currentAnim = 'idle';
                    
                    // Play all animations with faster speed
                    fbx.animations.forEach((anim) => {
                        const action = mixer.clipAction(anim);
                        action.timeScale = 3.0; // Spin 3x faster
                        action.play();
                    });
                    
                    // If this token has a walk model (White Girl), load it too
                    if (tokenInfo.walkModel) {
                        loadWalkModel(tokenInfo, player, model);
                    }
                }
            },
            function(error) {
                console.error(`Error loading FBX model for ${player.name}:`, error);
                console.error(`Model path: ${tokenInfo.model}`);
                delete tokenLoading[player.id];
                // Create a fallback simple geometry if model fails to load
                const fallbackGeometry = new THREE.BoxGeometry(1, 1, 1);
                const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const fallbackModel = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
                fallbackModel.scale.set(0.4, 0.4, 0.4);
                tokenModels[player.id] = fallbackModel;
                tokenMeshes[player.id] = fallbackModel;
                scene.add(fallbackModel);
                fallbackModel.visible = isTokenVisible(player.id);
                console.log(`Created fallback token for ${player.name}`);
                update3DTokenPositions();
                updateTokenVisibility();
            }
        );
    } else {
        // Use GLTF loader for GLB/GLTF files
        const loader = new THREE.GLTFLoader();
        loader.load(tokenInfo.model,
            function(gltf) {
                const model = gltf.scene;
                const scale = tokenInfo.scale || 0.2;
                model.scale.set(scale, scale, scale);

                // Store model reference
                tokenModels[player.id] = model;
                tokenMeshes[player.id] = model;
                delete tokenLoading[player.id];

                if (scene) {
                    scene.add(model);
                    model.visible = isTokenVisible(player.id);
                    applyTokenFacing(model, player.position || 0, 'forward', player);
                    update3DTokenPositions();
                    updateTokenVisibility();
                }

                if (gltf.animations && gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(model);
                    model.mixer = mixer;
                    model.animations = gltf.animations;
                    model.currentAnim = 'idle';

                    // Play all animations with faster speed
                    gltf.animations.forEach((anim) => {
                        const action = mixer.clipAction(anim);
                        action.timeScale = 3.0; // Spin 3x faster
                        action.play();
                    });
                }
            },
            function(xhr) {
                if (xhr.lengthComputable) {
                    const percentComplete = xhr.loaded / xhr.total * 100;
                    console.log(`Loading ${tokenInfo.model}: ${percentComplete.toFixed(2)}%`);
                }
            },
            function(error) {
                console.error(`Error loading GLTF model for ${player.name}:`, error);
                delete tokenLoading[player.id];
                // Create a fallback simple geometry if model fails to load
                const fallbackGeometry = new THREE.BoxGeometry(1, 1, 1);
                const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const fallbackModel = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
                fallbackModel.scale.set(0.4, 0.4, 0.4);
                tokenModels[player.id] = fallbackModel;
                tokenMeshes[player.id] = fallbackModel;
                scene.add(fallbackModel);
                fallbackModel.visible = isTokenVisible(player.id);
                update3DTokenPositions();
                updateTokenVisibility();
            }
        );
    }
}

// Update tokens on the board
function updateTokens() {
    tokensLayer.innerHTML = '';

    // Group players by position to handle multiple tokens on same space
    const playersByPosition = {};
    players.filter(p => p).forEach(player => {
        // Ensure all players start at GO (position 0) if not set
        if (player.position === undefined || player.position === null) {
            player.position = 0;
        }

        // Only load tokens for players who have selected (human players or AI after assignment)
        if (player.tokenIndex !== undefined) {
            if (!playersByPosition[player.position]) {
                playersByPosition[player.position] = [];
            }
            playersByPosition[player.position].push(player);
        }
    });
    
    // Position tokens for each group
    Object.keys(playersByPosition).forEach(position => {
        const playersAtPosition = playersByPosition[position];
        const pos = parseInt(position);

        // Use direct coordinate calculation instead of boardSpaces
        const coords = getTileCoordinates(pos);

        playersAtPosition.forEach((player) => {
            if (isTokenVisible(player.id) && !tokenModels[player.id]) {
                loadTokenModel(player.tokenIndex, player);
            }
        });
    });

    // Update 3D token positions after loading models
    setTimeout(() => {
        update3DTokenPositions();
    }, 10);
}

// Cache for loaded media to prevent re-loading
const mediaCache = {};

function closePropertyModal() {
    cleanupPropertyVideo();
    if (propertyModal) {
        propertyModal.classList.add('hidden');
    }
}

// Show property information
function showPropertyInfo(spaceData) {
    console.log('showPropertyInfo called for:', spaceData.name, 'position:', spaceData.position);
    cleanupPropertyVideo();
    const mediaSession = propertyMediaSession;

    const modal = propertyModal;
    const title = document.getElementById('propertyTitle');
    const content = document.getElementById('propertyContent');
    const mediaContainer = document.getElementById('propertyMedia') || document.getElementById('property-media');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    console.log('Modal elements:', { modal: !!modal, title: !!title, content: !!content, mediaContainer: !!mediaContainer });
    
    if (!modal || !title || !content || !mediaContainer) {
        console.error('Modal elements not found!');
        return;
    }
    
    title.textContent = spaceData.name;
    
    // Clear previous media
    mediaContainer.innerHTML = '';
    
    // Load media from tileMedia if available
    if (tileMedia && tileMedia[spaceData.position]) {
        const media = tileMedia[spaceData.position];
        const cacheKey = `${spaceData.position}_${media.name}`;
        
        // Check cache first
        if (mediaCache[cacheKey]) {
            const cloned = mediaCache[cacheKey].cloneNode(true);
            mediaContainer.appendChild(cloned);
            if (mediaCache[cacheKey].tagName === 'VIDEO') {
                const video = mediaContainer.querySelector('video');
                currentPropertyVideo = video;
                video.muted = true; // ensure muted when restoring from cache
                video.loop = false; // Ensure no looping
                video.currentTime = 0; // Reset video to start
                video.play().catch(e => console.log('Autoplay failed:', e));
            }
        } else {
            // Prefer video if available
            if (media.videos && media.videos.length > 0) {
                const randomVideo = media.videos[Math.floor(Math.random() * media.videos.length)];
                const video = document.createElement('video');
                // Don't encode - browser handles spaces in URLs automatically
                video.src = randomVideo;
                video.autoplay = true;
                video.muted = true; // Muted for autoplay to work
                video.loop = false; // Do not loop - play once then stop
                video.playsInline = true;
                video.controls = true;
                video.style.width = '100%';
                video.style.maxHeight = '250px';
                video.style.objectFit = 'cover';
                video.style.borderRadius = '8px';
                video.preload = 'auto';
                pendingPropertyVideo = video;
                
                video.addEventListener('loadeddata', () => {
                    if (mediaSession !== propertyMediaSession) {
                        stopVideoElement(video);
                        return;
                    }
                    pendingPropertyVideo = null;
                    mediaContainer.appendChild(video);
                    mediaCache[cacheKey] = video.cloneNode(true);
                    currentPropertyVideo = video;
                    video.play().catch(e => console.log('Autoplay failed:', e));
                });
                
                video.addEventListener('error', (e) => {
                    if (mediaSession !== propertyMediaSession) return;
                    pendingPropertyVideo = null;
                    console.log('Video load error:', e);
                    console.log('Failed video src:', randomVideo);
                    mediaContainer.innerHTML = '';
                    if (loadingIndicator) loadingIndicator.textContent = 'Media unavailable';
                });
            } else if (media.images && media.images.length > 0) {
                const randomImage = media.images[Math.floor(Math.random() * media.images.length)];
                const img = document.createElement('img');
                img.src = randomImage;
                img.alt = media.name;
                img.style.width = '100%';
                img.style.maxHeight = '250px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.loading = 'lazy';
                
                img.addEventListener('load', () => {
                    mediaContainer.innerHTML = '';
                    mediaContainer.appendChild(img);
                    mediaCache[cacheKey] = img.cloneNode(true);
                });
                
                img.addEventListener('error', () => {
                    mediaContainer.innerHTML = '';
                    if (loadingIndicator) loadingIndicator.textContent = 'Image unavailable';
                });
            } else {
                mediaContainer.innerHTML = '';
            }
        }
    } else {
        mediaContainer.innerHTML = '';
    }
    
    let html = `<p><strong>Position:</strong> ${spaceData.position}</p>`;
    html += `<p><strong>Type:</strong> ${spaceData.type}</p>`;
    
    if (spaceData.address) {
        html += `<p><strong>Address:</strong> ${spaceData.address}</p>`;
    }
    
    if (spaceData.type === 'property' || spaceData.type === 'railroad' || spaceData.type === 'utility') {
        html += `<p><strong>Price:</strong> $${spaceData.price}</p>`;

        if (spaceData.rent) {
            html += `<p><strong>Rent:</strong> $${spaceData.rent[0]}</p>`;
        }

        if (spaceData.position !== undefined && spaceData.position !== null) {
            const owner = players.find(p => p && p.properties && p.properties.includes(spaceData.position));
            if (owner) {
                html += `<p><strong>Owner:</strong> ${owner.name}</p>`;
            } else {
                html += `<p><strong>Status:</strong> Available</p>`;
            }
        }
    } else if (spaceData.type === 'tax') {
        html += `<p><strong>Tax Amount:</strong> $${spaceData.amount}</p>`;
    }
    
    content.innerHTML = html;
    
    console.log('Removing hidden class from modal');
    modal.classList.remove('hidden');
}

// Cleanup property video when modal closes
function cleanupPropertyVideo() {
    propertyMediaSession += 1;

    stopVideoElement(pendingPropertyVideo);
    pendingPropertyVideo = null;

    stopVideoElement(currentPropertyVideo);
    currentPropertyVideo = null;

    // Stop all videos in the media container
    const mediaContainer = document.getElementById('propertyMedia') || document.getElementById('property-media');
    if (mediaContainer) {
        mediaContainer.querySelectorAll('video').forEach(stopVideoElement);
        mediaContainer.innerHTML = '';
    }

    if (propertyModal) {
        propertyModal.querySelectorAll('video').forEach(stopVideoElement);
    }
}

// Update players list
function updatePlayersList() {
    if (!playersListEl) return;
    
    console.log('updatePlayersList - players array:', players);
    console.log('updatePlayersList - players.length:', players.length);
    
    playersListEl.innerHTML = '';
    
    // Filter out null players (index 0 dummy) to get 1-based indexing
    const actualPlayers = players.filter(p => p !== null);
    
    if (actualPlayers.length === 0) {
        playersListEl.innerHTML = '<div class="no-players">No players connected</div>';
        return;
    }
    
    actualPlayers.forEach((player, index) => {
        const playerNumber = index + 1; // Convert to 1-based
        console.log(`updatePlayersList - processing player ${playerNumber}:`, player);
        console.log(`  - Player ID: ${player.id}`);
        console.log(`  - Player Name: ${player.name}`);
        console.log(`  - My Player ID: ${myPlayerId}`);
        console.log(`  - Socket ID: ${socket.id}`);
        console.log(`  - Is Current Player: ${player.id === myPlayerId || player.id === socket.id}`);
        
        const playerEl = document.createElement('div');
        const isCurrentPlayer = player.id === myPlayerId || player.id === socket.id;
        const isActiveTurn = gameState && gameState.currentPlayer === player.id;
        playerEl.className = `player-card${isActiveTurn ? ' is-active' : ''}${player.isBankrupt ? ' is-bankrupt' : ''}`;

        const displayName = isCurrentPlayer ? 'You' : (player.name || 'Unknown Player');
        const aiBadge = player.isAI ? '<span class="player-card-badge ai">AI</span>' : '';
        const turnBadge = isActiveTurn ? '<span class="player-card-badge turn">Turn</span>' : '';
        const jailBadge = player.inJail ? '<span class="player-card-badge jail">Jail</span>' : (player.position === 10 ? '<span class="player-card-badge visiting">Visiting</span>' : '');

        let avatarHtml = '<div class="player-card-avatar player-card-avatar--empty">?</div>';
        if (player.tokenIndex !== undefined && tokenData[player.tokenIndex]) {
            const tokenInfo = tokenData[player.tokenIndex];
            avatarHtml = `<div class="player-card-avatar"><img src="${tokenInfo.image}" alt="${tokenInfo.name}"></div>`;
        }

        playerEl.innerHTML = `
            ${avatarHtml}
            <div class="player-card-main">
                <div class="player-card-top">
                    <span class="player-card-name">${displayName}</span>
                    <div class="player-card-badges">${turnBadge}${aiBadge}${jailBadge}</div>
                </div>
                <div class="player-card-money">$${(player.money ?? 2500).toLocaleString()}</div>
            </div>
        `;

        playersListEl.appendChild(playerEl);
    });
}

// Update my properties
function updateMyProperties() {
    if (!currentPlayer) return;
    
    myPropertiesEl.innerHTML = '';
    
    if (currentPlayer.properties && currentPlayer.properties.length > 0) {
        currentPlayer.properties.forEach(propPosition => {
            const spaceData = boardConfig[propPosition];
            if (spaceData) {
                const propDiv = document.createElement('div');
                propDiv.className = 'property-item';
                propDiv.innerHTML = `
                    <div class="property-name">${spaceData.name}</div>
                    <div class="property-rent">Rent: $${spaceData.rent ? spaceData.rent[0] : 0}</div>
                `;
                propDiv.addEventListener('click', () => showPropertyInfo(spaceData));
                myPropertiesEl.appendChild(propDiv);
            }
        });
    } else {
        myPropertiesEl.innerHTML = '<p style="color: #888; font-size: 0.9rem;">No properties yet</p>';
    }
}

// Add game log entry
function addLogEntry(message, type = 'system') {
    const gameLog = document.getElementById('gameLog');
    if (!gameLog) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    gameLog.appendChild(logEntry);
    
    // Auto-scroll to bottom and limit entries
    gameLog.scrollTop = gameLog.scrollHeight;
    
    // Keep only last 50 entries
    const entries = gameLog.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[0].remove();
    }
}

// Add chat message
function addChatMessage(sender, message) {
    console.log('addChatMessage called:', { sender, message, chatMessagesEl });
    if (!chatMessagesEl) {
        console.warn('chatMessagesEl not found, skipping chat message');
        return;
    }
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMessagesEl.appendChild(messageEl);

    // Auto-scroll to bottom
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    console.log('Message added to chat, total messages:', chatMessagesEl.children.length);
}

// Update UI elements
function updateUI(options = {}) {
    if (currentPlayer) {
        playerMoneyEl.textContent = `$${currentPlayer.money || 2500}`;
        playerNameEl.textContent = currentPlayer.name;
        localStorage.setItem('playerName', currentPlayer.name);
    } else {
        // Set defaults when currentPlayer is not available
        playerMoneyEl.textContent = '$2500';
        playerNameEl.textContent = 'Player';
    }
    
    updatePlayersList();
    updateMyProperties();

    // Update game status
    const gameCodeEl = document.getElementById('gameCode');

    if (gameState && gameState.currentPlayer) {
        // Check if all human players have selected tokens (AI tokens assigned after humans)
        const humanPlayers = players.filter(p => p && !p.isAI);
        const allHumanPlayersSelectedTokens = humanPlayers.every(p => p.tokenIndex !== undefined);

        if (!allHumanPlayersSelectedTokens) {
            gameCodeEl.textContent = 'Waiting for Token Selection...';
        } else {
            gameCodeEl.textContent = 'Game Active!';
        }
    } else if (gameState && gameState.status === 'playing') {
        const humanPlayers = players.filter(p => p && !p.isAI);
        const allHumanPlayersSelectedTokens = humanPlayers.every(p => p.tokenIndex !== undefined);

        if (!allHumanPlayersSelectedTokens) {
            gameCodeEl.textContent = 'Waiting for Token Selection...';
        } else {
            gameCodeEl.textContent = 'Game Active!';
        }
    } else {
        const actualPlayerCount = players.filter(p => p).length;
        const hasAIPlayers = players.some(p => p && p.isAI);
        const humanPlayers = players.filter(p => p && !p.isAI);
        const allHumanTokensSelected = humanPlayers.every(p => p.tokenIndex !== undefined);

        if ((actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) && allHumanTokensSelected) {
            gameCodeEl.textContent = 'Ready to Start!';
        } else if (actualPlayerCount >= 2 || (actualPlayerCount >= 1 && hasAIPlayers)) {
            gameCodeEl.textContent = 'Select Your Token';
        } else {
            gameCodeEl.textContent = 'Waiting for Players...';
        }
    }

    if (gameState) {
        const currentPlayerObj = players.find(p => p && p.id === gameState.currentPlayer);
        if (currentPlayerObj && lastTurnAnnouncementPlayerId !== currentPlayerObj.id) {
            addLogEntry(`${currentPlayerObj.name}'s turn`, 'system');
            lastTurnAnnouncementPlayerId = currentPlayerObj.id;
        }

        // Check if all human players have selected tokens (AI tokens assigned after humans)
        const humanPlayers = players.filter(p => p && !p.isAI);
        const allHumanPlayersSelectedTokens = humanPlayers.every(p => p.tokenIndex !== undefined);

        const isPlaying = gameState.status === 'playing' || !!gameState.currentPlayer;
        canRollDice = Boolean(
            isPlaying &&
            myPlayerId &&
            gameState.currentPlayer &&
            myPlayerId === gameState.currentPlayer &&
            !gameState.diceRolled &&
            allHumanPlayersSelectedTokens // Can only roll if all human players have selected tokens
        );

        const rollDiceBtn = document.getElementById('rollDiceBtn');
        if (rollDiceBtn) {
            rollDiceBtn.disabled = !canRollDice;
        }

        const endTurnBtn = document.getElementById('endTurnBtn');
        if (endTurnBtn) {
            endTurnBtn.disabled = !canEndTurnNow();
        }
    } else {
        canRollDice = false;
        const rollDiceBtn = document.getElementById('rollDiceBtn');
        if (rollDiceBtn) {
            rollDiceBtn.disabled = true;
        }

        const endTurnBtn = document.getElementById('endTurnBtn');
        if (endTurnBtn) {
            endTurnBtn.disabled = true;
        }
    }

    if (!options.skipTokenLayer) {
        updateTokens();
    }
    
    // Handle jail button visibility
    const myPlayerData = players.find(p => p && p.id === myPlayerId);
    const payJailBtn = document.getElementById('payJailBtn');
    if (payJailBtn && myPlayerData) {
        if (myPlayerData.inJail && gameState.currentPlayer === myPlayerId) {
            payJailBtn.style.display = 'block';
            payJailBtn.disabled = myPlayerData.money < 50;
        } else {
            payJailBtn.style.display = 'none';
        }
    }
}

// ========== DICE ROLL SEQUENCE HANDLERS ==========
// REFACTORED FLOW ARCHITECTURE
// ================================
// The complete dice roll → token movement → property decision sequence is now managed
// through a clean, single-responsibility flow:
//
// PHASES (tracked by DiceRollSequenceManager):
//   DICE_ROLLING    - Dice animation is playing, roll hasn't landed yet
//   TOKEN_MOVING    - Token is animating from old position to new position
//   UI_OPENING      - Property decision UI is opening or sequence is preparing to complete
//   COMPLETE        - Sequence finished, cleanup done
//
// FLOW FOR NON-DOUBLES ROLLS:
//   socket.on('diceRolled')
//     → handleDiceRolledEvent()         [orchestrator]
//       → roll3DDice() onLand callback  [dice animation complete]
//         → animateTokenMove()          [token animation]
//           → onTokenAnimationComplete() callback
//             → onDiceRollSequenceComplete() [consolidated completion handler]
//               → startPropertyDecision()   [opens buy modal if applicable]
//               → updateUI() once          [single update call]
//               → scheduleClientAutoEndTurn()
//
// FLOW FOR DOUBLES ROLLS:
//   socket.on('diceRolled')
//     → handleDiceRolledEvent()         [orchestrator]
//       → roll3DDice() onLand callback
//         → animateTokenMove()
//           → onTokenAnimationComplete() callback
//             → skip onDiceRollSequenceComplete() (doubles detected)
//             → updateUI() once
//             [turn continues for next roll]
//
// KEY IMPROVEMENTS:
//   ✓ Single orchestration point (handleDiceRolledEvent)
//   ✓ Clear phase tracking for debugging/logging
//   ✓ Consolidated updateUI() calls (1-2 per sequence instead of 3+)
//   ✓ Proper cancellation on turn change via DiceRollSequenceManager
//   ✓ No nested callback hell - flat async flow
//   ✓ Handles multiple concurrent sequences (AI players rolling in sequence)
//   ✓ Property decision UI only opens for current player

// Consolidated callback that triggers after token animation completes
function onDiceRollSequenceComplete(playerId, newPosition, diceData) {
    DiceRollSequenceManager.markUIOpening(playerId);
    
    // Only trigger property decision UI for the current player (not observers)
    if (playerId === myPlayerId) {
        const spaceData = getUnownedPurchasableSpace(newPosition);
        if (spaceData) {
            console.log('[DiceRoll] Opening property decision for:', spaceData.name);
            startPropertyDecision(spaceData, newPosition);
            // startPropertyDecision calls updateUI(), so we don't call it again
            DiceRollSequenceManager.completeSequence(playerId);
            return;
        }
    }
    
    // Mark sequence as complete and update UI (only if property decision didn't already)
    DiceRollSequenceManager.completeSequence(playerId);
    updateUI();
}

// Main handler for diceRolled event - orchestrates the entire sequence
function handleDiceRolledEvent(data) {
    const playerId = data.playerId;
    const newPosition = data.newPosition;
    const message = data.message || 'Dice rolled';
    const serverDice1 = data.dice1 ?? (data.roll && data.roll.dice1);
    const serverDice2 = data.dice2 ?? (data.roll && data.roll.dice2);
    const rollTotal = (data.roll && data.roll.total) || ((serverDice1 || 1) + (serverDice2 || 1));

    // Start tracking this sequence
    DiceRollSequenceManager.startSequence(playerId);

    const existingPlayer = players.find(p => p && p.id === playerId);
    const oldPosition = data.oldPosition !== undefined
        ? data.oldPosition
        : (existingPlayer
            ? existingPlayer.position
            : ((newPosition - rollTotal + 40) % 40));

    // Update game state from server
    if (data.gameState) {
        gameState = data.gameState;
    }

    if (data.players) {
        players = data.players;
    }

    const moveSteps = getMoveStepCount(oldPosition, newPosition);
    const player = players.find(p => p && p.id === playerId);
    
    if (player) {
        revealPlayerToken(playerId);
        if (oldPosition !== newPosition) {
            player.position = oldPosition;
        }
        if (player.tokenIndex !== undefined && !tokenModels[playerId]) {
            loadTokenModel(player.tokenIndex, player);
        }
        if (moveSteps === 0) {
            update3DTokenPositions();
        } else {
            const coords = get3DBoardCoords(oldPosition);
            const model = tokenModels[playerId];
            if (model) {
                model.position.set(coords.x, coords.y, coords.z);
                model.visible = isTokenVisible(playerId);
            }
        }
    }

    // Track this roll so animations can be cancelled if needed
    markPendingRollTokenMove(playerId);
    
    // Record dice data for sequence tracking
    DiceRollSequenceManager.markDiceRolled(playerId, oldPosition, newPosition, data);

    // Start the 3D dice animation
    roll3DDice(serverDice1 || 1, serverDice2 || 1, oldPosition, {
        onLand: () => {
            // Validate that this roll hasn't been cancelled
            const pending = pendingRollTokenMoves[playerId];
            if (!pending || pending.cancelled) {
                DiceRollSequenceManager.cancelSequence(playerId);
                return;
            }
            delete pendingRollTokenMoves[playerId];

            // Log the dice roll
            addLogEntry(message, 'system');

            // Determine what happens after token animation
            const onTokenAnimationComplete = () => {
                if (!isDoublesRoll(data)) {
                    // For non-doubles: trigger property decision
                    onDiceRollSequenceComplete(playerId, newPosition, data);
                } else {
                    // For doubles: just clean up and let turn continue
                    DiceRollSequenceManager.completeSequence(playerId);
                    updateUI();
                }
                
                // Client-side auto-end-turn logic (for current player only)
                if (playerId === myPlayerId && !isDoublesRoll(data)) {
                    scheduleClientAutoEndTurn(playerId, oldPosition, newPosition);
                }
            };

            // Animate token movement
            if (player && moveSteps > 0) {
                animateTokenMove(playerId, oldPosition, newPosition, onTokenAnimationComplete);
            } else if (player) {
                player.position = newPosition;
                update3DTokenPositions();
                onTokenAnimationComplete();
            } else {
                onTokenAnimationComplete();
            }
        }
    });
}

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');

    const urlParts = window.location.pathname.split('/');
    const gameId = urlParts[urlParts.length - 1];
    currentGameId = gameId;
    const playerUid = getStoredPlayerUid();

    if (gameId && gameCodeEl) {
        gameCodeEl.textContent = gameId;
    }

    if (gameId) {
        socket.emit('joinGame', { gameId, playerUid });
    }
});

socket.on('gameJoined', (data) => {
    console.log('=== GAME JOINED ===');
    console.log('GAME: Received gameJoined event:', data);
    console.log('GAME: Socket ID:', socket.id);
    console.log('GAME: Server sent playerId:', data.playerId);
    console.log('GAME: My Player ID (before):', myPlayerId);
    console.log('GAME: Game State:', data.gameState);
    console.log('GAME: Players array:', data.players);
    console.log('GAME: Available player IDs:', data.players.filter(p => p).map(p => ({ id: p.id, name: p.name })));
    
    if (data.playerUid) {
        persistPlayerIdentity(data.gameId, data.playerUid);
    }
    players = data.players;
    currentPlayer = resolveLocalPlayer(players);
    myPlayerId = currentPlayer ? currentPlayer.id : data.playerId;

    gameState = data.gameState;
    
    console.log('GAME: Current player found:', currentPlayer ? currentPlayer.name : 'NOT FOUND');
    console.log('GAME: Final myPlayerId:', myPlayerId);
    console.log('GAME: Socket ID:', socket.id);
    console.log('GAME: Do they match?', myPlayerId === socket.id);
    
    // Acknowledge connection to server
    socket.emit('gameJoinedAck');
    console.log('GAME: Sent gameJoinedAck');
    
    try {
        initializeBoard();
        updateUI();
        console.log('GAME: Board and UI initialized');
    } catch (error) {
        console.error('GAME: Error initializing board:', error);
    }
    
    // Update status immediately
    const gameCodeEl = document.getElementById('gameCode');
    if (gameCodeEl) {
        if (gameState && (gameState.currentPlayer || gameState.status === 'playing')) {
            gameCodeEl.textContent = 'Game Active!';
        } else if (players.length >= 2 && players.filter(p => p).every(p => p.tokenIndex !== undefined)) {
            gameCodeEl.textContent = 'Ready to Start!';
        } else if (players.length >= 2) {
            gameCodeEl.textContent = 'Select Your Token';
        } else {
            gameCodeEl.textContent = 'Waiting for Players...';
        }
    }
    
    // Show token selection if player doesn't have a token
    if (currentPlayer && !currentPlayer.tokenIndex && currentPlayer.tokenIndex !== 0) {
        showTokenSelection();
    }
    
    addLogEntry(`${currentPlayer ? currentPlayer.name : 'Player'} joined the game`, 'player');
    
    // Update tokens to show all players' tokens on the board
    updateTokens();
});

socket.on('tokenSelected', (data) => {
    const { playerId, tokenIndex, players: serverPlayers, allTokensAssigned } = data;

    if (serverPlayers) {
        players = serverPlayers;
    } else if (playerId != null && tokenIndex != null) {
        const player = players.find(p => p && p.id === playerId);
        if (player) {
            player.tokenIndex = tokenIndex;
            const tokenInfo = tokenData[tokenIndex];
            if (tokenInfo) {
                player.tokenName = tokenInfo.name;
                player.tokenImage = tokenInfo.image;
            }
        }
    }

    pendingTokenSelection = null;
    currentPlayer = resolveLocalPlayer(players);
    if (currentPlayer) {
        myPlayerId = currentPlayer.id;
    }

    if (!allTokensAssigned && playerId != null && tokenIndex != null) {
        const player = players.find(p => p && p.id === playerId);
        const tokenInfo = tokenData[tokenIndex];
        if (player && tokenInfo) {
            addLogEntry(`${player.name} selected ${tokenInfo.name}`, 'system');
        }
    } else if (allTokensAssigned) {
        addLogEntry('All players have tokens', 'system');
    }

    if (currentPlayer && currentPlayer.tokenIndex !== undefined) {
        tokenModal?.classList.add('hidden');
    }

    refreshTokenSelectionUI();
});

socket.on('gameStarted', (data) => {
    gameState = data.gameState;
    players = data.players;

    currentPlayer = resolveLocalPlayer(players);
    if (currentPlayer) {
        myPlayerId = currentPlayer.id;
    }

    // Acknowledge receipt to server
    socket.emit('gameStartedAck');

    // Force status update
    const gameCodeEl = document.getElementById('gameCode');
    if (gameCodeEl) {
        gameCodeEl.textContent = 'Game Active!';
    }

    initRevealedPlayersForTurn();
    updateUI();
    updateTokens();
    update3DTokenPositions();
    updateTokenVisibility();

    addLogEntry('Game started!', 'system');
});

socket.on('gameReady', (data) => {
    // Update gameState and players from the event
    if (data.gameState) {
        gameState = data.gameState;
    }
    if (data.players) {
        players = data.players;
    }

    addLogEntry(data.message, 'system');

    // Update game status to show game is ready
    const gameCodeEl = document.getElementById('gameCode');
    if (gameCodeEl) {
        gameCodeEl.textContent = 'Game Active!';
    }

    initRevealedPlayersForTurn();
    updateUI();
    updateTokens();
});

socket.on('updateGameStatus', (data) => {
    console.log('Game status updated:', data);
    const gameCodeEl = document.getElementById('gameCode');
    if (gameCodeEl) {
        const count = data.playerCount != null
            ? data.playerCount
            : players.filter((p) => p).length;
        gameCodeEl.textContent = `${data.status} (${count} players)`;
    }
});

socket.on('propertyPurchased', (data) => {
    const { playerId, position, propertyName, newMoney } = data;
    const player = players.find(p => p && p.id === playerId);
    
    if (player) {
        player.money = newMoney;
        if (!player.properties) player.properties = [];
        player.properties.push(position);
        
        updateUI();
        addLogEntry(`${player.name} bought ${propertyName} for $${boardConfig[position].price}`, 'property');
        
        // Update property display on board
        if (boardSpaces[position]) {
            boardSpaces[position].style.borderLeft = `4px solid ${player.color || '#4a9eff'}`;
        }

        if (playerId === myPlayerId && waitingForBuyResult) {
            waitingForBuyResult = false;
            activePropertyDecision = null;
            clearPropertyDecisionTimer();
            if (buyModal) buyModal.classList.add('hidden');
            updateUI();
            endTurnNow();
        }
    }
});

socket.on('propertyPassed', (data) => {
    const { playerId, position, propertyName } = data;
    const player = players.find(p => p && p.id === playerId);
    
    if (playerId === myPlayerId) {
        waitingForBuyResult = false;
        activePropertyDecision = null;
        clearPropertyDecisionTimer();
        if (buyModal) buyModal.classList.add('hidden');
        updateUI();
    }
});

socket.on('playerJoined', (data) => {
    players = data.players;
    updateUI();
});

socket.on('playersUpdated', (data) => {
    console.log('PLAYERS: Received playersUpdated event:', data);
    players = data.players;
    if (data.gameState) {
        gameState = data.gameState;
    }

    currentPlayer = resolveLocalPlayer(players);
    if (currentPlayer) {
        myPlayerId = currentPlayer.id;
    }
    
    console.log('PLAYERS: Updated players array:', players);
    console.log('PLAYERS: Current player:', currentPlayer ? currentPlayer.name : 'NOT FOUND');
    console.log('PLAYERS: My Player ID:', myPlayerId);
    console.log('PLAYERS: Socket ID:', socket.id);
    
    updateUI();
    updatePlayersList();
    updateTokens(); // Update tokens when players list is updated

    // Sync token meshes from server positions (skip players mid-animation)
    update3DTokenPositions();
});

socket.on('playerDisconnected', (data) => {
    console.log('DISCONNECT: Received playerDisconnected event:', data);
    
    // Update UI to show disconnected status (but keep player in list)
    updateUI();
    updatePlayersList();
});

socket.on('playerMoved', (data) => {
    const { playerId, newPosition, message, players: serverPlayers, direction = 'forward' } = data;

    cancelPendingRollTokenMove(playerId);

    const existingPlayer = players.find(p => p && p.id === playerId);
    const oldPosition = data.oldPosition !== undefined
        ? data.oldPosition
        : (existingPlayer ? existingPlayer.position : 0);

    if (serverPlayers) {
        players = serverPlayers;
    }

    const player = players.find(p => p && p.id === playerId);
    if (player) {
        revealPlayerToken(playerId);
        if (player.tokenIndex !== undefined && !tokenModels[playerId]) {
            loadTokenModel(player.tokenIndex, player);
        }
        const afterMove = () => handlePlayerLanding(playerId, newPosition);

        if (oldPosition !== newPosition) {
            player.position = oldPosition;
            animateTokenMove(playerId, oldPosition, newPosition, afterMove, direction);
        } else {
            player.position = newPosition;
            update3DTokenPositions();
            afterMove();
        }

        updateTokens();

        const spaceName = boardConfig[newPosition]?.name || 'unknown space';
        addLogEntry(`${player.name} moved to ${spaceName}`, 'player');
    }
});

socket.on('diceRolled', (data) => {
    // Delegate to the refactored sequence manager
    handleDiceRolledEvent(data);
});

function isDoublesRoll(diceRolledData) {
    const d1 = diceRolledData.dice1 ?? (diceRolledData.roll && diceRolledData.roll.dice1);
    const d2 = diceRolledData.dice2 ?? (diceRolledData.roll && diceRolledData.roll.dice2);
    return d1 === d2;
}

socket.on('turnChanged', (data) => {
    cancelClientAutoEndTurn();
    Object.keys(pendingRollTokenMoves).forEach((id) => cancelPendingRollTokenMove(id));
    
    // Clean up property decision state when turn changes
    if (activePropertyDecision) {
        dismissPropertyDecisionUI();
    }
    
    if (data.gameState) {
        gameState = data.gameState;
    } else if (gameState) {
        gameState.currentPlayer = data.nextPlayer;
        gameState.diceRolled = false;
        gameState.turnPhase = 'roll';
    }
    lastTurnAnnouncementPlayerId = null;
    revealPlayerToken(data.nextPlayer);
    updateUI();
});

// Handle Chance/Community Chest cards (server delays draw until roll animation finishes)
socket.on('cardDrawn', (data) => {
    cancelPendingRollTokenMove(data.playerId);

    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        if (data.playerId === myPlayerId) {
            showCardModal(data.cardType, data.card.message, data.action);
        }
        addLogEntry(`${player.name} drew ${data.cardType}: ${data.card.message}`, 'system');
    }
});

// Handle tax payments
socket.on('taxPaid', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.money = data.newMoney;
        updateUI();
        addLogEntry(`${player.name} paid $${data.amount} for ${data.taxName}`, 'system');
    }
});

// Handle rent payments
socket.on('rentPaid', (data) => {
    const payer = players.find(p => p && p.id === data.payerId);
    const owner = players.find(p => p && p.id === data.ownerId);
    if (payer && owner) {
        payer.money = data.newPayerMoney;
        owner.money = data.newOwnerMoney;
        updateUI();
        addLogEntry(`${payer.name} paid $${data.amount} rent to ${owner.name} for ${data.property.name}`, 'system');
    }
});

// Handle casino winnings
socket.on('playerMoneyUpdate', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.money = data.money;
        updateUI();
    }
});

// Handle show rent payment UI
socket.on('showRentPayment', (data) => {
    if (data.playerId === myPlayerId) {
        const spaceData = data.property;
        const owner = players.find(p => p && p.id === data.ownerId);
        if (spaceData && owner) {
            startRentDecision({ spaceData, owner }, data.position);
        }
    }
});

// Handle jail events
socket.on('playerSentToJail', (data) => {
    cancelPendingRollTokenMove(data.playerId);

    if (data.players) {
        players = data.players;
    }

    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        const oldPosition = data.oldPosition !== undefined
            ? data.oldPosition
            : player.position;
        const newPosition = data.newPosition !== undefined ? data.newPosition : 10;

        player.inJail = true;
        player.jailTurns = 0;
        revealPlayerToken(data.playerId);

        if (oldPosition !== newPosition) {
            player.position = oldPosition;
            animateTokenMove(
                data.playerId,
                oldPosition,
                newPosition,
                undefined,
                getBestMoveDirection(oldPosition, newPosition)
            );
        } else {
            player.position = newPosition;
            update3DTokenPositions();
        }
        updateTokens();
        updateUI();
        addLogEntry(`${player.name} was sent to jail!`, 'system');
    }
});

socket.on('playerOutOfJail', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.inJail = false;
        player.jailTurns = 0;
        updateUI();
        addLogEntry(`${player.name} got out of jail (${data.method})`, 'system');
    }
});

socket.on('stillInJail', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.inJail = true;
        player.jailTurns = data.jailTurns;
        updateUI();
    }
});

// Handle doubles rolled
socket.on('doublesRolled', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        cancelClientAutoEndTurn();
        if (player.id === myPlayerId) {
            updateUI();
        }
        
        // Show visual notification for doubles
        showDoublesNotification(player.name);
    }
});

// Handle GO bonus
socket.on('passedGo', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.money = data.newMoney;
        updateUI();
        addLogEntry(`${player.name} collected $${data.amount} for passing GO!`, 'system');
    }
});

// Pay to get out of jail
function payToGetOutOfJail() {
    socket.emit('payJail');
}

// Show card modal
function showCardModal(cardType, message, action) {
    // Initialize card modal elements if not already done
    if (!cardModal) {
        cardModal = document.getElementById('cardModal');
        cardTitle = document.getElementById('cardTitle');
        cardContent = document.getElementById('cardContent');
        cardOkBtn = document.getElementById('cardOkBtn');
    }

    if (!cardModal || !cardTitle || !cardContent) {
        console.error('Card modal elements not found');
        return;
    }

    cardTitle.textContent = cardType;
    cardContent.innerHTML = `
        <div class="card-display">
            <div class="card-type">${cardType}</div>
            <div class="card-message">${message}</div>
            ${action ? `<div class="card-action">${action}</div>` : ''}
        </div>
    `;
    cardModal.classList.remove('hidden');
}

// Show doubles notification
function showDoublesNotification(playerName) {
    const notification = document.createElement('div');
    notification.className = 'doubles-notification';
    notification.innerHTML = `
        <div class="doubles-content">
            <div class="doubles-icon">🎲🎲</div>
            <div class="doubles-text">${playerName} rolled DOUBLES!</div>
            <div class="doubles-subtext">Roll again!</div>
        </div>
    `;
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 30px 50px;
        border-radius: 20px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: doublesPopup 2s ease-out forwards;
        font-family: 'Arial', sans-serif;
        text-align: center;
    `;
    
    // Add animation keyframes if not already present
    if (!document.getElementById('doubles-animation')) {
        const style = document.createElement('style');
        style.id = 'doubles-animation';
        style.textContent = `
            @keyframes doublesPopup {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
                40% { transform: translate(-50%, -50%) scale(1); }
                80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            }
            .doubles-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
            }
            .doubles-icon {
                font-size: 48px;
            }
            .doubles-text {
                font-size: 24px;
                font-weight: bold;
            }
            .doubles-subtext {
                font-size: 18px;
                opacity: 0.9;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remove notification after animation
    setTimeout(() => {
        notification.remove();
    }, 2000);
}

socket.on('chatMessage', (data) => {
    addChatMessage(data.sender, data.message);
});

socket.on('gameOver', (data) => {
    const { winnerName, finalPlayers } = data;
    
    const modal = gameOverModal;
    const title = document.getElementById('gameOverTitle');
    const content = document.getElementById('gameOverContent');
    
    title.textContent = winnerName === currentPlayer.name ? 'You Won!' : 'Game Over';
    content.innerHTML = `
        <h3>${winnerName} won the game!</h3>
        <div style="margin-top: 20px;">
            ${finalPlayers.map((p, i) => `
                <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                    <strong>${i + 1}. ${p.name}</strong> - $${p.money}
                </div>
            `).join('')}
        </div>
    `;
    
    modal.classList.remove('hidden');
});

socket.on('gameError', (error) => {
    console.error('Game error:', error);
    const message = typeof error === 'string' ? error : String(error);
    
    // Silently ignore "Not your turn" errors (can happen during reconnection)
    if (message.toLowerCase().includes('not your turn')) {
        return;
    }
    
    addLogEntry(`Game error: ${message}`, 'system');

    // Handle "Game not found" - redirect to lobby
    if (message.toLowerCase().includes('game not found')) {
        alert('Game not found. Redirecting to lobby...');
        window.location.href = '/';
        return;
    }

    if (message.toLowerCase().includes('token') && currentPlayer && pendingTokenSelection != null) {
        delete currentPlayer.tokenIndex;
        delete currentPlayer.tokenName;
        delete currentPlayer.tokenImage;
        pendingTokenSelection = null;
        showTokenSelection();
        refreshTokenSelectionUI();
    }

    if (waitingForBuyResult) {
        waitingForBuyResult = false;
        activePropertyDecision = null;
        clearPropertyDecisionTimer();
        if (buyModal) buyModal.classList.add('hidden');
    }
});

socket.on('error', (error) => {
    console.error('Game error:', error);
    alert(error);
});

// Update token options to grey out taken tokens
function updateTokenOptions() {
    const tokenOptions = document.querySelectorAll('.token-option');
    tokenOptions.forEach(option => {
        const tokenIndex = parseInt(option.dataset.token, 10);
        const humanPlayers = players.filter(p => p && !p.isAI);
        const isTokenTaken = humanPlayers.some(p => p.tokenIndex === tokenIndex);
        option.classList.toggle('disabled', isTokenTaken);
        option.style.opacity = isTokenTaken ? '0.5' : '1';
        option.style.pointerEvents = isTokenTaken ? 'none' : 'auto';
    });
}

function loadTokenForPlayerIfNeeded(player) {
    if (!player || player.tokenIndex === undefined) return;
    if (isTokenVisible(player.id) && !tokenModels[player.id] && !tokenLoading[player.id]) {
        loadTokenModel(player.tokenIndex, player);
    }
    if (player.isAI && !tokenModels[player.id] && !tokenLoading[player.id]) {
        loadTokenModel(player.tokenIndex, player);
    }
}

function refreshTokenSelectionUI() {
    updateTokenOptions();
    updatePlayersList();
    players.filter(p => p).forEach(loadTokenForPlayerIfNeeded);
    updateUI({ skipTokenLayer: true });
    requestAnimationFrame(() => {
        update3DTokenPositions();
        updateTokenVisibility();
    });
}

function pickToken(tokenIndex) {
    if (!currentPlayer || currentPlayer.tokenIndex !== undefined) return;
    const humanPlayers = players.filter(p => p && !p.isAI);
    if (humanPlayers.some(p => p.tokenIndex === tokenIndex)) return;

    pendingTokenSelection = tokenIndex;
    currentPlayer.tokenIndex = tokenIndex;
    const tokenInfo = tokenData[tokenIndex];
    if (tokenInfo) {
        currentPlayer.tokenName = tokenInfo.name;
        currentPlayer.tokenImage = tokenInfo.image;
    }

    tokenModal?.classList.add('hidden');
    refreshTokenSelectionUI();
    socket.emit('selectToken', { tokenIndex });
}

function initTokenSelectionUI() {
    if (!tokenSelectionEl || tokenSelectionEl.dataset.bound === '1') return;
    tokenSelectionEl.dataset.bound = '1';

    tokenSelectionEl.addEventListener('click', (event) => {
        const option = event.target.closest('.token-option');
        if (!option || option.classList.contains('disabled')) return;
        const tokenIndex = parseInt(option.dataset.token, 10);
        if (Number.isNaN(tokenIndex)) return;
        pickToken(tokenIndex);
    });

    if (confirmTokenBtn) {
        confirmTokenBtn.style.display = 'none';
    }
}

// Show token selection modal
function showTokenSelection() {
    if (!tokenModal) {
        console.error('Token modal not found');
        return;
    }
    if (currentPlayer && currentPlayer.tokenIndex !== undefined) {
        return;
    }

    updateTokenOptions();
    tokenModal.classList.remove('hidden');
}

const confirmBuyBtn = document.getElementById('confirmBuyBtn');
const cancelBuyBtn = document.getElementById('cancelBuyBtn');
const closeCasinoBtn = document.getElementById('closeCasinoBtn');

if (confirmBuyBtn) {
    confirmBuyBtn.addEventListener('click', () => {
        if (!activePropertyDecision) return;
        const { position, spaceData } = activePropertyDecision;
        const canAfford = currentPlayer && currentPlayer.money >= spaceData.price;
        const isCasino = spaceData.isCasino;
        clearPropertyDecisionTimer();
        buyModal.classList.add('hidden');

        if (canAfford) {
            waitingForBuyResult = true;
            socket.emit('buyProperty', { position });
            
            // Auto-end turn for non-casino properties
            if (!isCasino) {
                setTimeout(() => {
                    if (gameState && gameState.currentPlayer === myPlayerId) {
                        endTurnNow();
                    }
                }, 500);
            }
        } else {
            socket.emit('passProperty', { position });
            addLogEntry(`Cannot afford ${spaceData.name}. Passing.`, 'system');
            activePropertyDecision = null;
        }
    });
}

if (cancelBuyBtn) {
    cancelBuyBtn.addEventListener('click', () => {
        if (!activePropertyDecision) return;
        socket.emit('passProperty', { position: activePropertyDecision.position });
        clearPropertyDecisionTimer();
        buyModal.classList.add('hidden');
        activePropertyDecision = null;
    });
}

if (closeCasinoBtn) {
    closeCasinoBtn.addEventListener('click', () => {
        closeCasinoGame();
    });
}

// Chat event listeners - wrapped in DOMContentLoaded to ensure elements exist
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupChatListeners);
} else {
    setupChatListeners();
}
initTokenSelectionUI();

function setupChatListeners() {
    // Initialize chat DOM elements
    chatMessagesEl = document.getElementById('chatMessages');
    chatInputEl = document.getElementById('chatInput');
    sendChatBtn = document.getElementById('sendChatBtn');

    console.log('Chat elements initialized:', { chatMessagesEl, chatInputEl, sendChatBtn });

    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', () => {
            const message = chatInputEl.value.trim();
            if (message) {
                console.log('Sending chat message:', message);
                socket.emit('sendChat', { message });
                chatInputEl.value = '';
            }
        });
    }

    if (chatInputEl) {
        chatInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const message = chatInputEl.value.trim();
                if (message) {
                    console.log('Sending chat message:', message);
                    socket.emit('sendChat', { message });
                    chatInputEl.value = '';
                }
            }
        });
    }
}

// Roll dice button
const rollDiceBtn = document.getElementById('rollDiceBtn');
if (rollDiceBtn) {
    rollDiceBtn.addEventListener('click', () => {
        if (canRollDice) {
            socket.emit('rollDice');
        }
    });
}

// End turn button (manual)
const endTurnBtn = document.getElementById('endTurnBtn');
if (endTurnBtn) {
    endTurnBtn.addEventListener('click', () => {
        if (!canEndTurnNow()) return;
        if (activePropertyDecision) {
            dismissPropertyDecisionUI();
        }
        cancelClientAutoEndTurn();
        endTurnNow();
    });
}

// Modal close handlers
document.querySelectorAll('.modal-close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal === buyModal && activePropertyDecision) {
            socket.emit('passProperty', { position: activePropertyDecision.position });
            clearPropertyDecisionTimer();
            activePropertyDecision = null;
            waitingForBuyResult = false;
        }
        if (modal === propertyModal) {
            closePropertyModal();
            return;
        }
        modal.classList.add('hidden');
    });
});

// Close modals when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            if (modal === buyModal && activePropertyDecision) {
                socket.emit('passProperty', { position: activePropertyDecision.position });
                clearPropertyDecisionTimer();
                activePropertyDecision = null;
                waitingForBuyResult = false;
            }
            if (modal === propertyModal) {
                closePropertyModal();
                return;
            }
            modal.classList.add('hidden');
        }
    });
});

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch CDN configuration from server
    try {
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        window.USE_VIDEO_CDN = config.USE_VIDEO_CDN;
        window.VIDEO_CDN_BASE_URL = config.VIDEO_CDN_BASE_URL;
        window.USE_CDN = config.USE_CDN;
        window.CDN_BASE_URL = config.CDN_BASE_URL;
        console.log('CDN Config loaded:', config);
    } catch (error) {
        console.error('Failed to load CDN config:', error);
        // Fallback to local paths
        window.USE_VIDEO_CDN = false;
        window.VIDEO_CDN_BASE_URL = '';
    }

    // Clear any stale player data from previous games
    localStorage.removeItem('playerName');

    // Card modal event listener - wrapped in DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupCardModalListener);
    } else {
        setupCardModalListener();
    }

    function setupCardModalListener() {
        // Initialize card modal elements
        if (!cardModal) {
            cardModal = document.getElementById('cardModal');
            cardTitle = document.getElementById('cardTitle');
            cardContent = document.getElementById('cardContent');
            cardOkBtn = document.getElementById('cardOkBtn');
        }

        if (cardOkBtn) {
            cardOkBtn.addEventListener('click', () => {
                if (cardModal) {
                    cardModal.classList.add('hidden');
                }
            });
        }
    }

    // Orbit camera in Three.js (board + tokens share this view)
    if (boardContainer) {
        boardContainer.addEventListener('contextmenu', (e) => e.preventDefault());

        boardContainer.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                isRightMouseDown = true;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                boardContainer.style.cursor = e.shiftKey ? 'move' : 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isRightMouseDown) return;

            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;

            if (e.shiftKey) {
                e.preventDefault();
                // Pan camera (move target) - pure screen-space left/right and up/down
                const panSpeed = 0.02 * cameraDistance;
                
                // Get camera's right vector for horizontal panning
                const azimuth = (cameraAzimuthDeg * Math.PI) / 180;
                const right = new THREE.Vector3(
                    Math.cos(azimuth),
                    0,
                    -Math.sin(azimuth)
                );
                
                // Horizontal: move along camera's right vector (left/right on screen)
                cameraTargetX -= right.x * deltaX * panSpeed;
                cameraTargetZ -= right.z * deltaX * panSpeed;
                
                // Vertical: move along world Y axis (true up/down on screen)
                cameraTargetY += deltaY * panSpeed;
            } else {
                // Orbit around target
                cameraAzimuthDeg += deltaX * 0.5;
                cameraPolarDeg = Math.max(15, Math.min(85, cameraPolarDeg - deltaY * 0.5));
            }
            updateThreeCamera();

            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                isRightMouseDown = false;
                boardContainer.style.cursor = 'default';
            }
        });

        boardContainer.addEventListener('wheel', (e) => {
            if (e.shiftKey) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1.2 : -1.2;
            cameraDistance = Math.max(CAMERA_DISTANCE_MIN, Math.min(CAMERA_DISTANCE_MAX, cameraDistance + delta));
            updateThreeCamera();
        }, { passive: false });

        boardContainer.addEventListener('dblclick', () => {
            cameraDistance = CAMERA_DISTANCE_DEFAULT;
            cameraPolarDeg = 55;
            cameraAzimuthDeg = 0;
            cameraTargetX = 0;
            cameraTargetY = 0;
            cameraTargetZ = 0;
            updateThreeCamera();
        });
    }
});

function getBoardContainerSize() {
    const el = boardViewport || boardContainer;
    if (!el) return null;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return null;
    return { w, h };
}

function resize3DScene() {
    const size = getBoardContainerSize();
    if (!size || !renderer || !camera) return false;

    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    renderer.setSize(size.w, size.h);
    return true;
}

function start3DScene() {
    if (typeof THREE === 'undefined') {
        console.warn('Three.js not loaded; 3D board disabled');
        return;
    }

    const size = getBoardContainerSize();
    if (!size) {
        requestAnimationFrame(start3DScene);
        return;
    }

    if (scene3DInitialized) {
        resize3DScene();
        return;
    }

    const containerWidth = size.w;
    const containerHeight = size.h;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(64, containerWidth / containerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(containerWidth, containerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    token3DScene.innerHTML = '';
    token3DScene.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.addEventListener('click', on3DBoardClick);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(6, 18, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x4a9eff, 0.22);
    fillLight.position.set(-8, 10, -6);
    scene.add(fillLight);

    create3DBoard();
    updateThreeCamera();
    scene3DInitialized = true;

    console.log(`3D board ready: ${Object.keys(boardMeshes).length} tiles`);

    const resizeTarget = boardViewport || boardContainer;
    if (resizeTarget && !resizeObserver) {
        resizeObserver = new ResizeObserver(() => resize3DScene());
        resizeObserver.observe(resizeTarget);
    }
}

function wrapCanvasLines(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    });
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
}

function tileSubLabel(spaceData) {
    if (spaceData.type === 'property' && spaceData.price != null) return `$${spaceData.price}`;
    if (spaceData.type === 'railroad' || spaceData.type === 'utility') return `$${spaceData.price}`;
    if (spaceData.type === 'tax' && spaceData.amount != null) return `$${spaceData.amount}`;
    return '';
}

// Y rotation so tile face (and color strip) point outward from board center
function getTileFacingRotationY(row, col) {
    if (row === 0) return 0; // Top row: face north (away from center)
    if (row === 10) return Math.PI; // Bottom row: face south (away from center)
    if (col === 10) return Math.PI / 2; // Right column: face east (away from center)
    if (col === 0) return -Math.PI / 2; // Left column: face west (away from center)
    return 0;
}

// Color strip is drawn on the canvas top; rotation above places it on the inner edge
function stripEdgeFromGrid(row, col) {
    if (row === 0 || row === 10 || col === 0 || col === 10) return 'top';
    return 'top';
}

function stripAccentColor(spaceData) {
    if (spaceData.type === 'property' && spaceData.color) return spaceData.color;
    if (spaceData.type === 'railroad') return '#4a9eff';
    if (spaceData.type === 'utility') return '#95a5a6';
    if (spaceData.type === 'chance') return '#ffc107';
    if (spaceData.type === 'community-chest') return '#dc3545';
    if (spaceData.type === 'tax') return '#e74c3c';
    if (spaceData.type === 'corner') return '#4a9eff';
    return '#4a9eff';
}

function hexToRgba(hex, alpha) {
    const h = (hex || '#000000').replace('#', '');
    if (h.length !== 6) return `rgba(74, 158, 255, ${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function roundRectPath(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function createMonopolyFaceTexture(spaceData, row, col) {
    const W = 512;
    const H = 512;
    const pad = 10;
    const cornerR = 26;
    const stripThick = 64;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Flip canvas horizontally so text reads correctly when tiles face outward
    ctx.translate(W, 0);
    ctx.scale(-1, 1);

    const inner = { x: pad + 4, y: pad + 4, w: W - (pad + 4) * 2, h: H - (pad + 4) * 2 };

    roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, cornerR);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#161e2e');
    bg.addColorStop(0.45, '#0d1219');
    bg.addColorStop(1, '#1a2638');
    ctx.fillStyle = bg;
    ctx.fill();

    const edge = stripEdgeFromGrid(row, col);
    const c = stripAccentColor(spaceData);

    ctx.save();
    roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, cornerR);
    ctx.clip();

    if (edge === 'top') {
        const lg = ctx.createLinearGradient(0, inner.y, 0, inner.y + stripThick);
        lg.addColorStop(0, c);
        lg.addColorStop(1, hexToRgba(c, 0.55));
        ctx.fillStyle = lg;
        ctx.fillRect(inner.x, inner.y, inner.w, stripThick);
    } else if (edge === 'bottom') {
        const lg = ctx.createLinearGradient(0, inner.y + inner.h - stripThick, 0, inner.y + inner.h);
        lg.addColorStop(0, hexToRgba(c, 0.45));
        lg.addColorStop(1, c);
        ctx.fillStyle = lg;
        ctx.fillRect(inner.x, inner.y + inner.h - stripThick, inner.w, stripThick);
    } else if (edge === 'right') {
        const lg = ctx.createLinearGradient(inner.x + inner.w - stripThick, 0, inner.x + inner.w, 0);
        lg.addColorStop(0, hexToRgba(c, 0.45));
        lg.addColorStop(1, c);
        ctx.fillStyle = lg;
        ctx.fillRect(inner.x + inner.w - stripThick, inner.y, stripThick, inner.h);
    } else {
        const lg = ctx.createLinearGradient(inner.x, 0, inner.x + stripThick, 0);
        lg.addColorStop(0, c);
        lg.addColorStop(1, hexToRgba(c, 0.45));
        ctx.fillStyle = lg;
        ctx.fillRect(inner.x, inner.y, stripThick, inner.h);
    }
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, pad + 1, pad + 1, W - (pad + 1) * 2, H - (pad + 1) * 2, cornerR - 1);
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(74, 158, 255, 0.65)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, cornerR);
    ctx.clip();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (spaceData.type === 'chance') {
        ctx.fillStyle = '#f8fbff';
        ctx.font = '900 85px "Arial Black", "Impact", sans-serif';
        ctx.fillText('CHANCE', W / 2, H / 2 - 100);
        ctx.font = '900 220px "Arial Black", "Impact", sans-serif';
        ctx.fillStyle = '#ffc107';
        ctx.shadowColor = 'rgba(255, 193, 7, 0.45)';
        ctx.shadowBlur = 18;
        ctx.fillText('?', W / 2, H / 2 + 80);
    } else if (spaceData.type === 'community-chest') {
        ctx.fillStyle = '#f8fbff';
        ctx.font = '900 72px "Arial Black", "Impact", sans-serif';
        ctx.fillText('COMMUNITY', W / 2, H / 2 - 60);
        ctx.fillText('CHEST', W / 2, H / 2 + 45);
    } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#f5f8fc';
        ctx.font = '900 58px "Arial Black", "Impact", sans-serif';
        const bodyLines = wrapCanvasLines(ctx, spaceData.name, inner.w - 15, 3);
        const sub = tileSubLabel(spaceData);
        const lineH = 62;
        const extra = sub ? 1 : 0;
        let ty = H / 2 - ((bodyLines.length + extra - 1) * lineH) / 2 + 12;
        bodyLines.forEach((ln) => {
            ctx.fillText(ln, W / 2, ty);
            ty += lineH;
        });
        if (sub) {
            ctx.font = '900 50px "Arial Black", "Impact", sans-serif';
            ctx.fillStyle = 'rgba(190, 210, 235, 0.95)';
            ctx.fillText(sub, W / 2, ty + 10);
        }
    }

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.flipY = false;
    if (typeof renderer !== 'undefined' && renderer && renderer.capabilities) {
        const maxA = renderer.capabilities.getMaxAnisotropy
            ? renderer.capabilities.getMaxAnisotropy()
            : 1;
        tex.anisotropy = Math.min(8, maxA);
    }
    return tex;
}

function createPremiumBoardTile(spaceData, row, col) {
    const { tileSize, tileHeight } = BOARD_LAYOUT;
    const group = new THREE.Group();

    const slab = new THREE.Mesh(
        new THREE.BoxGeometry(tileSize * 0.98, tileHeight, tileSize * 0.98),
        new THREE.MeshPhongMaterial({
            color: 0x0c1018,
            emissive: 0x050810,
            emissiveIntensity: 0.6,
            shininess: 95,
            specular: 0x5588bb
        })
    );
    group.add(slab);

    const tex = createMonopolyFaceTexture(spaceData, row, col);

    const faceMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: true
    });
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(tileSize * 0.9, tileSize * 0.9),
        faceMat
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = tileHeight / 2 + 0.004;
    group.add(face);

    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(tileSize * 0.99, tileHeight + 0.004, tileSize * 0.99));
    const edgeLines = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.28 })
    );
    group.add(edgeLines);

    // Add Ferris Wheel model for County Fair (position 24)
    if (spaceData.position === 24 && spaceData.name === 'County Fair') {
        const loader = new THREE.GLTFLoader();
        loader.load(getModelPath('/Models/Ferris Wheel/scene.gltf'),
            function(gltf) {
                const ferrisWheel = gltf.scene;
                const scale = tileSize * 0.06;
                ferrisWheel.scale.set(scale, scale, scale);
                ferrisWheel.position.y = tileHeight / 2 + 0.05;
                ferrisWheel.userData.isFerrisWheel = true;
                ferrisWheel.userData.lastUpdate = 0;
                
                // Optimize model for performance
                ferrisWheel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        if (child.material) {
                            child.material.flatShading = true;
                            // Disable expensive material features
                            child.material.needsUpdate = true;
                            if (child.material.map) {
                                child.material.map.anisotropy = 1;
                            }
                        }
                    }
                });
                
                // Setup animation mixer if model has animations
                if (gltf.animations && gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(ferrisWheel);
                    ferrisWheel.mixer = mixer;
                    ferrisWheel.animations = gltf.animations;
                    
                    // Play the animation with reduced time scale for performance
                    const action = mixer.clipAction(gltf.animations[0]);
                    action.timeScale = 0.3;
                    action.play();
                }
                
                group.add(ferrisWheel);
            },
            function(xhr) {
                if (xhr.lengthComputable) {
                    const percentComplete = xhr.loaded / xhr.total * 100;
                    console.log(`Loading Ferris Wheel: ${percentComplete.toFixed(2)}%`);
                }
            },
            function(error) {
                console.error('Error loading Ferris Wheel model:', error);
            }
        );
    }

    return group;
}

// Center carousel variables
let centerCarouselGroup = null;
let carouselImages = [];
let carouselCurrentIndex = 0;

// Fisher-Yates shuffle for randomizing carousel images
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function createCenterCarousel(parentGroup) {
    if (centerCarouselGroup) {
        parentGroup.remove(centerCarouselGroup);
    }
    
    centerCarouselGroup = new THREE.Group();
    carouselImages = [];
    
    // All images from Images folder (excluding tokens and utilities)
    const allImages = [
        '/Images/county_fair.png',
        '/Images/screenshot_2024-12-12_033702.png',
        '/Images/raidersimage.png',
        '/Images/230613231941-04-knights-stanley-cup-061323.jpg',
        '/Images/9b.jpg',
        '/Images/HelicopterRidesNight.jpg',
        '/Images/LVACES.jpg',
        '/Images/LVTheater.jpg',
        '/Images/LasVegasSphere.jpg',
        '/Images/las_vegas_strip_map_blog.jpg',
        '/Images/PIX-1-Exosphere-Architecture.jpg',
        '/Images/ResortsWorldTheater.jpg',
        '/Images/SV_OFF_ROAD_TRACK_GALLERY_6.jpg',
        '/Images/ShrinersChildrens-18-hole-2022.jpg',
        '/Images/SpeedVegasOffroading.jpg',
        '/Images/welcome_fabulous_las_vegas_sign.jpg',
        '/Images/wynn_2_2.jpg',
        '/Images/bellagio.jpg',
        '/Images/cityracing.jpg',
        '/Images/cosmopolitan.jpg',
        '/Images/eater_vegas_large.jpg',
        '/Images/hq720.jpg',
        '/Images/santafecasino.jpg',
        '/Images/themirage.jpg',
        '/Images/thesphere.jpg',
        '/Images/welcome_caesars_palace.jpg',
        '/Images/01je2cjc09h0eq0z3pgh.webp',
        '/Images/17509129_web1_INMATE-WHISPERER-FEB28-23__001-1.webp',
        '/Images/11929141633_b4ab5fd45e_k.webp',
        '/Images/Adele-Slams-Fan-Who-Yelled-Pride-Sucks-During-Concert-02.webp',
        '/Images/BetMGM.jpg',
        '/Images/man_rolls_royce.png',
        '/Images/las_vegas_motor_speedway.webp',
        '/Images/tigetwoods.avif',
        '/Images/unnamed.jpg',
        '/Images/minus_1x_1.webp',
        '/Images/berry_1.webp',
        '/Images/las_vegas_elopement_wedding_champagne_pop.webp',
        '/Images/unnamed_1.png',
        '/Images/rolls_royce_2.png',
        '/Images/helicopters.webp',
        '/Images/house_of_blues_sunset.webp',
        '/Images/unnamed.gif',
    ];
    
    // Use sequential track-based ordering instead of randomization
    console.log(`Total carousel images: ${allImages.length}`);
    
    if (allImages.length === 0) return;
    
    const textureLoader = new THREE.TextureLoader();
    
    // Create single image mesh for slideshow with error handling
    textureLoader.load(
        allImages[0],
        (texture) => {
            if (typeof renderer !== 'undefined' && renderer && renderer.capabilities) {
                const maxA = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
                texture.anisotropy = Math.min(8, maxA);
            }
            
            const imageMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(9, 9),
                new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    side: THREE.DoubleSide
                })
            );
            
            imageMesh.position.set(0, 0.16, 0);
            imageMesh.rotation.x = -Math.PI / 2;
            imageMesh.userData.images = allImages;
            imageMesh.userData.currentIndex = 0;
            imageMesh.userData.lastChange = Date.now();
            imageMesh.userData.nextTexture = null;
            imageMesh.userData.nextIndex = null;
            imageMesh.userData.failedImages = new Set(); // Track failed images
            
            centerCarouselGroup.add(imageMesh);
            carouselImages.push(imageMesh);
            
            // Preload the first next image
            preloadNextCarouselImage(imageMesh);
        },
        undefined,
        (error) => {
            console.error('Error loading initial carousel image:', error);
            // Try next image as fallback
            if (allImages.length > 1) {
                console.log('Trying fallback image...');
                const fallbackImages = allImages.slice(1);
                createCenterCarouselWithFallback(parentGroup, fallbackImages);
            }
        }
    );
    
    parentGroup.add(centerCarouselGroup);
}

// Fallback function for carousel loading
function createCenterCarouselWithFallback(parentGroup, images) {
    if (images.length === 0) {
        console.error('All carousel images failed to load');
        return;
    }
    
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        images[0],
        (texture) => {
            if (typeof renderer !== 'undefined' && renderer && renderer.capabilities) {
                const maxA = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
                texture.anisotropy = Math.min(8, maxA);
            }
            
            const imageMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(9, 9),
                new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    side: THREE.DoubleSide
                })
            );
            
            imageMesh.position.set(0, 0.16, 0);
            imageMesh.rotation.x = -Math.PI / 2;
            imageMesh.userData.images = images;
            imageMesh.userData.currentIndex = 0;
            imageMesh.userData.lastChange = Date.now();
            imageMesh.userData.nextTexture = null;
            imageMesh.userData.nextIndex = null;
            imageMesh.userData.failedImages = new Set();
            
            centerCarouselGroup.add(imageMesh);
            carouselImages.push(imageMesh);
            
            preloadNextCarouselImage(imageMesh);
        },
        undefined,
        (error) => {
            console.error('Fallback image also failed:', error);
            createCenterCarouselWithFallback(parentGroup, images.slice(1));
        }
    );
}

function preloadNextCarouselImage(imageMesh) {
    const imagesLength = imageMesh.userData.images.length;
    if (imagesLength <= 1) return;
    
    // Use sequential track-based ordering
    let nextIndex = (imageMesh.userData.currentIndex + 1) % imagesLength;
    
    // Skip failed images
    let attempts = 0;
    const maxAttempts = imagesLength;
    while (imageMesh.userData.failedImages && imageMesh.userData.failedImages.has(nextIndex) && attempts < maxAttempts) {
        nextIndex = (nextIndex + 1) % imagesLength;
        attempts++;
    }
    
    if (attempts >= maxAttempts) {
        console.warn('All carousel images failed to load');
        return;
    }
    
    imageMesh.userData.nextIndex = nextIndex;
    
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        imageMesh.userData.images[nextIndex],
        (texture) => {
            if (typeof renderer !== 'undefined' && renderer && renderer.capabilities) {
                const maxA = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
                texture.anisotropy = Math.min(8, maxA);
            }
            imageMesh.userData.nextTexture = texture;
        },
        undefined,
        (error) => {
            console.error('Error preloading carousel image:', error);
            if (!imageMesh.userData.failedImages) {
                imageMesh.userData.failedImages = new Set();
            }
            imageMesh.userData.failedImages.add(nextIndex);
            // Try next image
            preloadNextCarouselImage(imageMesh);
        }
    );
}

function animateCenterCarousel() {
    if (!centerCarouselGroup || carouselImages.length === 0) return;
    
    const imageMesh = carouselImages[0];
    const now = Date.now();
    const changeInterval = 3000; // Change every 3 seconds
    
    if (now - imageMesh.userData.lastChange > changeInterval) {
        imageMesh.userData.lastChange = now;
        
        // Use preloaded texture if available, otherwise fall back to current
        if (imageMesh.userData.nextTexture && imageMesh.userData.nextIndex !== null) {
            // Seamless swap to preloaded texture
            imageMesh.material.map = imageMesh.userData.nextTexture;
            imageMesh.material.needsUpdate = true;
            imageMesh.userData.currentIndex = imageMesh.userData.nextIndex;
            carouselCurrentIndex = imageMesh.userData.nextIndex;
            
            // Clear preloaded texture and preload next one
            imageMesh.userData.nextTexture = null;
            imageMesh.userData.nextIndex = null;
            preloadNextCarouselImage(imageMesh);
        } else {
            // Fallback if preload failed - load immediately with error handling
            const imagesLength = imageMesh.userData.images.length;
            let newIndex = (imageMesh.userData.currentIndex + 1) % imagesLength;
            
            // Skip failed images
            let attempts = 0;
            const maxAttempts = imagesLength;
            while (imageMesh.userData.failedImages && imageMesh.userData.failedImages.has(newIndex) && attempts < maxAttempts) {
                newIndex = (newIndex + 1) % imagesLength;
                attempts++;
            }
            
            if (attempts >= maxAttempts) {
                console.warn('All carousel images failed to load, staying on current');
                return;
            }
            
            imageMesh.userData.currentIndex = newIndex;
            carouselCurrentIndex = newIndex;
            
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                imageMesh.userData.images[newIndex],
                (texture) => {
                    if (typeof renderer !== 'undefined' && renderer && renderer.capabilities) {
                        const maxA = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
                        texture.anisotropy = Math.min(8, maxA);
                    }
                    imageMesh.material.map = texture;
                    imageMesh.material.needsUpdate = true;
                },
                undefined,
                (error) => {
                    console.error('Error loading carousel image:', error);
                    if (!imageMesh.userData.failedImages) {
                        imageMesh.userData.failedImages = new Set();
                    }
                    imageMesh.userData.failedImages.add(newIndex);
                }
            );
        }
    }
}

// Create the 3D board in Three.js
function create3DBoard() {
    const { tileSize, gap, tileHeight, step } = BOARD_LAYOUT;
    const boardSize = 11;

    Object.values(boardMeshes).forEach((obj) => {
        if (obj && scene) scene.remove(obj);
    });
    boardMeshes = {};

    if (boardEnvironmentGroup) {
        scene.remove(boardEnvironmentGroup);
    }
    boardEnvironmentGroup = new THREE.Group();

    const boardBase = new THREE.Mesh(
        new THREE.BoxGeometry(8.5, 0.025, 8.5),
        new THREE.MeshPhongMaterial({
            color: 0x0f0f0f,
            emissive: 0x1a1a1a,
            emissiveIntensity: 0.35,
            shininess: 60,
            specular: 0x1a3a5c
        })
    );
    boardBase.position.y = -0.012;
    boardEnvironmentGroup.add(boardBase);

    const rim = new THREE.Mesh(
        new THREE.BoxGeometry(8.62, 0.012, 8.62),
        new THREE.MeshBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.35 })
    );
    rim.position.y = 0.002;
    boardEnvironmentGroup.add(rim);

    const innerSpan = 9 * step - gap;
    const centerPad = new THREE.Mesh(
        new THREE.BoxGeometry(innerSpan * 0.94, 0.028, innerSpan * 0.94),
        new THREE.MeshPhongMaterial({
            color: 0x1a1f28,
            emissive: 0x243447,
            emissiveIntensity: 0.4,
            shininess: 70,
            specular: 0x4a9eff
        })
    );
    centerPad.position.y = tileHeight * 0.5;
    boardEnvironmentGroup.add(centerPad);

    // Create revolving image carousel in center
    createCenterCarousel(boardEnvironmentGroup);

    scene.add(boardEnvironmentGroup);

    for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
            let position = null;

            // Use the same logic as positionToGrid function for consistency
            if (row === 0) position = col; // Top row: GO (0) to JAIL (10)
            else if (row === 10) position = 20 + (10 - col); // Bottom row: FREE PARKING (20) to GO TO JAIL (30)
            else if (col === 0) position = 30 + (10 - row); // Left column: GO TO JAIL (30) to GO (39)
            else if (col === 10) position = 10 + row; // Right column: JAIL (10) to FREE PARKING (20)
            else continue;

            const spaceData = boardConfig[position];
            if (!spaceData) continue;

            const x = (col - 5) * step;
            const z = (row - 5) * step;
            const tile = createPremiumBoardTile(spaceData, row, col);
            tile.position.set(x, tileHeight / 2, z);
            tile.rotation.y = getTileFacingRotationY(row, col);
            tile.userData.position = position;

            scene.add(tile);
            boardMeshes[position] = tile;
        }
    }
}


// Animation loop for 3D scene
function animate3DScene() {
    requestAnimationFrame(animate3DScene);
    
    update3DTokenPositions();
    animateCenterCarousel();
    animateFerrisWheels();
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Animate all Ferris wheels on the board
function animateFerrisWheels() {
    const now = Date.now();
    Object.values(boardMeshes).forEach(tile => {
        if (tile && tile.children) {
            tile.children.forEach(child => {
                if (child.userData && child.userData.isFerrisWheel && child.mixer) {
                    // Skip frames to reduce CPU load - update every 3rd frame (~50ms)
                    if (!child.userData.lastUpdate || now - child.userData.lastUpdate > 50) {
                        child.mixer.update(0.05);
                        child.userData.lastUpdate = now;
                    }
                }
            });
        }
    });
}

// Initialize the game
    initializeBoard();
    requestAnimationFrame(() => {
        try {
            start3DScene();
            animate3DScene();
        } catch (error) {
            console.error('3D scene initialization failed:', error);
        }
    });

// Video Chat Variables
let peer = null;
let conn = null;
let localStream = null;
let remoteStream = null;
let videoCall = null;
let isCallActive = false;
let myPeerId = null;
let opponentPeerId = null;

// Initialize PeerJS
function initializePeerJS() {
    if (peer) return;

    // Create a new PeerJS instance with a random ID
    peer = new Peer(null, {
        debug: 2
    });

    peer.on('open', (id) => {
        console.log('PeerJS connected with ID:', id);
        myPeerId = id;
        updateConnectionStatus('Ready to call');
        // Share peer ID with other players via socket
        socket.emit('peerIdShare', {
            gameId: currentGameId,
            playerId: myPlayerId,
            peerId: id
        });
    });

    peer.on('call', (call) => {
        console.log('Incoming call from:', call.peer);
        // Answer with local stream if available
        if (localStream) {
            console.log('Answering with existing stream');
            call.answer(localStream);
        } else {
            // Get stream first then answer
            console.log('Getting stream to answer call');
            navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: true
            }).then(stream => {
                localStream = stream;
                const localVideo = document.getElementById('localVideo');
                localVideo.srcObject = localStream;
                call.answer(stream);
            }).catch(err => {
                console.error('Error getting media for incoming call:', err);
            });
        }
        videoCall = call;
        handleCall(call);
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        updateConnectionStatus('Error: ' + err.type);
    });
}

// Start video call
async function startVideoCall() {
    console.log('startVideoCall called');
    // Wait for peer to be ready
    if (!peer || !myPeerId) {
        updateConnectionStatus('Connecting to peer server...');
        if (!peer) {
            console.log('Initializing PeerJS...');
            initializePeerJS();
        }
        // Wait a bit for peer to connect
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!myPeerId) {
        console.log('Error: Peer not ready - myPeerId is null');
        updateConnectionStatus('Error: Peer not ready');
        return;
    }

    console.log('Peer ready, myPeerId:', myPeerId);

    try {
        // Get local media stream
        console.log('Getting user media...');
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: true
        });

        // Display local video
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;

        updateConnectionStatus('Calling...');

        // Send call request to other player with our peer ID
        console.log('Sending video call request with peerId:', myPeerId, 'gameId:', currentGameId, 'playerId:', myPlayerId);
        socket.emit('videoCallRequest', {
            gameId: currentGameId,
            playerId: myPlayerId,
            peerId: myPeerId
        });
        console.log('videoCallRequest emitted');

        document.getElementById('startVideoCall').style.display = 'none';
        document.getElementById('endVideoCall').style.display = 'block';
        isCallActive = true;

    } catch (err) {
        console.error('Error getting media stream:', err);
        updateConnectionStatus('Error: Camera access denied');
    }
}

// Handle incoming video call
function handleCall(call) {
    call.on('stream', (stream) => {
        console.log('Received remote stream');
        remoteStream = stream;
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = stream;
        updateConnectionStatus('Connected');
    });

    call.on('close', () => {
        console.log('Call ended');
        endVideoCall();
    });

    call.on('error', (err) => {
        console.error('Call error:', err);
        updateConnectionStatus('Call error');
    });
}

// End video call
function endVideoCall() {
    if (videoCall) {
        videoCall.close();
        videoCall = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    // Stop and clear local video
    if (localVideo) {
        localVideo.pause();
        localVideo.srcObject = null;
        localVideo.load();
    }
    
    // Stop and clear remote video
    if (remoteVideo) {
        remoteVideo.pause();
        remoteVideo.srcObject = null;
        remoteVideo.load();
    }

    document.getElementById('startVideoCall').style.display = 'block';
    document.getElementById('endVideoCall').style.display = 'none';
    updateConnectionStatus('Not connected');
    isCallActive = false;

    // Notify other player
    socket.emit('videoCallEnd', {
        gameId: currentGameId,
        playerId: myPlayerId
    });
}

// Update connection status display
function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.textContent = status;
    }
}

// Video chat UI event listeners
function setupVideoChatUI() {
    console.log('setupVideoChatUI called');
    const startVideoCallBtn = document.getElementById('startVideoCall');
    const endVideoCallBtn = document.getElementById('endVideoCall');

    console.log('startVideoCallBtn:', startVideoCallBtn, 'endVideoCallBtn:', endVideoCallBtn);

    // Initialize PeerJS on load
    if (!peer) {
        console.log('Initializing PeerJS from setupVideoChatUI');
        initializePeerJS();
    }

    if (startVideoCallBtn) {
        startVideoCallBtn.addEventListener('click', startVideoCall);
        console.log('Added click listener to startVideoCallBtn');
    } else {
        console.log('startVideoCallBtn not found');
    }

    if (endVideoCallBtn) {
        endVideoCallBtn.addEventListener('click', endVideoCall);
    }

    console.log('Setting up socket event listeners for video call');
}

// Set up socket event listeners globally (not inside setupVideoChatUI)
socket.on('videoCallRequest', async (data) => {
    console.log('=== CLIENT: Received videoCallRequest event ===', data);
    console.log('myPlayerId:', myPlayerId, 'isCallActive:', isCallActive);
    if (data.playerId !== myPlayerId && !isCallActive) {
        console.log('CLIENT: Processing call request from:', data.playerId);
        // Store caller's peer ID
        opponentPeerId = data.peerId;
        
        // Get our stream and call them back
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = localStream;

            updateConnectionStatus('Connecting...');

            // Call the caller back
            if (peer && opponentPeerId) {
                console.log('Calling back:', opponentPeerId);
                const call = peer.call(opponentPeerId, localStream);
                videoCall = call;
                handleCall(call);
            } else {
                console.error('Cannot call back - peer or opponentPeerId missing', { peer: !!peer, opponentPeerId });
            }

            document.getElementById('startVideoCall').style.display = 'none';
            document.getElementById('endVideoCall').style.display = 'block';
            isCallActive = true;
        } catch (err) {
            console.error('Error getting media for incoming call:', err);
            updateConnectionStatus('Error: Camera access denied');
        }
    } else {
        console.log('CLIENT: Ignoring call request - from self or already active');
    }
});

socket.on('videoCallEnd', (data) => {
    console.log('Video call ended by:', data.playerId);
    if (data.playerId !== myPlayerId) {
        endVideoCall();
    }
});

socket.on('peerIdShare', (data) => {
    console.log('Received peer ID from:', data.playerId, 'peer:', data.peerId);
    if (data.playerId !== myPlayerId) {
        opponentPeerId = data.peerId;
    }
});

socket.on('requestPeerId', (data) => {
    console.log('Peer ID requested by:', data.playerId);
    if (data.playerId !== myPlayerId && myPeerId) {
        socket.emit('peerIdShare', {
            gameId: currentGameId,
            playerId: myPlayerId,
            peerId: myPeerId
        });
    }
});

// Setup video chat UI when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVideoChatUI);
} else {
    setupVideoChatUI();
}