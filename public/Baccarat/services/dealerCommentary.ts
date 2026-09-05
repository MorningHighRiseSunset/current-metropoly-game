import { GameResult } from "../types";

const winnerLines: Record<GameResult["winner"], string[]> = {
  PLAYER: [
    "Player takes the hand. A clean result from this side of the table.",
    "Player wins. The blue side found its number.",
  ],
  BANKER: [
    "Banker takes the hand. The red side holds its ground.",
    "Banker wins. A familiar rhythm at the table.",
  ],
  TIE: [
    "A tie. Even the cards occasionally refuse to choose a side.",
    "Neither side yields—this hand ends level.",
  ],
};

export const getDealerCommentary = (
  result: GameResult,
  playerScore: number,
  bankerScore: number,
  totalPayout: number,
): string => {
  if (result.winner === "BANKER" && bankerScore === 6) {
    return "Banker wins with a Super 6—the half-pay rule applies.";
  }

  const outcome = totalPayout > result.totalBet
    ? " Your wagers finished ahead."
    : totalPayout === result.totalBet
      ? " Your wagers broke even."
      : " The table keeps this one.";
  const lines = winnerLines[result.winner];
  const lineIndex = (playerScore + bankerScore + result.totalBet) % lines.length;

  return `${lines[lineIndex]}${outcome}`;
};
