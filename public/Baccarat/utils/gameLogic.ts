import { Card, Suit, Hand, GameResult, BetPosition, Bets } from '../types';
import { PAYOUTS } from '../constants';

export const createDeck = (): Card[] => {
  const suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  const deck: Card[] = [];
  
  suits.forEach(suit => {
    ranks.forEach(rank => {
      let value = parseInt(rank);
      if (rank === 'A') value = 1;
      if (['10', 'J', 'Q', 'K'].includes(rank)) value = 0;
      
      deck.push({
        suit,
        rank,
        value,
        id: `${rank}-${suit}-${Math.random().toString(36).substr(2, 9)}`
      });
    });
  });
  
  return deck;
};

export const createShoe = (decks = 8): Card[] => {
  let shoe: Card[] = [];
  for (let i = 0; i < decks; i++) {
    shoe = [...shoe, ...createDeck()];
  }
  // Shuffle (Fisher-Yates)
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
};

export const calculateScore = (hand: Hand): number => {
  const sum = hand.reduce((acc, card) => acc + card.value, 0);
  return sum % 10;
};

export const isPair = (hand: Hand): boolean => {
  if (hand.length < 2) return false;
  return hand[0].rank === hand[1].rank;
};

// Returns the payout amount (profit only) based on bets and result
export const calculatePayout = (bets: Bets, result: GameResult): number => {
  let totalWin = 0;
  
  // Player Bet
  if (result.winner === 'PLAYER' && bets.PLAYER > 0) {
    totalWin += bets.PLAYER * PAYOUTS.PLAYER;
  }
  
  // Banker Bet (No Commission Logic)
  if (result.winner === 'BANKER' && bets.BANKER > 0) {
    if (result.bankerScore === 6) {
      totalWin += bets.BANKER * PAYOUTS.BANKER_SUPER6;
    } else {
      totalWin += bets.BANKER * PAYOUTS.BANKER;
    }
  } else if (result.winner === 'TIE' && bets.BANKER > 0) {
    // Push on Banker bet if Tie? No, usually standard baccarat tie returns bet.
    // In this calculation, we are calculating PROFIT. 
    // The initial bet is returned separately in the state management logic usually, 
    // or we consider "payout" to include the stake.
    // Let's standardize: This function returns the TOTAL return (Profit + Stake).
  }

  // Fix: Calculate Return (Stake + Profit)
  let totalReturn = 0;

  // Player
  if (bets.PLAYER > 0) {
    if (result.winner === 'PLAYER') {
      totalReturn += bets.PLAYER + (bets.PLAYER * PAYOUTS.PLAYER);
    } else if (result.winner === 'TIE') {
      totalReturn += bets.PLAYER; // Push
    }
  }

  // Banker
  if (bets.BANKER > 0) {
    if (result.winner === 'BANKER') {
      const odds = result.bankerScore === 6 ? PAYOUTS.BANKER_SUPER6 : PAYOUTS.BANKER;
      totalReturn += bets.BANKER + (bets.BANKER * odds);
    } else if (result.winner === 'TIE') {
      totalReturn += bets.BANKER; // Push
    }
  }

  // Tie
  if (bets.TIE > 0 && result.winner === 'TIE') {
    totalReturn += bets.TIE + (bets.TIE * PAYOUTS.TIE);
  }

  // Pairs
  if (bets.PLAYER_PAIR > 0 && result.isPlayerPair) {
    totalReturn += bets.PLAYER_PAIR + (bets.PLAYER_PAIR * PAYOUTS.PAIR);
  }
  if (bets.BANKER_PAIR > 0 && result.isBankerPair) {
    totalReturn += bets.BANKER_PAIR + (bets.BANKER_PAIR * PAYOUTS.PAIR);
  }

  return totalReturn;
};

export const determineWinner = (playerScore: number, bankerScore: number): 'PLAYER' | 'BANKER' | 'TIE' => {
  if (playerScore > bankerScore) return 'PLAYER';
  if (bankerScore > playerScore) return 'BANKER';
  return 'TIE';
};
