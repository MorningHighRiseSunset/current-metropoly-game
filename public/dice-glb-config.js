/**
 * Dice configuration for procedurally generated dice (Three.js BoxGeometry).
 * Animation and timing configuration shared between game.js and dice-test.
 */
const DICE_GLB_CONFIG = {
    scale: 1.8,
    separation: 2.2,
    restOffsetY: 0.2,
    rollDurationMs: 3500,
    settleHoldMs: 800,
    tossHeight: 1.8,
    /** Must match server.js getRollAnimationMs perTileMs and game.js TOKEN_STEP_DURATION_MS */
    tokenStepMs: 80,
    faceEuler: {
        1: { x: 0, y: 0, z: 0 },
        2: { x: 0, y: 0, z: 0 },
        3: { x: 0, y: 0, z: 0 },
        4: { x: 0, y: 0, z: 0 },
        5: { x: 0, y: 0, z: 0 },
        6: { x: 0, y: 0, z: 0 }
    }
};

const DICE_WORLD_UP = new THREE.Vector3(0, 1, 0);

let DICE_LOCAL_PIP = null;
const _pipKey = (v) => `${v.x},${v.y},${v.z}`;
const _worldN = new THREE.Vector3();
const _qFaceUp = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');
const _spinAxis = new THREE.Vector3();
const _spinQ = new THREE.Quaternion();
const _box = new THREE.Box3();

// Pip mapping for procedurally generated dice (BoxGeometry face order)
// BoxGeometry: +X=2, -X=5, +Y=1, -Y=6, +Z=4, -Z=3
function getDefaultLocalPip() {
    return {
        '0,1,0': 1,   // +Y = top = 1
        '0,-1,0': 6,  // -Y = bottom = 6
        '0,0,1': 4,   // +Z = front = 4
        '0,0,-1': 3,  // -Z = back = 3
        '1,0,0': 2,   // +X = right = 2
        '-1,0,0': 5   // -X = left = 5
    };
}

function getLocalNormalForPip(pip) {
    if (!DICE_LOCAL_PIP) DICE_LOCAL_PIP = getDefaultLocalPip();
    for (const [key, value] of Object.entries(DICE_LOCAL_PIP)) {
        if (value === pip) {
            const [x, y, z] = key.split(',').map(Number);
            return new THREE.Vector3(x, y, z);
        }
    }
    return new THREE.Vector3(0, 1, 0);
}

// Compute quaternion to orient die so specified face points up (+Y)
function getDiceQuaternionForValue(value) {
    const localN = getLocalNormalForPip(value);
    _qFaceUp.setFromUnitVectors(localN, DICE_WORLD_UP);
    return _qFaceUp.clone();
}

function detectDiceFaceRaw(die) {
    let best = 1;
    let bestDot = -1;

    for (let pip = 1; pip <= 6; pip++) {
        const localN = getLocalNormalForPip(pip);
        _worldN.copy(localN).applyQuaternion(die.quaternion);
        const dot = _worldN.dot(DICE_WORLD_UP);
        if (dot > bestDot) {
            bestDot = dot;
            best = pip;
        }
    }
    return best;
}

function detectDiceFace(die) {
    return detectDiceFaceRaw(die);
}

function applyDiceFace(die, value) {
    die.quaternion.copy(getDiceQuaternionForValue(value));
    die.rotation.setFromQuaternion(die.quaternion, 'XYZ');
}

function applyDiceSpin(mesh, wx, wy, wz, dt) {
    _spinAxis.set(wx, wy, wz);
    const speed = _spinAxis.length();
    if (speed < 0.001) return;
    _spinAxis.multiplyScalar(1 / speed);
    _spinQ.setFromAxisAngle(_spinAxis, speed * dt);
    mesh.quaternion.premultiply(_spinQ);
    mesh.rotation.setFromQuaternion(mesh.quaternion, 'XYZ');
}

function getDiceLandY() {
    return DICE_GLB_CONFIG.restOffsetY;
}

function getDiceRollDurationMs() {
    return DICE_GLB_CONFIG.rollDurationMs || 1500;
}

function getDiceSettleHoldMs() {
    return DICE_GLB_CONFIG.settleHoldMs || 300;
}

function getDiceRollTotalMs() {
    return getDiceRollDurationMs() + getDiceSettleHoldMs();
}

function getTokenStepDurationMs() {
    return DICE_GLB_CONFIG.tokenStepMs || 150;
}

function getRollAnimationMs(rollTotal) {
    return getDiceRollTotalMs() + Math.max(0, rollTotal) * getTokenStepDurationMs();
}

function diceEulerForValue(value) {
    const q = getDiceQuaternionForValue(value);
    _euler.setFromQuaternion(q, 'XYZ');
    return new THREE.Euler(_euler.x, _euler.y, _euler.z, 'XYZ');
}

function _diceSmoothstep(edge0, edge1, x) {
    const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return u * u * (3 - 2 * u);
}

function runDiceRollAnimation(opts) {
    const meshes = opts.meshes;
    const values = opts.values;
    const duration = opts.duration ?? getDiceRollDurationMs();
    const anchor = opts.anchor || { x: 0, y: 0, z: 0 };
    const landY = anchor.y + getDiceLandY();
    const tossHeight = opts.tossHeight ?? DICE_GLB_CONFIG.tossHeight ?? 0.3;
    const sep = DICE_GLB_CONFIG.separation * 0.5;
    const start = performance.now();

    const targets = values.map((v) => getDiceQuaternionForValue(v));
    const states = meshes.map((mesh, i) => {
        const offsetX = i === 0 ? -sep : sep;
        const offsetZ = (Math.random() - 0.5) * 0.12;
        const startY = landY + tossHeight + i * 0.07;
        mesh.position.set(anchor.x + offsetX, startY, anchor.z + offsetZ);
        mesh.quaternion.setFromEuler(
            new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                'XYZ'
            )
        );
        mesh.rotation.setFromQuaternion(mesh.quaternion, 'XYZ');
        return {
            mesh,
            offsetX,
            offsetZ,
            y: startY,
            vy: 3.5 + Math.random() * 2.0,
            wx: (Math.random() - 0.5) * 55,
            wy: (Math.random() - 0.5) * 58,
            wz: (Math.random() - 0.5) * 52,
            targetQ: targets[i],
            bounceCount: 0
        };
    });

    let lastFrame = start;

    return function tick(now) {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);

        if (t >= 1) {
            states.forEach((s) => {
                s.mesh.quaternion.copy(s.targetQ);
                s.mesh.rotation.setFromQuaternion(s.mesh.quaternion, 'XYZ');
                s.mesh.position.set(anchor.x + s.offsetX, landY, anchor.z + s.offsetZ);
            });
            if (opts.onComplete) opts.onComplete();
            return false;
        }

        const dt = Math.min(0.032, Math.max(0.008, (now - lastFrame) / 1000));
        lastFrame = now;

        const spinMix = 1 - _diceSmoothstep(0.06, 0.58, t);
        const alignMix = _diceSmoothstep(0.5, 0.98, t);

        states.forEach((s) => {
            s.vy -= 13.5 * dt;
            s.y += s.vy * dt;

            const onGround = s.y <= landY;
            if (onGround) {
                if (s.vy < -0.05) {
                    s.bounceCount += 1;
                    const bounceDamp = 0.28 + Math.min(s.bounceCount, 5) * 0.06;
                    s.vy = -s.vy * Math.max(0.12, bounceDamp - t * 0.15);
                    if (Math.abs(s.vy) < 0.25 || t > 0.88) s.vy = 0;
                    if (s.bounceCount <= 4 && t < 0.75) {
                        s.wx += (Math.random() - 0.5) * 12;
                        s.wy += (Math.random() - 0.5) * 10;
                        s.wz += (Math.random() - 0.5) * 12;
                        // Add scatter on bounce
                        s.offsetX += (Math.random() - 0.5) * 0.15;
                        s.offsetZ += (Math.random() - 0.5) * 0.15;
                    }
                }
                s.y = landY;
                const groundSpinDamp = 0.82 - t * 0.28;
                s.wx *= groundSpinDamp;
                s.wy *= groundSpinDamp;
                s.wz *= groundSpinDamp;
            } else {
                const airDamp = 0.995;
                s.wx *= airDamp;
                s.wy *= airDamp;
                s.wz *= airDamp;
            }

            if (spinMix > 0.04) {
                applyDiceSpin(s.mesh, s.wx * spinMix, s.wy * spinMix, s.wz * spinMix, dt);
            }

            const grounded = onGround || s.y <= landY + 0.025;
            let alignRate = 0;
            if (grounded && t > 0.42) {
                alignRate = alignMix * 0.04;
                if (Math.abs(s.vy) < 0.2) alignRate += 0.06 + alignMix * 0.22;
            }
            if (t > 0.72) alignRate += (t - 0.72) * 0.55;

            if (alignRate > 0) {
                s.mesh.quaternion.slerp(s.targetQ, Math.min(0.42, alignRate));
                s.mesh.rotation.setFromQuaternion(s.mesh.quaternion, 'XYZ');
            }

            if (t > 0.82) {
                s.wx *= 0.7;
                s.wy *= 0.7;
                s.wz *= 0.7;
            }

            s.mesh.position.set(anchor.x + s.offsetX, s.y, anchor.z + s.offsetZ);
        });

        return true;
    };
}
