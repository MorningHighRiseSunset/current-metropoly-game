// Refactored for dynamic loading
window.initSlotMachine = function(container, playerMoney, updateMainGameBalance) {
	const symbols = ['🍒', '7️⃣', '💎'];
	const spinBtn = container.querySelector('#spinBtn');
	const message = container.querySelector('#message');
	const reelStrips = [
		container.querySelector('#reel1-strip'),
		container.querySelector('#reel2-strip'),
		container.querySelector('#reel3-strip')
	];
	const balanceSpan = container.querySelector('#slot-balance');
	let balance = typeof playerMoney === 'number' ? playerMoney : 25000;
	function updateBalanceDisplay() {
		balanceSpan.textContent = balance;
		if (typeof updateMainGameBalance === 'function') {
			updateMainGameBalance(balance);
		} else if (container && typeof CustomEvent === 'function') {
			container.dispatchEvent(new CustomEvent('minigame-balance-update', {detail: {balance}}));
		}
		// Send winnings to parent window via postMessage
		if (window.parent !== window) {
			const initialBalance = typeof playerMoney === 'number' ? playerMoney : 25000;
			const winnings = balance - initialBalance;
			if (winnings !== 0) {
				window.parent.postMessage({ type: 'casinoWinnings', amount: winnings }, '*');
			}
		}
	}

	function getRandomSymbol() {
		return symbols[Math.floor(Math.random() * symbols.length)];
	}

	function fillInitialReels() {
		reelStrips.forEach(strip => {
			strip.innerHTML = '';
			for (let i = 0; i < 3; i++) {
				const symbolDiv = document.createElement('div');
				symbolDiv.className = 'reel-symbol';
				symbolDiv.textContent = symbols[i % symbols.length];
				strip.appendChild(symbolDiv);
			}
		});
	}

	function animateReelDown(strip, finalSymbol, duration = 4000) {
		const totalSymbols = 60;
		strip.innerHTML = '';
		let symbolList = [];
		for (let i = 0; i < totalSymbols - 1; i++) {
			symbolList.push(getRandomSymbol());
		}
		symbolList.push(finalSymbol);
		symbolList.forEach(sym => {
			const symbolDiv = document.createElement('div');
			symbolDiv.className = 'reel-symbol';
			symbolDiv.textContent = sym;
			strip.appendChild(symbolDiv);
		});
		strip.classList.add('spinning');
		strip.style.transition = 'none';
		strip.style.transform = 'translateY(0)';
		setTimeout(() => {
			strip.style.transition = `transform ${duration}ms cubic-bezier(.17,.67,.83,.67)`;
			strip.style.transform = `translateY(-${(totalSymbols-3)*60}px)`;
		}, 30);
	}

	function spin() {
		if (balance < 1000) {
			message.textContent = 'Not enough money to spin!';
			message.style.color = '#fff';
			return;
		}
		balance -= 1000;
		updateBalanceDisplay();
		spinBtn.disabled = true;
		message.textContent = '';
		// Animate lever
		const lever = container.querySelector('#slot-lever');
		lever.classList.add('pulled');
		setTimeout(() => lever.classList.remove('pulled'), 600);

		const finalSymbols = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
		reelStrips.forEach((strip, idx) => {
			animateReelDown(strip, finalSymbols[idx], 4000 + idx*500);
		});
		setTimeout(() => {
			// Wait for the animation to finish, then smoothly fade to the final result
			reelStrips.forEach((strip, idx) => {
				// Fade out spinning strip
				strip.style.transition = 'opacity 0.2s';
				strip.style.opacity = '0';
				setTimeout(() => {
					strip.classList.remove('spinning');
					// Show four symbols: one above, the final, one below, and one more below
					strip.innerHTML = '';
					const above = getRandomSymbol();
					const final = finalSymbols[idx];
					const below = getRandomSymbol();
					const below2 = getRandomSymbol();
					[above, final, below, below2].forEach(sym => {
						const symbolDiv = document.createElement('div');
						symbolDiv.className = 'reel-symbol';
						symbolDiv.textContent = sym;
						strip.appendChild(symbolDiv);
					});
					strip.style.transition = 'none';
					strip.style.transform = 'translateY(-60px)';
					strip.style.opacity = '1';
				}, 200);
			});
			setTimeout(() => {
				checkWin(finalSymbols);
				spinBtn.disabled = false;
			}, 250);
		}, 4000 + 2*500 + 100); // Wait for last reel to finish
	}

	function checkWin(finalSymbols) {
		if (finalSymbols[0] === finalSymbols[1] && finalSymbols[1] === finalSymbols[2]) {
			let reward = 10000;
			let symbol = finalSymbols[0];
			if (symbol === '💎') {
				reward = 50000;
				message.textContent = `💎💎💎 DIAMOND JACKPOT! Three Diamonds! You win $${reward}!`;
				message.style.color = '#00eaff';
			} else {
				message.textContent = `🎉 Jackpot! Three ${symbol}! You win $${reward}!`;
				message.style.color = '#FFD700';
			}
			balance += reward;
			updateBalanceDisplay();
			showSparkles();
		} else if (finalSymbols[0] === finalSymbols[1] || finalSymbols[1] === finalSymbols[2] || finalSymbols[0] === finalSymbols[2]) {
			let reward = 2000;
			balance += reward;
			updateBalanceDisplay();
			message.textContent = `Nice! Two matching symbols! You win $${reward}!`;
			message.style.color = '#FFA500';
		} else {
			message.textContent = 'Try again!';
			message.style.color = '#fff';
			updateBalanceDisplay();
		}
	}

	function showSparkles() {
		const sparkles = container.querySelector('#sparkles');
		sparkles.innerHTML = '';
		for (let i = 0; i < 12; i++) {
			const sparkle = document.createElement('div');
			sparkle.className = 'sparkle';
			sparkle.style.left = `${Math.random()*80+10}px`;
			sparkle.style.top = `${Math.random()*60+10}px`;
			sparkles.appendChild(sparkle);
		}
		setTimeout(() => { sparkles.innerHTML = ''; }, 1200);
	}

	spinBtn.addEventListener('click', spin);
	fillInitialReels();
	updateBalanceDisplay();
};
						message.style.color = '#fff';

