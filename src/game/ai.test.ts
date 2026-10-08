import { describe, expect, it } from 'vitest'
import { chooseShot, createAiState, huntParity, recordShot, type AiState } from './ai'
import { allShipsSunk, fireAt, randomFleet, seededRandom, shipCells } from './board'
import { formatCoord, parseCoord, toKey } from './coords'
import { columnFleet, stackedFleet } from './testFleets'
import type { Board, Coord, Orientation, ShipType } from './types'

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)

type Report = [string, 'hit' | 'miss']

function at(label: string): Coord {
  const coord = parseCoord(label)
  if (!coord) throw new Error(`Bad label ${label}`)
  return coord
}

/** Applies reported results, e.g. ['E5', 'hit'], to a fresh AI with the given seed. */
function aiAfter(reports: Report[], seed = 1): AiState {
  return reports.reduce((ai, [label, result]) => recordShot(ai, at(label), { result }), createAiState(seed))
}

/** Every square the AI picks after `reports`, across many seeds. */
function choicesAfter(reports: Report[]): string[] {
  return [...new Set(SEEDS.map((seed) => formatCoord(chooseShot(aiAfter(reports, seed)).coord)))].sort()
}

/** Lets the AI play against `board` until every ship is sunk. */
function playOut(board: Board, seed: number) {
  let ai = createAiState(seed)
  let current = board
  const shots: Coord[] = []
  while (!allShipsSunk(current)) {
    if (shots.length >= 100) throw new Error('AI failed to finish within 100 shots')
    const decision = chooseShot(ai)
    const outcome = fireAt(current, decision.coord)
    if (!outcome.ok) throw new Error(`AI fired an illegal shot: ${outcome.reason}`)
    shots.push(decision.coord)
    current = outcome.board
    ai = recordShot(ai, decision.coord, {
      result: outcome.result,
      sunkShipType: outcome.result === 'sunk' ? outcome.shipType : undefined,
    })
  }
  return { shots, ai }
}

function huntOrder(seed: number, count: number): string[] {
  let ai = createAiState(seed)
  const labels: string[] = []
  for (let i = 0; i < count; i++) {
    const { coord } = chooseShot(ai)
    labels.push(formatCoord(coord))
    ai = recordShot(ai, coord, { result: 'miss' })
  }
  return labels
}

describe('AI hunt mode', () => {
  it('fires only at untried squares of one checkerboard colour, covering all 50 before anything else', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      let ai = createAiState(seed)
      const parity = huntParity(ai)
      const seen = new Set<string>()
      for (let i = 0; i < 50; i++) {
        const decision = chooseShot(ai)
        expect(decision.mode).toBe('hunt')
        expect((decision.coord.row + decision.coord.col) % 2).toBe(parity)
        seen.add(toKey(decision.coord))
        ai = recordShot(ai, decision.coord, { result: 'miss' })
      }
      expect(seen.size).toBe(50)
      const sweep = chooseShot(ai)
      expect((sweep.coord.row + sweep.coord.col) % 2).not.toBe(parity)
      expect(sweep.reason).toMatch(/Checkerboard exhausted/)
    }
  })

  it('hunts on either checkerboard colour depending on the game', () => {
    expect(new Set(SEEDS.map((seed) => huntParity(createAiState(seed))))).toEqual(new Set([0, 1]))
  })

  it('varies the hunt order between games but replays it exactly for the same seed', () => {
    expect(huntOrder(5, 15)).toEqual(huntOrder(5, 15))
    expect(huntOrder(5, 15)).not.toEqual(huntOrder(7, 15))
    const openingShots = new Set(SEEDS.map((seed) => huntOrder(seed, 1)[0]))
    expect(openingShots.size).toBeGreaterThan(15)
  })

  it('explains each choice', () => {
    expect(chooseShot(createAiState(3)).reason).toMatch(
      /^No unsunk hits; picked [A-J]\d+ at random from 50 untried checkerboard squares\.$/,
    )
  })
})

describe('AI target mode', () => {
  it('switches from hunt to target mode after a hit and probes an adjacent square', () => {
    expect(chooseShot(createAiState(1)).mode).toBe('hunt')
    const decision = chooseShot(aiAfter([['E5', 'hit']]))
    expect(decision.mode).toBe('target')
    expect(['D5', 'E6', 'F5', 'E4']).toContain(formatCoord(decision.coord))
    expect(decision.reason).toMatch(/Unsunk hit at E5.*picked at random from 4 untried neighbours/)
  })

  it('switches modes during a real game: the shot after the first hit is orthogonally adjacent', () => {
    const board = stackedFleet()
    for (const seed of SEEDS.slice(0, 10)) {
      let ai = createAiState(seed)
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
    }
  })

  it('probes neighbours in a random order, only ever choosing untried on-board squares', () => {
    expect(choicesAfter([['E5', 'hit']])).toEqual(['D5', 'E4', 'E6', 'F5'])
    expect(choicesAfter([['E5', 'hit'], ['D5', 'miss'], ['E6', 'miss']])).toEqual(['E4', 'F5'])
    expect(choicesAfter([['E5', 'hit'], ['D5', 'miss'], ['E6', 'miss'], ['F5', 'miss']])).toEqual(['E4'])
    expect(chooseShot(aiAfter([['E5', 'hit'], ['D5', 'miss'], ['E6', 'miss'], ['F5', 'miss']])).reason).toMatch(
      /the only untried neighbour/,
    )
    expect(choicesAfter([['A1', 'hit']])).toEqual(['A2', 'B1'])
    expect(choicesAfter([['J10', 'hit'], ['I10', 'miss']])).toEqual(['J9'])
  })

  it('continues along a row after two horizontal hits, then reverses at a miss', () => {
    const twoHits: Report[] = [['E5', 'hit'], ['D5', 'miss'], ['E6', 'hit']]
    expect(choicesAfter(twoHits)).toEqual(['E4', 'E7'])
    expect(chooseShot(aiAfter(twoHits)).reason).toMatch(/row E/)
    expect(choicesAfter([...twoHits, ['E7', 'miss']])).toEqual(['E4'])
  })

  it('reverses along a column when the line reaches the board edge', () => {
    expect(choicesAfter([['I3', 'hit'], ['J3', 'hit']])).toEqual(['H3'])
    expect(chooseShot(aiAfter([['I3', 'hit'], ['J3', 'hit']])).reason).toMatch(/column 3.*the only untried end/)
  })

  it('falls back to probing neighbours when both ends of a line are blocked', () => {
    const blocked: Report[] = [['I3', 'hit'], ['H3', 'miss'], ['I4', 'miss'], ['J3', 'hit']]
    expect(choicesAfter(blocked)).toEqual(['I2'])
    expect(chooseShot(aiAfter(blocked)).mode).toBe('target')
  })

  it('extends a vertical line in both directions', () => {
    const twoHits: Report[] = [['C3', 'hit'], ['B3', 'hit']]
    expect(choicesAfter(twoHits)).toEqual(['A3', 'D3'])
    expect(choicesAfter([...twoHits, ['D3', 'miss']])).toEqual(['A3'])
    expect(chooseShot(aiAfter([...twoHits, ['D3', 'miss']])).reason).toMatch(/column 3/)
  })

  it('returns to hunt mode once the hit ship is sunk', () => {
    let ai = aiAfter([['E5', 'hit'], ['D5', 'miss']])
    ai = recordShot(ai, at('E6'), { result: 'sunk', sunkShipType: 'destroyer' })
    expect(ai.unresolvedHits).toEqual([])
    expect(chooseShot(ai).mode).toBe('hunt')
  })

  it('keeps targeting leftover hits that belong to a different ship', () => {
    // E5 and E6 are hits on two different vertical ships; the destroyer E6/F6 sinks first.
    let ai = aiAfter([['E5', 'hit'], ['D5', 'miss'], ['E6', 'hit']])
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
      for (const seed of SEEDS.slice(0, 10)) {
        const { shots } = playOut(board, seed)
        expect(new Set(shots.map(toKey)).size).toBe(shots.length)
      }
    }
  })

  it('never repeats or goes off-board across 500 random games, and always finishes', () => {
    let total = 0
    for (let seed = 1; seed <= 500; seed++) {
      const { shots } = playOut(randomFleet(seededRandom(seed)), seed + 1000)
      const keys = shots.map(toKey)
      expect(new Set(keys).size).toBe(keys.length)
      expect(shots.length).toBeLessThanOrEqual(100)
      total += shots.length
    }
    // Hunt/target should do far better than random firing (~96 shots on average).
    expect(total / 500).toBeLessThan(70)
  })

  it('still copes with ships packed side by side (no longer a legal layout; kept as a stress test)', () => {
    const packed: [ShipType, Coord, Orientation, number][] = [
      ['carrier', { row: 3, col: 2 }, 'horizontal', 5],
      ['battleship', { row: 4, col: 2 }, 'horizontal', 4],
      ['cruiser', { row: 5, col: 2 }, 'horizontal', 3],
      ['submarine', { row: 3, col: 7 }, 'vertical', 3],
      ['destroyer', { row: 3, col: 8 }, 'vertical', 2],
    ]
    const board: Board = {
      ships: packed.map(([type, origin, orientation, length]) => ({ type, cells: shipCells(origin, orientation, length) })),
      shots: {},
    }
    for (const seed of SEEDS.slice(0, 10)) {
      const { shots, ai } = playOut(board, seed)
      expect(new Set(shots.map(toKey)).size).toBe(shots.length)
      expect(Object.keys(ai.shots)).toHaveLength(shots.length)
    }
  })

  it('is repeatable: the same fleet and seed replay the same game; another seed plays differently', () => {
    const board = randomFleet(seededRandom(7))
    expect(playOut(board, 42).shots).toEqual(playOut(board, 42).shots)
    expect(playOut(board, 42).shots).not.toEqual(playOut(board, 43).shots)
  })

  it('decides only from reported results, never from the hidden fleet', () => {
    for (const seed of SEEDS) {
      let boardA = stackedFleet()
      let boardB = columnFleet()
      let aiA = createAiState(seed)
      let aiB = createAiState(seed)
      for (let i = 0; i < 100; i++) {
        const decisionA = chooseShot(aiA)
        expect(chooseShot(aiB)).toEqual(decisionA)
        const a = fireAt(boardA, decisionA.coord)
        const b = fireAt(boardB, decisionA.coord)
        if (!a.ok || !b.ok) throw new Error('illegal')
        if (a.result !== b.result || a.shipType !== b.shipType) break
        const report = { result: a.result, sunkShipType: a.result === 'sunk' ? a.shipType : undefined }
        aiA = recordShot(aiA, decisionA.coord, report)
        aiB = recordShot(aiB, decisionA.coord, report)
        boardA = a.board
        boardB = b.board
      }
    }
  })
})
