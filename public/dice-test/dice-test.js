(function () {
    const viewport = document.getElementById('viewport');
    const loadStatus = document.getElementById('loadStatus');
    const die1Input = document.getElementById('die1Input');
    const die2Input = document.getElementById('die2Input');
    const targetResult = document.getElementById('targetResult');
    const detectedResult = document.getElementById('detectedResult');
    const matchResult = document.getElementById('matchResult');

    let scene, camera, renderer;
    let die1, die2, diceTemplate;
    let diceRolling = false;

    const DEG = Math.PI / 180;
    let rollTick = null;

    function dieSep() {
        return DICE_GLB_CONFIG.separation * 0.5;
    }

    function clampDie(v) {
        const n = parseInt(v, 10);
        if (Number.isNaN(n)) return 1;
        return Math.max(1, Math.min(6, n));
    }

    function updateResultDisplay(v1, v2) {
        const d1 = detectDiceFace(die1);
        const d2 = detectDiceFace(die2);
        targetResult.textContent = `${v1} + ${v2} = ${v1 + v2}`;
        detectedResult.textContent = `${d1} + ${d2} = ${d1 + d2}`;
        const ok = d1 === v1 && d2 === v2;
        matchResult.textContent = ok ? '✓ Correct' : '✗ Mismatch — check console layout';
        matchResult.className = ok ? 'ok' : 'bad';
    }

    function snapDice(v1, v2) {
        const landY = getDiceLandY();
        applyDiceFace(die1, v1);
        applyDiceFace(die2, v2);
        die1.position.set(-dieSep(), landY, 0);
        die2.position.set(dieSep(), landY, 0);
        updateResultDisplay(v1, v2);
    }

    function rollAnimation(v1, v2, onDone) {
        if (diceRolling || !die1 || !die2) return;
        diceRolling = true;

        rollTick = runDiceRollAnimation({
            meshes: [die1, die2],
            values: [v1, v2],
            onComplete: () => {
                diceRolling = false;
                updateResultDisplay(v1, v2);
                if (onDone) onDone();
            }
        });

        function frame(now) {
            if (!rollTick) return;
            if (rollTick(now)) requestAnimationFrame(frame);
            else rollTick = null;
        }
        requestAnimationFrame(frame);
    }

    function syncSlidersFromDie() {
        if (!die1) return;
        document.getElementById('rotX').value = Math.round(die1.rotation.x / DEG);
        document.getElementById('rotY').value = Math.round(die1.rotation.y / DEG);
        document.getElementById('rotZ').value = Math.round(die1.rotation.z / DEG);
        document.getElementById('rotXVal').textContent = document.getElementById('rotX').value + '°';
        document.getElementById('rotYVal').textContent = document.getElementById('rotY').value + '°';
        document.getElementById('rotZVal').textContent = document.getElementById('rotZ').value + '°';
    }

    function initScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 1.8, 4.2);
        camera.lookAt(0, 0.2, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        viewport.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const key = new THREE.DirectionalLight(0xffffff, 0.95);
        key.position.set(4, 8, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xaaccff, 0.35);
        fill.position.set(-4, 2, 3);
        scene.add(fill);

        function resize() {
            const w = viewport.clientWidth;
            const h = viewport.clientHeight;
            if (!w || !h) return;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
        resize();
        window.addEventListener('resize', resize);

        (function loop() {
            requestAnimationFrame(loop);
            renderer.render(scene, camera);
        })();
    }

    function prepareDie(root) {
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

    function getDiceModelUrls() {
        const urls = [];
        try {
            urls.push(new URL('../../Models/Dice/dice.glb', window.location.href).href);
            urls.push(new URL('../Models/Dice/dice.glb', window.location.href).href);
        } catch (e) { /* ignore */ }
        urls.push(`${window.location.origin}/Models/Dice/dice.glb`);
        urls.push('/Models/Dice/dice.glb');
        if (typeof DICE_GLB_CONFIG !== 'undefined' && DICE_GLB_CONFIG.modelPath) {
            urls.unshift(DICE_GLB_CONFIG.modelPath);
        }
        return [...new Set(urls)];
    }

    function onDiceModelLoaded(gltf, loadedFrom) {
        diceTemplate = prepareDie(gltf.scene);
        autoCalibrateDiceFaces(diceTemplate);

        die1 = diceTemplate.clone(true);
        die2 = diceTemplate.clone(true);
        const landY = getDiceLandY();
        die1.position.set(-dieSep(), landY, 0);
        die2.position.set(dieSep(), landY, 0);
        scene.add(die1);
        scene.add(die2);

        loadStatus.textContent = 'Calibrated — try 3 + 3';
        snapDice(3, 3);
        syncSlidersFromDie();
        console.log('Dice model loaded from:', loadedFrom);
    }

    function loadDice() {
        const loader = new THREE.GLTFLoader();
        const urls = getDiceModelUrls();
        let index = 0;

        function tryNext() {
            if (index >= urls.length) {
                loadStatus.textContent = 'Model not found. Run npm start → /dice-test/';
                return;
            }
            const url = urls[index++];
            loadStatus.textContent = 'Loading dice model…';
            loader.load(
                url,
                (gltf) => onDiceModelLoaded(gltf, url),
                undefined,
                (err) => {
                    console.warn('Dice load failed:', url, err);
                    tryNext();
                }
            );
        }
        tryNext();
    }

    document.getElementById('snapBtn').addEventListener('click', () => {
        snapDice(clampDie(die1Input.value), clampDie(die2Input.value));
        syncSlidersFromDie();
    });

    document.getElementById('rollBtn').addEventListener('click', () => {
        rollAnimation(clampDie(die1Input.value), clampDie(die2Input.value));
    });

    document.getElementById('randomBtn').addEventListener('click', () => {
        const v1 = Math.floor(Math.random() * 6) + 1;
        const v2 = Math.floor(Math.random() * 6) + 1;
        die1Input.value = v1;
        die2Input.value = v2;
        rollAnimation(v1, v2);
    });

    ['rotX', 'rotY', 'rotZ'].forEach((id) => {
        const el = document.getElementById(id);
        const valEl = document.getElementById(id + 'Val');
        el.addEventListener('input', () => {
            if (!die1) return;
            die1.rotation.x = parseFloat(document.getElementById('rotX').value) * DEG;
            die1.rotation.y = parseFloat(document.getElementById('rotY').value) * DEG;
            die1.rotation.z = parseFloat(document.getElementById('rotZ').value) * DEG;
            die1.quaternion.setFromEuler(die1.rotation);
            valEl.textContent = el.value + '°';
            updateResultDisplay(clampDie(die1Input.value), clampDie(die2Input.value));
        });
    });

    document.querySelectorAll('.assign-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const v = parseInt(btn.dataset.v, 10);
            const key = _pipKey(getLocalNormalForPip(v));
            DICE_LOCAL_PIP[key] = v;
            for (const axis of DICE_AXIS_DIRS) {
                if (_pipKey(axis) === key) continue;
                if (DICE_LOCAL_PIP[_pipKey(axis)] === v) {
                    delete DICE_LOCAL_PIP[_pipKey(axis)];
                }
            }
            buildFaceEulerFromLocalPip();
            loadStatus.textContent = `Face ${v} assigned from die 1 orientation`;
            snapDice(clampDie(die1Input.value), clampDie(die2Input.value));
        });
    });

    document.getElementById('exportConfigBtn').addEventListener('click', () => {
        const pipLines = DICE_LOCAL_PIP
            ? Object.entries(DICE_LOCAL_PIP).map(([k, v]) => `        '${k}': ${v},`).join('\n')
            : '';
        const eulerLines = Object.entries(DICE_GLB_CONFIG.faceEuler)
            .map(([k, e]) => `        ${k}: { x: ${e.x.toFixed(4)}, y: ${e.y.toFixed(4)}, z: ${e.z.toFixed(4)} },`)
            .join('\n');
        const text = `DICE_LOCAL_PIP:\n${pipLines}\n\nfaceEuler:\n${eulerLines}`;
        document.getElementById('configExport').textContent = text;
        navigator.clipboard?.writeText(text);
    });

    initScene();
    loadDice();
})();
