export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000];

export const PAYOUTS = {
  PLAYER: 1,
  BANKER: 1, // No Commission, except specific win
  BANKER_SUPER6: 0.5, // Pays 50% if Banker wins with 6
  TIE: 8,
  PAIR: 11
};

export const INITIAL_BALANCE = 2500;
export const MIN_BET = 5;
export const MAX_BET = 5000;