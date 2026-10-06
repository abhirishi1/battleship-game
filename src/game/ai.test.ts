import { describe, expect, it } from 'vitest'
import { chooseShot, createAiState, HUNT_SEQUENCE, recordShot, type AiState } from './ai'
import { allShipsSunk, fireAt, randomFleet, seededRandom } from './board'
import { formatCoord, parseCoord, toKey } from './coords'
import { buildBoard, columnFleet, stackedFleet } from './testFleets'
import type { Board, Coord } from './types'

function at(label: string): Coord {
  const coord = parseCoord(label)
  if (!coord) throw new Error(`Bad label ${label}`)
  return coord
}

/** Applies a sequence of reported results, e.g. ['E5', 'hit'], to a fresh AI. */
function aiAfter(...reports: [string, 'hit' | 'miss'][]): AiState {
  return reports.reduce(
    (ai, [label, result]) => recordShot(ai, at(label), { result }),
    createAiState(),
  )
}

/** Lets the AI play against `board` until every ship is sunk. */
function playOut(board: Board) {
  let ai = createAiState()
  let current = board
  const shots: Coord[] = []
  const modes: string[] = []
  while (!allShipsSunk(current)) {
    if (shots.length >= 100) throw new Error('AI failed to finish within 100 shots')
    const decision = chooseShot(ai)
    const outcome = fireAt(current, decision.coord)
    if (!outcome.ok) throw new Error(`AI fired an illegal shot: ${outcome.reason}`)
    shots.push(decision.coord)
    modes.push(decision.mode)
    current = outcome.board
    ai = recordShot(ai, decision.coord, {
      result: outcome.result,
      sunkShipType: outcome.result === 'sunk' ? outcome.shipType : undefined,
    })
  }
  return { shots, modes, ai }
}

describe('AI hunt mode', () => {
  it('uses a fixed checkerboard sequence', () => {
    expect(HUNT_SEQUENCE).toHaveLength(50)
    expect(HUNT_SEQUENCE.slice(0, 7).map(formatCoord)).toEqual(['A1', 'A3', 'A5', 'A7', 'A9', 'B2', 'B4'])
    expect(HUNT_SEQUENCE.every(({ row, col }) => (row + col) % 2 === 0)).toBe(true)
  })

  it('fires the hunt sequence in order while every shot misses', () => {
    let ai = createAiState()
    for (const expected of HUNT_SEQUENCE.slice(0, 12)) {
      const decision = chooseShot(ai)
      expect(decision.mode).toBe('hunt')
      expect(decision.coord).toEqual(expected)
      ai = recordShot(ai, decision.coord, { result: 'miss' })
    }
  })

  it('explains each choice', () => {
    expect(chooseShot(createAiState()).reason).toMatch(/checkerboard.*A1/)
  })
})

describe('AI target mode', () => {
  it('switches from hunt to target mode after a hit and probes an adjacent square', () => {
    expect(chooseShot(createAiState()).mode).toBe('hunt')
    const ai = aiAfter(['E5', 'hit'])
    const decision = chooseShot(ai)
    expect(decision.mode).toBe('target')
    expect(decision.coord).toEqual(at('D5'))
    expect(decision.reason).toMatch(/E5.*D5.*up/)
  })

  it('switches modes during a real game: the shot after the first hit is orthogonally adjacent', () => {
    const board = stackedFleet()
    let ai = createAiState()
    for (;;) {
      const decision = chooseShot(ai)
      expect(decision.mode).toBe('hunt')
      const outcome = fireAt(board, decision.coord)
      if (!outcome.ok) throw new Error('illegal')
      ai = recordShot(ai, decision.coord, { result: outcome.result })
      if (outcome.result === 'hit') {
        const next = chooseShot(ai)
        expect(next.mode).toBe('target')
        const distance =
          Math.abs(next.coord.row - decision.coord.row) + Math.abs(next.coord.col - decision.coord.col)
        expect(distance).toBe(1)
        break
      }
    }
  })

  it('probes neighbours in the order up, right, down, left, skipping tried and off-board squares', () => {
    expect(chooseShot(aiAfter(['E5', 'hit'], ['D5', 'miss'])).coord).toEqual(at('E6'))
    expect(chooseShot(aiAfter(['E5', 'hit'], ['D5', 'miss'], ['E6', 'miss'])).coord).toEqual(at('F5'))
    expect(
      chooseShot(aiAfter(['E5', 'hit'], ['D5', 'miss'], ['E6', 'miss'], ['F5', 'miss'])).coord,
    ).toEqual(at('E4'))
    expect(chooseShot(aiAfter(['A1', 'hit'])).coord).toEqual(at('A2'))
    expect(chooseShot(aiAfter(['J10', 'hit'])).coord).toEqual(at('I10'))
    expect(chooseShot(aiAfter(['J10', 'hit'], ['I10', 'miss'])).coord).toEqual(at('J9'))
  })

  it('continues along a row after two horizontal hits, then reverses at a miss', () => {
    const twoHits = aiAfter(['E5', 'hit'], ['D5', 'miss'], ['E6', 'hit'])
    const next = chooseShot(twoHits)
    expect(next.coord).toEqual(at('E7'))
    expect(next.reason).toMatch(/row E/)
    expect(chooseShot(recordShot(twoHits, at('E7'), { result: 'miss' })).coord).toEqual(at('E4'))
  })

  it('reverses along a column when the line reaches the board edge', () => {
    const next = chooseShot(aiAfter(['I3', 'hit'], ['J3', 'hit']))
    expect(next.coord).toEqual(at('H3'))
    expect(next.reason).toMatch(/column 3/)
  })

  it('falls back to probing neighbours when both ends of a line are blocked', () => {
    const blocked = aiAfter(['I3', 'hit'], ['H3', 'miss'], ['I4', 'miss'], ['J3', 'hit'])
    const next = chooseShot(blocked)
    expect(next.coord).toEqual(at('I2'))
    expect(next.mode).toBe('target')
  })

  it('extends a vertical line in both directions', () => {
    const twoHits = aiAfter(['C3', 'hit'], ['B3', 'hit'])
    expect(chooseShot(twoHits).coord).toEqual(at('D3'))
    const reversed = recordShot(twoHits, at('D3'), { result: 'miss' })
    const next = chooseShot(reversed)
    expect(next.coord).toEqual(at('A3'))
    expect(next.reason).toMatch(/column 3/)
  })

  it('returns to hunt mode once the hit ship is sunk', () => {
    let ai = aiAfter(['E5', 'hit'], ['D5', 'miss'])
    ai = recordShot(ai, at('E6'), { result: 'sunk', sunkShipType: 'destroyer' })
    expect(ai.unresolvedHits).toEqual([])
    expect(chooseShot(ai).mode).toBe('hunt')
  })

  it('keeps targeting leftover hits that belong to a different ship', () => {
    // E5 and E6 are hits on two different vertical ships; the destroyer E6/F6 sinks first.
    let ai = aiAfter(['E5', 'hit'], ['D5', 'miss'], ['E6', 'hit'])
    ai = recordShot(ai, at('E7'), { result: 'miss' })
    ai = recordShot(ai, at('E4'), { result: 'miss' })
    ai = recordShot(ai, at('F6'), { result: 'sunk', sunkShipType: 'destroyer' })
    expect(ai.unresolvedHits).toEqual([toKey(at('E5'))])
    expect(chooseShot(ai).mode).toBe('target')
  })
})

describe('AI full games', () => {
  it('sinks fixed fleets without ever repeating a shot', () => {
    for (const board of [stackedFleet(), columnFleet()]) {
      const { shots } = playOut(board)
      expect(new Set(shots.map(toKey)).size).toBe(shots.length)
    }
  })

  it('never repeats or goes off-board across 500 random fleets, and always finishes', () => {
    let total = 0
    for (let seed = 1; seed <= 500; seed++) {
      const { shots } = playOut(randomFleet(seededRandom(seed)))
      const keys = shots.map(toKey)
      expect(new Set(keys).size).toBe(keys.length)
      expect(shots.length).toBeLessThanOrEqual(100)
      total += shots.length
    }
    // Hunt/target should do far better than random firing (~96 shots on average).
    expect(total / 500).toBeLessThan(70)
  })

  it('handles ships packed side by side', () => {
    const board = buildBoard([
      ['carrier', { row: 3, col: 2 }, 'horizontal'],
      ['battleship', { row: 4, col: 2 }, 'horizontal'],
      ['cruiser', { row: 5, col: 2 }, 'horizontal'],
      ['submarine', { row: 3, col: 7 }, 'vertical'],
      ['destroyer', { row: 3, col: 8 }, 'vertical'],
    ])
    const { shots, ai } = playOut(board)
    expect(new Set(shots.map(toKey)).size).toBe(shots.length)
    expect(shots.length).toBeLessThanOrEqual(100)
    expect(Object.keys(ai.shots)).toHaveLength(shots.length)
  })

  it('is deterministic: the same fleet produces the same shot sequence', () => {
    const board = randomFleet(seededRandom(7))
    expect(playOut(board).shots).toEqual(playOut(board).shots)
  })

  it('does not depend on the hidden fleet beyond reported results', () => {
    // Two different fleets that both miss the first 10 hunt shots get identical decisions.
    const a = buildBoard([['destroyer', { row: 9, col: 0 }, 'horizontal']])
    const b = buildBoard([['destroyer', { row: 8, col: 0 }, 'vertical']])
    const first = (board: Board) => {
      let ai = createAiState()
      const coords: Coord[] = []
      for (let i = 0; i < 10; i++) {
        const { coord } = chooseShot(ai)
        const outcome = fireAt(board, coord)
        if (!outcome.ok) throw new Error('illegal')
        ai = recordShot(ai, coord, { result: outcome.result })
        coords.push(coord)
      }
      return coords
    }
    expect(first(a)).toEqual(first(b))
  })
})
