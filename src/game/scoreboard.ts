/** Wins per side for the current visit. Kept in memory only, so reloading the page resets it. */
export interface Score {
  player: number
  computer: number
}

export const EMPTY_SCORE: Score = { player: 0, computer: 0 }

export function recordWin(score: Score, winner: keyof Score): Score {
  return { ...score, [winner]: score[winner] + 1 }
}

export function gamesPlayed(score: Score): number {
  return score.player + score.computer
}
