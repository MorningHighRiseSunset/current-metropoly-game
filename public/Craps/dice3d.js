// 3D Dice Roller for Craps
// Usage: Call createDice3D(container) to add dice to a DOM element

function createDice3D(container) {
    const diceWrapper = document.createElement('div');
    diceWrapper.id = 'dice-3d-wrapper';
    diceWrapper.style.position = 'absolute';
    diceWrapper.style.right = '40px';
    diceWrapper.style.bottom = '40px';
    diceWrapper.style.width = '80px';
    diceWrapper.style.height = '80px';
    diceWrapper.style.perspective = '600px';
    diceWrapper.style.zIndex = '100';

    // Dice cube
    const dice = document.createElement('div');
    dice.className = 'dice-3d';
    dice.style.width = '80px';
    dice.style.height = '80px';
    dice.style.position = 'absolute';
    dice.style.transformStyle = 'preserve-3d';
    dice.style.transition = 'transform 1s cubic-bezier(.25,1.7,.5,1.15)';

    // Dice faces
    for (let i = 1; i <= 6; i++) {
        const face = document.createElement('div');
        face.className = 'dice-face dice-face-' + i;
        face.style.position = 'absolute';
        face.style.width = '80px';
        face.style.height = '80px';
        face.style.background = '#fff';
        face.style.border = '2px solid #222';
        face.style.boxSizing = 'border-box';
        face.style.display = 'flex';
        face.style.alignItems = 'center';
        face.style.justifyContent = 'center';
        face.innerHTML = getDiceSVG(i);
        // Position faces
        if (i === 1) face.style.transform = 'rotateY(0deg) translateZ(40px)';
        if (i === 2) face.style.transform = 'rotateY(180deg) translateZ(40px)';
        if (i === 3) face.style.transform = 'rotateX(90deg) translateZ(40px)';
        if (i === 4) face.style.transform = 'rotateX(-90deg) translateZ(40px)';
        if (i === 5) face.style.transform = 'rotateY(90deg) translateZ(40px)';
        if (i === 6) face.style.transform = 'rotateY(-90deg) translateZ(40px)';
        dice.appendChild(face);
    }
    diceWrapper.appendChild(dice);
    container.appendChild(diceWrapper);

    // Roll function
    diceWrapper.rollDice = function(result) {
        // result: 1-6
        const rotations = [
            'rotateY(0deg)',           // 1
            'rotateY(180deg)',         // 2
            'rotateX(-90deg)',         // 3
            'rotateX(90deg)',          // 4
            'rotateY(-90deg)',         // 5
            'rotateY(90deg)',          // 6
        ];
        dice.style.transform = rotations[result-1] + ' scale(1.08)';
        setTimeout(() => {
            dice.style.transform = rotations[result-1];
        }, 900);
    };

    // Click to roll
    diceWrapper.onclick = function() {
        const roll = Math.floor(Math.random()*6)+1;
        diceWrapper.rollDice(roll);
        if (typeof window.onDiceRoll === 'function') window.onDiceRoll(roll);
    };

    return diceWrapper;
}

function getDiceSVG(n) {
    // Returns SVG for dice face n
    const dot = '<circle cx="16" cy="16" r="6" fill="#222"/>';
    const dots = [
        [dot],
        [dot, '<circle cx="64" cy="64" r="6" fill="#222"/>'],
        [dot, '<circle cx="64" cy="16" r="6" fill="#222"/>', '<circle cx="16" cy="64" r="6" fill="#222"/>'],
        [dot, '<circle cx="64" cy="16" r="6" fill="#222"/>', '<circle cx="16" cy="64" r="6" fill="#222"/>', '<circle cx="64" cy="64" r="6" fill="#222"/>'],
        [dot, '<circle cx="64" cy="16" r="6" fill="#222"/>', '<circle cx="16" cy="64" r="6" fill="#222"/>', '<circle cx="64" cy="64" r="6" fill="#222"/>', '<circle cx="40" cy="40" r="6" fill="#222"/>'],
        [dot, '<circle cx="64" cy="16" r="6" fill="#222"/>', '<circle cx="16" cy="64" r="6" fill="#222"/>', '<circle cx="64" cy="64" r="6" fill="#222"/>', '<circle cx="16" cy="40" r="6" fill="#222"/>', '<circle cx="64" cy="40" r="6" fill="#222"/>'],
    ];
    return `<svg width="80" height="80">${dots[n-1].join('')}</svg>`;
}

// To use: createDice3D(document.querySelector('.craps-table-image-wrapper'));
