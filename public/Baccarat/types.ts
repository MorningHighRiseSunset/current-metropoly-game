export enum Suit {
  HEARTS = '♥',
  DIAMONDS = '♦',
  CLUBS = '♣',
  SPADES = '♠'
}

export interface Card {
  suit: Suit;
  rank: string;
  value: number; // Baccarat value (0-9)
  id: string;
}

export type Hand = Card[];

export enum GameState {
  IDLE = 'IDLE',
  BETTING = 'BETTING',
  DEALING = 'DEALING',
  RESULT = 'RESULT'
}

export enum BetPosition {
  PLAYER = 'PLAYER',
  BANKER = 'BANKER',
  TIE = 'TIE',
  PLAYER_PAIR = 'PLAYER_PAIR',
  BANKER_PAIR = 'BANKER_PAIR'
}

export type Bets = {
  [key in BetPosition]: number;
};

export interface GameResult {
  winner: 'PLAYER' | 'BANKER' | 'TIE';
  playerScore: number;
  bankerScore: number;
  isPlayerPair: boolean;
  isBankerPair: boolean;
  payout: number;
  totalBet: number;
  timestamp: number;
  balanceAfter: number;
}

export interface PnLPoint {
  hand: number;
  pnl: number;
}