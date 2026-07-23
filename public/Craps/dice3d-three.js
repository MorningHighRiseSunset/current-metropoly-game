// Three.js 3D Dice Roller for Craps
// Usage: Call createThreeDice(container) to add dice to a DOM element

function createThreeDice(container) {
    // Create dice container
    const diceDiv = document.createElement('div');
    diceDiv.id = 'dice-threejs-wrapper';
    diceDiv.style.position = 'absolute';
    diceDiv.style.left = '120px';
    diceDiv.style.bottom = '16px';
    diceDiv.style.width = '60px';
    diceDiv.style.height = '60px';
    diceDiv.style.zIndex = '100';
    container.appendChild(diceDiv);

    // Add Roll Dice button
    const rollBtn = document.createElement('button');
    rollBtn.innerText = 'Roll Dice';
    rollBtn.style.position = 'absolute';
    rollBtn.style.left = '70px'; // Move to the right of the dice
    rollBtn.style.top = '24px'; // Lower the button a bit
    rollBtn.style.width = '80px';
    rollBtn.style.fontSize = '15px';
    rollBtn.style.background = '#27ae60';
    rollBtn.style.color = '#fff';
    rollBtn.style.border = 'none';
    rollBtn.style.borderRadius = '8px';
    rollBtn.style.cursor = 'pointer';
    rollBtn.style.zIndex = '101';
    diceDiv.appendChild(rollBtn);

    rollBtn.onclick = function() {
        diceDiv.onclick();
    };

    // Three.js setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(60, 60);
    diceDiv.appendChild(renderer.domElement);

    // Dice geometry: rounded box
    const diceGeo = new THREE.BoxGeometry(40, 40, 40, 8, 8, 8);
    const diceMaterials = [1,2,3,4,5,6].map(n => new THREE.MeshPhongMaterial({ map: createDiceTexture(n), shininess: 60 }));
    const diceMesh = new THREE.Mesh(diceGeo, diceMaterials);
    // Add subtle bevel
    diceMesh.castShadow = true;
    diceMesh.receiveShadow = true;
    scene.add(diceMesh); 

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(40, 60, 100);
    directional.castShadow = true;
    scene.add(directional);

    // Animation loop
    function animate() {
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }
    animate();

    // Roll dice on click
    diceDiv.onclick = function() {
        const roll = Math.floor(Math.random()*6)+1;
        rollDiceToFace(roll);
        if (typeof window.onDiceRoll === 'function') window.onDiceRoll(roll);
    };

    // Roll animation
    function rollDiceToFace(face) {
        // Face: 1-6
        // Map face to rotation
        const rotations = [
            [0, 0],           // 1
            [Math.PI, 0],     // 2
            [Math.PI/2, 0],   // 3
            [-Math.PI/2, 0],  // 4
            [0, -Math.PI/2],  // 5
            [0, Math.PI/2],   // 6
        ];
        const [x, y] = rotations[face-1];
        // Animate rotation
        let t = 0;
        const startX = diceMesh.rotation.x;
        const startY = diceMesh.rotation.y;
        const endX = x + Math.random()*2*Math.PI;
        const endY = y + Math.random()*2*Math.PI;
        function spin() {
            t += 0.08;
            diceMesh.rotation.x = startX + (endX-startX)*Math.min(t,1);
            diceMesh.rotation.y = startY + (endY-startY)*Math.min(t,1);
            if (t < 1) requestAnimationFrame(spin);
            else {
                diceMesh.rotation.x = x;
                diceMesh.rotation.y = y;
            }
        }
        spin();
    }

    // Dice face textures
    function createDiceTexture(n) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0,0,64,64);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.strokeRect(2,2,60,60);
        // Draw pips
        ctx.fillStyle = '#222';
        function pip(x, y) {
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fill();
        }
        if (n===1) pip(32,32);
        if (n===2) pip(16,16),pip(48,48);
        if (n===3) pip(16,16),pip(32,32),pip(48,48);
        if (n===4) pip(16,16),pip(48,16),pip(16,48),pip(48,48);
        if (n===5) pip(16,16),pip(48,16),pip(32,32),pip(16,48),pip(48,48);
        if (n===6) pip(16,16),pip(48,16),pip(16,32),pip(48,32),pip(16,48),pip(48,48);
        return new THREE.CanvasTexture(canvas);
    }

    return diceDiv;
}

// To use: createThreeDice(document.querySelector('.craps-table-image-wrapper'));
