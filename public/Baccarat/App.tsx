import React, { useState, useEffect } from 'react';
import { Card, Hand, GameState, BetPosition, Bets, GameResult } from './types';
import { createShoe, calculateScore, isPair, calculatePayout, determineWinner } from './utils/gameLogic';
import { Card as CardComponent } from './components/Card';
import { BettingTable } from './components/BettingTable';
import { CHIP_VALUES, MAX_BET, MIN_BET } from './constants';
import { getDealerCommentary } from './services/dealerCommentary';

const INITIAL_BETS: Bets = {
  PLAYER: 0,
  BANKER: 0,
  TIE: 0,
  PLAYER_PAIR: 0,
  BANKER_PAIR: 0
};

interface BaccaratProps {
  initialBalance: number;
  onBalanceChange: (newBalance: number) => void;
}

export default function App({ initialBalance, onBalanceChange }: BaccaratProps) {
  // Game State
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [shoe, setShoe] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Hand>([]);
  const [bankerHand, setBankerHand] = useState<Hand>([]);
  
  // Betting State
  const [balance, setBalance] = useState(initialBalance);
  const [currentBets, setCurrentBets] = useState<Bets>(INITIAL_BETS);
  const [selectedChip, setSelectedChip] = useState(CHIP_VALUES[1]);
  const [commentary, setCommentary] = useState<string>("Place your bets.");

  // Initialize Shoe
  useEffect(() => {
    setShoe(createShoe());
  }, []);

  // Sync balance with parent
  useEffect(() => {
    onBalanceChange(balance);
  }, [balance, onBalanceChange]);

  const handlePlaceBet = (position: BetPosition) => {
    if (gameState !== GameState.IDLE && gameState !== GameState.BETTING) return;
    
    // Start betting phase if in idle
    if (gameState === GameState.IDLE) setGameState(GameState.BETTING);

    // Calculate potential new total bet
    const currentTotalBet = Object.values(currentBets).reduce((a, b) => a + b, 0);
    
    if (currentTotalBet + selectedChip > balance) {
      // Logic to add remaining balance could go here, but simple block for now
      setCommentary("Insufficient funds.");
      return;
    }

    if (currentBets[position] + selectedChip > MAX_BET) return;

    setCurrentBets(prev => ({
      ...prev,
      [position]: prev[position] + selectedChip
    }));
    
    setBalance(prev => {
      const newBalance = prev - selectedChip;
      return newBalance;
    });
  };

  const clearBets = () => {
    const totalRefund = Object.values(currentBets).reduce((a, b) => a + b, 0);
    setBalance(prev => prev + totalRefund);
    setCurrentBets(INITIAL_BETS);
    setGameState(GameState.IDLE);
    setCommentary("Place your bets.");
  };

  const dealGame = async () => {
    const totalBet = Object.values(currentBets).reduce((a, b) => a + b, 0);
    if (totalBet < MIN_BET) {
      setCommentary("Minimum bet is $" + MIN_BET);
      return;
    }
    if (shoe.length < 20) {
       // Reshuffle
       setCommentary("Reshuffling shoe...");
       setShoe(createShoe());
       await new Promise(r => setTimeout(r, 1000));
    }

    setGameState(GameState.DEALING);
    setPlayerHand([]);
    setBankerHand([]);
    setCommentary("Dealing...");

    const newShoe = [...shoe];
    const pHand: Card[] = [];
    const bHand: Card[] = [];

    // Initial Deal: P, B, P, B
    // We use timeouts to simulate dealing animation
    const dealCard = (target: 'P' | 'B', card: Card) => {
       if (target === 'P') pHand.push(card);
       else bHand.push(card);
    };

    const draw = () => newShoe.pop()!;

    // Logic execution immediately to determine outcome, then animate
    const c1 = draw();
    const c2 = draw();
    const c3 = draw();
    const c4 = draw();

    // --- 3rd Card Logic Pre-calculation ---
    let finalPHand = [c1, c3];
    let finalBHand = [c2, c4];
    
    let pScore = calculateScore(finalPHand);
    let bScore = calculateScore(finalBHand);

    let pDrawnCard: Card | null = null;
    let bDrawnCard: Card | null = null;

    // Natural Win Check (8 or 9)
    const isNatural = pScore >= 8 || bScore >= 8;

    if (!isNatural) {
      // Player Rules
      if (pScore <= 5) {
        pDrawnCard = draw();
        finalPHand.push(pDrawnCard);
        pScore = calculateScore(finalPHand);
      }

      // Banker Rules
      if (!pDrawnCard) {
        // Player stood
        if (bScore <= 5) {
          bDrawnCard = draw();
          finalBHand.push(bDrawnCard);
        }
      } else {
        // Player drew, banker rules depend on player's 3rd card value
        const p3Val = pDrawnCard.value;
        let bankerDraws = false;
        
        if (bScore <= 2) bankerDraws = true;
        else if (bScore === 3 && p3Val !== 8) bankerDraws = true;
        else if (bScore === 4 && [2,3,4,5,6,7].includes(p3Val)) bankerDraws = true;
        else if (bScore === 5 && [4,5,6,7].includes(p3Val)) bankerDraws = true;
        else if (bScore === 6 && [6,7].includes(p3Val)) bankerDraws = true;

        if (bankerDraws) {
          bDrawnCard = draw();
          finalBHand.push(bDrawnCard);
        }
      }
    }
    
    bScore = calculateScore(finalBHand); // Recalculate final

    setShoe(newShoe);

    // Animation Sequence
    // Deal initial 4
    setPlayerHand([c1]);
    await wait(500);
    setBankerHand([c2]);
    await wait(500);
    setPlayerHand([c1, c3]);
    await wait(500);
    setBankerHand([c2, c4]);
    await wait(800);

    if (pDrawnCard) {
        setCommentary("Player draws...");
        setPlayerHand(prev => [...prev, pDrawnCard!]);
        await wait(800);
    }

    if (bDrawnCard) {
        setCommentary("Banker draws...");
        setBankerHand(prev => [...prev, bDrawnCard!]);
        await wait(800);
    }

    // Result
    const winner = determineWinner(pScore, bScore);
    const result: GameResult = {
      winner,
      playerScore: pScore,
      bankerScore: bScore,
      isPlayerPair: isPair([c1, c3]), // Only first two cards count for pair bet
      isBankerPair: isPair([c2, c4]),
      payout: 0,
      totalBet,
      timestamp: Date.now(),
      balanceAfter: 0
    };

    const totalPayout = calculatePayout(currentBets, result);
    const netProfit = totalPayout - totalBet; // Profit for this hand
    
    // Update Balance (add winnings)
    setBalance(prev => {
      const newBal = prev + totalPayout;
      result.balanceAfter = newBal;
      result.payout = totalPayout;
      return newBal;
    });

    setGameState(GameState.RESULT);

    // Local commentary keeps gameplay responsive and requires no API credentials.
    setCommentary(getDealerCommentary(result, pScore, bScore, totalPayout));

    // Reset for next round after delay? No, let user decide when to clear/rebet
  };

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const resetGame = () => {
    setPlayerHand([]);
    setBankerHand([]);
    setCurrentBets(INITIAL_BETS);
    setGameState(GameState.IDLE);
    setCommentary("Place your bets.");
  };

  return (
    <div className="h-full bg-[#0f2015] text-white flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-black/30 border-b border-white/10 p-3 flex justify-end items-center backdrop-blur-md z-20 relative">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 uppercase">Balance</span>
          <span className="font-mono text-lg text-yellow-400">${balance.toLocaleString()}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative">
        {/* Felt Texture Overlay */}
        <div className="absolute inset-0 opacity-30 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/felt.png')]"></div>

        {/* Game Area */}
        <div className="flex-1 flex flex-col items-center justify-start pt-2 md:pt-4 relative z-10 w-full max-w-4xl mx-auto">
            
            {/* Table Info */}
            <div className="w-full flex justify-between px-4 mb-2 md:mb-4">
                <div className="flex flex-col items-center">
                    <h2 className="text-blue-400 font-serif text-lg md:text-xl font-bold mb-1 drop-shadow-md">PLAYER</h2>
                    <div className="text-2xl md:text-3xl font-mono font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {gameState !== GameState.IDLE && gameState !== GameState.BETTING ? calculateScore(playerHand) : '-'}
                    </div>
                </div>
                
                {/* Dealer commentary */}
                <div className="flex-1 mx-2 md:mx-6 flex items-center justify-center">
                    <div className="bg-black/60 backdrop-blur border border-yellow-500/30 rounded-full px-4 py-1 md:px-6 md:py-2 flex items-center gap-2 md:gap-3 shadow-xl max-w-lg">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <p className="text-xs md:text-sm text-white/90 italic text-center font-serif">"{commentary}"</p>
                    </div>
                </div>

                <div className="flex flex-col items-center">
                    <h2 className="text-red-500 font-serif text-lg md:text-xl font-bold mb-1 drop-shadow-md">BANKER</h2>
                    <div className="text-2xl md:text-3xl font-mono font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {gameState !== GameState.IDLE && gameState !== GameState.BETTING ? calculateScore(bankerHand) : '-'}
                    </div>
                </div>
            </div>

            {/* Cards Area */}
            <div className="flex justify-center gap-4 md:gap-16 w-full px-4 h-32 md:h-40">
                {/* Player Hand */}
                <div className="flex -space-x-12 md:-space-x-16">
                    {playerHand.map((card, i) => (
                        <div key={card.id} className={`transform transition-all duration-500 ease-out origin-bottom-left hover:-translate-y-2`} style={{ zIndex: i }}>
                            <CardComponent card={card} />
                        </div>
                    ))}
                    {playerHand.length === 0 && (
                         <div className="border-2 border-white/10 rounded-lg w-16 h-24 md:w-24 md:h-32 flex items-center justify-center text-white/10">
                            <span className="text-xs">PLAYER</span>
                         </div>
                    )}
                </div>

                {/* Banker Hand */}
                <div className="flex -space-x-12 md:-space-x-16">
                     {bankerHand.map((card, i) => (
                        <div key={card.id} className={`transform transition-all duration-500 ease-out origin-bottom-left hover:-translate-y-2`} style={{ zIndex: i }}>
                            <CardComponent card={card} />
                        </div>
                    ))}
                    {bankerHand.length === 0 && (
                         <div className="border-2 border-white/10 rounded-lg w-16 h-24 md:w-24 md:h-32 flex items-center justify-center text-white/10">
                            <span className="text-xs">BANKER</span>
                         </div>
                    )}
                </div>
            </div>

            {/* Betting Table */}
            <div className="w-full flex-1 flex flex-col justify-end pb-2">
                <BettingTable 
                    bets={currentBets} 
                    onPlaceBet={handlePlaceBet} 
                    disabled={gameState === GameState.DEALING || balance === 0} 
                />

                {/* Controls */}
                <div className="flex flex-col items-center gap-2 md:gap-4 mt-2 md:mt-4 px-4">
                    
                    {/* Chip Selector */}
                    <div className="flex gap-2 md:gap-4 bg-black/40 p-2 md:p-3 rounded-2xl backdrop-blur-sm border border-white/10 shadow-xl">
                        {CHIP_VALUES.map(val => (
                            <button
                                key={val}
                                onClick={() => setSelectedChip(val)}
                                disabled={gameState === GameState.DEALING}
                                className={`
                                    w-10 h-10 md:w-12 md:h-12 rounded-full border-4 flex items-center justify-center font-bold text-sm shadow-xl transition-all hover:scale-110 relative overflow-hidden
                                    ${selectedChip === val ? 'transform -translate-y-2 ring-4 ring-yellow-400 shadow-yellow-400/50' : ''}
                                    ${val < 25 ? 'bg-gradient-to-br from-white to-gray-200 text-black border-gray-400' : 
                                      val < 100 ? 'bg-gradient-to-br from-red-500 to-red-700 text-white border-red-300' :
                                      val < 500 ? 'bg-gradient-to-br from-green-500 to-green-700 text-white border-green-300' :
                                      val < 1000 ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-300' :
                                      'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black border-yellow-200'
                                    }
                                `}
                            >
                                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent)]"></div>
                                <div className="absolute inset-0 border-2 border-white/20 rounded-full"></div>
                                <span className="relative z-10">{val >= 1000 ? '1K' : val}</span>
                            </button>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 md:gap-4">
                        {gameState === GameState.RESULT ? (
                             <button 
                                onClick={resetGame}
                                className="px-6 py-2 md:px-8 md:py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full shadow-[0_0_20px_rgba(234,179,8,0.4)] uppercase tracking-widest transition-all hover:scale-105 text-sm md:text-base"
                            >
                                New Bet
                            </button>
                        ) : (
                            <>
                                <button 
                                    onClick={clearBets}
                                    disabled={gameState !== GameState.BETTING}
                                    className="px-4 py-2 md:px-6 md:py-3 bg-gray-700/50 hover:bg-gray-600 text-white rounded-full uppercase text-xs md:text-sm font-bold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Clear
                                </button>
                                <button 
                                    onClick={dealGame}
                                    disabled={Object.values(currentBets).reduce((a, b) => a + b, 0) === 0 || gameState === GameState.DEALING}
                                    className="px-6 py-2 md:px-10 md:py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed text-sm md:text-base"
                                >
                                    Deal
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
