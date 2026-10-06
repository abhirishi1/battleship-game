import { describe, expect, it } from 'vitest'
import { EMPTY_SCORE, gamesPlayed, recordWin } from './scoreboard'

describe('scoreboard', () => {
  it('starts at zero', () => {
    expect(EMPTY_SCORE).toEqual({ player: 0, computer: 0 })
    expect(gamesPlayed(EMPTY_SCORE)).toBe(0)
  })

  it('adds one win to the winner only, without changing the original score', () => {
    const afterPlayer = recordWin(EMPTY_SCORE, 'player')
    expect(afterPlayer).toEqual({ player: 1, computer: 0 })
    expect(EMPTY_SCORE).toEqual({ player: 0, computer: 0 })

    const afterComputer = recordWin(recordWin(afterPlayer, 'computer'), 'computer')
    expect(afterComputer).toEqual({ player: 1, computer: 2 })
    expect(gamesPlayed(afterComputer)).toBe(3)
  })
})
