/**
 * Dice Roll Sound Generator
 * Exact implementation from Metropoly main game
 * Procedurally generated dice rolling sound effects using Web Audio API
 */

// Dice roll sound (Web Audio API) - Exact implementation from game.js
function playDiceRollSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const rollMs = 850; // DICE_GLB_CONFIG.rollDurationMs
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
        console.warn('Could not play dice sound:', e);
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { playDiceRollSound };
}

if (typeof window !== 'undefined') {
    window.DiceSound = {
        playDiceRollSound
    };
}