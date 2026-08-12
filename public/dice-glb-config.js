/**
 * Dice configuration for procedurally generated dice (Three.js BoxGeometry).
 * Animation and timing configuration shared between game.js and dice-test.
 */
const DICE_GLB_CONFIG = {
    scale: 0.45,
    separation: 3.0,
    restOffsetY: 0.2,
    rollDurationMs: 2100,
    settleHoldMs: 1400,
    tossHeight: 2.5,
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
const _wobbleEuler = new THREE.Euler(0, 0, 0, 'XYZ');
const _wobbleQ = new THREE.Quaternion();
const _settleQ = new THREE.Quaternion();

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

function _diceEaseOutCubic(t) {
    const u = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - u, 3);
}

function _diceLerp(a, b, t) {
    return a + (b - a) * t;
}

/** Fade dice out after settle hold — scale down + slight lift */
function runDiceFadeOutAnimation(meshes, durationMs, onComplete) {
    const meshesAlive = meshes.filter(Boolean);
    if (!meshesAlive.length) {
        if (onComplete) onComplete();
        return null;
    }

    const startY = meshesAlive.map((m) => m.position.y);
    const start = performance.now();

    return function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const ease = _diceEaseOutCubic(t);
        const scale = 1 - ease * 0.92;

        meshesAlive.forEach((mesh, i) => {
            mesh.scale.setScalar(Math.max(0.01, scale));
            mesh.position.y = startY[i] + ease * 0.18;
        });

        if (t >= 1) {
            meshesAlive.forEach((mesh) => {
                mesh.visible = false;
                mesh.scale.setScalar(1);
            });
            if (onComplete) onComplete();
            return false;
        }
        return true;
    };
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
        const offsetZ = (Math.random() - 0.5) * 0.18;
        const startY = landY + 0.05;
        mesh.position.set(anchor.x + offsetX, startY, anchor.z + offsetZ);
        mesh.scale.setScalar(1);
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
            restX: offsetX,
            restZ: offsetZ,
            offsetX,
            offsetZ,
            vx: (Math.random() - 0.5) * 0.35,
            vz: (Math.random() - 0.5) * 0.35,
            y: startY,
            vy: 5.8 + Math.random() * 2.4 + tossHeight * 0.8,
            wx: (Math.random() - 0.5) * 68,
            wy: (Math.random() - 0.5) * 72,
            wz: (Math.random() - 0.5) * 64,
            targetQ: targets[i],
            bounceCount: 0,
            wobblePhase: Math.random() * Math.PI * 2,
            squash: 0,
            groundedFrames: 0
        };
    });

    let lastFrame = start;
    const TUMBLE_END = 0.74;
    const SETTLE_START = 0.74;

    return function tick(now) {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);

        if (t >= 1) {
            states.forEach((s) => {
                s.mesh.quaternion.copy(s.targetQ);
                s.mesh.rotation.setFromQuaternion(s.mesh.quaternion, 'XYZ');
                s.mesh.position.set(anchor.x + s.restX, landY, anchor.z + s.restZ);
                s.mesh.scale.setScalar(1);
            });
            if (opts.onComplete) opts.onComplete();
            return false;
        }

        const dt = Math.min(0.032, Math.max(0.008, (now - lastFrame) / 1000));
        lastFrame = now;

        const tumbleT = Math.min(1, t / TUMBLE_END);
        const spinMix = 1 - _diceSmoothstep(0.08, 0.62, tumbleT);
        const inSettle = t >= SETTLE_START;
        const settleT = inSettle ? (t - SETTLE_START) / (1 - SETTLE_START) : 0;

        states.forEach((s) => {
            if (!inSettle) {
                s.vy -= 15 * dt;
                s.y += s.vy * dt;
                s.offsetX += s.vx * dt;
                s.offsetZ += s.vz * dt;

                const onGround = s.y <= landY;
                if (onGround) {
                    s.groundedFrames += 1;
                    if (s.vy < -0.08) {
                        s.bounceCount += 1;
                        const impact = Math.min(1, Math.abs(s.vy) / 5.5);
                        s.squash = Math.max(s.squash, impact * 0.85);

                        const restitution = Math.max(0.14, 0.42 - s.bounceCount * 0.07 - t * 0.12);
                        s.vy = -s.vy * restitution;

                        if (Math.abs(s.vy) < 0.35 || t > 0.68) s.vy = 0;

                        s.vx *= 0.55;
                        s.vz *= 0.55;

                        if (s.bounceCount <= 5 && t < 0.68) {
                            s.wx += (Math.random() - 0.5) * 18;
                            s.wy += (Math.random() - 0.5) * 14;
                            s.wz += (Math.random() - 0.5) * 18;
                        }
                    }
                    s.y = landY;

                    const groundSpinDamp = 0.78 - t * 0.22;
                    s.wx *= groundSpinDamp;
                    s.wy *= groundSpinDamp;
                    s.wz *= groundSpinDamp;
                } else {
                    s.groundedFrames = 0;
                    const airDamp = 0.992;
                    s.wx *= airDamp;
                    s.wy *= airDamp;
                    s.wz *= airDamp;
                }

                if (spinMix > 0.04) {
                    applyDiceSpin(s.mesh, s.wx * spinMix, s.wy * spinMix, s.wz * spinMix, dt);
                }

                const grounded = onGround || s.y <= landY + 0.03;
                let alignRate = 0;
                if (grounded && t > 0.38) {
                    alignRate = _diceSmoothstep(0.38, 0.72, t) * 0.05;
                    if (Math.abs(s.vy) < 0.25) alignRate += 0.04;
                }
                if (alignRate > 0) {
                    s.mesh.quaternion.slerp(s.targetQ, Math.min(0.28, alignRate));
                    s.mesh.rotation.setFromQuaternion(s.mesh.quaternion, 'XYZ');
                }
            } else {
                const settleEase = _diceEaseOutCubic(settleT);
                const wobbleAmp = (1 - settleEase) * 0.07;
                const wobble = wobbleAmp * Math.sin(settleT * Math.PI * 5.5 + s.wobblePhase);

                s.offsetX = _diceLerp(s.offsetX, s.restX, 0.12 + settleEase * 0.22);
                s.offsetZ = _diceLerp(s.offsetZ, s.restZ, 0.12 + settleEase * 0.22);
                s.y = landY + Math.abs(Math.sin(settleT * Math.PI * 2.2 + s.wobblePhase)) * wobbleAmp * 0.35;

                s.wx *= 0.72;
                s.wy *= 0.72;
                s.wz *= 0.72;

                s.mesh.quaternion.slerp(s.targetQ, 0.08 + settleEase * 0.28);
                _wobbleEuler.set(wobble * 0.55, wobble * 0.25, wobble * 0.4);
                _wobbleQ.setFromEuler(_wobbleEuler);
                _settleQ.copy(s.mesh.quaternion).multiply(_wobbleQ);
                s.mesh.quaternion.copy(_settleQ);
                s.mesh.rotation.setFromQuaternion(s.mesh.quaternion, 'XYZ');
            }

            if (s.squash > 0) {
                s.squash = Math.max(0, s.squash - dt * 7.5);
                const sq = s.squash;
                const sy = 1 - sq * 0.14;
                const sxz = 1 + sq * 0.07;
                s.mesh.scale.set(sxz, sy, sxz);
            } else if (inSettle) {
                s.mesh.scale.setScalar(_diceLerp(s.mesh.scale.x, 1, 0.18));
            }

            s.mesh.position.set(anchor.x + s.offsetX, s.y, anchor.z + s.offsetZ);
        });

        return true;
    };
}
