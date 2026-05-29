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

// Token data
const tokenData = [
    { name: 'Burger', model: '/Models/Cheeseburger/cheeseburger.glb', image: '/images/burger%20image.png', scale: 0.42 },
    { name: 'Rolls Royce', model: '/Models/RollsRoyce/rollsRoyceCarAnim.glb', image: '/images/rolls%20royce%20image.png', scale: 0.14, facingOffset: -Math.PI / 2 },
    { name: 'Top Hat', model: '/Models/TopHat/tophat.glb', image: '/images/top%20hat%20image.png', scale: 0.22 },
    { name: 'Vegas Model', model: '/Models/WhiteGirlIdle/Standing Idle.fbx', image: '/images/woman%20model%20image.png', scale: 0.1 }
];

// Initialize 3D dice scene
function initializeDiceScene() {
    if (diceSceneInitialized) return;

    const diceContainer = document.getElementById('dice3DContainer');
    if (!diceContainer) {
        console.error('Dice container not found');
        return;
    }

    // Create scene
    diceScene = new THREE.Scene();

    // Create camera
    diceCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    diceCamera.position.set(0, 2.4, 4.6);
    diceCamera.lookAt(0, 0.12, 0);

    // Create renderer
    diceRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    diceRenderer.setSize(200, 200);
    diceRenderer.setClearColor(0x000000, 0);
    diceContainer.appendChild(diceRenderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    diceScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(4, 8, 6);
    diceScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.35);
    fillLight.position.set(-3, 2, 4);
    diceScene.add(fillLight);

    // Create dice
    createDice();

    diceSceneInitialized = true;
}

let diceGlbTemplate = null;
let diceGlbLoading = false;

function prepareDiceGlbRoot(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const s = DICE_GLB_CONFIG.scale / maxDim;
    root.scale.setScalar(s);
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    return root;
}

function spawnDiceFromTemplate() {
    const sep = DICE_GLB_CONFIG.separation * 0.5;
    const landY = getDiceLandY();
    dice1Mesh = diceGlbTemplate.clone(true);
    dice2Mesh = diceGlbTemplate.clone(true);
    dice1Mesh.position.set(-sep, landY, 0);
    dice2Mesh.position.set(sep, landY, 0);
    diceScene.add(dice1Mesh);
    diceScene.add(dice2Mesh);
    dice1Mesh.visible = false;
    dice2Mesh.visible = false;
}

// Load GLB dice model (two instances)
function createDice() {
    if (diceGlbTemplate) {
        spawnDiceFromTemplate();
        return;
    }
    if (diceGlbLoading) return;
    diceGlbLoading = true;

    const loader = new THREE.GLTFLoader();
    loader.load(
        DICE_GLB_CONFIG.modelPath,
        function (gltf) {
            diceGlbTemplate = prepareDiceGlbRoot(gltf.scene);
            if (diceCamera) {
                autoCalibrateDiceFaces(diceGlbTemplate);
            }
            diceGlbLoading = false;
            spawnDiceFromTemplate();
        },
        undefined,
        function (err) {
            diceGlbLoading = false;
            console.error('Failed to load dice GLB:', err);
        }
    );
}

/** GLB dice roll (all clients: human + AI via diceRolled socket). Optional onLand when roll finishes. */
function roll3DDice(dice1Value, dice2Value, callbacks) {
    if (!diceSceneInitialized) {
        initializeDiceScene();
    }
    if (!dice1Mesh || !dice2Mesh) {
        createDice();
        setTimeout(() => roll3DDice(dice1Value, dice2Value, callbacks), 200);
        return;
    }

    if (diceRollAnimFrame) {
        cancelAnimationFrame(diceRollAnimFrame);
        diceRollAnimFrame = null;
    }

    diceRolling = true;
    dice1Mesh.visible = true;
    dice2Mesh.visible = true;

    const diceEl = document.getElementById('dice3DContainer');
    if (diceEl) diceEl.classList.add('dice-rolling');

    let rollTick = runDiceRollAnimation({
        meshes: [dice1Mesh, dice2Mesh],
        values: [dice1Value, dice2Value],
        duration: getDiceRollDurationMs(),
        onComplete: () => {
            diceRolling = false;
            if (diceEl) diceEl.classList.remove('dice-rolling');
            if (callbacks && typeof callbacks.onLand === 'function') {
                callbacks.onLand();
            }
            setTimeout(() => {
                if (!diceRolling && dice1Mesh && dice2Mesh) {
                    dice1Mesh.visible = false;
                    dice2Mesh.visible = false;
                }
            }, 600);
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
    return Math.atan2(dx, -dz) + yawOffset;
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
    model.rotation.y = getTokenFacingRotationY(position, direction, getTokenYawOffset(player));
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

// Three.js variables for 3D tokens and board
let scene, camera, renderer;
let css2dRenderer = null;
let centerPanelCSS2D = null;
let tokenModels = {};
let tokenMeshes = {};
let tokenLoading = {};
let boardMeshes = {}; // Store board space meshes
let boardEnvironmentGroup = null;
let scene3DInitialized = false;
let resizeObserver = null;

// 3D Dice variables
let diceScene, diceCamera, diceRenderer;
let dice1Mesh, dice2Mesh;
let diceSceneInitialized = false;
let diceRolling = false;
let diceRollAnimFrame = null;
const revealedPlayerIds = new Set();
const tokenAnimatingIds = new Set();
const tokenAnimationHandles = {};
const pendingRollTokenMoves = {};
const TOKEN_STEP_DURATION_MS = 320;

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
const chatMessagesEl = document.getElementById('chatMessages');
const chatInputEl = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

// 3D View Controls
const boardContainer = document.querySelector('.board-container');
const boardViewport = document.querySelector('.board-viewport');

// Three.js orbit camera (degrees / distance — shared by board + token models)
let cameraDistance = 14;
const CAMERA_DISTANCE_MIN = 6;
const CAMERA_DISTANCE_MAX = 55;
const CAMERA_DISTANCE_DEFAULT = 14;
let cameraPolarDeg = 55;
let cameraAzimuthDeg = 0;
let isRightMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Modal elements
const propertyModal = document.getElementById('propertyModal');
const buyModal = document.getElementById('buyModal');
const gameOverModal = document.getElementById('gameOverModal');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverContent = document.getElementById('gameOverContent');
const cardModal = document.getElementById('cardModal');
const cardTitle = document.getElementById('cardTitle');
const cardContent = document.getElementById('cardContent');
const cardOkBtn = document.getElementById('cardOkBtn');
const confirmTokenBtn = document.getElementById('confirmTokenBtn');
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsModalClose = document.querySelector('.modal-close');

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
let selectedTokenIndex = null;
let tokenSelectionListenerAdded = false;

// Token configuration
const tokens = [
    { id: 'car', emoji: '🚗', color: '#e74c3c' },
    { id: 'dog', emoji: '🐕', color: '#3498db' },
    { id: 'hat', emoji: '🎩', color: '#2ecc71' },
    { id: 'ship', emoji: '🚢', color: '#f39c12' },
    { id: 'boot', emoji: '👢', color: '#9b59b6' },
    { id: 'iron', emoji: '🔧', color: '#34495e' },
    { id: 'wheelbarrow', emoji: '🚚', color: '#e67e22' },
    { id: 'thimble', emoji: '🧵', color: '#16a085' }
];

// Board configuration - Las Vegas Monopoly themed
const boardConfig = [
    { name: 'GO', type: 'corner', position: 0 },
    { name: 'Las Vegas Raiders', type: 'property', color: '#8B4513', price: 350, rent: [17, 85, 255, 765, 1360, 2125], position: 1 },
    { name: 'Community Cards', type: 'community-chest', position: 2 },
    { name: 'Las Vegas Grand Prix', type: 'property', color: '#8B4513', price: 300, rent: [15, 75, 225, 675, 1200, 1875], position: 3 },
    { name: 'Income Tax', type: 'tax', amount: 200, position: 4 },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 5 },
    { name: 'Las Vegas Monorail', type: 'property', color: '#87CEEB', price: 250, rent: [12, 60, 180, 540, 800, 1100], position: 6 },
    { name: 'Chance', type: 'chance', position: 7 },
    { name: 'Speed Vegas Off Roading', type: 'property', color: '#87CEEB', price: 220, rent: [11, 55, 165, 495, 720, 990], position: 8 },
    { name: 'Las Vegas Golden Knights', type: 'property', color: '#87CEEB', price: 275, rent: [14, 70, 210, 630, 930, 1275], position: 9 },
    { name: 'JAIL', type: 'corner', position: 10 },
    { name: 'Maverick Helicopter Rides', type: 'property', color: '#FF69B4', price: 320, rent: [16, 80, 240, 720, 1060, 1450], position: 11 },
    { name: 'Electric Company', type: 'utility', price: 180, position: 12 },
    { name: 'Bet MGM', type: 'property', color: '#FF69B4', price: 350, rent: [17, 85, 255, 765, 1360, 2125], position: 13 },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 14 },
    { name: 'Las Vegas Monorail', type: 'property', color: '#FFA500', price: 250, rent: [12, 60, 180, 540, 800, 1100], position: 15 },
    { name: 'Bellagio', type: 'property', color: '#FFA500', price: 400, rent: [20, 100, 300, 900, 1325, 1825], position: 16 },
    { name: 'Community Cards', type: 'community-chest', position: 17 },
    { name: 'Las Vegas Aces', type: 'property', color: '#FFA500', price: 300, rent: [15, 75, 225, 675, 1200, 1875], position: 18 },
    { name: 'Brothel', type: 'property', color: '#FFA500', price: 200, rent: [10, 50, 150, 450, 625, 750], position: 19 },
    { name: 'FREE PARKING', type: 'corner', position: 20 },
    { name: 'Hard Rock Hotel', type: 'property', color: '#FF0000', price: 260, rent: [13, 65, 195, 585, 860, 1180], position: 21 },
    { name: 'Chance', type: 'chance', position: 22 },
    { name: 'Horseback Riding', type: 'property', color: '#FF0000', price: 260, rent: [13, 65, 195, 585, 860, 1180], position: 23 },
    { name: 'Resorts World Theatre', type: 'property', color: '#FF0000', price: 350, rent: [17, 85, 255, 765, 1360, 2125], position: 24 },
    { name: 'Las Vegas Monorail', type: 'railroad', price: 250, rent: [25, 50, 100, 200], position: 25 },
    { name: 'Shriners Children\'s Open', type: 'property', color: '#FFFF00', price: 300, rent: [15, 75, 225, 675, 1200, 1875], position: 26 },
    { name: 'Community Cards', type: 'community-chest', position: 27 },
    { name: 'Sphere', type: 'property', color: '#FFFF00', price: 400, rent: [20, 100, 300, 900, 1325, 1825], position: 28 },
    { name: 'Water Works', type: 'utility', price: 200, position: 29 },
    { name: 'GO TO JAIL', type: 'corner', position: 30 },
    { name: 'Wynn Las Vegas', type: 'property', color: '#008000', price: 320, rent: [16, 80, 240, 720, 1060, 1450], position: 31 },
    { name: 'Santa Fe Hotel and Casino', type: 'property', color: '#008000', price: 350, rent: [17, 85, 255, 765, 1360, 2125], position: 32 },
    { name: 'Luxury Tax', type: 'tax', amount: 100, position: 33 },
    { name: 'Chance', type: 'chance', position: 34 },
    { name: 'House of Blues', type: 'property', color: '#008000', price: 300, rent: [15, 75, 225, 675, 1200, 1875], position: 35 },
    { name: 'The Cosmopolitan', type: 'railroad', price: 350, rent: [25, 50, 100, 200], position: 36 },
    { name: 'Community Cards', type: 'community-chest', position: 37 },
    { name: 'Las Vegas Monorail', type: 'property', color: '#0000FF', price: 250, rent: [12, 60, 180, 540, 800, 1100], position: 38 },
    { name: 'Speed Vegas Off Roading', type: 'property', color: '#0000FF', price: 275, rent: [14, 70, 210, 630, 930, 1275], position: 39 }
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
            
            // Create invisible click target
            const space = document.createElement('div');
            space.className = 'board-space';
            space.dataset.position = position;
            space.style.gridRow = row + 1;
            space.style.gridColumn = col + 1;
            space.style.visibility = 'hidden'; // Invisible, just for click detection
            
            space.addEventListener('click', () => showPropertyInfo(boardConfig[position]));
            gameBoard.appendChild(space);
            boardSpaces[position] = space;
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

    camera.position.x = cameraDistance * Math.cos(polar) * Math.sin(azimuth);
    camera.position.y = cameraDistance * Math.sin(polar);
    camera.position.z = cameraDistance * Math.cos(polar) * Math.cos(azimuth);
    camera.lookAt(0, 0, 0);
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
    const hits = raycaster.intersectObjects(Object.values(boardMeshes), true);

    if (!hits.length) return;

    let object = hits[0].object;
    while (object && object.userData.position === undefined && object.parent) {
        object = object.parent;
    }

    const position = object?.userData?.position;
    if (position !== undefined && boardConfig[position]) {
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
    const delay = getDiceRollDurationMs() + 200 + moveSteps * TOKEN_STEP_DURATION_MS + 600;

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
    if (!buyContent) return;

    const now = Date.now();
    const secondsLeft = Math.max(0, Math.ceil((propertyDecisionEndsAt - now) / 1000));
    const canAfford = currentPlayer && currentPlayer.money >= activePropertyDecision.spaceData.price;

    buyContent.innerHTML = `
        <p><strong>${activePropertyDecision.spaceData.name}</strong></p>
        <p>Price: <strong>$${activePropertyDecision.spaceData.price}</strong></p>
        <p>Rent: <strong>$${activePropertyDecision.spaceData.rent ? activePropertyDecision.spaceData.rent[0] : 0}</strong></p>
        <p>Decision timer: <strong>${secondsLeft}s</strong></p>
        <p>${canAfford ? 'Buy this property, Pass, or click End Turn when you are done.' : 'Not enough money to buy. Pass or click End Turn.'}</p>
    `;
}

function startPropertyDecision(spaceData, position) {
    if (!spaceData || !buyModal || !currentPlayer) return;
    cancelClientAutoEndTurn();
    clearPropertyDecisionTimer();
    waitingForBuyResult = false;
    activePropertyDecision = { spaceData, position };
    propertyDecisionEndsAt = Date.now() + 15000;
    updateBuyModalContent();
    buyModal.classList.remove('hidden');
    updateUI();

    propertyDecisionTimer = setInterval(() => {
        updateBuyModalContent();
        if (!propertyDecisionEndsAt || Date.now() < propertyDecisionEndsAt) return;

        clearPropertyDecisionTimer();
        buyModal.classList.add('hidden');
        activePropertyDecision = null;
        updateUI();
        addLogEntry(`Decision time expired for ${spaceData.name}. Use End Turn when ready.`, 'system');
    }, 250);
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

        if (steps.length === 0) {
            player.position = newPosition;
            tokenAnimatingIds.delete(playerId);
            update3DTokenPositions();
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
            setTimeout(waitForModel, 100);
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

                scene.add(model);
                model.visible = isTokenVisible(player.id);
                applyTokenFacing(model, player.position || 0, 'forward', player);
                console.log(`3D Token loaded and added to scene for ${player.name}`);

                update3DTokenPositions();
                updateTokenVisibility();

                // Check if model has animations
                if (fbx.animations && fbx.animations.length > 0) {
                    console.log(`FBX model has ${fbx.animations.length} animations`);
                    // Set up animation mixer for Vegas model
                    const mixer = new THREE.AnimationMixer(model);
                    model.mixer = mixer;
                    const action = mixer.clipAction(fbx.animations[0]);
                    action.play();
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

                scene.add(model);
                model.visible = isTokenVisible(player.id);
                applyTokenFacing(model, player.position || 0, 'forward', player);
                update3DTokenPositions();
                updateTokenVisibility();

                if (gltf.animations && gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(model);
                    model.mixer = mixer;

                    // Play idle animation
                    const action = mixer.clipAction(gltf.animations[0]);
                    action.play();
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
    }, 100);
}

// Show property information
function showPropertyInfo(spaceData) {
    const modal = propertyModal;
    const title = document.getElementById('propertyTitle');
    const content = document.getElementById('propertyContent');
    
    title.textContent = spaceData.name;
    
    let html = `<p><strong>Type:</strong> ${spaceData.type}</p>`;
    
    if (spaceData.type === 'property' || spaceData.type === 'railroad' || spaceData.type === 'utility') {
        html += `<p><strong>Price:</strong> $${spaceData.price}</p>`;

        if (spaceData.rent) {
            html += `<p><strong>Rent:</strong> $${spaceData.rent[0]}</p>`;
        }

        if (spaceData.position !== undefined && spaceData.position !== null) {
            const owner = players.find(p => p.properties && p.properties.includes(spaceData.position));
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
    modal.classList.remove('hidden');
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
        const jailBadge = player.inJail ? '<span class="player-card-badge jail">Jail</span>' : '';

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
                <div class="player-card-money">$${(player.money ?? 1500).toLocaleString()}</div>
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
    setTimeout(() => {
        gameLog.scrollTop = gameLog.scrollHeight;
        
        // Keep only last 50 entries
        const entries = gameLog.querySelectorAll('.log-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
    }, 100);
}

// Add chat message
function addChatMessage(sender, message) {
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
}

// Update UI elements
function updateUI() {
    if (currentPlayer) {
        playerMoneyEl.textContent = `$${currentPlayer.money || 1500}`;
        playerNameEl.textContent = currentPlayer.name;
        localStorage.setItem('playerName', currentPlayer.name);
    } else {
        // Set defaults when currentPlayer is not available
        playerMoneyEl.textContent = '$1500';
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

        const diceContainer = document.getElementById('dice3DContainer');
        if (diceContainer) {
            diceContainer.classList.toggle('dice-attention', canRollDice);
        }
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
        const diceContainer = document.getElementById('dice3DContainer');
        if (diceContainer) {
            diceContainer.classList.remove('dice-attention');
        }
        const rollDiceBtn = document.getElementById('rollDiceBtn');
        if (rollDiceBtn) {
            rollDiceBtn.disabled = true;
        }

        const endTurnBtn = document.getElementById('endTurnBtn');
        if (endTurnBtn) {
            endTurnBtn.disabled = true;
        }
    }

    updateTokens();
    
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
    addChatMessage('System', `Welcome to Metropoly, ${currentPlayer ? currentPlayer.name : 'Player'}!`);
    
    // Update tokens to show all players' tokens on the board
    updateTokens();
});

socket.on('tokenSelected', (data) => {
    const { playerId, tokenIndex, players: serverPlayers } = data;

    if (serverPlayers) {
        players = serverPlayers;
    }

    currentPlayer = resolveLocalPlayer(players);
    if (currentPlayer) {
        myPlayerId = currentPlayer.id;
    }

    const player = players.find(p => p && p.id === playerId);

    if (player) {
        player.tokenIndex = tokenIndex;
        if (isTokenVisible(player.id) && !tokenModels[player.id]) {
            loadTokenModel(tokenIndex, player);
        }
        const tokenInfo = tokenData[tokenIndex];
        if (tokenInfo) {
            player.tokenName = tokenInfo.name;
            player.tokenImage = tokenInfo.image;
        }

        // Add log entry for token selection
        addLogEntry(`${player.name} selected ${tokenInfo.name}`, 'system');

        updateUI();
        updatePlayersList();
        updateTokens();

        // Update token selection modal to grey out taken tokens
        updateTokenOptions();

        // If this is an AI player token assignment, ensure the token model is loaded
        if (player.isAI) {
            loadTokenModel(tokenIndex, player);
        }
    } else {
        console.error('TOKEN: Player not found for token selection:', playerId);
    }
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

    setTimeout(() => {
        update3DTokenPositions();
        updateTokenVisibility();
    }, 500);

    addLogEntry('Game started!', 'system');
    addChatMessage('System', 'Game started! Good luck!');
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
    addChatMessage('System', data.message);

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
        addChatMessage('System', `${player.name} bought ${propertyName} for $${boardConfig[position].price}`);
        
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
        }
    }
});

socket.on('propertyPassed', (data) => {
    const { playerId, position, propertyName } = data;
    const player = players.find(p => p && p.id === playerId);
    
    if (player) {
        addChatMessage('System', `${player.name} passed on ${propertyName}`);
    }
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
    if (!currentPlayer || data.playerName !== currentPlayer.name) {
        addChatMessage('System', `${data.playerName} joined the game`);
    }
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

    addChatMessage('System', data.message || 'Player list updated');
});

socket.on('playerDisconnected', (data) => {
    console.log('DISCONNECT: Received playerDisconnected event:', data);
    addChatMessage('System', `${data.playerName} disconnected`);
    
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
        if (oldPosition !== newPosition) {
            player.position = oldPosition;
            animateTokenMove(playerId, oldPosition, newPosition, undefined, direction);
        } else {
            player.position = newPosition;
            update3DTokenPositions();
        }

        updateTokens();

        const spaceName = boardConfig[newPosition]?.name || 'unknown space';
        addLogEntry(`${player.name} moved to ${spaceName}`, 'player');

        if (message) {
            addChatMessage('System', message);
        }

        if (playerId === myPlayerId) {
            const moveSteps = getMoveStepCount(oldPosition, newPosition, direction);
            setTimeout(() => {
                const spaceData = getUnownedPurchasableSpace(newPosition);
                if (spaceData) startPropertyDecision(spaceData, newPosition);
            }, moveSteps * TOKEN_STEP_DURATION_MS + 100);
        }
    }
});

socket.on('diceRolled', (data) => {
    const playerId = data.playerId;
    const newPosition = data.newPosition;
    const message = data.message || 'Dice rolled';
    const serverDice1 = data.dice1 ?? (data.roll && data.roll.dice1);
    const serverDice2 = data.dice2 ?? (data.roll && data.roll.dice2);
    const rollTotal = (data.roll && data.roll.total) || ((serverDice1 || 1) + (serverDice2 || 1));

    const existingPlayer = players.find(p => p && p.id === playerId);
    const oldPosition = data.oldPosition !== undefined
        ? data.oldPosition
        : (existingPlayer
            ? existingPlayer.position
            : ((newPosition - rollTotal + 40) % 40));

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

    const totalMoveTime = moveSteps * TOKEN_STEP_DURATION_MS;

    markPendingRollTokenMove(playerId);

    roll3DDice(serverDice1 || 1, serverDice2 || 1, {
        onLand: () => {
            const pending = pendingRollTokenMoves[playerId];
            if (!pending || pending.cancelled) return;
            delete pendingRollTokenMoves[playerId];

            addLogEntry(message, 'system');
            updateUI();

            if (player && moveSteps > 0) {
                animateTokenMove(playerId, oldPosition, newPosition);
            } else if (player) {
                player.position = newPosition;
                update3DTokenPositions();
            }

            setTimeout(() => {
                if (playerId === myPlayerId) {
                    updateUI();
                    if (!isDoublesRoll(data)) {
                        scheduleClientAutoEndTurn(playerId, oldPosition, newPosition);
                    }
                }
            }, totalMoveTime + 200);
        }
    });
});

function isDoublesRoll(diceRolledData) {
    const d1 = diceRolledData.dice1 ?? (diceRolledData.roll && diceRolledData.roll.dice1);
    const d2 = diceRolledData.dice2 ?? (diceRolledData.roll && diceRolledData.roll.dice2);
    return d1 === d2;
}

socket.on('turnChanged', (data) => {
    cancelClientAutoEndTurn();
    Object.keys(pendingRollTokenMoves).forEach((id) => cancelPendingRollTokenMove(id));
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

// Handle doubles rolled
socket.on('doublesRolled', (data) => {
    const player = players.find(p => p && p.id === data.playerId);
    if (player) {
        cancelClientAutoEndTurn();
        if (player.id === myPlayerId) {
            updateUI();
        }
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

socket.on('chatMessage', (data) => {
    addChatMessage(data.playerName, data.message);
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
    addLogEntry(`Game error: ${error}`, 'system');
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
        const tokenIndex = parseInt(option.dataset.token);
        // Only check human players for taken tokens (AI tokens assigned after humans select)
        const humanPlayers = players.filter(p => p && !p.isAI);
        const isTokenTaken = humanPlayers.some(p => p.tokenIndex === tokenIndex);
        if (isTokenTaken) {
            option.classList.add('disabled');
            option.style.opacity = '0.5';
            option.style.pointerEvents = 'none';
        } else {
            option.classList.remove('disabled');
            option.style.opacity = '1';
            option.style.pointerEvents = 'auto';
        }
    });
}

// Show token selection modal
function showTokenSelection() {
    try {
        if (!tokenModal) {
            console.error('Token modal not found');
            return;
        }

        tokenModal.classList.remove('hidden');

        // Update token options to show taken tokens as disabled
        updateTokenOptions();

        // Add token selection handlers
        const tokenOptions = document.querySelectorAll('.token-option');

        tokenOptions.forEach(option => {
            const tokenIndex = parseInt(option.dataset.token);

            // Check if this token is already taken by human players (AI tokens assigned after humans)
            const humanPlayers = players.filter(p => p && !p.isAI);
            const isTokenTaken = humanPlayers.some(p => p.tokenIndex === tokenIndex);
            if (isTokenTaken) {
                option.classList.add('disabled');
                option.style.opacity = '0.5';
                option.style.pointerEvents = 'none';
                // Add visual indicator
                const takenLabel = document.createElement('div');
                takenLabel.textContent = 'TAKEN';
                takenLabel.style.cssText = 'position: absolute; top: 5px; right: 5px; background: red; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;';
                option.appendChild(takenLabel);
            } else {
                option.addEventListener('click', () => {
                    // Remove selected class from all options
                    tokenOptions.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    selectedTokenIndex = tokenIndex;
                    if (confirmTokenBtn) {
                        confirmTokenBtn.disabled = false;
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error showing token selection:', error);
    }
    
    if (!tokenSelectionListenerAdded) {
        confirmTokenBtn.addEventListener('click', () => {
            if (selectedTokenIndex !== null) {
                console.log('=== EMITTING TOKEN SELECTION ===');
                console.log('TOKEN: Emitting selectToken with tokenIndex:', selectedTokenIndex);
                console.log('TOKEN: My player ID:', myPlayerId);
                console.log('TOKEN: Socket ID:', socket.id);
                console.log('TOKEN: Current player:', currentPlayer ? currentPlayer.name : 'NOT FOUND');
                console.log('TOKEN: Token name:', tokenData[selectedTokenIndex] ? tokenData[selectedTokenIndex].name : 'UNKNOWN');
                socket.emit('selectToken', { tokenIndex: selectedTokenIndex });
                tokenModal.classList.add('hidden');
            } else {
                console.log('TOKEN: No token selected');
            }
        });
        tokenSelectionListenerAdded = true;
    }
}

const confirmBuyBtn = document.getElementById('confirmBuyBtn');
const cancelBuyBtn = document.getElementById('cancelBuyBtn');
if (confirmBuyBtn) {
    confirmBuyBtn.addEventListener('click', () => {
        if (!activePropertyDecision) return;
        const { position, spaceData } = activePropertyDecision;
        const canAfford = currentPlayer && currentPlayer.money >= spaceData.price;
        clearPropertyDecisionTimer();
        buyModal.classList.add('hidden');

        if (canAfford) {
            waitingForBuyResult = true;
            socket.emit('buyProperty', { position });
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

sendChatBtn.addEventListener('click', () => {
    const message = chatInputEl.value.trim();
    if (message) {
        socket.emit('sendChat', { message });
        chatInputEl.value = '';
    }
});

chatInputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const message = chatInputEl.value.trim();
        if (message) {
            socket.emit('sendChat', { message });
            chatInputEl.value = '';
        }
    }
});

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
            modal.classList.add('hidden');
        }
    });
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Clear any stale player data from previous games
    localStorage.removeItem('playerName');
    
    // Card modal event listener
cardOkBtn.addEventListener('click', () => {
    cardModal.classList.add('hidden');
});

    // Orbit camera in Three.js (board + tokens share this view)
    if (boardContainer) {
        boardContainer.addEventListener('contextmenu', (e) => e.preventDefault());

        boardContainer.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                isRightMouseDown = true;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                boardContainer.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isRightMouseDown) return;

            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;

            cameraAzimuthDeg += deltaX * 0.5;
            cameraPolarDeg = Math.max(15, Math.min(85, cameraPolarDeg - deltaY * 0.5));
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
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1.2 : -1.2;
            cameraDistance = Math.max(CAMERA_DISTANCE_MIN, Math.min(CAMERA_DISTANCE_MAX, cameraDistance + delta));
            updateThreeCamera();
        }, { passive: false });

        boardContainer.addEventListener('dblclick', () => {
            cameraDistance = CAMERA_DISTANCE_DEFAULT;
            cameraPolarDeg = 55;
            cameraAzimuthDeg = 0;
            updateThreeCamera();
        });
    }

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
    if (css2dRenderer) {
        css2dRenderer.setSize(size.w, size.h);
    }
    return true;
}

function attachCenterPanelCSS2D() {
    const centerArea = document.getElementById('centerArea');
    if (!centerArea || !scene) return;
    if (typeof THREE.CSS2DRenderer === 'undefined' || typeof THREE.CSS2DObject === 'undefined') {
        console.warn('CSS2DRenderer not loaded; center panel stays 2D overlay');
        return;
    }
    if (css2dRenderer && centerPanelCSS2D) return;

    centerArea.classList.add('center-area--css2d');

    centerPanelCSS2D = new THREE.CSS2DObject(centerArea);
    const padTopY = BOARD_LAYOUT.tileHeight * 0.5 + 0.018;
    centerPanelCSS2D.position.set(0, padTopY + 0.04, 0);
    scene.add(centerPanelCSS2D);

    css2dRenderer = new THREE.CSS2DRenderer();
    const sz = getBoardContainerSize();
    if (sz) css2dRenderer.setSize(sz.w, sz.h);
    css2dRenderer.domElement.className = 'css2d-layer';
    css2dRenderer.domElement.style.position = 'absolute';
    css2dRenderer.domElement.style.left = '0';
    css2dRenderer.domElement.style.top = '0';
    css2dRenderer.domElement.style.width = '100%';
    css2dRenderer.domElement.style.height = '100%';
    css2dRenderer.domElement.style.pointerEvents = 'none';
    css2dRenderer.domElement.style.zIndex = '2';
    css2dRenderer.domElement.style.overflow = 'visible';
    token3DScene.appendChild(css2dRenderer.domElement);
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
    attachCenterPanelCSS2D();
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

// Y rotation so tile face (and color strip) point toward board center
function getTileFacingRotationY(row, col) {
    if (row === 0) return Math.PI;
    if (row === 10) return 0;
    if (col === 10) return -Math.PI / 2;
    if (col === 0) return Math.PI / 2;
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
        ctx.font = '800 40px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText('CHANCE', W / 2, H / 2 - 52);
        ctx.font = '800 118px "Segoe UI", sans-serif';
        ctx.fillStyle = '#ffc107';
        ctx.shadowColor = 'rgba(255, 193, 7, 0.45)';
        ctx.shadowBlur = 18;
        ctx.fillText('?', W / 2, H / 2 + 42);
    } else if (spaceData.type === 'community-chest') {
        ctx.fillStyle = '#f8fbff';
        ctx.font = '800 32px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText('COMMUNITY', W / 2, H / 2 - 28);
        ctx.fillText('CHEST', W / 2, H / 2 + 18);
    } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#f5f8fc';
        ctx.font = '700 26px "Segoe UI", Tahoma, sans-serif';
        const bodyLines = wrapCanvasLines(ctx, spaceData.name, inner.w - 32, 4);
        const sub = tileSubLabel(spaceData);
        const lineH = 28;
        const extra = sub ? 1 : 0;
        let ty = H / 2 - ((bodyLines.length + extra - 1) * lineH) / 2 + 6;
        bodyLines.forEach((ln) => {
            ctx.fillText(ln, W / 2, ty);
            ty += lineH;
        });
        if (sub) {
            ctx.font = '600 24px "Segoe UI", Tahoma, sans-serif';
            ctx.fillStyle = 'rgba(190, 210, 235, 0.95)';
            ctx.fillText(sub, W / 2, ty + 4);
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

    return group;
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

    scene.add(boardEnvironmentGroup);

    for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
            let position = null;

            if (row === 0) position = col;
            else if (row === 10) position = 20 + (10 - col);
            else if (col === 0) position = 30 + (10 - row);
            else if (col === 10) position = 10 + row;
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

// Animation loop for dice scene
function animateDiceScene() {
    requestAnimationFrame(animateDiceScene);

    if (diceRenderer && diceScene && diceCamera) {
        diceRenderer.render(diceScene, diceCamera);
    }
}

// Animation loop for 3D scene
function animate3DScene() {
    requestAnimationFrame(animate3DScene);
    
    update3DTokenPositions();
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
    if (css2dRenderer && scene && camera) {
        css2dRenderer.render(scene, camera);
    }
}

// Initialize the game
    initializeBoard();
    requestAnimationFrame(() => {
        try {
            start3DScene();
            animate3DScene();
            initializeDiceScene();
            animateDiceScene();
        } catch (error) {
            console.error('3D scene initialization failed:', error);
        }
    });
    updateUI();
});