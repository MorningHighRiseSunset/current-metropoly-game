import React from 'react';
import { Card as CardType, Suit } from '../types';

interface CardProps {
  card: CardType | null;
  hidden?: boolean;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ card, hidden, className = '' }) => {
  if (hidden || !card) {
    return (
      <div className={`w-20 h-28 md:w-28 md:h-40 bg-blue-900 border-2 border-white rounded-lg shadow-xl flex items-center justify-center ${className} relative overflow-hidden`}>
         <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-500 via-transparent to-transparent"></div>
         <div className="w-full h-full bg-[repeating-linear-gradient(45deg,#1e3a8a_0px,#1e3a8a_10px,#172554_10px,#172554_20px)]"></div>
      </div>
    );
  }

  const isRed = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS;

  return (
    <div className={`w-20 h-28 md:w-28 md:h-40 bg-white rounded-lg shadow-xl flex flex-col justify-between p-2 select-none transition-transform transform hover:scale-105 ${className}`}>
      <div className={`text-left text-lg md:text-xl font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>
        <div>{card.rank}</div>
        <div>{card.suit}</div>
      </div>
      <div className={`text-center text-4xl md:text-5xl ${isRed ? 'text-red-600' : 'text-black'}`}>
        {card.suit}
      </div>
      <div className={`text-right text-lg md:text-xl font-bold transform rotate-180 ${isRed ? 'text-red-600' : 'text-black'}`}>
        <div>{card.rank}</div>
        <div>{card.suit}</div>
      </div>
    </div>
  );
};