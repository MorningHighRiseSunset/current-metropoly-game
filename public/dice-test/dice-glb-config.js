/**
 * Same as /dice-glb-config.js — keep in sync.
 */
const DICE_GLB_CONFIG = {
    get modelPath() {
        try {
            return new URL('../../Models/Dice/dice.glb', window.location.href).href;
        } catch (e) {
            return '/Models/Dice/dice.glb';
        }
    },
    scale: 1,
    separation: 1.65,
    restOffsetY: 0.2,
    rollDurationMs: 4500,
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

const DICE_AXIS_DIRS = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0)
];

let DICE_LOCAL_PIP = null;
const _pipKey = (v) => `${v.x},${v.y},${v.z}`;
const _worldN = new THREE.Vector3();
const _qFaceUp = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');
const _spinAxis = new THREE.Vector3();
const _spinQ = new THREE.Quaternion();
const _box = new THREE.Box3();

function getDefaultLocalPip() {
    return {
        '0,1,0': 1,
        '0,-1,0': 6,
        '0,0,1': 4,
        '0,0,-1': 3,
        '1,0,0': 2,
        '-1,0,0': 5
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

function cacheDiceRestOffsetY(template) {
    applyDiceFace(template, 1);
    template.position.set(0, 0, 0);
    template.updateMatrixWorld(true);
    _box.setFromObject(template);
    DICE_GLB_CONFIG.restOffsetY = Math.max(0.05, -_box.min.y);
}

function getDiceLandY() {
    return DICE_GLB_CONFIG.restOffsetY;
}

function getDiceRollDurationMs() {
    return DICE_GLB_CONFIG.rollDurationMs || 4500;
}

function buildFaceEulerFromLocalPip() {
    for (let pip = 1; pip <= 6; pip++) {
        const q = getDiceQuaternionForValue(pip);
        _euler.setFromQuaternion(q, 'XYZ');
        DICE_GLB_CONFIG.faceEuler[pip] = { x: _euler.x, y: _euler.y, z: _euler.z };
    }
}

function diceEulerForValue(value) {
    const e = DICE_GLB_CONFIG.faceEuler[value] || DICE_GLB_CONFIG.faceEuler[1];
    return new THREE.Euler(e.x, e.y, e.z, 'XYZ');
}

function selfTestFaceMap(template) {
    for (let pip = 1; pip <= 6; pip++) {
        const clone = template.clone(true);
        clone.position.set(0, 0, 0);
        clone.quaternion.set(0, 0, 0, 1);
        clone.rotation.set(0, 0, 0);
        applyDiceFace(clone, pip);
        if (detectDiceFace(clone) !== pip) return false;
    }
    return true;
}

function autoCalibrateDiceFaces(template) {
    DICE_LOCAL_PIP = getDefaultLocalPip();
    buildFaceEulerFromLocalPip();

    if (selfTestFaceMap(template)) {
        console.log('Dice face map OK for dice.glb');
    } else {
        console.warn('Dice face self-test failed — check Models/Dice/dice.glb');
    }

    cacheDiceRestOffsetY(template);
}

function _diceSmoothstep(edge0, edge1, x) {
    const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return u * u * (3 - 2 * u);
}

function runDiceRollAnimation(opts) {
    const meshes = opts.meshes;
    const values = opts.values;
    const duration = opts.duration ?? getDiceRollDurationMs();
    const landY = getDiceLandY();
    const sep = DICE_GLB_CONFIG.separation * 0.5;
    const start = performance.now();

    const targets = values.map((v) => getDiceQuaternionForValue(v));
    const states = meshes.map((mesh, i) => {
        const x = i === 0 ? -sep : sep;
        const startY = 0.95 + i * 0.05;
        mesh.position.set(x, startY, 0);
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
            x,
            y: startY,
            vy: -0.4 - Math.random() * 0.3,
            wx: (Math.random() - 0.5) * 24,
            wy: (Math.random() - 0.5) * 26,
            wz: (Math.random() - 0.5) * 22,
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
                s.mesh.position.set(s.x, landY, 0);
            });
            if (opts.onComplete) opts.onComplete();
            return false;
        }

        const dt = Math.min(0.032, Math.max(0.008, (now - lastFrame) / 1000));
        lastFrame = now;

        const spinMix = 1 - _diceSmoothstep(0.12, 0.72, t);
        const alignMix = _diceSmoothstep(0.08, 0.92, t);

        states.forEach((s) => {
            s.vy -= 9.8 * dt * 0.72;
            s.y += s.vy * dt;

            const onGround = s.y <= landY;
            if (onGround) {
                if (s.vy < 0) {
                    s.bounceCount += 1;
                    const bounceDamp = 0.18 + Math.min(s.bounceCount, 4) * 0.06;
                    s.vy = -s.vy * Math.max(0.12, bounceDamp - t * 0.08);
                    if (Math.abs(s.vy) < 0.2 || t > 0.82) s.vy = 0;
                }
                s.y = landY;
                const groundSpinDamp = 0.82 - t * 0.2;
                s.wx *= groundSpinDamp;
                s.wy *= groundSpinDamp;
                s.wz *= groundSpinDamp;
            } else {
                const airDamp = 0.988;
                s.wx *= airDamp;
                s.wy *= airDamp;
                s.wz *= airDamp;
            }

            if (spinMix > 0.03) {
                applyDiceSpin(s.mesh, s.wx * spinMix, s.wy * spinMix, s.wz * spinMix, dt);
            }

            const grounded = onGround || s.y <= landY + 0.02;
            let alignRate = alignMix * 0.05;
            if (grounded) {
                alignRate += 0.08 + alignMix * 0.28;
                if (Math.abs(s.vy) < 0.15) alignRate += 0.15;
            }
            if (t > 0.55) alignRate += (t - 0.55) * 0.45;

            s.mesh.quaternion.slerp(s.targetQ, Math.min(0.55, alignRate));
            s.mesh.rotation.setFromQuaternion(s.mesh.quaternion, 'XYZ');

            if (t > 0.78) {
                s.wx *= 0.75;
                s.wy *= 0.75;
                s.wz *= 0.75;
            }

            s.mesh.position.set(s.x, s.y, 0);
        });

        return true;
    };
}
