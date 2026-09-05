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

// Console commands to load minigames directly in the same page
// Usage in browser console: loadBlackjack(), loadBaccarat(), loadRoulette(), loadPoker(), loadSlots(), loadCraps()
window.loadBlackjack = function() {
    loadMinigameInOverlay('/BlackJack/index.html');
    return 'Blackjack loading...';
};

window.loadBaccarat = function() {
    loadMinigameInOverlay('/Baccarat/index.html');
    return 'Baccarat loading...';
};

window.loadRoulette = function() {
    loadMinigameInOverlay('/Roulette/index.html');
    return 'Roulette loading...';
};

window.loadPoker = function() {
    loadMinigameInOverlay('/PokerFP/index.html');
    return 'Poker loading...';
};

window.loadSlots = function() {
    loadMinigameInOverlay('/slotMachine/index.html');
    return 'Slots loading...';
};

window.loadCraps = function() {
    loadMinigameInOverlay('/Craps/index.html');
    return 'Craps loading...';
};

function loadMinigameInOverlay(url) {
    // Extract game name from URL to use the proper casino modal
    const gameNameMatch = url.match(/\/([^\/]+)\/index\.html/);
    const gameName = gameNameMatch ? gameNameMatch[1] : 'BlackJack';
    
    // Get current player balance from game state
    const playerBalance = window.playerMoney || 2500;
    
    // Use the same casino modal system as the actual popup
    openCasinoGame(gameName, playerBalance);
}


const SOCKET_SERVER_URL = getConfiguredSocketServerUrl();
const socket = io(SOCKET_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
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
let activeCasinoBalanceSync = null;
let isSpectator = false;
let spectatorName = null;
let isAiVsAiGame = false;
let activeAiLandingPlayerId = null;
let observerCasinoStartBalance = null;
let activePlayerCasinoGame = null; // Track if human player is actively playing casino
let casinoPlayCounts = {}; // Track how many times each player has played casino (max 5 for humans, 3 for AI)
let manuallyOpenedModal = false; // Track if property modal was opened by manual click
let aiMoves = []; // Track last 5 AI moves
let aiMovesEl = null; // DOM element for AI moves display

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
        // console.log(`[DiceRollSeq:${playerName}] ${message}`);
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
    { name: 'Burger', model: getModelPath('/Models/Cheeseburger/cheeseburger.glb'), image: '/tokenimages/burger.png', scale: 0.42 },
    { name: 'Football', model: getModelPath('/Models/Football/football.glb'), image: '/tokenimages/football.png', scale: 0.03 },
    { name: 'Helicopter', model: getModelPath('/Models/Helicopter/helicopter.glb'), image: '/tokenimages/helicopter.png', scale: 0.002 },
    { name: 'Rolls Royce', model: getModelPath('/Models/RollsRoyce/rollsRoyceCarAnim.glb'), image: '/tokenimages/rolls_royce.png', scale: 0.14, facingOffset: Math.PI / 2 },
    { name: 'Shoe', model: getModelPath('/Models/Shoe/shoe.glb'), image: '/tokenimages/shoe.png', scale: 0.25 },
    { name: 'Top Hat', model: getModelPath('/Models/TopHat/tophat.glb'), image: '/tokenimages/top_hat.png', scale: 0.22 },
    { name: 'White Girl', model: getModelPath('/Models/WhiteGirlIdle/Standing Idle.fbx'), walkModel: getModelPath('/Models/WhiteGirlWalk/Walking.fbx'), image: '/tokenimages/woman_model.png', scale: 0.06 },
    { name: 'Coffee Cup', model: getModelPath('/Models/CoffeeCup/coffee.gltf'), image: '/tokenimages/coffee.png', scale: 0.25 }
];

// Track last played videos for each tile to prevent repeats
const lastPlayedPropertyVideos = {};

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

// Helper function to get local path from CDN path
function getLocalPath(cdnPath) {
    // If it's already a local path, return it
    if (cdnPath.startsWith('/Models')) {
        return cdnPath;
    }
    // Otherwise, extract the model name and construct local path
    const parts = cdnPath.split('/');
    const modelName = parts[parts.length - 1];
    return `/Models/${modelName}`;
}

// Dice initialization (no longer needed - procedurally generated)

// Dice roll sound (Web Audio API)
function playDiceRollSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const rollMs = getDiceRollDurationMs();
        const clatterCount = Math.max(6, Math.floor(rollMs / 280));

        // Randomize rumble characteristics
        const rumbleOsc = audioContext.createOscillator();
        const rumbleGain = audioContext.createGain();
        rumbleOsc.type = Math.random() > 0.5 ? 'triangle' : 'sawtooth';
        const baseFreq = 150 + Math.random() * 60;
        rumbleOsc.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
        rumbleOsc.frequency.exponentialRampToValueAtTime(40 + Math.random() * 20, audioContext.currentTime + rollMs / 1000);
        rumbleGain.gain.setValueAtTime(0.18 + Math.random() * 0.08, audioContext.currentTime);
        rumbleGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + rollMs / 1000);
        rumbleOsc.connect(rumbleGain);
        rumbleGain.connect(audioContext.destination);
        rumbleOsc.start();
        rumbleOsc.stop(audioContext.currentTime + rollMs / 1000);

        for (let i = 0; i < clatterCount; i++) {
            setTimeout(() => {
                const clickOsc = audioContext.createOscillator();
                const clickGain = audioContext.createGain();
                clickOsc.type = Math.random() > 0.3 ? 'square' : 'triangle';
                clickOsc.frequency.setValueAtTime(200 + Math.random() * 500, audioContext.currentTime);
                clickGain.gain.setValueAtTime(0.06 + Math.random() * 0.08, audioContext.currentTime);
                clickGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05 + Math.random() * 0.03);
                clickOsc.connect(clickGain);
                clickGain.connect(audioContext.destination);
                clickOsc.start();
                clickOsc.stop(audioContext.currentTime + 0.05 + Math.random() * 0.03);
            }, i * (rollMs / clatterCount) * (0.7 + Math.random() * 0.3));
        }
    } catch (e) {
        // console.log('Could not play dice sound:', e);
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
    const size = DICE_GLB_CONFIG.scale;
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
    if (diceFadeAnimFrame) {
        cancelAnimationFrame(diceFadeAnimFrame);
        diceFadeAnimFrame = null;
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
                // Pause for 5 seconds so players can see dice result before UI opens
                const fadeTick = runDiceFadeOutAnimation(
                    [dice1Mesh, dice2Mesh],
                    150,
                    () => { diceFadeAnimFrame = null; }
                );
                if (fadeTick) {
                    function animateFade(now) {
                        if (fadeTick && fadeTick(now)) {
                            diceFadeAnimFrame = requestAnimationFrame(animateFade);
                        } else {
                            diceFadeAnimFrame = null;
                        }
                    }
                    diceFadeAnimFrame = requestAnimationFrame(animateFade);
                }
                if (callbacks && typeof callbacks.onLand === 'function') {
                    callbacks.onLand();
                }
            }, 5000);
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
let diceFadeAnimFrame = null;
const revealedPlayerIds = new Set();
const tokenAnimatingIds = new Set();
const tokenAnimationHandles = {};
const pendingRollTokenMoves = {};
const TOKEN_STEP_DURATION_MS = typeof getTokenStepDurationMs === 'function'
    ? getTokenStepDurationMs()
    : 80;

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

function executePendingRollMove(pending) {
    if (!pending || pending.cancelled || pending.moveStarted) return;
    const move = pending.playerMoveData;
    if (!move) return;

    pending.moveStarted = true;
    pending.playerMoveData = null;

    const { playerId: movePlayerId, oldPosition: moveOldPosition, newPosition: moveNewPosition, direction } = move;
    const player = players.find(p => p && p.id === movePlayerId);
    const afterMove = () => {
        handlePlayerLanding(movePlayerId, moveNewPosition);
        if (typeof pending.onComplete === 'function') {
            pending.onComplete();
        }
    };

    if (!player) {
        afterMove();
        return;
    }

    if (moveOldPosition !== moveNewPosition) {
        player.position = moveOldPosition;
        animateTokenMove(movePlayerId, moveOldPosition, moveNewPosition, afterMove, direction);
    } else {
        player.position = moveNewPosition;
        update3DTokenPositions();
        afterMove();
    }

    updateTokens();

    const spaceName = boardConfig[moveNewPosition]?.name || 'unknown space';
    addLogEntry(`${getPlayerDisplayName(player)} moved to ${spaceName}`, 'player');
    if (player.isAI) {
        addAiMove(getPlayerDisplayName(player), 'moved to', spaceName);
    }
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

// Modal elements (initialized after DOM is ready)
let propertyModal = null;
let gameOverModal = null;
let gameOverTitle = null;
let gameOverContent = null;
let cardModal = null;
let cardTitle = null;
let cardContent = null;
let cardOkBtn = null;
let confirmTokenBtn = null;
let themeToggle = null;
let settingsBtn = null;
let settingsModal = null;
let settingsModalClose = null;

// Video cleanup
let currentPropertyVideo = null;
let pendingPropertyVideo = null;
let propertyMediaSession = 0;
let currentPropertyMediaPosition = null;

function stopVideoElement(video) {
    if (!video) return;
    if (video.id === 'localVideo' || video.id === 'remoteVideo') return;
    video._intentionalStop = true;

    try {
        video.pause();
        video.autoplay = false;
        video.muted = true;
        video.removeAttribute('src');
        video.querySelectorAll('source').forEach(source => source.remove());
        if (video.parentNode) {
            video.parentNode.removeChild(video);
        }
    } catch (e) {
        console.error('Error stopping video:', e);
    }
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
            // Stop hover videos immediately when settings modal opens
            if (typeof hideTileHoverImmediately === 'function') {
                hideTileHoverImmediately();
            }
            settingsModal.classList.remove('hidden');
        });
    }

    if (settingsModalClose) {
        settingsModalClose.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    // Close modal when clicking outside
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.add('hidden');
            }
        });
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode';
    }
}

// Token selection state
let pendingTokenSelection = null;

// Board configuration - Las Vegas Monopoly themed
const boardConfig = [
    { name: 'GO', type: 'corner', position: 0 },
    { name: 'Las Vegas Raiders', type: 'property', color: '#8B4513', price: 140, rent: [17, 85, 255, 765, 1360, 2125], position: 1, address: '3333 Al Davis Way, Las Vegas, NV 89118 (Allegiant Stadium)' },
    { name: 'Community Cards', type: 'community-chest', position: 2 },
    { name: 'Las Vegas Grand Prix', type: 'property', color: '#8B4513', price: 120, rent: [15, 75, 225, 675, 1200, 1875], position: 3, address: '7000 Las Vegas Blvd N, Las Vegas, NV 89115 (Las Vegas Motor Speedway)' },
    { name: 'Income Tax', type: 'tax', amount: 150, position: 4 },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 150, rent: [25, 50, 100, 200], position: 5, address: '2535 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Speed Vegas Off Roading', type: 'property', color: '#87CEEB', price: 150, rent: [25, 50, 150, 450, 625, 750], position: 6, address: '14200 S Las Vegas Blvd, Las Vegas, NV 89054 (SPEEDVEGAS)' },
    { name: 'Chance', type: 'chance', position: 7 },
    { name: 'Las Vegas Golden Knights', type: 'property', color: '#87CEEB', price: 165, rent: [28, 55, 165, 495, 700, 850], position: 8, address: '3780 S Las Vegas Blvd, Las Vegas, NV 89158 (T-Mobile Arena)' },
    { name: 'Maverick Helicopter Rides', type: 'property', color: '#87CEEB', price: 192, rent: [32, 65, 195, 580, 800, 950], position: 9, address: '6075 S Las Vegas Blvd, Las Vegas, NV 89119' },
    { name: 'JAIL', type: 'corner', position: 10, address: 'Jail Square' },
    { name: 'Brothel', type: 'property', color: '#FF69B4', price: 120, rent: [20, 40, 120, 360, 500, 600], position: 11, address: 'Nevada Brothel' },
    { name: 'Electric Company', type: 'utility', price: 100, position: 12 },
    { name: 'Bet MGM', type: 'property', color: '#FF69B4', price: 210, rent: [35, 70, 210, 630, 875, 1050], position: 13, address: '3799 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 150, rent: [25, 50, 100, 200], position: 14, address: '2535 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Bellagio', type: 'property', color: '#FFA500', price: 240, rent: [40, 80, 240, 720, 1000, 1200], position: 15, address: '3600 S Las Vegas Blvd, Las Vegas, NV 89115', isCasino: true, casinoGame: 'PokerFP' },
    { name: 'Las Vegas Aces', type: 'property', color: '#FFA500', price: 180, rent: [30, 60, 180, 540, 750, 900], position: 16, address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119 (Michelob ULTRA Arena)' },
    { name: 'Community Cards', type: 'community-chest', position: 17 },
    { name: 'Horseback Riding', type: 'property', color: '#FF0000', price: 156, rent: [26, 52, 156, 468, 650, 780], position: 18, address: 'Red Rock Canyon National Conservation Area, Las Vegas, NV' },
    { name: 'Resorts World Theatre', type: 'property', color: '#FF0000', price: 210, rent: [35, 70, 210, 630, 875, 1050], position: 19, address: '3000 S Las Vegas Blvd, Las Vegas, NV 89109 (Resorts World)' },
    { name: 'FREE PARKING', type: 'corner', position: 20 },
    { name: 'Hard Rock Hotel', type: 'property', color: '#FFFF00', price: 168, rent: [28, 56, 168, 504, 700, 840], position: 21, address: '3400 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'slotMachine' },
    { name: 'Chance', type: 'chance', position: 22 },
    { name: 'Wynn Las Vegas', type: 'property', color: '#FFFF00', price: 192, rent: [32, 65, 195, 580, 800, 950], position: 23, address: '3131 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'Roulette' },
    { name: 'County Fair', type: 'property', color: '#FFFF00', price: 180, rent: [30, 60, 180, 540, 750, 900], position: 24, address: '1301 W Whipple Ave, Logandale, NV 89021' },
    { name: 'Shriners Children\'s Open', type: 'property', color: '#008000', price: 192, rent: [32, 65, 195, 580, 800, 950], position: 25, address: '1700 Village Center Circle Las Vegas NV 89134' },
    { name: 'Las Vegas Little White Wedding Chapel', type: 'property', color: '#008000', price: 210, rent: [35, 70, 210, 630, 875, 1050], position: 26, address: '1301 Las Vegas Blvd S, Las Vegas, NV 89104 (Little White Wedding Chapel)' },
    { name: 'Community Cards', type: 'community-chest', position: 27 },
    { name: 'Sphere', type: 'property', color: '#008000', price: 240, rent: [40, 80, 240, 720, 1000, 1200], position: 28, address: '255 Sands Ave, Las Vegas, NV 89169 (The Sphere)' },
    { name: 'Water Works', type: 'utility', price: 120, position: 29 },
    { name: 'GO TO JAIL', type: 'corner', position: 30 },
    { name: 'Caesars Palace', type: 'property', color: '#0000FF', price: 252, rent: [42, 84, 252, 756, 1050, 1260], position: 31, address: '3570 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'BlackJack' },
    { name: 'Santa Fe Hotel and Casino', type: 'property', color: '#0000FF', price: 210, rent: [35, 70, 210, 630, 875, 1050], position: 32, address: '4949 N Rancho Dr, Las Vegas, NV 89130', isCasino: true, casinoGame: 'Craps' },
    { name: 'Luxury Tax', type: 'tax', amount: 75, position: 33 },
    { name: 'Chance', type: 'chance', position: 34 },
    { name: 'House of Blues', type: 'property', color: '#0000FF', price: 180, rent: [30, 60, 180, 540, 750, 900], position: 35, address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119 (inside Mandalay Bay)' },
    { name: 'Venetian', type: 'property', color: '#4B0082', price: 240, rent: [40, 80, 240, 720, 1000, 1200], position: 36, address: '3355 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'Baccarat' },
    { name: 'The Cosmopolitan', type: 'property', color: '#4B0082', price: 210, rent: [35, 70, 210, 630, 875, 1050], position: 37, address: '3708 S Las Vegas Blvd, Las Vegas, NV 89109', isCasino: true, casinoGame: 'Roulette' },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 150, rent: [25, 50, 100, 200], position: 38, address: '2535 S Las Vegas Blvd, Las Vegas, NV 89109' },
    { name: 'Speed Vegas Off Roading', type: 'property', color: '#4B0082', price: 165, rent: [28, 55, 165, 495, 700, 850], position: 39, address: '14200 S Las Vegas Blvd, Las Vegas, NV 89054 (SPEEDVEGAS)' }
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
        manuallyOpenedModal = true;
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
    console.log('[handlePlayerLanding] Called - playerId:', playerId, 'newPosition:', newPosition, 'gameState.diceRolled:', gameState?.diceRolled, 'currentPlayer:', gameState?.currentPlayer, 'myPlayerId:', myPlayerId);
    // Show property info for spaces with media, properties, or jail (only for human player)
    // Skip chance, community chest, tax, and other special spaces that have their own UI
    // Also skip if modal was already opened manually by clicking on the square
    // Skip if property is owned (rent UI will be shown separately)
    const spaceData = boardConfig[newPosition];
    if (spaceData && playerId === myPlayerId && !manuallyOpenedModal) {
        const hasMedia = tileHasLandingMedia(newPosition);
        const isProperty = spaceData.type === 'property' || spaceData.type === 'railroad' || spaceData.type === 'utility';
        const isJail = newPosition === 10 || newPosition === 30;
        const isSpecialSpace = spaceData.type === 'chance' || spaceData.type === 'community-chest' || spaceData.type === 'tax';

        // Check if property is owned by another player (rent situation)
        const owner = players.find(p => p && p.properties && p.properties.includes(newPosition) && p.id !== playerId);
        const isOwned = !!owner;

        if ((hasMedia || isProperty || isJail) && !isSpecialSpace && !isOwned) {
            showPropertyInfo(spaceData);
        }
    }

    // Reset manual flag after landing
    manuallyOpenedModal = false;

    // Show jail proceed UI specifically for the current player (only for visiting jail, not go to jail)
    // Only show if this is not a "send to jail" situation (which happens from position 30)
    if (newPosition === 10) {
        const player = players.find(p => p && p.id === playerId);
        // Only show proceed UI if player is not already in jail (meaning they just visited)
        // If they're already in jail, it means they were sent there and their turn is already handled
        if (player && !player.inJail && playerId === myPlayerId) {
            showJailProceedUI(newPosition);
        }
    }

    // GO / Free Parking have no buy/rent UI — show Proceed so the turn can end
    if ((newPosition === 0 || newPosition === 20) && playerId === myPlayerId) {
        showJailProceedUI(newPosition);
    }

    // Show buy modal for unowned properties (this will show after property modal)
    if (playerId === myPlayerId) {
        const spaceData = getUnownedPurchasableSpace(newPosition);
        if (spaceData) {
            startPropertyDecision(spaceData, newPosition);
        } else {
            // Check if landing on a casino property (owned or unowned)
            const casinoSpace = boardConfig[newPosition];
            if (casinoSpace && casinoSpace.isCasino && !currentPlayer.isAI) {
                // Open casino game for owned casino properties
                const playerId = currentPlayer.id || myPlayerId;
                if (!casinoPlayCounts[playerId]) {
                    casinoPlayCounts[playerId] = 0;
                }

                if (casinoPlayCounts[playerId] >= 5) {
                    alert('You have reached the maximum of 5 casino plays per game.');
                } else {
                    casinoPlayCounts[playerId]++;
                    openCasinoGame(casinoSpace.casinoGame);
                }
            }
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

function getStoredSpectatorUid() {
    return sessionStorage.getItem('metropoly_spectator_uid');
}

function isSpectatorSession() {
    return sessionStorage.getItem('metropoly_is_spectator') === '1'
        || new URLSearchParams(window.location.search).get('spectate') === '1';
}

function persistSpectatorIdentity(gameId, uid, name) {
    sessionStorage.setItem('metropoly_is_spectator', '1');
    sessionStorage.removeItem('metropoly_player_uid');
    if (gameId) sessionStorage.setItem('metropoly_game_id', gameId);
    if (uid) sessionStorage.setItem('metropoly_spectator_uid', uid);
    if (name) sessionStorage.setItem('metropoly_spectator_name', name);
}

function applySpectatorModeUI() {
    document.body.classList.add('spectator-mode');
    const label = spectatorName || 'Spectator';
    if (playerNameEl) playerNameEl.textContent = `${label} (Watching)`;
    if (playerMoneyEl) playerMoneyEl.textContent = '—';

    const rollDiceBtn = document.getElementById('rollDiceBtn');
    const endTurnBtn = document.getElementById('endTurnBtn');
    if (rollDiceBtn) rollDiceBtn.disabled = true;
    if (endTurnBtn) endTurnBtn.disabled = true;
}

function hydrateSpectatorFromJoinData(data) {
    isSpectator = true;
    myPlayerId = null;
    currentPlayer = null;
    isAiVsAiGame = Boolean(
        data.isAiVsAi || sessionStorage.getItem('metropoly_ai_vs_ai') === '1'
    );
    spectatorName = data.spectatorName || sessionStorage.getItem('metropoly_spectator_name') || 'Spectator';
    players = data.players || [];
    gameState = data.gameState || null;
    if (data.gameId) currentGameId = data.gameId;
    if (data.spectatorUid) {
        persistSpectatorIdentity(data.gameId, data.spectatorUid, spectatorName);
    }
    applySpectatorModeUI();
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
    if (gameState.diceRolled === undefined || !gameState.diceRolled) return false;
    if (waitingForBuyResult) return false;
    return true;
}

function hidePropertyActionButtons() {
    const propertyActions = document.getElementById('propertyActions');
    const propertyConfirmBtn = document.getElementById('propertyConfirmBtn');
    const propertyPassBtn = document.getElementById('propertyPassBtn');
    const propertyProceedBtn = document.getElementById('propertyProceedBtn');
    if (propertyActions) propertyActions.classList.add('hidden');
    if (propertyConfirmBtn) propertyConfirmBtn.classList.remove('hidden');
    if (propertyPassBtn) propertyPassBtn.classList.remove('hidden');
    if (propertyProceedBtn) propertyProceedBtn.classList.add('hidden');
}

function showJailProceedUI(position) {
    const spaceData = boardConfig[position];
    if (!spaceData) return;
    showPropertyInfo(spaceData, { showProceedButton: true });
}

function handleJailProceed() {
    console.log('[handleJailProceed] Called - gameState.diceRolled:', gameState?.diceRolled, 'currentPlayer:', gameState?.currentPlayer, 'myPlayerId:', myPlayerId);
    // Stop any playing video/audio before proceeding
    if (currentPropertyVideo) {
        stopVideoElement(currentPropertyVideo);
        currentPropertyVideo = null;
    }
    cleanupPropertyVideo();
    dismissPropertyDecisionUI();
    if (gameState && gameState.currentPlayer === myPlayerId) {
        // Ensure we can actually end the turn
        if (canEndTurnNow()) {
            endTurnNow();
        } else {
            console.log('[handleJailProceed] Cannot end turn - canEndTurnNow returned false');
        }
    }
}

function dismissPropertyDecisionUI() {
    clearPropertyDecisionTimer();
    activePropertyDecision = null;
    waitingForBuyResult = false;
    hidePropertyActionButtons();
    const decisionPrompt = document.getElementById('propertyDecisionPrompt');
    if (decisionPrompt) {
        decisionPrompt.classList.add('hidden');
        decisionPrompt.textContent = '';
    }
    activeAiLandingPlayerId = null;
    cleanupPropertyVideo(); // Ensure video stops when dismissing decision UI
    
    // Stop hover videos immediately when dismissing UI
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }
    
    closePropertyModal();
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
        if (gameState.diceRolled === undefined || !gameState.diceRolled) return;
        if (activePropertyDecision || waitingForBuyResult) return;
        endTurnNow();
    }, delay);
}

function getSpaceTypeLabel(type) {
    if (type === 'railroad') return 'Railroad';
    if (type === 'utility') return 'Utility';
    if (type === 'property') return 'Property';
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
}

function updatePropertyDecisionUI() {
    if (!activePropertyDecision) return;
    const propertyActions = document.getElementById('propertyActions');
    const propertyConfirmBtn = document.getElementById('propertyConfirmBtn');
    const propertyPassBtn = document.getElementById('propertyPassBtn');
    const propertyPayRentBtn = document.getElementById('propertyPayRentBtn');
    const decisionPrompt = document.getElementById('propertyDecisionPrompt');
    if (!propertyActions || !propertyConfirmBtn || !propertyPassBtn || !propertyPayRentBtn) return;

    const isRentDecision = activePropertyDecision.isRent;
    const canAfford = currentPlayer && currentPlayer.money >= activePropertyDecision.spaceData.price;
    const isCasino = activePropertyDecision.spaceData.isCasino;
    const spaceData = activePropertyDecision.spaceData;
    const typeLabel = getSpaceTypeLabel(spaceData.type);

    let confirmLabel = `Buy ${typeLabel}`;
    let passLabel = 'Pass';
    let promptText = canAfford
        ? `Buy this ${typeLabel.toLowerCase()} or pass.`
        : 'Not enough money to buy. Pass to continue.';
    let confirmHandler = null;

    if (isRentDecision) {
        const owner = activePropertyDecision.owner;
        const rent = calculateRentAmount(spaceData, owner, activePropertyDecision.rentAmount, activePropertyDecision.diceRoll);
        confirmLabel = 'Pay Rent';
        passLabel = 'Pass';
        promptText = `Owned by ${owner.name}. Pay $${rent} to continue.`;
        
        // Update the Pay Rent button specifically
        if (propertyPayRentBtn) {
            propertyPayRentBtn.textContent = `Pay Rent ($${rent})`;
            propertyPayRentBtn.onclick = () => {
                if (currentPlayer && currentPlayer.money >= rent) {
                    // Stop any playing video/audio before paying rent
                    if (currentPropertyVideo) {
                        stopVideoElement(currentPropertyVideo);
                        currentPropertyVideo = null;
                    }
                    cleanupPropertyVideo();
                    socket.emit('payRent', { position: activePropertyDecision.position, amount: rent });
                    dismissPropertyDecisionUI();
                    endTurnNow();
                } else {
                    alert('Not enough money to pay rent!');
                }
            };
        }
        
        // Hide the confirm button when in rent mode
        if (propertyConfirmBtn) propertyConfirmBtn.classList.add('hidden');
        if (propertyPassBtn) propertyPassBtn.classList.add('hidden');
        if (propertyPayRentBtn) propertyPayRentBtn.classList.remove('hidden');
    } else {
        confirmHandler = () => {
            if (canAfford) {
                waitingForBuyResult = true;
                // Stop any playing video/audio
                if (currentPropertyVideo) {
                    stopVideoElement(currentPropertyVideo);
                    currentPropertyVideo = null;
                }
                cleanupPropertyVideo();
                socket.emit('buyProperty', { position: activePropertyDecision.position });
                dismissPropertyDecisionUI();
                // Auto-end turn after buying (including casino properties)
                setTimeout(() => {
                    if (gameState && gameState.currentPlayer === myPlayerId) {
                        endTurnNow();
                    }
                }, 500);
            } else {
                alert(`Not enough money to buy this ${typeLabel.toLowerCase()}.`);
            }
        };
    }

    if (decisionPrompt) {
        decisionPrompt.textContent = promptText;
        decisionPrompt.classList.remove('hidden');
    }

    if (!isRentDecision) {
        propertyConfirmBtn.textContent = confirmLabel;
        propertyPassBtn.textContent = passLabel;
        propertyConfirmBtn.onclick = confirmHandler;
        propertyPassBtn.onclick = () => {
            if (!activePropertyDecision) return;
            // Stop any playing video/audio before passing
            if (currentPropertyVideo) {
                stopVideoElement(currentPropertyVideo);
                currentPropertyVideo = null;
            }
            cleanupPropertyVideo();
            socket.emit('passProperty', { position: activePropertyDecision.position });
            dismissPropertyDecisionUI();
        };
    }
    
    propertyActions.classList.remove('hidden');
}

function createCasinoBalanceSync(startingMoney) {
    let lastSyncedBalance = startingMoney;
    return function syncCasinoBalance(balance) {
        if (!socket || typeof balance !== 'number' || Number.isNaN(balance)) return;

        const moneyDiff = balance - lastSyncedBalance;
        if (moneyDiff === 0) return;

        lastSyncedBalance = balance;
        socket.emit('casinoWinnings', { amount: moneyDiff });

        const localPlayer = resolveLocalPlayer(players);
        if (localPlayer) {
            localPlayer.money = (localPlayer.money ?? startingMoney) + moneyDiff;
            if (currentPlayer && currentPlayer.id === localPlayer.id) {
                currentPlayer.money = localPlayer.money;
            }
        }

        const label = moneyDiff > 0 ? `Casino win: +$${moneyDiff}` : `Casino loss: -$${Math.abs(moneyDiff)}`;
        addLogEntry(label, 'system');
        updateUI();
    };
}

function flushCasinoBalanceFromIframe(casinoContainer) {
    if (!activeCasinoBalanceSync || !casinoContainer) return;
    try {
        const iframe = casinoContainer.querySelector('iframe');
        const win = iframe?.contentWindow;
        if (!win) return;

        const exposedBalance = win.__casinoBalance ?? win.playerBalance ?? win.playerMoney ?? win.playerBankroll;
        if (typeof exposedBalance === 'number' && !Number.isNaN(exposedBalance)) {
            activeCasinoBalanceSync(exposedBalance);
        }
    } catch (e) {
        // Cross-origin or teardown race — balance already synced via callback when possible
    }
}

function finishLandingDecisionUI() {
    if (!activePropertyDecision) return;

    showPropertyInfo(activePropertyDecision.spaceData, { showDecisionActions: true });
    updatePropertyDecisionUI();
}

function openLandingPropertyModal(spaceData) {
    const isRent = activePropertyDecision && activePropertyDecision.isRent;
    showPropertyInfo(spaceData, { showDecisionActions: true, isRent });
    updatePropertyDecisionUI();
}

function beginLandingDecision({ spaceData, position, isRent = false, owner = null, rentAmount = null, diceRoll = null }) {
    if (!spaceData || isSpectator) return;
    if (!currentPlayer) return;
    cancelClientAutoEndTurn();
    clearPropertyDecisionTimer();
    waitingForBuyResult = false;
    activePropertyDecision = { spaceData, position, isRent, owner, rentAmount, diceRoll };

    if (spaceData.isCasino && !currentPlayer.isAI) {
        // Check casino play count limit (max 5 times per player for humans)
        const playerId = currentPlayer.id || myPlayerId;
        if (!casinoPlayCounts[playerId]) {
            casinoPlayCounts[playerId] = 0;
        }

        if (casinoPlayCounts[playerId] >= 5) {
            alert('You have reached the maximum of 5 casino plays per game.');
            openLandingPropertyModal(spaceData);
            return;
        }

        // Increment play count
        casinoPlayCounts[playerId]++;
        
        if (propertyModal) propertyModal.classList.add('hidden');
        cleanupPropertyVideo();
        openCasinoGame(spaceData.casinoGame);
    } else {
        openLandingPropertyModal(spaceData);
    }

    updateUI();
}

function startPropertyDecision(spaceData, position) {
    if (!spaceData || !currentPlayer) return;
    beginLandingDecision({ spaceData, position, isRent: false });
}

function startRentDecision(ownedData, position) {
    if (!ownedData || !currentPlayer) return;
    beginLandingDecision({
        spaceData: ownedData.spaceData,
        position,
        isRent: true,
        owner: ownedData.owner,
        rentAmount: ownedData.rentAmount,
        diceRoll: ownedData.diceRoll
    });
}

function calculateRentAmount(spaceData, owner, serverRentAmount = null, diceRoll = null) {
    // If server provided rent amount (important for utilities), use it
    if (serverRentAmount !== null && serverRentAmount !== undefined) {
        console.log('[calculateRentAmount] Using server rent amount:', serverRentAmount);
        return serverRentAmount;
    }
    
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
    
    // For utilities, need dice roll multiplier (but server should provide this)
    if (spaceData.type === 'utility' && diceRoll) {
        rent = rent * diceRoll.total;
    }
    
    return rent;
}

// Root element each casino minigame expects when embedded in the main game iframe
const CASINO_GAME_CONTAINERS = {
    Baccarat: '.baccarat-container',
    BlackJack: '.blackjack-container',
    Craps: '.craps-game',
    PokerFP: '.poker-container',
    Roulette: '.main',
    slotMachine: '.slot-container'
};

function getCasinoGameContainer(doc, gameName) {
    const selector = CASINO_GAME_CONTAINERS[gameName];
    if (!selector || selector === 'body') return doc.body;
    return doc.querySelector(selector) || doc.body;
}

function getIframeCasinoBalance(iframe) {
    if (!iframe) return null;
    try {
        const win = iframe.contentWindow;
        const balance = win.__casinoBalance ?? win.playerBalance ?? win.playerBankroll;
        return (typeof balance === 'number' && !Number.isNaN(balance)) ? balance : null;
    } catch (e) {
        return null;
    }
}

function reportAiCasinoWinnings(iframe) {
    if (!activeAiLandingPlayerId || !currentGameId || observerCasinoStartBalance == null) return;

    const endBalance = getIframeCasinoBalance(iframe);
    if (typeof endBalance !== 'number') return;

    socket.emit('aiCasinoReport', {
        gameId: currentGameId,
        playerId: activeAiLandingPlayerId,
        winnings: Math.round(endBalance - observerCasinoStartBalance)
    });
}

function triggerObserverCasinoAutoPlay(iframe, gameName, iframeDoc) {
    if (!iframe || !iframeDoc) return;

    const click = (selector) => {
        const el = iframeDoc.querySelector(selector);
        if (el && !el.disabled) {
            el.click();
            return true;
        }
        return false;
    };

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const postPlayWait = {
        slotMachine: 6500,
        Roulette: 5000,
        BlackJack: 5500,
        Baccarat: 5500,
        PokerFP: 3500,
        Craps: 3500
    };

    (async () => {
        try {
            await delay(900);
            const win = iframe.contentWindow;

            switch (gameName) {
                case 'slotMachine':
                    click('#spinBtn');
                    break;
                case 'Roulette': {
                    const redCell = iframeDoc.querySelector('.number-cell[aria-label="1"]')
                        || iframeDoc.querySelector('.number-cell');
                    if (redCell) redCell.click();
                    await delay(400);
                    if (typeof win.spinWheel === 'function') {
                        win.spinWheel();
                    } else {
                        click('#spin-btn');
                    }
                    break;
                }
                case 'BlackJack':
                    click('#bet0') || click('.bet-square');
                    await delay(500);
                    click('#deal-btn');
                    await delay(2200);
                    click('#stand-btn');
                    break;
                case 'Baccarat':
                    click('.chip[data-value="50"]') || click('.chip');
                    await delay(300);
                    click('.bet-type[data-type="player"]');
                    await delay(300);
                    click('#deal-btn');
                    break;
                case 'PokerFP':
                    click('#btn-newgame');
                    await delay(1200);
                    click('#btn-check') || click('#btn-call');
                    break;
                case 'Craps':
                    if (typeof win.__crapsAutoPlay === 'function') {
                        win.__crapsAutoPlay(50);
                    }
                    break;
                default:
                    break;
            }

            await delay(postPlayWait[gameName] || 3000);
            reportAiCasinoWinnings(iframe);
        } catch (e) {
            console.warn('[Casino] Observer auto-play failed:', gameName, e);
        }
    })();
}

// Open casino game modal
function openCasinoGame(gameName, observerOptions = null) {
    const casinoModal = document.getElementById('casinoGameModal');
    const casinoTitle = document.getElementById('casinoGameTitle');
    const casinoContainer = document.getElementById('casinoGameContainer');
    const closeCasinoBtn = document.getElementById('closeCasinoBtn');

    if (!casinoModal || !casinoContainer) return;

    const isObserver = Boolean(observerOptions);
    const observePlayer = observerOptions?.player;
    const playerLabel = observerOptions?.playerLabel || 'AI';
    const playerMoney = observePlayer ? observePlayer.money : (currentPlayer ? currentPlayer.money : 2500);

    casinoTitle.textContent = isObserver
        ? `🎲 ${playerLabel} playing ${gameName}`
        : `Play ${gameName}`;

    if (closeCasinoBtn) {
        closeCasinoBtn.style.display = isObserver ? 'none' : '';
    }

    observerCasinoStartBalance = isObserver ? playerMoney : null;

    // Track if human player is actively playing
    if (!isObserver && currentPlayer) {
        activePlayerCasinoGame = gameName;
    }

    // Stop hover videos immediately when casino modal opens
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }

    // Load casino game in iframe with initialization parameters
    const gamePath = `/${gameName}/index.html?observer=${isObserver ? 'true' : 'false'}`;
    
    // Create iframe without src first to avoid race condition
    const iframe = document.createElement('iframe');
    iframe.className = 'casino-iframe';
    iframe.frameBorder = '0';
    
    casinoContainer.innerHTML = '';
    casinoContainer.appendChild(iframe);

    casinoModal.classList.remove('hidden');

    if (propertyModal) propertyModal.classList.add('hidden');
    cleanupPropertyVideo();

    // Listen for messages from the casino game iframe (only add listener once)
    if (!casinoMessageListenerAttached) {
        window.addEventListener('message', handleCasinoGameMessage);
        casinoMessageListenerAttached = true;
    }

    // Initialize the casino game with player money after iframe loads
    // Attach onload handler BEFORE setting src to ensure it always fires
    iframe.onload = function() {
        try {
            const iframeDoc = iframe.contentWindow.document;
            
            // Different scales for different games for individual sizing
            const gameScales = {
                'Roulette': 0.9,
                'BlackJack': 0.7,
                'Baccarat': 0.85,
                'Craps': 0.75,
                'PokerFP': 0.85,
                'slotMachine': 0.65
            };
            
            const scale = gameScales[gameName] || 0.85;
            
            const embedFit = iframeDoc.createElement('style');
            embedFit.textContent = `
                html, body {
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 0 !important;
                    max-height: 100% !important;
                    overflow: hidden !important;
                    box-sizing: border-box !important;
                }
                body {
                    margin: 0 !important;
                    padding: 8px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transform-origin: center center !important;
                    transform: scale(${scale}) !important;
                }
            `;
            iframeDoc.head.appendChild(embedFit);

            // Get the appropriate initialization function name based on game
            const initFunctionNames = {
                'Baccarat': 'initBaccaratMinigame',
                'BlackJack': 'initBlackjackMinigame',
                'Craps': 'initCrapsMinigame',
                'PokerFP': 'initPokerMinigame',
                'Roulette': 'initRouletteMinigame',
                'slotMachine': 'initSlotMachine'
            };

            const initFunctionName = initFunctionNames[gameName];
            const initFn = initFunctionName && iframe.contentWindow[initFunctionName];
            if (!initFn) {
                console.error('[Casino] Init function not found:', gameName, initFunctionName);
                return;
            }

            const container = getCasinoGameContainer(iframeDoc, gameName);
            if (!container) {
                console.error('[Casino] Container not found for:', gameName);
                return;
            }

            const syncCasinoBalance = function(balance) {
                try {
                    iframe.contentWindow.__casinoBalance = balance;
                } catch (e) {}

                if (isObserver) return;

                if (!activeCasinoBalanceSync) {
                    activeCasinoBalanceSync = createCasinoBalanceSync(playerMoney);
                }
                activeCasinoBalanceSync(balance);
            };

            if (!isObserver) {
                activeCasinoBalanceSync = createCasinoBalanceSync(playerMoney);
            } else {
                activeCasinoBalanceSync = null;
            }

            initFn(container, playerMoney, syncCasinoBalance);

            if (isObserver) {
                triggerObserverCasinoAutoPlay(iframe, gameName, iframeDoc);
            }
        } catch (e) {
            console.error('[Casino] Could not initialize casino game:', gameName, e);
        }
    };
    
    // Now set the src to start loading
    iframe.src = gamePath;
}

// Handle messages from casino game iframe
function handleCasinoGameMessage(event) {
    if (event.data && event.data.type === 'casinoGameClose') {
        // Only auto-close if it's an AI observer, not a human player actively playing
        if (activePlayerCasinoGame) {
            console.log('[Casino] Human player is actively playing, ignoring auto-close request');
            return;
        }
        closeCasinoGame();
    }
}

// Close casino game modal
function closeCasinoGame() {
    const casinoModal = document.getElementById('casinoGameModal');
    const casinoContainer = document.getElementById('casinoGameContainer');
    const closeCasinoBtn = document.getElementById('closeCasinoBtn');

    // Stop hover videos immediately when casino closes
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }

    if (activeCasinoBalanceSync) {
        flushCasinoBalanceFromIframe(casinoContainer);
    }
    activeCasinoBalanceSync = null;
    observerCasinoStartBalance = null;
    activePlayerCasinoGame = null; // Clear the active player casino game flag

    if (closeCasinoBtn) {
        closeCasinoBtn.style.display = '';
    }

    if (casinoModal) {
        casinoModal.classList.add('hidden');
    }

    if (casinoContainer) {
        casinoContainer.innerHTML = '';
    }

    if (!activeAiLandingPlayerId) {
        finishLandingDecisionUI();
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
            // console.log(`Walk model loaded for ${player.name}`);
            idleModel.walkModel = fbx;
            idleModel.walkAnimations = fbx.animations;
        },
        function(xhr) {
            if (xhr.lengthComputable) {
                const percentComplete = xhr.loaded / xhr.total * 100;
    // console.log(`Loading walk model: ${percentComplete.toFixed(2)}%`);
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
        // console.log(`No model found for token ${tokenIndex} - ${player.name}`);
        return;
    }

    // Check if already loading or loaded
    if (tokenLoading[player.id] || tokenModels[player.id]) {
        // console.log(`Model already loading or loaded for ${player.name}, skipping`);
        return;
    }

    tokenLoading[player.id] = true;
    // console.log(`Loading 3D model for ${player.name} from: ${tokenInfo.model}`);

    // Check file extension to determine loader
    const isFBX = tokenInfo.model.toLowerCase().endsWith('.fbx');

    // Get local path for fallback
    const getLocalPath = (cdnPath) => {
        // If CDN path, extract the local path by removing CDN base
        if (window.CDN_BASE_URL && cdnPath.includes(window.CDN_BASE_URL)) {
            return cdnPath.replace(window.CDN_BASE_URL, '/Models');
        }
        // Already local or unknown format, return as-is
        return cdnPath;
    };

    if (isFBX) {
        // Use FBX loader for FBX files
        const loader = new THREE.FBXLoader();
        const modelPath = tokenInfo.model;
        const localPath = getLocalPath(modelPath);
        
        const loadModel = (path) => {
            loader.load(path,
            function(fbx) {
            // console.log(`FBX model loaded for ${player.name}:`, fbx);

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
                    // console.log(`3D Token loaded and added to scene for ${player.name}`);

                    update3DTokenPositions();
                    updateTokenVisibility();
                }

                // Check if model has animations
                if (fbx.animations && fbx.animations.length > 0) {
                    // console.log(`FBX model has ${fbx.animations.length} animations`);
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
                console.error(`Error loading FBX model for ${player.name} from ${path}:`, error);
                // If CDN failed and this was CDN path, try local
                if (path !== localPath) {
                    console.log(`Falling back to local FBX model for ${player.name}...`);
                    loadModel(localPath);
                } else {
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
                    // console.log(`Created fallback token for ${player.name}`);
                    update3DTokenPositions();
                    updateTokenVisibility();
                }
            }
        );
        };
        
        loadModel(modelPath);
    } else {
        // Use GLTF loader for GLB/GLTF files
        const loader = new THREE.GLTFLoader();
        const modelPath = tokenInfo.model;
        const localPath = getLocalPath(modelPath);
        
        const loadModel = (path) => {
            loader.load(path,
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
    // console.log(`Loading ${tokenInfo.model}: ${percentComplete.toFixed(2)}%`);
                }
            },
            function(error) {
                console.error(`Error loading GLTF model for ${player.name} from ${path}:`, error);
                // If CDN failed and this was CDN path, try local
                if (path !== localPath) {
                    console.log(`Falling back to local GLTF model for ${player.name}...`);
                    loadModel(localPath);
                } else {
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
            }
        );
        };
        
        loadModel(modelPath);
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

function pickAlternatePropertyVideo(videos, position) {
    if (!videos || videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    const lastVideo = lastPlayedPropertyVideos[position];
    if (!lastVideo) {
        // First visit, return first video
        return videos[0];
    }

    // Find index of last played video
    const lastIndex = videos.indexOf(lastVideo);
    if (lastIndex === -1) {
        // Last video not in list (shouldn't happen), return first
        return videos[0];
    }

    // Return next video in array, wrapping around to start
    const nextIndex = (lastIndex + 1) % videos.length;
    return videos[nextIndex];
}

function applyMediaFrameOrientation(frame, element) {
    const w = element.videoWidth || element.naturalWidth;
    const h = element.videoHeight || element.naturalHeight;
    if (!w || !h) return;

    const ratio = w / h;
    frame.classList.remove('media-frame--portrait', 'media-frame--landscape', 'media-frame--square');

    if (ratio < 0.85) {
        frame.classList.add('media-frame--portrait');
    } else if (ratio > 1.15) {
        frame.classList.add('media-frame--landscape');
    } else {
        frame.classList.add('media-frame--square');
    }
}

function bindMediaFrameOrientation(frame, element) {
    const apply = () => applyMediaFrameOrientation(frame, element);
    if (element.tagName === 'VIDEO') {
        if (element.readyState >= 1) apply();
        else element.addEventListener('loadedmetadata', apply, { once: true });
    } else if (element.complete && element.naturalWidth) {
        apply();
    } else {
        element.addEventListener('load', apply, { once: true });
    }
}

function createMediaFrame(element) {
    const frame = document.createElement('div');
    frame.className = 'media-frame media-frame--landscape';
    frame.appendChild(element);
    bindMediaFrameOrientation(frame, element);
    return frame;
}

/*
// TEMP DEBUG — remove after diagnosing video load failures
function debugVideoAssignment(video, context) { ... }
function watchVideoSrcMutations(video, propertyName) { ... }
function logVideoLoadError(video, context) { ... }
*/
function debugVideoAssignment() {}
function watchVideoSrcMutations() { return { disconnect() {} }; }
function logVideoLoadError(video, context) {
    if (video && video._intentionalStop) return;
    const src = context.intendedSrc || video?.currentSrc || video?.src || 'unknown';
    console.error(`[Video Error] ${context.propertyName} - Failed to load video`, src);
}

function showPropertyImages(media, spaceData, mediaContainer, cacheKey) {
    console.log(`[showPropertyImages] Called for ${media.name}, images:`, media.images);
    if (!media.images || media.images.length === 0) {
        console.log(`[showPropertyImages] No images available for ${media.name}`);
        return false;
    }
    const randomImage = media.images[Math.floor(Math.random() * media.images.length)];
    console.log(`[Image Load] Loading image for ${media.name}:`, randomImage);

    mediaContainer.innerHTML = '';
    const img = document.createElement('img');
    img.src = randomImage;
    img.alt = media.name;
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    mediaContainer.appendChild(img);

    console.log(`[Image Load] Appended img to container for ${media.name}`);
    mediaCache[cacheKey] = mediaContainer.cloneNode(true);
    return true;
}

function closePropertyModal() {
    // Always cleanup videos, even for AI landing
    cleanupPropertyVideo();

    // Stop hover videos immediately when modal closes
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }

    // Hide decision prompt
    const decisionPrompt = document.getElementById('propertyDecisionPrompt');
    if (decisionPrompt) {
        decisionPrompt.classList.add('hidden');
        decisionPrompt.textContent = '';
    }
    const modal = propertyModal || document.getElementById('propertyModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function buildPropertyDetailsHtml(spaceData) {
    const owner = players.find(p => p && p.properties && p.properties.includes(spaceData.position));
    const isPurchasable = spaceData.type === 'property' || spaceData.type === 'railroad' || spaceData.type === 'utility';
    const isRentDecision = activePropertyDecision
        && activePropertyDecision.position === spaceData.position
        && activePropertyDecision.isRent;
    let html = '';

    if (isPurchasable) {
        html += '<div class="property-stat-grid">';
        if (isRentDecision) {
            const rent = calculateRentAmount(spaceData, activePropertyDecision.owner);
            html += `<div class="property-stat"><span class="property-stat-label">Rent Due</span><span class="property-stat-value property-stat-value--accent">$${rent}</span></div>`;
            html += `<div class="property-stat"><span class="property-stat-label">Owner</span><span class="property-stat-value">${activePropertyDecision.owner.name}</span></div>`;
        } else {
            html += `<div class="property-stat"><span class="property-stat-label">Price</span><span class="property-stat-value property-stat-value--accent">$${spaceData.price}</span></div>`;
            html += `<div class="property-stat"><span class="property-stat-label">Base Rent</span><span class="property-stat-value">$${spaceData.rent ? spaceData.rent[0] : 0}</span></div>`;
        }
        html += `<div class="property-stat"><span class="property-stat-label">Tile</span><span class="property-stat-value">#${spaceData.position}</span></div>`;
        html += `<div class="property-stat"><span class="property-stat-label">Status</span><span class="property-stat-value">${owner ? owner.name : 'Available'}</span></div>`;
        html += '</div>';
    } else if (spaceData.type === 'tax') {
        html += `<div class="property-stat"><span class="property-stat-label">Tax</span><span class="property-stat-value property-stat-value--accent">$${spaceData.amount}</span></div>`;
    }

    if (spaceData.address) {
        html += `<p class="property-detail-line">${spaceData.address}</p>`;
    }

    return html;
}

// Show property information
function showPropertyInfo(spaceData, options = {}) {
    const { showDecisionActions = false, showProceedButton = false, viewerLabel = null, isRent = false, isAI = false } = options;

    console.log(`[showPropertyInfo] Called for ${spaceData.name} (position ${spaceData.position}, type ${spaceData.type})`);

    // Force cleanup any existing videos before showing new content
    cleanupPropertyVideo();

    // Stop hover videos immediately when modal opens
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }

    const mediaSession = propertyMediaSession;

    // Re-query modal elements if not initialized (handles case where socket events fire before DOM ready)
    const modal = propertyModal || document.getElementById('propertyModal');
    const title = document.getElementById('propertyTitle');
    const subtitle = document.getElementById('propertySubtitle');
    const colorBar = document.getElementById('propertyColorBar');
    const content = document.getElementById('propertyContent');
    const mediaContainer = document.getElementById('propertyMedia') || document.getElementById('property-media');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const propertyActions = document.getElementById('propertyActions');
    const propertyConfirmBtn = document.getElementById('propertyConfirmBtn');
    const propertyPassBtn = document.getElementById('propertyPassBtn');
    const propertyPayRentBtn = document.getElementById('propertyPayRentBtn');
    const propertyProceedBtn = document.getElementById('propertyProceedBtn');
    const decisionPrompt = document.getElementById('propertyDecisionPrompt');

    if (!modal || !title || !content || !mediaContainer) {
        console.error('Modal elements not found!', { modal, title, content, mediaContainer });
        return;
    }
    
    title.textContent = spaceData.name;

    if (subtitle) {
        const typeLabel = getSpaceTypeLabel(spaceData.type);
        subtitle.textContent = `${typeLabel}${spaceData.isCasino ? ' · Casino' : ''}`;
    }

    if (colorBar) {
        colorBar.style.background = spaceData.color || '#888';
    }

    if (propertyActions) {
        if (isAI) {
            // Hide all buttons for AI - this is just a viewer mode
            propertyActions.classList.add('hidden');
        } else if (showProceedButton) {
            propertyActions.classList.remove('hidden');
            if (propertyConfirmBtn) propertyConfirmBtn.classList.add('hidden');
            if (propertyPassBtn) propertyPassBtn.classList.add('hidden');
            if (propertyPayRentBtn) propertyPayRentBtn.classList.add('hidden');
            if (propertyProceedBtn) propertyProceedBtn.classList.remove('hidden');
        } else if (isRent) {
            propertyActions.classList.remove('hidden');
            if (propertyConfirmBtn) propertyConfirmBtn.classList.add('hidden');
            if (propertyPassBtn) propertyPassBtn.classList.add('hidden');
            if (propertyPayRentBtn) propertyPayRentBtn.classList.remove('hidden');
            if (propertyProceedBtn) propertyProceedBtn.classList.add('hidden');
        } else if (showDecisionActions) {
            propertyActions.classList.remove('hidden');
            if (propertyConfirmBtn) propertyConfirmBtn.classList.remove('hidden');
            if (propertyPassBtn) propertyPassBtn.classList.remove('hidden');
            if (propertyPayRentBtn) propertyPayRentBtn.classList.add('hidden');
            if (propertyProceedBtn) propertyProceedBtn.classList.add('hidden');
        } else {
            propertyActions.classList.add('hidden');
            if (propertyConfirmBtn) propertyConfirmBtn.classList.remove('hidden');
            if (propertyPassBtn) propertyPassBtn.classList.remove('hidden');
            if (propertyPayRentBtn) propertyPayRentBtn.classList.add('hidden');
            if (propertyProceedBtn) propertyProceedBtn.classList.add('hidden');
        }
    }

    if (decisionPrompt) {
        if (showProceedButton) {
            decisionPrompt.textContent = 'Watch the video, then click Proceed to end your turn.';
            decisionPrompt.classList.remove('hidden');
        } else if (isRent) {
            decisionPrompt.textContent = 'You landed on an owned property. Pay rent to continue.';
            decisionPrompt.classList.remove('hidden');
        } else if (viewerLabel) {
            decisionPrompt.textContent = viewerLabel;
            decisionPrompt.classList.remove('hidden');
        } else if (!showDecisionActions) {
            decisionPrompt.classList.add('hidden');
            decisionPrompt.textContent = '';
        }
    }
    
    // Clear previous media
    mediaContainer.innerHTML = '';

    // Load media from tileMedia if available
    console.log(`[showPropertyInfo] tileMedia exists:`, !!tileMedia);
    console.log(`[showPropertyInfo] tileMedia[${spaceData.position}]:`, tileMedia ? tileMedia[spaceData.position] : 'N/A');

    if (tileMedia && tileMedia[spaceData.position]) {
        const media = tileMedia[spaceData.position];
        console.log(`[showPropertyInfo] Media object:`, media);
        console.log(`[showPropertyInfo] Videos:`, media.videos);
        console.log(`[showPropertyInfo] Images:`, media.images);

        // Video loading code
        const selectedVideo = (media.videos && media.videos.length > 0)
            ? pickAlternatePropertyVideo(media.videos, spaceData.position)
            : null;
        const cacheKey = selectedVideo
            ? `${spaceData.position}_${selectedVideo}`
            : `${spaceData.position}_${media.name}`;

        console.log(`[showPropertyInfo] Selected video:`, selectedVideo);
        console.log(`[showPropertyInfo] media.images exists:`, !!media.images);
        console.log(`[showPropertyInfo] media.images.length:`, media.images ? media.images.length : 'N/A');

        if (selectedVideo) {
            lastPlayedPropertyVideos[spaceData.position] = selectedVideo;

            // Fallback logic: try other videos if selected one fails
            const triedVideos = [selectedVideo];
            const loadVideoWithFallback = (videoUrl) => {
                const video = document.createElement('video');
                const frame = createMediaFrame(video);
                video.playsInline = true;
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                video.controls = true;
                video.loop = false;
                video.preload = 'metadata';
                video.muted = false;
                video.autoplay = true;
                video.src = videoUrl;
                pendingPropertyVideo = video;
                currentPropertyMediaPosition = spaceData.position;
                mediaContainer.appendChild(frame);

                video.addEventListener('error', () => {
                    if (video._intentionalStop || mediaSession !== propertyMediaSession) return;
                    stopVideoElement(video);
                    pendingPropertyVideo = null;
                    
                    // Try next video in array
                    const nextVideo = media.videos.find(v => !triedVideos.includes(v));
                    if (nextVideo) {
                        triedVideos.push(nextVideo);
                        loadVideoWithFallback(nextVideo);
                    } else {
                        // All videos failed, fall back to images only for utilities
                        logVideoLoadError(video, {
                            propertyName: media.name,
                            position: spaceData.position,
                            intendedSrc: videoUrl,
                            fromCache: false
                        });
                        if (spaceData.type === 'utility') {
                            if (!showPropertyImages(media, spaceData, mediaContainer, cacheKey) && loadingIndicator) {
                                mediaContainer.innerHTML = '';
                                loadingIndicator.textContent = 'Media unavailable';
                            }
                        } else {
                            mediaContainer.innerHTML = '';
                            if (loadingIndicator) loadingIndicator.textContent = 'Media unavailable';
                        }
                    }
                });

                video.addEventListener('loadeddata', () => {
                    if (mediaSession !== propertyMediaSession) {
                        stopVideoElement(video);
                        return;
                    }
                    pendingPropertyVideo = null;
                    const cachedFrame = frame.cloneNode(true);
                    // Remove autoplay from cached video to prevent autoplay when cloned
                    const cachedVideo = cachedFrame.querySelector('video');
                    if (cachedVideo) {
                        cachedVideo.removeAttribute('autoplay');
                        cachedVideo.autoplay = false;
                    }
                    mediaCache[cacheKey] = cachedFrame;
                    currentPropertyVideo = video;
                    
                    // Set video duration limits based on property
                    if (spaceData.name === 'Bet MGM') {
                        video.addEventListener('timeupdate', () => {
                            if (video.currentTime >= 9) {
                                video.pause();
                            }
                        });
                    } else if (spaceData.name === 'Sphere') {
                        // Play last 10 seconds of Sphere videos
                        video.addEventListener('loadedmetadata', () => {
                            if (video.duration > 10) {
                                video.currentTime = video.duration - 10;
                            }
                        }, { once: true });
                    } else {
                        // General 10-second limit for all other videos
                        video.addEventListener('timeupdate', () => {
                            if (video.currentTime >= 10) {
                                video.pause();
                            }
                        });
                    }
                    
                    video.play().catch(() => {});
                });
            };

            loadVideoWithFallback(selectedVideo);
        } else if (mediaCache[cacheKey]) {
            console.log(`[showPropertyInfo] Loading from cache for ${spaceData.name}`);
            const cloned = mediaCache[cacheKey].cloneNode(true);

            // Apply duration limits to cached videos
            const cachedVideo = cloned.querySelector('video');
            if (cachedVideo) {
                // Stop autoplay for cached videos to prevent them from playing automatically
                cachedVideo.removeAttribute('autoplay');
                cachedVideo.autoplay = false;
                cachedVideo.pause();

                // Track cached video so it can be stopped
                currentPropertyVideo = cachedVideo;
                currentPropertyMediaPosition = spaceData.position;

                if (spaceData.name === 'Bet MGM') {
                    cachedVideo.addEventListener('timeupdate', () => {
                        if (cachedVideo.currentTime >= 9) {
                            cachedVideo.pause();
                        }
                    });
                } else if (spaceData.name === 'Sphere') {
                    cachedVideo.addEventListener('loadedmetadata', () => {
                        if (cachedVideo.duration > 10) {
                            cachedVideo.currentTime = cachedVideo.duration - 10;
                        }
                    }, { once: true });
                } else {
                    // General 10-second limit for all other videos
                    cachedVideo.addEventListener('timeupdate', () => {
                        if (cachedVideo.currentTime >= 10) {
                            cachedVideo.pause();
                        }
                    });
                }
            }

            mediaContainer.appendChild(cloned);

            // Play the cached video after appending (for viewing, not auto-play)
            if (cachedVideo) {
                cachedVideo.play().catch(() => {});
            }
        } else if (media.images && media.images.length > 0 && spaceData.type === 'utility') {
            console.log(`[showPropertyInfo] Loading images for ${spaceData.name}`);
            showPropertyImages(media, spaceData, mediaContainer, cacheKey);
        } else {
            console.log(`[showPropertyInfo] No media available for ${spaceData.name}`);
            mediaContainer.innerHTML = '';
        }
    } else {
        console.log(`[showPropertyInfo] No tileMedia for position ${spaceData.position}`);
        mediaContainer.innerHTML = '';
    }
    
    content.innerHTML = buildPropertyDetailsHtml(spaceData);
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

    const modal = propertyModal || document.getElementById('propertyModal');
    if (modal) {
        modal.querySelectorAll('video').forEach(stopVideoElement);
    }
    
    // Global cleanup: stop ALL videos on the page to prevent audio clashes
    document.querySelectorAll('video').forEach(stopVideoElement);
    
    // Also check and stop any audio elements
    document.querySelectorAll('audio').forEach(audio => {
        try {
            audio.pause();
            audio.currentTime = 0;
            audio.removeAttribute('src');
            if (audio.parentNode) {
                audio.parentNode.removeChild(audio);
            }
        } catch (e) {
            console.error('Error stopping audio:', e);
        }
    });
}

// Update players list
function updatePlayersList() {
    if (!playersListEl) return;
    
    // console.log('updatePlayersList - players array:', players);
    // console.log('updatePlayersList - players.length:', players.length);
    
    playersListEl.innerHTML = '';
    
    // Filter out null players (index 0 dummy) to get 1-based indexing
    const actualPlayers = players.filter(p => p !== null);
    
    if (actualPlayers.length === 0) {
        playersListEl.innerHTML = '<div class="no-players">No players connected</div>';
        return;
    }
    
    actualPlayers.forEach((player, index) => {
        const playerNumber = index + 1; // Convert to 1-based
        // console.log(`updatePlayersList - processing player ${playerNumber}:`, player);
        // console.log(`  - Player ID: ${player.id}`);
        // console.log(`  - Player Name: ${player.name}`);
        // console.log(`  - My Player ID: ${myPlayerId}`);
        // console.log(`  - Socket ID: ${socket.id}`);
        // console.log(`  - Is Current Player: ${player.id === myPlayerId || player.id === socket.id}`);
        
        const playerEl = document.createElement('div');
        const isCurrentPlayer = player.id === myPlayerId || player.id === socket.id;
        const isActiveTurn = gameState && gameState.currentPlayer === player.id;
        playerEl.className = `player-card${isActiveTurn ? ' is-active' : ''}${player.isBankrupt ? ' is-bankrupt' : ''}`;

        const displayName = isAiVsAiGame
            ? `Player ${playerNumber}`
            : (isCurrentPlayer ? 'You' : `Player ${playerNumber}`);
        const aiBadge = (player.isAI && !isAiVsAiGame)
            ? '<span class="player-card-badge ai">AI</span>'
            : '';
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
        // Remove duplicates by using Set
        const uniqueProperties = [...new Set(currentPlayer.properties)];
        uniqueProperties.forEach(propPosition => {
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
    // console.log('addChatMessage called:', { sender, message, chatMessagesEl });
    if (!chatMessagesEl) {
        // console.warn('chatMessagesEl not found, skipping chat message');
        return;
    }
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMessagesEl.appendChild(messageEl);

    // Auto-scroll to bottom
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    // console.log('Message added to chat, total messages:', chatMessagesEl.children.length);
}

// Add AI move to tracker
function addAiMove(playerName, action, details) {
    console.log(`[AI Move] ${playerName} ${action} ${details}`);
    const move = {
        playerName,
        action,
        details,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    // Add to beginning of array
    aiMoves.unshift(move);
    
    // Keep only last 5 moves
    if (aiMoves.length > 5) {
        aiMoves.pop();
    }
    
    // Update UI
    updateAiMovesDisplay();
}

// Update AI moves display in UI
function updateAiMovesDisplay() {
    if (!aiMovesEl) {
        aiMovesEl = document.getElementById('aiMoves');
    }
    
    if (!aiMovesEl) return;
    
    aiMovesEl.innerHTML = '';
    
    if (aiMoves.length === 0) {
        aiMovesEl.innerHTML = '<div style="color: #888; font-size: 0.85rem; padding: 8px;">No AI moves yet</div>';
        return;
    }
    
    aiMoves.forEach(move => {
        const moveEl = document.createElement('div');
        moveEl.className = 'ai-move-entry';
        moveEl.innerHTML = `
            <span class="ai-player">${move.playerName}</span>
            <span class="ai-action">${move.action}</span>
            ${move.details ? `<span class="ai-details">${move.details}</span>` : ''}
        `;
        aiMovesEl.appendChild(moveEl);
    });
}

// Helper function to get display name for a player
function getPlayerDisplayName(player) {
    if (!player) return 'Unknown Player';
    const actualPlayers = players.filter((p) => p);
    const index = actualPlayers.findIndex((p) => p.id === player.id);
    return `Player ${index >= 0 ? index + 1 : '?'}`;
}

// Update UI elements
function updateUI(options = {}) {
    if (isSpectator) {
        applySpectatorModeUI();
        updatePlayersList();
        if (myPropertiesEl) myPropertiesEl.innerHTML = '<div class="no-properties">Spectating — no properties</div>';
        const gameCodeEl = document.getElementById('gameCode');
        if (gameCodeEl) gameCodeEl.textContent = 'Spectating';
        if (!options.skipTokenLayer) updateTokens();
        return;
    }

    if (currentPlayer) {
        playerMoneyEl.textContent = `$${currentPlayer.money || 2500}`;
        playerNameEl.textContent = getPlayerDisplayName(currentPlayer);
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
            addLogEntry(`${getPlayerDisplayName(currentPlayerObj)}'s turn`, 'system');
            lastTurnAnnouncementPlayerId = currentPlayerObj.id;
        }

        // Check if all human players have selected tokens (AI tokens assigned after humans)
        const humanPlayers = players.filter(p => p && !p.isAI);
        const allHumanPlayersSelectedTokens = humanPlayers.every(p => p.tokenIndex !== undefined);

        const isPlaying = gameState.status === 'playing' || !!gameState.currentPlayer;
        const myPlayerData = players.find(p => p && p.id === myPlayerId);
        if (gameState && gameState.currentPlayer === myPlayerId) {
            canRollDice = (
                gameState.diceRolled !== undefined && !gameState.diceRolled &&
                allHumanPlayersSelectedTokens // Can only roll if all human players have selected tokens
            );
            console.log('[updateUI] Set canRollDice:', canRollDice, 'gameState.diceRolled:', gameState.diceRolled, 'allHumanPlayersSelectedTokens:', allHumanPlayersSelectedTokens);

            const rollDiceBtn = document.getElementById('rollDiceBtn');
            if (rollDiceBtn) {
                rollDiceBtn.disabled = !canRollDice;
            }
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
    
    // Show roll dice button normally (including when in jail)
    const myPlayerData = players.find(p => p && p.id === myPlayerId);
    const rollDiceBtn = document.getElementById('rollDiceBtn');
    if (rollDiceBtn && gameState && gameState.diceRolled !== undefined && !gameState.diceRolled) {
        rollDiceBtn.style.display = 'block';
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

    // Jail pay-to-roll emits diceRolled with no movement; the real landing comes from playerMoved.
    if (diceData && diceData.oldPosition !== undefined && diceData.oldPosition === newPosition) {
        DiceRollSequenceManager.completeSequence(playerId);
        updateUI();
        return;
    }
    
    // Landing UI is opened from playerMoved → handlePlayerLanding so we
    // never start two property videos for the same tile.
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
        console.log('[handleDiceRolledEvent] Updating gameState:', {
            diceRolled: data.gameState.diceRolled,
            currentPlayer: data.gameState.currentPlayer,
            myPlayerId: myPlayerId
        });
        gameState = data.gameState;
        if (gameState.diceRolled && gameState.currentPlayer === myPlayerId) {
            canRollDice = false;
            const rollBtn = document.getElementById('rollDiceBtn');
            if (rollBtn) rollBtn.disabled = true;
        }
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

            // Log the dice roll
            addLogEntry(message, 'system');

            // Token animation may already be stored on this pending object (playerMoved
            // usually arrives during the dice animation). Keep the same object so
            // playerMoveData and onComplete stay together.
            const onTokenAnimationComplete = () => {
                if (!isDoublesRoll(data)) {
                    onDiceRollSequenceComplete(playerId, newPosition, data);
                } else {
                    const player = players.find(p => p && p.id === playerId);
                    if (player) {
                        showDoublesNotification(getPlayerDisplayName(player));
                    }
                    DiceRollSequenceManager.completeSequence(playerId);
                    updateUI();
                }
                
                if (playerId === myPlayerId && !isDoublesRoll(data)) {
                    scheduleClientAutoEndTurn(playerId, oldPosition, newPosition);
                }
            };

            pending.onComplete = onTokenAnimationComplete;
            pending.diceLanded = true;

            if (pending.playerMoveData) {
                executePendingRollMove(pending);
            }
        }
    });
}

// Socket event handlers
socket.on('connect', () => {
    const urlParts = window.location.pathname.split('/');
    const gameId = urlParts[urlParts.length - 1];
    currentGameId = gameId;
    const spectating = isSpectatorSession();

    if (gameId && gameCodeEl) {
        gameCodeEl.textContent = gameId;
    }

    if (!gameId) return;

    if (spectating) {
        isSpectator = true;
        socket.emit('joinAsSpectator', {
            gameId,
            spectatorUid: getStoredSpectatorUid(),
            spectatorName: sessionStorage.getItem('metropoly_spectator_name') || undefined
        });
    } else {
        const playerUid = getStoredPlayerUid();
        socket.emit('joinGame', { gameId, playerUid });
    }
});

socket.on('spectatorJoined', (data) => {
    hydrateSpectatorFromJoinData(data);

    if (data.chatLog && Array.isArray(data.chatLog) && chatMessagesEl) {
        chatMessagesEl.innerHTML = '';
        data.chatLog.forEach((entry) => {
            addChatMessage(entry.sender, entry.message);
        });
    }

    try {
        initializeBoard();
        initRevealedPlayersForTurn();
        players.filter((p) => p && p.tokenIndex !== undefined).forEach(loadTokenForPlayerIfNeeded);
        updateUI();
        updateTokens();
    } catch (error) {
        console.error('GAME: Error initializing spectator view:', error);
    }

    addLogEntry(`You are watching as ${spectatorName}`, 'system');
    updateTokens();
});

socket.on('gameJoined', (data) => {
    if (isSpectator) return;
    // console.log('=== GAME JOINED ===');
    // console.log('GAME: Received gameJoined event:', data);
    // console.log('GAME: Socket ID:', socket.id);
    // console.log('GAME: Server sent playerId:', data.playerId);
    // console.log('GAME: My Player ID (before):', myPlayerId);
    // console.log('GAME: Game State:', data.gameState);
    // console.log('GAME: Players array:', data.players);
    // console.log('GAME: Available player IDs:', data.players.filter(p => p).map(p => ({ id: p.id, name: p.name })));

    if (data.isSpectator) {
        // Spectator mode - no player ID
        myPlayerId = null;
        currentPlayer = null;
    } else {
        if (data.playerUid) {
            persistPlayerIdentity(data.gameId, data.playerUid);
        }
        currentPlayer = resolveLocalPlayer(players);
        myPlayerId = currentPlayer ? currentPlayer.id : data.playerId;
    }

    players = data.players;
    gameState = data.gameState;

    // console.log('GAME: Current player found:', currentPlayer ? currentPlayer.name : 'NOT FOUND');
    // console.log('GAME: Final myPlayerId:', myPlayerId);
    // console.log('GAME: Socket ID:', socket.id);
    // console.log('GAME: Do they match?', myPlayerId === socket.id);

    // Acknowledge connection to server
    socket.emit('gameJoinedAck');
    // console.log('GAME: Sent gameJoinedAck');

    try {
        initializeBoard();
        updateUI();
        // console.log('GAME: Board and UI initialized');
    } catch (error) {
        console.error('GAME: Error initializing board:', error);
    }

    // Update status immediately
    const gameCodeEl = document.getElementById('gameCode');
    if (gameCodeEl) {
        if (data.isSpectator) {
            gameCodeEl.textContent = '👁️ Spectating';
        } else if (gameState && (gameState.currentPlayer || gameState.status === 'playing')) {
            gameCodeEl.textContent = 'Game Active!';
        } else if (players.length >= 2 && players.filter(p => p).every(p => p.tokenIndex !== undefined)) {
            gameCodeEl.textContent = 'Ready to Start!';
        } else if (players.length >= 2) {
            gameCodeEl.textContent = 'Select Your Token';
        } else {
            gameCodeEl.textContent = 'Waiting for Players...';
        }
    }

    // Hide game controls for spectators
    if (data.isSpectator) {
        const rollDiceBtn = document.getElementById('rollDiceBtn');
        const endTurnBtn = document.getElementById('endTurnBtn');
        const playerName = document.getElementById('playerName');
        
        if (rollDiceBtn) rollDiceBtn.style.display = 'none';
        if (endTurnBtn) endTurnBtn.style.display = 'none';
        if (playerName) playerName.textContent = 'Spectator';
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
            addLogEntry(`${getPlayerDisplayName(player)} selected ${tokenInfo.name}`, 'system');
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

    // Ensure diceRolled is false on game start
    if (gameState) {
        gameState.diceRolled = false;
        gameState.turnPhase = 'roll';
    }

    if (!isSpectator) {
        currentPlayer = resolveLocalPlayer(players);
        if (currentPlayer) {
            myPlayerId = currentPlayer.id;
        }
        socket.emit('gameStartedAck');
    }

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

    if (!isSpectator && currentPlayer && !currentPlayer.tokenIndex && currentPlayer.tokenIndex !== 0) {
        showTokenSelection();
    }
});

socket.on('gameReady', (data) => {
    if (data.isAiVsAi) {
        isAiVsAiGame = true;
        sessionStorage.setItem('metropoly_ai_vs_ai', '1');
    }
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
    if (isSpectator) {
        players.filter((p) => p && p.tokenIndex !== undefined).forEach(loadTokenForPlayerIfNeeded);
        update3DTokenPositions();
    }
});

socket.on('updateGameStatus', (data) => {
    // console.log('Game status updated:', data);
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
        // Only add property if it doesn't already exist
        if (!player.properties.includes(position)) {
            player.properties.push(position);
        }

        updateUI();
        addLogEntry(`${getPlayerDisplayName(player)} bought ${propertyName} for $${boardConfig[position].price}`, 'property');

        // Track AI move
        if (player.isAI) {
            addAiMove(getPlayerDisplayName(player), 'bought', `${propertyName} for $${boardConfig[position].price}`);
        }

        // Update property display on board
        if (boardSpaces[position]) {
            boardSpaces[position].style.borderLeft = `4px solid ${player.color || '#4a9eff'}`;
        }

        if (playerId === myPlayerId && waitingForBuyResult) {
            waitingForBuyResult = false;
            activePropertyDecision = null;
            clearPropertyDecisionTimer();
            dismissPropertyDecisionUI();
            updateUI();
            // Auto-end turn after buying casino property
            setTimeout(() => {
                if (gameState && gameState.currentPlayer === myPlayerId) {
                    endTurnNow();
                }
            }, 500);
        }
    }
});

socket.on('propertyPassed', (data) => {
    const { playerId, position, propertyName } = data;
    const player = players.find(p => p && p.id === playerId);

    if (player && player.isAI) {
        addLogEntry(`${getPlayerDisplayName(player)} passed on ${propertyName}`, 'property');
        addAiMove(player.name, 'passed on', propertyName);
    }
    
    if (playerId === myPlayerId) {
        waitingForBuyResult = false;
        clearPropertyDecisionTimer();
        dismissPropertyDecisionUI();
        updateUI();
        // Auto-end turn after passing on property (including casino)
        setTimeout(() => {
            if (gameState && gameState.currentPlayer === myPlayerId) {
                endTurnNow();
            }
        }, 500);
    }
});

socket.on('playerJoined', (data) => {
    players = data.players;
    updateUI();
});

socket.on('playersUpdated', (data) => {
    players = data.players;
    if (data.gameState) {
        gameState = data.gameState;
    }

    if (!isSpectator) {
        currentPlayer = resolveLocalPlayer(players);
        if (currentPlayer) {
            myPlayerId = currentPlayer.id;
        }
    }
    
    updateUI();
    updatePlayersList();
    updateTokens(); // Update tokens when players list is updated

    // Sync token meshes from server positions (skip players mid-animation)
    update3DTokenPositions();
});

socket.on('playerDisconnected', (data) => {
    // console.log('DISCONNECT: Received playerDisconnected event:', data);
    
    // Update UI to show disconnected status (but keep player in list)
    updateUI();
    updatePlayersList();
});

socket.on('lobbyDeleted', (data) => {
    const { gameId, reason } = data;
    alert(`Lobby deleted: ${reason}`);
    
    // Redirect back to lobby
    window.location.href = '/';
});

socket.on('playerMoved', (data) => {
    const { playerId, newPosition, message, players: serverPlayers, direction = 'forward' } = data;

    // Don't cancel if this is the rolling player - diceRolled handler will animate
    const pending = pendingRollTokenMoves[playerId];
    if (pending && !pending.cancelled) {
        if (serverPlayers) {
            players = serverPlayers;
        }
        pending.playerMoveData = {
            playerId,
            newPosition,
            direction,
            oldPosition: data.oldPosition !== undefined ? data.oldPosition : (players.find(p => p && p.id === playerId)?.position || 0)
        };
        // Dice already finished: run the move now. Otherwise wait for onLand.
        if (pending.diceLanded) {
            executePendingRollMove(pending);
        }
        return;
    }
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
        const afterMove = () => {
            handlePlayerLanding(playerId, newPosition);
        };

        if (oldPosition !== newPosition) {
            player.position = oldPosition;
            animateTokenMove(playerId, oldPosition, newPosition, afterMove, direction);
        } else {
            player.position = newPosition;
            update3DTokenPositions();
            afterMove();
        }

        updateTokens();
        
        // Reset canRollDice to ensure proper state after move
        canRollDice = false;

        const spaceName = boardConfig[newPosition]?.name || 'unknown space';
        addLogEntry(`${getPlayerDisplayName(player)} moved to ${spaceName}`, 'player');

        // Track AI move
        if (player.isAI) {
            addAiMove(getPlayerDisplayName(player), 'moved to', spaceName);
        }
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
    
    // Force cleanup videos when turn changes to prevent audio clashes
    cleanupPropertyVideo();

    if (data.gameState) {
        gameState = data.gameState;
        // Always reset diceRolled for the new player's turn
        gameState.diceRolled = false;
        gameState.turnPhase = 'roll';
    } else if (gameState) {
        gameState.currentPlayer = data.nextPlayer;
        gameState.diceRolled = false;
        gameState.turnPhase = 'roll';
    }
    
    // Reset canRollDice to ensure proper state
    canRollDice = false;
    
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
        addLogEntry(`${getPlayerDisplayName(player)} drew ${data.cardType}: ${data.card.message}`, 'system');

        // Track AI move
        if (player.isAI) {
            addAiMove(getPlayerDisplayName(player), `drew ${data.cardType}`, data.card.message);
        }
    }
});

// Handle tax payments
socket.on('taxPaid', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.money = data.newMoney;
        updateUI();
        addLogEntry(`${getPlayerDisplayName(player)} paid $${data.amount} for ${data.taxName}`, 'system');

        // Track AI move
        if (player.isAI) {
            addAiMove(getPlayerDisplayName(player), 'paid tax', `$${data.amount} for ${data.taxName}`);
        }
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

        // Track AI moves
        if (payer.isAI) {
            addAiMove(payer.name, 'paid rent', `$${data.amount} to ${owner.name} for ${data.property.name}`);
        }
        if (owner.isAI) {
            addAiMove(owner.name, 'received rent', `$${data.amount} from ${payer.name} for ${data.property.name}`);
        }
    }
});

// Handle casino winnings
socket.on('playerMoneyUpdate', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.money = data.money;
        // Update the local player money variable for casino games
        if (data.playerId === myPlayerId) {
            playerMoney = data.money;
        }
        updateUI();
    }
});

// Handle show rent payment UI
socket.on('showRentPayment', (data) => {
    console.log('[showRentPayment] Received rent payment event:', data);
    if (data.playerId === myPlayerId) {
        const spaceData = data.property;
        const owner = players.find(p => p && p.id === data.ownerId);
        if (spaceData && owner) {
            // Use the rent amount from server (important for utilities)
            const rentData = {
                spaceData, 
                owner, 
                rentAmount: data.rentAmount,
                diceRoll: data.diceRoll
            };
            startRentDecision(rentData, data.position);
        } else {
            console.error('[showRentPayment] Missing spaceData or owner:', { spaceData, owner, data });
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

        // Track AI move
        if (player.isAI) {
            addAiMove(getPlayerDisplayName(player), 'sent to jail', '');
        }

        if (oldPosition !== newPosition) {
            player.position = oldPosition;
            animateTokenMove(
                data.playerId,
                oldPosition,
                newPosition,
                () => {
                    // Don't show jail proceed UI when sent to jail (only show for visiting jail)
                    if (data.playerId === myPlayerId) {
                        // Player was sent to jail - no proceed button needed, turn is already ended by server
                    } else {
                        const jailSpace = boardConfig[10];
                        if (jailSpace) {
                            showPropertyInfo(jailSpace);
                        }
                    }
                },
                getBestMoveDirection(oldPosition, newPosition)
            );
        } else {
            player.position = newPosition;
            update3DTokenPositions();
            if (data.playerId === myPlayerId) {
                // Player was sent to jail - no proceed button needed, turn is already ended by server
            } else {
                const jailSpace = boardConfig[10];
                if (jailSpace) {
                    showPropertyInfo(jailSpace);
                }
            }
        }
        updateTokens();
        
        // Reset canRollDice to ensure proper state
        canRollDice = false;
        
        updateUI();
        addLogEntry(`${getPlayerDisplayName(player)} was sent to jail!`, 'system');
    }
});

socket.on('playerOutOfJail', (data) => {
    console.log('[playerOutOfJail] Received - playerId:', data.playerId, 'method:', data.method, 'gameState.diceRolled:', gameState?.diceRolled);
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        player.inJail = false;
        player.jailTurns = 0;

        // Track AI move
        if (player.isAI) {
            addAiMove(getPlayerDisplayName(player), 'got out of jail', data.method);
        }

        // Reset canRollDice to ensure proper state
        if (data.playerId === myPlayerId) {
            console.log('[playerOutOfJail] Resetting canRollDice to false for current player');
            canRollDice = false;
        }

        updateUI();
        addLogEntry(`${getPlayerDisplayName(player)} got out of jail (${data.method})`, 'system');

        // If this is the current player and they got out of jail, show roll dice button
        const rollDiceBtn = document.getElementById('rollDiceBtn');
        if (rollDiceBtn) {
            rollDiceBtn.style.display = 'block';
        }
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
        // Update diceRolled state to allow another roll
        if (gameState) {
            gameState.diceRolled = false;
        }
        if (player.id === myPlayerId) {
            // Reset canRollDice to ensure proper state for doubles
            canRollDice = false;
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
        addLogEntry(`${getPlayerDisplayName(player)} collected $${data.amount} for passing GO!`, 'system');

        // Track AI move
        if (player.isAI) {
            addAiMove(getPlayerDisplayName(player), 'passed GO', `collected $${data.amount}`);
        }
    }
});

// Show card modal
function showCardModal(cardType, message, action) {
    // Stop hover videos immediately when card modal opens
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }

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

    console.log('[showCardModal] Card modal shown - gameState.diceRolled:', gameState?.diceRolled, 'currentPlayer:', gameState?.currentPlayer, 'myPlayerId:', myPlayerId);
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

function showGameWonModal(data) {
    // Stop hover videos immediately when game over modal opens
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }

    const modal = gameOverModal;
    if (!modal) return;

    if (data.players) {
        players = data.players;
    }

    const winner = players.find((p) => p && p.id === data.winnerId);
    const winnerName = data.winnerName || (winner ? getPlayerDisplayName(winner) : 'Unknown');
    const title = document.getElementById('gameOverTitle');
    const content = document.getElementById('gameOverContent');
    const reason = data.winReason === 'money'
        ? `reached $${(data.winningAmount || 10000).toLocaleString()}`
        : 'bankruptcy';

    if (title) {
        if (isSpectator) {
            title.textContent = 'Game Over';
        } else if (data.winnerId === myPlayerId) {
            title.textContent = 'You Won!';
        } else {
            title.textContent = 'Game Over';
        }
    }

    const finalPlayers = (data.players || players).filter((p) => p);
    if (content) {
        content.innerHTML = `
            <h3>${winnerName} won (${reason})!</h3>
            <div style="margin-top: 20px;">
                ${finalPlayers.map((p, i) => `
                    <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                        <strong>${i + 1}. ${getPlayerDisplayName(p)}</strong> - $${(p.money ?? 0).toLocaleString()}
                    </div>
                `).join('')}
            </div>
        `;
    }

    modal.classList.remove('hidden');
}

socket.on('gameWon', (data) => {
    showGameWonModal(data);
});

socket.on('aiLandingStarted', (data) => {
    console.log('[aiLandingStarted] Received:', data);
    if (data.players) {
        players = data.players;
    }

    activeAiLandingPlayerId = data.playerId;
    // Show AI landing UI with property info
    const player = players.find((p) => p && p.id === data.playerId);
    const spaceData = boardConfig[data.position];
    if (!spaceData) {
        console.error('[aiLandingStarted] Space data not found for position:', data.position);
        return;
    }

    console.log('[aiLandingStarted] Showing property info for:', spaceData.name);
    const label = `${getPlayerDisplayName(player)} (AI) landed on ${spaceData.name}`;
    const isUtility = spaceData.type === 'utility';
    showPropertyInfo(spaceData, {
        showDecisionActions: false,
        viewerLabel: data.willBuy
            ? `${label} — ${isUtility ? 'viewing property' : 'watching property video'}, then may buy...`
            : `${label} — viewing property...`,
        isAI: true
    });
});

socket.on('aiCasinoStarted', (data) => {
    if (data.playerId !== activeAiLandingPlayerId || !data.casinoGame) return;

    const player = players.find((p) => p && p.id === data.playerId);
    if (!player) return;

    // Show AI playing casino game in observer mode
    openCasinoGame(data.casinoGame, {
        player,
        playerLabel: `${getPlayerDisplayName(player)} (AI)`
    });
});

socket.on('aiCasinoComplete', (data) => {
    if (data.playerId !== activeAiLandingPlayerId) return;

    closeCasinoGame();

    if (data.players) {
        players = data.players;
    }

    const player = players.find((p) => p && p.id === data.playerId);
    if (player && typeof data.newMoney === 'number') {
        player.money = data.newMoney;
    }

    const sign = data.winnings >= 0 ? '+' : '';
    addLogEntry(
        `${getPlayerDisplayName(player)} finished ${data.casinoGame}: ${sign}$${Math.abs(data.winnings)}`,
        'system'
    );

    // Track AI move
    if (player && player.isAI) {
        addAiMove(player.name, 'played casino', `${data.casinoGame}: ${sign}$${Math.abs(data.winnings)}`);
    }

    updateUI();

    // AI player UI disabled - don't show property info after AI casino
    // if (player && typeof player.position === 'number') {
    //     const spaceData = boardConfig[player.position];
    //     if (spaceData) {
    //         showPropertyInfo(spaceData, {
    //             showDecisionActions: false,
    //             viewerLabel: `${getPlayerDisplayName(player)} — casino done (${sign}$${Math.abs(data.winnings)}), deciding on property...`
    //         });
    //     }
    // }
});

socket.on('aiLandingEnded', (data) => {
    if (data.playerId !== activeAiLandingPlayerId) return;
    activeAiLandingPlayerId = null;
    closeCasinoGame();
    
    // Force cleanup videos when AI landing ends
    cleanupPropertyVideo();
    
    dismissPropertyDecisionUI();
});

socket.on('gameOver', (data) => {
    showGameWonModal({
        winnerId: null,
        winnerName: data.winnerName,
        players: data.finalPlayers,
        winReason: 'bankruptcy'
    });
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

    if (message.toLowerCase().includes('not in progress') || message.toLowerCase().includes('join the lobby')) {
        alert(message);
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
        dismissPropertyDecisionUI();
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

    // Stop hover videos immediately when token modal opens
    if (typeof hideTileHoverImmediately === 'function') {
        hideTileHoverImmediately();
    }

    updateTokenOptions();
    tokenModal.classList.remove('hidden');
}

const closeCasinoBtn = document.getElementById('closeCasinoBtn');

if (closeCasinoBtn) {
    closeCasinoBtn.addEventListener('click', () => {
        activePlayerCasinoGame = null; // Clear the flag when human manually closes
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
    
    // Initialize AI moves display
    aiMovesEl = document.getElementById('aiMoves');
    updateAiMovesDisplay();

    // console.log('Chat elements initialized:', { chatMessagesEl, chatInputEl, sendChatBtn });

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
        console.log('[rollDiceBtn] Clicked - canRollDice:', canRollDice, 'gameState.diceRolled:', gameState?.diceRolled, 'currentPlayer:', gameState?.currentPlayer, 'myPlayerId:', myPlayerId);
        if (canRollDice && !(gameState && gameState.diceRolled)) {
            canRollDice = false;
            rollDiceBtn.disabled = true;
            socket.emit('rollDice');
        } else {
            console.log('[rollDiceBtn] Cannot roll - canRollDice is false');
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
        
        // Stop hover videos immediately when any modal closes
        if (typeof hideTileHoverImmediately === 'function') {
            hideTileHoverImmediately();
        }
        
        if (modal === propertyModal) {
            if (activePropertyDecision) {
                if (activePropertyDecision.isRent) {
                    alert('You must pay rent to continue.');
                } else {
                    // Stop any playing video/audio before passing
                    if (currentPropertyVideo) {
                        stopVideoElement(currentPropertyVideo);
                        currentPropertyVideo = null;
                    }
                    cleanupPropertyVideo();
                    socket.emit('passProperty', { position: activePropertyDecision.position });
                    dismissPropertyDecisionUI();
                }
            } else {
                closePropertyModal();
            }
            return;
        }
        if (modal.id === 'casinoGameModal') {
            activePlayerCasinoGame = null; // Clear the flag when human manually closes
            closeCasinoGame();
            return;
        }
        modal.classList.add('hidden');
    });
});

// Close modals when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            // Stop hover videos immediately when clicking outside modal
            if (typeof hideTileHoverImmediately === 'function') {
                hideTileHoverImmediately();
            }
            
            if (modal === propertyModal) {
                if (activePropertyDecision) {
                    if (activePropertyDecision.isRent) {
                        alert('You must pay rent to continue.');
                    } else {
                        // Stop any playing video/audio before passing
                        if (currentPropertyVideo) {
                            stopVideoElement(currentPropertyVideo);
                            currentPropertyVideo = null;
                        }
                        cleanupPropertyVideo();
                        socket.emit('passProperty', { position: activePropertyDecision.position });
                        dismissPropertyDecisionUI();
                    }
                } else {
                    closePropertyModal();
                }
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
        window.VIDEO_CDN_BASE_URL = (config.VIDEO_CDN_BASE_URL || '').replace(/^http:\/\//, 'https://');
        window.USE_CDN = config.USE_CDN;
        window.CDN_BASE_URL = config.CDN_BASE_URL;
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
                // End turn after closing card modal
                if (gameState && gameState.currentPlayer === myPlayerId) {
                    endTurnNow();
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
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(containerWidth, containerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Suppress warnings
    renderer.debug.checkShaderErrors = false;
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
        const displayName = spaceData.isCasino ? '★ ' + spaceData.name : spaceData.name;
        const bodyLines = wrapCanvasLines(ctx, displayName, inner.w - 15, 3);
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
        
        // Try CDN first, fall back to local if CDN fails
        const cdnPath = getModelPath('/Models/ferrisWheel/ferris_wheel.glb');
        const localPath = '/Models/ferrisWheel/ferris_wheel.glb'; // Models are now in public/Models
        
        const loadFerrisWheel = (path) => {
            loader.load(path,
                function(gltf) {
                    const ferrisWheel = gltf.scene;
                    const scale = 0.03; // Adjusted scale
                    ferrisWheel.scale.set(scale, scale, scale);
                    ferrisWheel.position.y = tileHeight / 2 + 0.22; // Raised by 0.02
                    ferrisWheel.position.z = 0.15; // Moved forward
                    ferrisWheel.visible = true; // Ensure visible
                    ferrisWheel.userData.isFerrisWheel = true;
                    ferrisWheel.userData.lastUpdate = 0;
                    
                    // Optimize model for performance but keep it visible
                    ferrisWheel.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = false;
                            child.receiveShadow = false;
                            child.visible = true; // Ensure each mesh is visible
                            if (child.material) {
                                child.material.flatShading = false; // Better visual quality
                                child.material.needsUpdate = true;
                                if (child.material.map) {
                                    child.material.map.anisotropy = 1;
                                }
                                // Ensure material is visible
                                child.material.transparent = false;
                                child.material.opacity = 1.0;
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
                    }
                },
                function(error) {
                    console.error('Error loading Ferris Wheel model from', path, ':', error);
                    // If CDN failed and this was CDN path, try local
                    if (path !== localPath) {
                        console.log('Falling back to local Ferris Wheel model...');
                        loadFerrisWheel(localPath);
                    }
                }
            );
        };
        
        loadFerrisWheel(cdnPath);
    }

    return group;
}

// Center carousel variables
let centerCarouselGroup = null;
let carouselImages = [];
let carouselCurrentIndex = 0;
let hotelCasinoImages = new Set();

function encodeCarouselPath(path) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return normalized
        .split('/')
        .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
        .join('/');
}

function getCarouselImageUrl(imagePath) {
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
    return encodeCarouselPath(imagePath);
}

function isHotelCasinoCarouselImage(imageUrl) {
    if (!imageUrl) return false;
    return [...hotelCasinoImages].some(
        (hotelPath) => imageUrl.endsWith(hotelPath) || imageUrl.includes(hotelPath.replace(/^\//, ''))
    );
}

function buildCarouselImageList(baseImages, casinoGameImages) {
    const ordered = [];
    let casinoIndex = 0;

    baseImages.forEach((imagePath) => {
        ordered.push(getCarouselImageUrl(imagePath));
        if (hotelCasinoImages.has(imagePath) && casinoGameImages.length > 0) {
            const casinoPath = casinoGameImages[casinoIndex % casinoGameImages.length];
            ordered.push(getCarouselImageUrl(casinoPath));
            casinoIndex += 1;
        }
    });

    return ordered;
}

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
    const baseImages = [
        "/Images/1.png",
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
        '/Images/las_vegas_motor_speedway.webp',
        '/Images/tigetwoods.avif',
        'https://pub-7e0044f8048c45d0a1c328e210708508.r2.dev/Images/clark%20county%20fair.jpg',
        '/Images/minus_1x_1.webp',
        '/Images/berry_1.webp',
        '/Images/las_vegas_elopement_wedding_champagne_pop.webp',
        '/Images/unnamed_1.png',
        '/Images/helicopters.webp',
        '/Images/house_of_blues_sunset.webp',
        '/Images/yellow_light_bulb.jpg',
    ];

    // Casino game photos (served locally from /Images/, same as other carousel slides)
    const casinoGameImages = [
        '/Images/baccarat_photo.webp',
        '/Images/poker_photo.jpg',
        '/Images/poker_photo_2.jpg',
        '/Images/roulette_photo.jpg',
        '/Images/blackjack_photo.jpg',
    ];
    
    // Define hotel/casino images to prevent back-to-back display
    hotelCasinoImages = new Set([
        '/Images/santafecasino.jpg',
        '/Images/themirage.jpg',
        '/Images/bellagio.jpg',
        '/Images/cosmopolitan.jpg',
        '/Images/wynn_2_2.jpg',
        '/Images/welcome_caesars_palace.jpg',
        '/Images/BetMGM.jpg',
        '/Images/LasVegasSphere.jpg',
        '/Images/thesphere.jpg',
    ]);

    const allImages = buildCarouselImageList(baseImages, casinoGameImages);

    // Use sequential track-based ordering instead of randomization
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
    
    // Skip failed images and prevent hotel/casino images back-to-back
    let attempts = 0;
    const maxAttempts = imagesLength;
    const currentImage = imageMesh.userData.images[imageMesh.userData.currentIndex];
    const isCurrentHotelCasino = isHotelCasinoCarouselImage(currentImage);
    
    while (attempts < maxAttempts) {
        // Skip failed images
        if (imageMesh.userData.failedImages && imageMesh.userData.failedImages.has(nextIndex)) {
            nextIndex = (nextIndex + 1) % imagesLength;
            attempts++;
            continue;
        }
        
        // Skip hotel/casino images if current is also hotel/casino
        const nextImage = imageMesh.userData.images[nextIndex];
        if (isCurrentHotelCasino && isHotelCasinoCarouselImage(nextImage)) {
            nextIndex = (nextIndex + 1) % imagesLength;
            attempts++;
            continue;
        }
        
        break;
    }
    
    if (attempts >= maxAttempts) {
        console.warn('All carousel images failed to load or are hotel/casino');
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
            
            // Skip failed images and prevent hotel/casino images back-to-back
            let attempts = 0;
            const maxAttempts = imagesLength;
            const currentImage = imageMesh.userData.images[imageMesh.userData.currentIndex];
            const isCurrentHotelCasino = isHotelCasinoCarouselImage(currentImage);
            
            while (attempts < maxAttempts) {
                // Skip failed images
                if (imageMesh.userData.failedImages && imageMesh.userData.failedImages.has(newIndex)) {
                    newIndex = (newIndex + 1) % imagesLength;
                    attempts++;
                    continue;
                }
                
                // Skip hotel/casino images if current is also hotel/casino
                const nextImage = imageMesh.userData.images[newIndex];
                if (isCurrentHotelCasino && isHotelCasinoCarouselImage(nextImage)) {
                    newIndex = (newIndex + 1) % imagesLength;
                    attempts++;
                    continue;
                }
                
                break;
            }
            
            if (attempts >= maxAttempts) {
                console.warn('All carousel images failed to load or are hotel/casino, staying on current');
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
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.muted = true;
                    localVideo.play().catch(e => console.log('Local video play error:', e));
                }
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
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play().catch(e => console.log('Local video play error:', e));
        } else {
            console.error('localVideo element not found');
        }

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
        if (remoteVideo) {
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(e => console.log('Remote video play error:', e));
        } else {
            console.error('remoteVideo element not found');
        }
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
    const startVideoCallBtn = document.getElementById('startVideoCall');
    const endVideoCallBtn = document.getElementById('endVideoCall');

    // Initialize PeerJS on load
    if (!peer) {
        initializePeerJS();
    }

    if (startVideoCallBtn) {
        startVideoCallBtn.addEventListener('click', startVideoCall);
    }

    if (endVideoCallBtn) {
        endVideoCallBtn.addEventListener('click', endVideoCall);
    }
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
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true;
                localVideo.play().catch(e => console.log('Local video play error:', e));
            } else {
                console.error('localVideo element not found');
            }

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
    if (data.playerId !== myPlayerId && localStream) {
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

// Console command to load jail UI for testing
window.showJailUI = function() {
    const jailSpace = boardConfig[10]; // JAIL position
    if (jailSpace) {
        showPropertyInfo(jailSpace);
        console.log('Jail UI loaded');
    } else {
        console.error('JAIL space not found');
    }
};

// Console command to load Go to Jail UI for testing
window.showGoToJailUI = function() {
    const goToJailSpace = boardConfig[30]; // GO TO JAIL position
    if (goToJailSpace) {
        showPropertyInfo(goToJailSpace);
        console.log('Go to Jail UI loaded');
    } else {
        console.error('Go to Jail space not found');
    }
};

// Initialize modal elements when DOM is ready
function initializeModalElements() {
    propertyModal = document.getElementById('propertyModal');
    gameOverModal = document.getElementById('gameOverModal');
    gameOverTitle = document.getElementById('gameOverTitle');
    gameOverContent = document.getElementById('gameOverContent');
    cardModal = document.getElementById('cardModal');
    cardTitle = document.getElementById('cardTitle');
    cardContent = document.getElementById('cardContent');
    cardOkBtn = document.getElementById('cardOkBtn');
    confirmTokenBtn = document.getElementById('confirmTokenBtn');
    themeToggle = document.getElementById('themeToggle');
    settingsBtn = document.getElementById('settingsBtn');
    settingsModal = document.getElementById('settingsModal');
    settingsModalClose = document.querySelector('#settingsModal .modal-close');
    
    // Setup proceed button handler
    const propertyProceedBtn = document.getElementById('propertyProceedBtn');
    if (propertyProceedBtn) {
        propertyProceedBtn.addEventListener('click', handleJailProceed);
    }
}

// Setup video chat UI when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeModalElements();
        initThemeToggle();
        setupVideoChatUI();
    });
} else {
    initializeModalElements();
    initThemeToggle();
    setupVideoChatUI();
}