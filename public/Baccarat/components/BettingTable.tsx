import React from 'react';
import { BetPosition, Bets } from '../types';
import { Coins } from 'lucide-react';

interface BettingTableProps {
  bets: Bets;
  onPlaceBet: (position: BetPosition) => void;
  disabled: boolean;
}

const BettingSpot: React.FC<{
  label: string;
  subLabel?: string;
  amount: number;
  onClick: () => void;
  color: string;
  disabled: boolean;
  multiplier: string;
  className?: string;
}> = ({ label, subLabel, amount, onClick, color, disabled, multiplier, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={`${label} bet, pays ${multiplier}${subLabel ? `, ${subLabel}` : ''}`}
    className={`
      relative border-2 ${color} rounded-xl flex flex-col items-center justify-center
      cursor-pointer transition-all duration-200 h-24 md:h-32
      ${disabled ? 'opacity-80 cursor-default' : 'hover:bg-white/10 active:scale-95'}
      ${amount > 0 ? 'bg-white/5 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : ''}
      ${className}
    `}
  >
    <span className="text-white/90 font-serif text-lg md:text-2xl font-bold tracking-wider">{label}</span>
    {subLabel && <span className="text-white/60 text-xs md:text-sm">{subLabel}</span>}
    <span className="text-yellow-400 text-xs md:text-sm mt-1 font-mono">{multiplier}</span>
    
    {amount > 0 && (
      <div className="absolute -top-3 -right-3 bg-yellow-500 text-black font-bold rounded-full w-12 h-12 flex items-center justify-center shadow-lg border-2 border-white z-10 animate-bounce">
        <div className="flex flex-col items-center leading-none">
          <Coins size={12} className="mb-0.5 opacity-50" />
          <span className="text-xs">{amount}</span>
        </div>
      </div>
    )}
  </button>
);

export const BettingTable: React.FC<BettingTableProps> = ({ bets, onPlaceBet, disabled }) => {
  return (
    <div className="grid grid-cols-4 grid-rows-2 gap-4 w-full max-w-4xl mx-auto mt-8 px-4">
       {/* Top Row: Pairs and Tie */}
      <BettingSpot
        label="P. PAIR"
        amount={bets[BetPosition.PLAYER_PAIR]}
        onClick={() => onPlaceBet(BetPosition.PLAYER_PAIR)}
        color="border-blue-400"
        disabled={disabled}
        multiplier="11:1"
        className="col-span-1 row-span-1 bg-blue-900/30"
      />
      
      <BettingSpot
        label="TIE"
        amount={bets[BetPosition.TIE]}
        onClick={() => onPlaceBet(BetPosition.TIE)}
        color="border-green-400"
        disabled={disabled}
        multiplier="8:1"
        className="col-span-2 row-span-1 bg-green-900/30"
      />

      <BettingSpot
        label="B. PAIR"
        amount={bets[BetPosition.BANKER_PAIR]}
        onClick={() => onPlaceBet(BetPosition.BANKER_PAIR)}
        color="border-red-400"
        disabled={disabled}
        multiplier="11:1"
        className="col-span-1 row-span-1 bg-red-900/30"
      />

      {/* Bottom Row: Main Bets */}
      <BettingSpot
        label="PLAYER"
        amount={bets[BetPosition.PLAYER]}
        onClick={() => onPlaceBet(BetPosition.PLAYER)}
        color="border-blue-500"
        disabled={disabled}
        multiplier="1:1"
        className="col-span-2 row-span-1 bg-blue-800/40"
      />

      <BettingSpot
        label="BANKER"
        subLabel="Super 6 pays 1:2"
        amount={bets[BetPosition.BANKER]}
        onClick={() => onPlaceBet(BetPosition.BANKER)}
        color="border-red-500"
        disabled={disabled}
        multiplier="1:1"
        className="col-span-2 row-span-1 bg-red-800/40"
      />
    </div>
  );
};
