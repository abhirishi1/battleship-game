import { describe, expect, it } from 'vitest'
import { chooseShot, countShipPositions, createAiState, recordShot, type AiState, type ShotReport } from './ai'
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

/** Heat-map score of a square. */
function score(ai: AiState, label: string): number {
  const { row, col } = at(label)
  return countShipPositions(ai).counts[row][col]
}

describe('AI hunt mode (heat map)', () => {
  it('scores each square by how many ship positions could cover it', () => {
    const fresh = createAiState(1)
    // A corner fits each of the 5 ships in 2 ways (across and down); a centre square fits 34.
    expect(score(fresh, 'A1')).toBe(10)
    expect(score(fresh, 'E5')).toBe(34)
    expect(score(fresh, 'D5')).toBe(33)
  })

  it('opens on one of the most likely squares, chosen at random', () => {
    expect(choicesAfter([])).toEqual(['E5', 'E6', 'F5', 'F6'])
    expect(chooseShot(createAiState(3)).reason).toMatch(
      /^No unsunk hits; (E5|E6|F5|F6) fits a ship in 34 possible ways, the most of any untried square \(picked at random from 4 equally likely squares\)\.$/,
    )
  })

  it('varies the hunt order between games but replays it exactly for the same seed', () => {
    expect(huntOrder(5, 15)).toEqual(huntOrder(5, 15))
    expect(huntOrder(5, 15)).not.toEqual(huntOrder(7, 15))
  })

  it('skips a square boxed in by misses, because no ship fits there', () => {
    const boxed: Report[] = [['D5', 'miss'], ['F5', 'miss'], ['E4', 'miss'], ['E6', 'miss']]
    const ai = aiAfter(boxed)
    expect(score(ai, 'E5')).toBe(0)
    expect(choicesAfter(boxed)).not.toContain('E5')
    expect(chooseShot(ai).reason).toMatch(/1 untried square can't hold any ship and is skipped\./)
  })

  it('never fires next to a sunk ship (ships cannot touch)', () => {
    const ring = ['D4', 'D5', 'D6', 'D7', 'E4', 'E7', 'F4', 'F5', 'F6', 'F7']
    for (const seed of SEEDS) {
      let ai = recordShot(aiAfter([['E5', 'hit']], seed), at('E6'), { result: 'sunk', sunkShipType: 'destroyer' })
      expect(ai.unresolvedHits).toEqual([])
      for (const label of ring) expect(score(ai, label)).toBe(0)
      for (let i = 0; i < 20; i++) {
        const decision = chooseShot(ai)
        expect(decision.mode).toBe('hunt')
        expect(ring).not.toContain(formatCoord(decision.coord))
        ai = recordShot(ai, decision.coord, { result: 'miss' })
      }
    }
  })

  it('stops counting a ship once it is sunk', () => {
    // Only 2-square positions can fit between these misses; once the Destroyer is sunk, none can.
    const gap: Report[] = [['A3', 'miss'], ['B1', 'miss'], ['B2', 'miss']]
    expect(score(aiAfter(gap), 'A1')).toBe(1)
    const destroyerSunk = recordShot(aiAfter([['J9', 'hit']]), at('J10'), { result: 'sunk', sunkShipType: 'destroyer' })
    const afterSink = gap.reduce((ai, [label, result]) => recordShot(ai, at(label), { result }), destroyerSunk)
    expect(score(afterSink, 'A1')).toBe(0)
  })
})

describe('AI target mode (heat map through unsunk hits)', () => {
  it('switches to target mode after a hit and fires only at orthogonal neighbours', () => {
    expect(chooseShot(createAiState(1)).mode).toBe('hunt')
    const ai = aiAfter([['E5', 'hit']])
    expect(chooseShot(ai).mode).toBe('target')
    expect(choicesAfter([['E5', 'hit']])).toEqual(['D5', 'E4', 'E6', 'F5'])
    // Diagonal neighbours of a hit can never hold a ship: a different ship would touch it.
    for (const label of ['D4', 'D6', 'F4', 'F6']) expect(score(ai, label)).toBe(0)
  })

  it('prefers the direction with more room for a ship', () => {
    // From E1 only one position per ship runs right (to E2), but many run up or down.
    expect(choicesAfter([['E1', 'hit']])).toEqual(['D1', 'F1'])
    expect(chooseShot(aiAfter([['E1', 'hit']])).reason).toMatch(
      /^Unsunk hit at E1; [DF]1 is part of 12 of the 22 possible ship positions through it, the most of any square \(picked at random from 2 equally likely squares\)\.$/,
    )
  })

  it('continues along a row after two hits, then reverses at a miss', () => {
    const twoHits: Report[] = [['E5', 'hit'], ['D5', 'miss'], ['E6', 'hit']]
    expect(choicesAfter(twoHits)).toEqual(['E4', 'E7'])
    expect(chooseShot(aiAfter(twoHits)).reason).toMatch(/^Unsunk hits at E5, E6; /)
    expect(choicesAfter([...twoHits, ['E7', 'miss']])).toEqual(['E4'])
  })

  it('reverses along a column when the line reaches the board edge', () => {
    expect(choicesAfter([['I3', 'hit'], ['J3', 'hit']])).toEqual(['H3'])
  })

  it('returns to hunt mode once the hit ship is sunk', () => {
    let ai = aiAfter([['E5', 'hit'], ['D5', 'miss']])
    ai = recordShot(ai, at('E6'), { result: 'sunk', sunkShipType: 'destroyer' })
    expect(ai.unresolvedHits).toEqual([])
    expect(ai.sunkShips).toEqual(['destroyer'])
    expect(chooseShot(ai).mode).toBe('hunt')
  })

  it('keeps targeting a leftover hit on a different ship', () => {
    let ai = aiAfter([['C3', 'hit'], ['G7', 'hit']])
    ai = recordShot(ai, at('G8'), { result: 'sunk', sunkShipType: 'destroyer' })
    expect(ai.unresolvedHits).toEqual([toKey(at('C3'))])
    const decision = chooseShot(ai)
    expect(decision.mode).toBe('target')
    expect(['B3', 'C2', 'C4', 'D3']).toContain(formatCoord(decision.coord))
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
    // The heat map should do far better than random firing (~96 shots on average).
    expect(total / 500).toBeLessThan(45)
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
        const report: ShotReport = { result: a.result, sunkShipType: a.result === 'sunk' ? a.shipType : undefined }
        aiA = recordShot(aiA, decisionA.coord, report)
        aiB = recordShot(aiB, decisionA.coord, report)
        boardA = a.board
        boardB = b.board
      }
    }
  })
})
