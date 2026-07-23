// Auto-create Three.js 3D dice roller on page load
window.initCrapsMinigame = function(container, bankroll = 2500, updateMainGameBalance) {
	// Clear container
	container.innerHTML = '';
	// Create craps table wrapper
	const wrapper = document.createElement('div');
	wrapper.className = 'craps-table-image-wrapper';
	container.appendChild(wrapper);
	// Add table image
	const img = document.createElement('img');
	img.src = 'Craps_table_diagram.svg.png';
	img.alt = 'Craps Table';
	img.className = 'craps-table-img';
	wrapper.appendChild(img);
	// Create dice roller if available
	if (typeof createThreeDice === 'function') {
		const diceDiv = createThreeDice(wrapper);
		diceDiv.style.pointerEvents = 'none';
		diceDiv.style.opacity = '0.5';
		window.enableDiceRoll = function() {
			diceDiv.style.pointerEvents = 'auto';
			diceDiv.style.opacity = '1';
		};
		// ====== CRAPS GAME STATE ======
		let gamePhase = 'comeout'; // 'comeout' or 'point'
		let point = null;
		function getPassLineBet() {
			return playerBets.find(b => {
				const area = BETTING_AREAS.find(a => a.id === b.areaId);
				return area && area.label.toLowerCase() === 'pass line';
			});
		// End of window.initCrapsMinigame
		function getDontPassBet() {
			return playerBets.find(b => {
				const area = BETTING_AREAS.find(a => a.id === b.areaId);
				return area && area.label.toLowerCase() === "don't pass";
			});
		}
		function showDiceResult(roll) {
			let resultDiv = document.getElementById('dice-result-popup');
			if (!resultDiv) {
				resultDiv = document.createElement('div');
				resultDiv.id = 'dice-result-popup';
				resultDiv.style.position = 'absolute';
				resultDiv.style.left = '50%';
				resultDiv.style.top = '20px';
				resultDiv.style.transform = 'translateX(-50%)';
				resultDiv.style.background = '#222d';
				resultDiv.style.color = '#fff';
				resultDiv.style.fontSize = '28px';
				resultDiv.style.fontWeight = 'bold';
				resultDiv.style.padding = '12px 32px';
				resultDiv.style.borderRadius = '12px';
				resultDiv.style.zIndex = '200';
				wrapper.appendChild(resultDiv);
			}
			resultDiv.innerText = `Dice rolled: ${roll}`;
			resultDiv.style.display = '';
			setTimeout(() => {
				resultDiv.innerText = '';
				resultDiv.style.display = 'none';
			}, 1800);
		}
		function showStatus(msg) {
			let statusDiv = document.getElementById('craps-status');
			if (!statusDiv) {
				statusDiv = document.createElement('div');
				statusDiv.id = 'craps-status';
				statusDiv.style.position = 'absolute';
				statusDiv.style.left = '50%';
				statusDiv.style.top = '60px';
				statusDiv.style.transform = 'translateX(-50%)';
				statusDiv.style.background = '#222d';
				statusDiv.style.color = '#fff';
				statusDiv.style.fontSize = '22px';
				statusDiv.style.fontWeight = 'bold';
				statusDiv.style.padding = '10px 28px';
				statusDiv.style.borderRadius = '10px';
				statusDiv.style.zIndex = '210';
				wrapper.appendChild(statusDiv);
			}
			statusDiv.innerText = msg;
			statusDiv.style.display = '';
			setTimeout(() => {
				statusDiv.innerText = '';
				statusDiv.style.display = 'none';
			}, 1800);
		}
		function payBet(bet, payout, msg) {
			playerBankroll += bet.amount * (payout - 1);
			showStatus(msg + ` +$${bet.amount * (payout - 1)}`);
			if (typeof updateMainGameBalance === 'function') updateMainGameBalance(playerBankroll);
			// Send winnings to parent window via postMessage
			if (window.parent !== window) {
				const initialBalance = bankroll || 2500;
				const winnings = playerBankroll - initialBalance;
				if (winnings !== 0) {
					window.parent.postMessage({ type: 'casinoWinnings', amount: winnings }, '*');
				}
			}
		}
		function loseBet(bet, msg) {
			showStatus(msg + ` -$${bet.amount}`);
			if (typeof updateMainGameBalance === 'function') updateMainGameBalance(playerBankroll);
			// Send winnings to parent window via postMessage
			if (window.parent !== window) {
				const initialBalance = bankroll || 2500;
				const winnings = playerBankroll - initialBalance;
				if (winnings !== 0) {
					window.parent.postMessage({ type: 'casinoWinnings', amount: winnings }, '*');
				}
			}
		}
		function pushBet(bet, msg) {
			playerBankroll += bet.amount;
			showStatus(msg + ` (push)`);
			if (typeof updateMainGameBalance === 'function') updateMainGameBalance(playerBankroll);
			// Send winnings to parent window via postMessage
			if (window.parent !== window) {
				const initialBalance = bankroll || 2500;
				const winnings = playerBankroll - initialBalance;
				if (winnings !== 0) {
					window.parent.postMessage({ type: 'casinoWinnings', amount: winnings }, '*');
				}
			}
		}
		function endRound() {
			setTimeout(() => {
				playerBets = [];
				playerChips = getChipBreakdown(playerBankroll);
				gamePhase = 'comeout';
				point = null;
				renderBettingAreas();
				showStatus('Place your bets for a new round!');
			}, 1800);
		}
		function handleCrapsRoll(roll) {
			const passBet = getPassLineBet();
			const dontPassBet = getDontPassBet();
			if (gamePhase === 'comeout') {
				if (roll === 7 || roll === 11) {
					if (passBet) payBet(passBet, 2, 'Pass Line wins!');
					if (dontPassBet) loseBet(dontPassBet, "Don't Pass loses.");
					endRound();
				} else if ([2, 3, 12].includes(roll)) {
					if (passBet) loseBet(passBet, 'Pass Line loses.');
					if (dontPassBet) {
						if (roll === 2 || roll === 3) payBet(dontPassBet, 2, "Don't Pass wins!");
						else if (roll === 12) pushBet(dontPassBet, "Don't Pass pushes.");
					}
					endRound();
				} else {
					point = roll;
					gamePhase = 'point';
					showStatus(`Point is set to ${point}. Keep rolling!`);
				}
			} else if (gamePhase === 'point') {
				if (roll === point) {
					if (passBet) payBet(passBet, 2, `Pass Line wins! Made the point (${point})`);
					if (dontPassBet) loseBet(dontPassBet, "Don't Pass loses.");
					endRound();
				} else if (roll === 7) {
					if (passBet) loseBet(passBet, 'Pass Line loses (seven out).');
					if (dontPassBet) payBet(dontPassBet, 2, "Don't Pass wins (seven out)!");
					endRound();
				} else {
					showStatus(`Point is ${point}. Roll again!`);
				}
			}
		}
		window.onDiceRoll = function(roll) {
			showDiceResult(roll);
			handleCrapsRoll(roll);
		};
	}
	playerBankroll = bankroll;
	playerChips = getChipBreakdown(bankroll);
	renderPlayerChips();
	renderBettingAreas();
};
// Each box is numbered (black), and their coordinates/rotation are shown in a side box for easy copy-paste.
// You can change the label for each area in the labels array below.


/*
(() => {
	const ENABLE_TESTING_MODE = false; // Testing mode now disabled
	if (!ENABLE_TESTING_MODE) return;

	// Always clear localStorage for fresh box state (for development/testing)
	localStorage.removeItem('craps_betting_boxes');

	// --- Config ---
		const MAX_BOXES = 24;
	const DEFAULT_BOX = { width: 80, height: 60, x: 100, y: 100, rotation: 0 };
	   const labels = [
		   'field', // 1
		   'pass line', // 2
		   "don't pass", // 3
		   'come', // 4
		   "don't come", // 5
		   'big 6', // 6
		   'big 8', // 7
		   'place 4', // 8
		   'place 5', // 9
		   'place 6', // 10
		   'place 8', // 11
		   'place 9', // 12
		   'place 10', // 13
		   'hardways 1', // 14
		   'hardways 2', // 15
		   'hardways 3', // 16
		   'hardways 4', // 17
		   'hardways 5', // 18
		   'hardways 6', // 19
		   'hardways 7', // 20
		   'hardways 8', // 21
		   'hardways 9', // 22
		   'hardways 10', // 23
		   'hardways 11', // 24
	   ];

	// --- DOM ---
	let overlay, coordsBox, coordsList;

	window.addEventListener('DOMContentLoaded', () => {
		overlay = document.getElementById('betting-areas-overlay');
		coordsBox = document.getElementById('betting-areas-coords-box');
		coordsList = document.getElementById('betting-areas-coords-list');

		updateOverlayRect();
		initializeBoxes();
		renderBoxes();
		updateCoordsList();

		// Attach all event listeners that depend on overlay
		if (overlay) {
			overlay.addEventListener('mousedown', mousedownHandler);
		}
	});

	function mousedownHandler(e) {
		if (e.target.classList.contains('resize-handle')) {
			resizeBox = boxes.find(b => b._resize === e.target);
			selectBox(resizeBox);
			dragOffset = {
				startX: e.clientX,
				startY: e.clientY,
				startW: resizeBox.width,
				startH: resizeBox.height
			};
			e.preventDefault();
		} else if (e.target.classList.contains('rotate-handle')) {
			rotateBox = boxes.find(b => b._rotate === e.target);
			selectBox(rotateBox);
			const rect = rotateBox._el.getBoundingClientRect();
			rotateStart = {
				cx: rect.left + rect.width/2,
				cy: rect.top + rect.height/2,
				startAngle: rotateBox.rotation
			};
			e.preventDefault();
		} else if (e.target.classList.contains('betting-area-box')) {
			dragBox = boxes.find(b => b._el === e.target);
			selectBox(dragBox);
			dragOffset = {
				x: e.clientX - dragBox.x,
				y: e.clientY - dragBox.y
			};
			e.preventDefault();
		}
	}
	// Stack all boxes at the exact same position (single sticky note pad)
	let boxes = [];
	let currentBoxIndex = 0;
	function getInitialBoxPosition() {
		const img = document.querySelector('.craps-table-img');
		if (!img) return { x: 40, y: 40 };
		// Place all boxes inside the image, near the top-right, all overlapping
		const offsetX = img.offsetLeft + img.offsetWidth - DEFAULT_BOX.width - 24;
		const offsetY = img.offsetTop + 24;
		return { x: offsetX, y: offsetY };
	}

	   // Pre-populated coordinates for boxes 1-30 (all unique, visible, non-overlapping, and matching labels)
	   const PRESET_BOXES = [
		   {x:134, y:206, width:236, height:38, rotation:0}, // 1 field
		   {x:77, y:279, width:292, height:20, rotation:0}, // 2 pass line
		   {x:131, y:251, width:242, height:20, rotation:0}, // 3 don't pass
		   {x:86, y:140, width:285, height:59, rotation:0}, // 4 come
		   {x:85, y:74, width:41, height:60, rotation:0}, // 5 don't come
		   {x:57, y:210, width:30, height:30, rotation:50}, // 6 big 6
		   {x:90, y:243, width:30, height:28, rotation:44}, // 7 big 8
		   {x:132, y:74, width:40, height:59, rotation:0}, // 8 place 4
		   {x:178, y:74, width:41, height:58, rotation:0}, // 9 place 5
		   {x:227, y:75, width:38, height:59, rotation:0}, // 10 place 6
		   {x:273, y:75, width:37, height:59, rotation:0}, // 11 place 8
		   {x:317, y:75, width:41, height:58, rotation:0}, // 12 place 9
		   {x:367, y:76, width:36, height:56, rotation:0}, // 13 place 10
		   // Boxes 14-24: sticky note pad, all at same position, moved further right
		   {x:900, y:120, width:80, height:60, rotation:0}, // 14
		   {x:900, y:120, width:80, height:60, rotation:0}, // 15
		   {x:900, y:120, width:80, height:60, rotation:0}, // 16
		   {x:900, y:120, width:80, height:60, rotation:0}, // 17
		   {x:900, y:120, width:80, height:60, rotation:0}, // 18
		   {x:900, y:120, width:80, height:60, rotation:0}, // 19
		   {x:900, y:120, width:80, height:60, rotation:0}, // 20
		   {x:900, y:120, width:80, height:60, rotation:0}, // 21
		   {x:900, y:120, width:80, height:60, rotation:0}, // 22
		   {x:900, y:120, width:80, height:60, rotation:0}, // 23
		   {x:900, y:120, width:80, height:60, rotation:0}, // 24
	   ];

	function saveBoxState() {
		localStorage.setItem('craps_betting_boxes', JSON.stringify({boxes, currentBoxIndex}));
	}
	function loadBoxState() {
		const data = localStorage.getItem('craps_betting_boxes');
		if (data) {
			try {
				const parsed = JSON.parse(data);
				if (Array.isArray(parsed.boxes) && typeof parsed.currentBoxIndex === 'number') {
					boxes = parsed.boxes;
					currentBoxIndex = parsed.currentBoxIndex;
					return true;
				}
			} catch {}
		}
		return false;
	}
	function renderBoxes() {
		overlay.innerHTML = '';
		// Only show the first box that hasn't been dragged
		if (boxes[currentBoxIndex]) {
			const box = boxes[currentBoxIndex];
			const el = document.createElement('div');
			el.className = 'betting-area-box';
			el.style.left = box.x + 'px';
			el.style.top = box.y + 'px';
			el.style.width = box.width + 'px';
			el.style.height = box.height + 'px';
			el.style.transform = `rotate(${box.rotation}deg)`;
			el.innerHTML = `<span>${box.id}</span>`;
			// Resize handle
			const resize = document.createElement('div');
			resize.className = 'resize-handle';
			el.appendChild(resize);
			// Rotate handle
			const rotate = document.createElement('div');
			rotate.className = 'rotate-handle';
			el.appendChild(rotate);
			overlay.appendChild(el);
			box._el = el;
			box._resize = resize;
			box._rotate = rotate;
		}
		// Render all previously dragged boxes
		for (let i = 0; i < currentBoxIndex; i++) {
			const box = boxes[i];
			const el = document.createElement('div');
			el.className = 'betting-area-box';
			el.style.left = box.x + 'px';
			el.style.top = box.y + 'px';
			el.style.width = box.width + 'px';
			el.style.height = box.height + 'px';
			el.style.transform = `rotate(${box.rotation}deg)`;
			el.innerHTML = `<span>${box.id}</span>`;
			// Resize handle
			const resize = document.createElement('div');
			resize.className = 'resize-handle';
			el.appendChild(resize);
			// Rotate handle
			const rotate = document.createElement('div');
			rotate.className = 'rotate-handle';
			el.appendChild(rotate);
			overlay.appendChild(el);
			box._el = el;
			box._resize = resize;
			box._rotate = rotate;
		}
	}
	   function initializeBoxes() {
		   if (loadBoxState()) {
			   renderBoxes();
			   return;
		   }
		   const pos = getInitialBoxPosition();
		   boxes = [];
		   for (let i = 0; i < MAX_BOXES; i++) {
			   if (i < PRESET_BOXES.length) {
				   boxes.push({
					   ...DEFAULT_BOX,
					   ...PRESET_BOXES[i],
					   label: labels[i] || '',
					   id: i + 1
				   });
			   } else {
				   boxes.push({
					   ...DEFAULT_BOX,
					   x: pos.x,
					   y: pos.y,
					   label: labels[i] || '',
					   id: i + 1
				   });
			   }
		   }
		   // Start sticky note stack at 14 (index 13)
		   currentBoxIndex = 13;
		   renderBoxes();
		   saveBoxState();
	   }
	function updateOverlayRect() {
		const img = document.querySelector('.craps-table-img');
		if (!img) return;
		overlay.style.position = 'absolute';
		overlay.style.left = img.offsetLeft + 'px';
		overlay.style.top = img.offsetTop + 'px';
		overlay.style.width = img.offsetWidth + 'px';
		overlay.style.height = img.offsetHeight + 'px';
	}
	window.addEventListener('resize', () => {
		updateOverlayRect();
		renderBoxes();
	});
	window.addEventListener('DOMContentLoaded', () => {
		updateOverlayRect();
		initializeBoxes();
	});
	setTimeout(() => {
		updateOverlayRect();
		initializeBoxes();
	}, 200);

	// --- Drag, resize, rotate logic ---
	let dragBox = null, dragOffset = {}, resizeBox = null, rotateBox = null, rotateStart = {}, selectedBox = null;

	function selectBox(box) {
		if (selectedBox && selectedBox._el) selectedBox._el.classList.remove('selected');
		selectedBox = box;
		if (box && box._el) box._el.classList.add('selected');
	}

	// overlay.addEventListener removed from here. Now attached only after DOMContentLoaded and overlay is defined.

	document.addEventListener('mousemove', e => {
	if (resizeBox) {
			let newW = dragOffset.startW + (e.clientX - dragOffset.startX);
			let newH = dragOffset.startH + (e.clientY - dragOffset.startY);
			newW = Math.max(30, newW);
			newH = Math.max(20, newH);
			resizeBox.width = newW;
			resizeBox.height = newH;
			resizeBox._el.style.width = newW + 'px';
			resizeBox._el.style.height = newH + 'px';
			updateCoordsList();
			saveBoxState();
	} else if (rotateBox) {
			const dx = e.clientX - rotateStart.cx;
			const dy = e.clientY - rotateStart.cy;
			let angle = Math.atan2(dy, dx) * 180 / Math.PI;
			angle = ((angle % 360) + 360) % 360;
			rotateBox.rotation = angle;
			rotateBox._el.style.transform = `rotate(${angle}deg)`;
			updateCoordsList();
			saveBoxState();
	} else if (dragBox) {
			dragBox.x = e.clientX - dragOffset.x;
			dragBox.y = e.clientY - dragOffset.y;
			dragBox._el.style.left = dragBox.x + 'px';
			dragBox._el.style.top = dragBox.y + 'px';
			updateCoordsList();
			saveBoxState();
		}
	});

	document.addEventListener('mouseup', () => {
		// If the current box was dragged, spawn the next one
		if (dragBox && currentBoxIndex < boxes.length - 1) {
			// If the box was moved from its original position, show the next
			const pos = getInitialBoxPosition();
			if (dragBox.x !== pos.x || dragBox.y !== pos.y) {
				currentBoxIndex++;
				renderBoxes();
				saveBoxState();
			}
		}
	dragBox = null;
	resizeBox = null;
	rotateBox = null;
	});

	// --- Update coordinates list ---
	function updateCoordsList() {
		if (!coordsList) return;
		coordsList.innerHTML = boxes.map((b, i) =>
			`betting area ${b.id} (${Math.round(b.x)}, ${Math.round(b.y)}, ${Math.round(b.width)}, ${Math.round(b.height)}, ${Math.round(b.rotation)}) - ${b.label}`
		).join('<br>');
	}
	updateCoordsList();

	// --- Overlay follows image position/size ---
	function syncOverlay() {
		updateOverlayRect();
		boxes.forEach(b => {
			if (b._el) {
				b._el.style.left = b.x + 'px';
				b._el.style.top = b.y + 'px';
				b._el.style.width = b.width + 'px';
				b._el.style.height = b.height + 'px';
				b._el.style.transform = `rotate(${b.rotation}deg)`;
			}
		});
	}
	window.addEventListener('resize', syncOverlay);
	setInterval(syncOverlay, 1000);

	// --- Keyboard shortcuts: delete selected box (for testing) ---
	document.addEventListener('keydown', e => {
		if (selectedBox && (e.key === 'Delete' || e.key === 'Backspace')) {
			selectedBox._el.style.display = 'none';
			boxes = boxes.filter(b => b !== selectedBox);
			updateCoordsList();
			saveBoxState();
			selectedBox = null;
		}
	});
*/
// ===================== END TESTING MODE =====================

// ===================== INTERACTIVE CRAPS GAME =====================
// This section is for the real game logic. Testing mode above is preserved for reference.

// Betting area definitions (coordinates and labels)
const BETTING_AREAS = [
	{ id: 1, label: 'field', x: 134, y: 206, width: 236, height: 38, rotation: 0 },
	{ id: 2, label: 'pass line', x: 77, y: 279, width: 292, height: 20, rotation: 0 },
	{ id: 3, label: "don't pass", x: 131, y: 251, width: 242, height: 20, rotation: 0 },
	{ id: 4, label: 'come', x: 86, y: 140, width: 285, height: 59, rotation: 0 },
	{ id: 5, label: "don't come", x: 85, y: 74, width: 41, height: 60, rotation: 0 },
	{ id: 6, label: 'big 6', x: 57, y: 210, width: 30, height: 30, rotation: 50 },
	{ id: 7, label: 'big 8', x: 90, y: 243, width: 30, height: 28, rotation: 44 },
	{ id: 8, label: 'place 4', x: 132, y: 74, width: 40, height: 59, rotation: 0 },
	{ id: 9, label: 'place 5', x: 178, y: 74, width: 41, height: 58, rotation: 0 },
	{ id: 10, label: 'place 6', x: 227, y: 75, width: 38, height: 59, rotation: 0 },
	{ id: 11, label: 'place 8', x: 273, y: 75, width: 37, height: 59, rotation: 0 },
	{ id: 12, label: 'place 9', x: 317, y: 75, width: 41, height: 58, rotation: 0 },
	{ id: 13, label: 'place 10', x: 367, y: 76, width: 36, height: 56, rotation: 0 },
	// Hardways (user provided coordinates)
	{ id: 14, label: 'hardways 1', x: 426, y: 118, width: 144, height: 20, rotation: 0 },
	{ id: 15, label: 'hardways 2', x: 411, y: 149, width: 83, height: 37, rotation: 0 },
	{ id: 16, label: 'hardways 3', x: 503, y: 149, width: 84, height: 37, rotation: 0 },
	{ id: 17, label: 'hardways 4', x: 412, y: 195, width: 81, height: 37, rotation: 0 },
	{ id: 18, label: 'hardways 5', x: 504, y: 195, width: 82, height: 37, rotation: 0 },
	{ id: 19, label: 'hardways 6', x: 409, y: 240, width: 53, height: 40, rotation: 0 },
	{ id: 20, label: 'hardways 7', x: 472, y: 241, width: 52, height: 38, rotation: 0 },
	{ id: 21, label: 'hardways 8', x: 535, y: 241, width: 51, height: 38, rotation: 0 },
	{ id: 22, label: 'hardways 9', x: 410, y: 286, width: 84, height: 38, rotation: 0 },
	{ id: 23, label: 'hardways 10', x: 504, y: 288, width: 81, height: 37, rotation: 0 },
	{ id: 24, label: 'hardways 11', x: 409, y: 332, width: 177, height: 22, rotation: 0 },
];

// Game state
let playerBets = [];
let playerBankroll = 2500;
let playerChips = [];

// Casino chip denominations and colors
const CHIP_DENOMS = [
	{ value: 1000, color: '#2e86de' }, // blue
	{ value: 250, color: '#27ae60' },  // green
	{ value: 50, color: '#e67e22' },   // orange
	{ value: 10, color: '#fff' }       // white
];

// Prompt for starting bankroll
function promptBankroll() {
	// Create modal
	const wrapper = document.querySelector('.craps-table-image-wrapper');
	let modal = document.createElement('div');
	modal.id = 'bankroll-modal';
	modal.style.position = 'absolute';
	modal.style.left = '50%';
	modal.style.top = '50%';
	modal.style.transform = 'translate(-50%, -50%)';
	modal.style.background = '#222';
	modal.style.color = '#fff';
	modal.style.padding = '32px 24px';
	modal.style.borderRadius = '16px';
	modal.style.boxShadow = '0 8px 32px #000a';
	modal.style.zIndex = '1000';
	modal.innerHTML = `
		<div style="font-size:20px; margin-bottom:16px;">Enter your starting bankroll (max $5000):</div>
		<input id="bankroll-input" type="number" min="1" max="5000" value="5000" style="font-size:18px; width:120px; margin-bottom:16px; text-align:center; border-radius:6px; border:1px solid #888;" />
		<br>
		<button id="bankroll-confirm" style="font-size:18px; padding:6px 24px; border-radius:8px; background:#27ae60; color:#fff; border:none; cursor:pointer;">Confirm</button>
	`;
	wrapper.appendChild(modal);
	document.getElementById('bankroll-confirm').onclick = function() {
		let amount = parseInt(document.getElementById('bankroll-input').value, 10);
		if (isNaN(amount) || amount <= 0 || amount > 5000) amount = 5000;
		playerBankroll = amount;
		playerChips = getChipBreakdown(amount);
		modal.remove();
		renderPlayerChips();
	};
}

function getChipBreakdown(amount) {
	let chips = [];
	let remaining = amount;
	for (const denom of CHIP_DENOMS) {
		while (remaining >= denom.value) {
			chips.push({ ...denom });
			remaining -= denom.value;
		}
	}
	return chips;
}

// Render betting areas and chips
function renderBettingAreas() {
	const wrapper = document.querySelector('.craps-table-image-wrapper');
	if (!wrapper) return;
	// Remove old areas and chips
	wrapper.querySelectorAll('.betting-area-interactive, .chip-stack, .player-chip').forEach(el => el.remove());
	let betPlaced = false;
	BETTING_AREAS.forEach(area => {
		const el = document.createElement('div');
		el.className = 'betting-area-interactive';
		el.style.left = area.x + 'px';
		el.style.top = area.y + 'px';
		el.style.width = area.width + 'px';
		el.style.height = area.height + 'px';
		el.style.transform = `rotate(${area.rotation}deg)`;
		el.style.background = 'transparent';
		el.style.border = 'none';
		el.title = area.label;
		el.dataset.areaId = area.id;
		// Highlight on chip dragover
		el.addEventListener('dragover', function(e) {
			e.preventDefault();
			el.classList.add('highlight');
		});
		el.addEventListener('dragleave', function(e) {
			el.classList.remove('highlight');
		});
		el.addEventListener('drop', function(e) {
			el.classList.remove('highlight');
		});
		wrapper.appendChild(el);
		// Render chips for this area if any
		const bet = playerBets.find(b => b.areaId === area.id);
		if (bet) {
			betPlaced = true;
			renderChipStack(area, bet.amount);
		}
	});
	if (betPlaced && typeof window.enableDiceRoll === 'function') {
		window.enableDiceRoll();
	}
	renderPlayerChips();
	renderPlayerChips();
}

// Render player's chips as a single draggable 3D stack
function renderPlayerChips() {
	const wrapper = document.querySelector('.craps-table-image-wrapper');
	if (!wrapper) return;
	// Remove old player stack
	wrapper.querySelectorAll('.player-chip-stack').forEach(el => el.remove());
	if (playerChips.length === 0) return;
	const stack = document.createElement('div');
	stack.className = 'player-chip-stack';
	stack.style.position = 'absolute';
	stack.style.left = '20px';
	stack.style.top = (wrapper.offsetHeight - 100) + 'px';
	stack.style.width = '48px';
	stack.style.height = '64px';
	stack.style.cursor = 'grab';
	stack.draggable = true;
	stack.addEventListener('dragstart', onPlayerStackDragStart);
	// 3D stack effect
	for (let i = 0; i < Math.min(playerChips.length, 8); i++) {
		const chip = playerChips[i];
		const chipEl = document.createElement('div');
		chipEl.style.position = 'absolute';
		chipEl.style.left = (i % 2 === 0 ? 0 : 2) + 'px';
		chipEl.style.bottom = (i * 7) + 'px';
		chipEl.style.width = '48px';
		chipEl.style.height = '18px';
		chipEl.style.zIndex = i;
		let edgeColor = '#2e86de', denom = chip.value;
		if (chip.value === 25) edgeColor = '#27ae60';
		if (chip.value === 5) edgeColor = '#e67e22';
		if (chip.value === 1) edgeColor = '#bbb';
		chipEl.innerHTML = `
			<svg width="48" height="18" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<radialGradient id="chipShadow" cx="50%" cy="60%" r="60%">
						<stop offset="0%" stop-color="#000" stop-opacity="0.25"/>
						<stop offset="100%" stop-color="#000" stop-opacity="0"/>
					</radialGradient>
					<linearGradient id="chipBevel" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>
						<stop offset="100%" stop-color="#fff" stop-opacity="0"/>
					</linearGradient>
				</defs>
				<ellipse cx="24" cy="11" rx="22" ry="8" fill="url(#chipShadow)"/>
				<ellipse cx="24" cy="9" rx="22" ry="8" fill="${edgeColor}" stroke="#222" stroke-width="2"/>
				<ellipse cx="24" cy="9" rx="22" ry="8" fill="url(#chipBevel)"/>
				<g>
					${[...Array(12)].map((_, idx) => {
						const angle = (Math.PI * 2 / 12) * idx;
						const x = 24 + Math.cos(angle) * 18;
						const y = 9 + Math.sin(angle) * 6.5;
						return `<rect x="${x-1}" y="${y-3}" width="2" height="6" fill="${idx%2===0?'white':edgeColor}" rx="1" transform="rotate(${angle*180/Math.PI},${x},${y})"/>`;
					}).join('')}
				</g>
				<ellipse cx="24" cy="9" rx="12" ry="4.5" fill="white" stroke="#eee" stroke-width="2"/>
				<text x="24" y="12" text-anchor="middle" font-size="14" font-weight="bold" fill="#222" style="font-family:Arial,Helvetica,sans-serif;">${denom}</text>
			</svg>
		`;
		stack.appendChild(chipEl);
	}
	// Amount label
	const label = document.createElement('div');
	label.className = 'chip-amount-label';
	label.innerText = '$' + playerChips.reduce((sum, c) => sum + c.value, 0);
	label.style.position = 'absolute';
	label.style.top = '-22px';
	label.style.left = '0px';
	label.style.width = '48px';
	label.style.textAlign = 'center';
	label.style.fontWeight = 'bold';
	label.style.fontSize = '15px';
	label.style.color = '#fff';
	label.style.textShadow = '0 2px 6px #000';
	stack.appendChild(label);
	wrapper.appendChild(stack);
	// Make betting areas droppable
	wrapper.querySelectorAll('.betting-area-interactive').forEach(areaEl => {
		areaEl.addEventListener('dragover', e => e.preventDefault());
		areaEl.addEventListener('drop', onPlayerStackDrop);
	});
}

let draggedStackAmount = null;
function onPlayerStackDragStart(e) {
	draggedStackAmount = playerChips.reduce((sum, c) => sum + c.value, 0);
}

function onPlayerStackDrop(e) {
	const areaId = parseInt(e.currentTarget.dataset.areaId, 10);
	if (!areaId || !draggedStackAmount) return;
	// Ask user how much to bet (up to draggedStackAmount)
	// Instantly use the full dragged stack amount for the bet
	// Remove all chips from playerChips
	playerChips = [];
	// Add stack value to bet for this area
	const betIdx = playerBets.findIndex(b => b.areaId === areaId);
	if (betIdx !== -1) {
		playerBets[betIdx].amount += draggedStackAmount;
	} else {
		playerBets.push({ areaId, amount: draggedStackAmount });
	}
	renderBettingAreas();
	draggedStackAmount = null;
}

let draggedChipValue = null;
function onChipDragStart(e) {
	draggedChipValue = parseInt(e.target.dataset.chipValue, 10);
}

function onChipDrop(e) {
	const areaId = parseInt(e.currentTarget.dataset.areaId, 10);
	if (!areaId || !draggedChipValue) return;
	// Remove chip from playerChips
	const idx = playerChips.findIndex(c => c.value === draggedChipValue);
	if (idx !== -1) playerChips.splice(idx, 1);
	// Add chip value to bet for this area
	const betIdx = playerBets.findIndex(b => b.areaId === areaId);
	if (betIdx !== -1) {
		playerBets[betIdx].amount += draggedChipValue;
	} else {
		playerBets.push({ areaId, amount: draggedChipValue });
	}
	renderBettingAreas();
	draggedChipValue = null;
}

// Render a 3D stack of chips at a betting area (single stack, amount label)
function renderChipStack(area, amount) {
	const wrapper = document.querySelector('.craps-table-image-wrapper');
	if (!wrapper) return;
	const stack = document.createElement('div');
	stack.className = 'chip-stack';
	stack.style.left = (area.x + area.width/2 - 24) + 'px';
	stack.style.top = (area.y + area.height/2 - 32) + 'px';
	stack.style.width = '48px';
	stack.style.height = '48px';
	stack.style.pointerEvents = 'none';
	stack.style.filter = 'drop-shadow(0 8px 16px #0006)';
	// Always render a single chip representing the total amount
	let edgeColor = '#2e86de', denom = amount;
	// Use blue for $100 and above, green for $25, orange for $5, white for $1
	if (amount === 25) edgeColor = '#27ae60';
	else if (amount === 5) edgeColor = '#e67e22';
	else if (amount === 1) edgeColor = '#bbb';
	// $100 and above stays blue
	const chipEl = document.createElement('div');
	chipEl.style.position = 'absolute';
	chipEl.style.left = '0px';
	chipEl.style.top = '0px';
	chipEl.style.zIndex = 1;
	chipEl.style.width = '48px';
	chipEl.style.height = '48px';
	chipEl.innerHTML = `
		<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<radialGradient id="chipShadow" cx="50%" cy="50%" r="50%">
					<stop offset="0%" stop-color="#000" stop-opacity="0.18"/>
					<stop offset="100%" stop-color="#000" stop-opacity="0"/>
				</radialGradient>
				<linearGradient id="chipBevel" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>
					<stop offset="100%" stop-color="#fff" stop-opacity="0"/>
				</linearGradient>
			</defs>
			<circle cx="24" cy="24" r="22" fill="url(#chipShadow)"/>
			<circle cx="24" cy="24" r="22" fill="${edgeColor}" stroke="#222" stroke-width="2"/>
			<circle cx="24" cy="24" r="22" fill="url(#chipBevel)"/>
			<g>
				${[...Array(12)].map((_, idx) => {
					const angle = (Math.PI * 2 / 12) * idx;
					const x = 24 + Math.cos(angle) * 18;
					const y = 24 + Math.sin(angle) * 18;
					return `<rect x="${x-2}" y="${y-6}" width="4" height="12" fill="${idx%2===0?'white':edgeColor}" rx="2" transform="rotate(${angle*180/Math.PI},${x},${y})"/>`;
				}).join('')}
			</g>
			<circle cx="24" cy="24" r="12" fill="white" stroke="#eee" stroke-width="2"/>
			<text x="24" y="29" text-anchor="middle" font-size="20" font-weight="bold" fill="#fff" style="font-family:Arial,Helvetica,sans-serif; text-shadow: 0 2px 6px #000;">${denom}</text>
		</svg>
	`;
		stack.appendChild(chipEl);
		wrapper.appendChild(stack);
	}

	// TODO: Add bet validation, continuous play logic, and chip return
	// ===================== END INTERACTIVE CRAPS GAME =====================
	// End of window.initCrapsMinigame
	}

// TODO: Add bet validation, continuous play logic, and chip return
// ===================== END INTERACTIVE CRAPS GAME =====================
