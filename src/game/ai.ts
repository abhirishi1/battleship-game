/**
 * Computer opponent: a "most likely square" heat map, randomized and explainable.
 *
 * The AI never sees the player's board. It only knows the squares it has fired at
 * and the ordinary result of each shot: miss, hit, or "sunk <ship name>".
 *
 * Before every shot it lists every position where each ship it has not sunk yet could still be,
 * using the placement rules: ships are straight and never overlap or touch, not even at a corner.
 * A position is ruled out if it
 *   - covers a miss or a square of a ship already sunk, or
 *   - sits next to (including diagonally) a hit that is not one of its own squares.
 * Each untried square scores the number of positions covering it, and the AI fires at the
 * highest-scoring one. Ties are broken at random.
 *
 * Hunt mode (no unsunk hits): every possible position counts.
 * Target mode (some hits not yet explained by a sunk ship): only positions through those hits count.
 *
 * Each game has a seed. Every random choice is derived from that seed and the number of
 * shots fired so far, so the same seed and the same results always replay the same game.
 */
import { BOARD_SIZE, FLEET, getShipDefinition } from './constants'
import { formatCoord, fromKey, isInBounds, toKey } from './coords'
import { pick, seededRandom, type RandomSource } from './random'
import type { Coord, CoordKey, ShipType, ShotMark, ShotResult } from './types'

export type AiMode = 'hunt' | 'target'

export interface AiState {
  /** Drives every random choice in this game; the same seed replays the same game. */
  seed: number
  /** Every square the AI has fired at, with the result it was told. */
  shots: Partial<Record<CoordKey, ShotMark>>
  /** Hits not yet attributed to a sunk ship, oldest first. */
  unresolvedHits: CoordKey[]
  /** Ships the AI has been told it sank. */
  sunkShips: ShipType[]
}

export interface AiDecision {
  coord: Coord
  mode: AiMode
  reason: string
}

/** The only information the AI receives about a shot it fired. */
export interface ShotReport {
  result: ShotResult
  sunkShipType?: ShipType
}

export interface ShipPositionCounts {
  /** `counts[row][col]`: how many possible ship positions cover that untried square. */
  counts: number[][]
  /** How many possible ship positions were counted in total. */
  positions: number
}

type Axis = 'horizontal' | 'vertical'

const AXES: readonly Axis[] = ['horizontal', 'vertical']

const AXIS_STEP: Record<Axis, Coord> = {
  horizontal: { row: 0, col: 1 },
  vertical: { row: 1, col: 0 },
}

const ORTHOGONAL_STEPS: readonly Coord[] = [
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
]

const ALL_COORDS: readonly Coord[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => ({
  row: Math.floor(i / BOARD_SIZE),
  col: i % BOARD_SIZE,
}))

export function createAiState(seed = 0): AiState {
  return { seed: seed >>> 0, shots: {}, unresolvedHits: [], sunkShips: [] }
}

function randomForNextShot(ai: AiState): RandomSource {
  const shotNumber = Object.keys(ai.shots).length + 1
  return seededRandom(ai.seed ^ Math.imul(shotNumber, 0x9e3779b9))
}

function offset(coord: Coord, step: Coord, times = 1): Coord {
  return { row: coord.row + step.row * times, col: coord.col + step.col * times }
}

function isUntried(ai: AiState, coord: Coord): boolean {
  return isInBounds(coord) && ai.shots[toKey(coord)] === undefined
}

/** A ship position as square indices (row * BOARD_SIZE + col), plus the squares around it. */
interface Position {
  cells: number[]
  border: number[]
}

const index = ({ row, col }: Coord) => row * BOARD_SIZE + col

/** The up to eight on-board squares around `coord`, including diagonals. */
function surroundingCells({ row, col }: Coord): Coord[] {
  const cells: Coord[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr !== 0 || dc !== 0) cells.push({ row: row + dr, col: col + dc })
    }
  }
  return cells.filter(isInBounds)
}

const positionsByLength = new Map<number, Position[]>()

/** Every on-board position for a ship of `length`. */
function allPositions(length: number): Position[] {
  let positions = positionsByLength.get(length)
  if (!positions) {
    positions = []
    for (const axis of AXES) {
      for (const origin of ALL_COORDS) {
        const coords = Array.from({ length }, (_, i) => offset(origin, AXIS_STEP[axis], i))
        if (!coords.every(isInBounds)) continue
        const cells = coords.map(index)
        const border = new Set(coords.flatMap(surroundingCells).map(index))
        for (const cell of cells) border.delete(cell)
        positions.push({ cells, border: [...border] })
      }
    }
    positionsByLength.set(length, positions)
  }
  return positions
}

const UNTRIED = 0
const MISS = 1
const SUNK_HIT = 2
const UNSUNK_HIT = 3

/**
 * The heat map: how many possible positions of the ships still afloat cover each untried square.
 * A position is possible if none of its squares is a miss or part of a sunk ship, and no hit
 * touches it from outside (ships never touch).
 */
export function countShipPositions(ai: AiState): ShipPositionCounts {
  const squares = new Uint8Array(BOARD_SIZE * BOARD_SIZE)
  for (const [key, mark] of Object.entries(ai.shots)) {
    squares[index(fromKey(key as CoordKey))] = mark === 'miss' ? MISS : SUNK_HIT
  }
  for (const key of ai.unresolvedHits) squares[index(fromKey(key))] = UNSUNK_HIT
  const targeting = ai.unresolvedHits.length > 0

  const counts = Array.from({ length: BOARD_SIZE }, () => Array<number>(BOARD_SIZE).fill(0))
  let positions = 0
  for (const { type, length } of FLEET) {
    if (ai.sunkShips.includes(type)) continue
    for (const { cells, border } of allPositions(length)) {
      if (targeting && !cells.some((cell) => squares[cell] === UNSUNK_HIT)) continue
      if (cells.some((cell) => squares[cell] === MISS || squares[cell] === SUNK_HIT)) continue
      if (border.some((cell) => squares[cell] >= SUNK_HIT)) continue
      positions++
      for (const cell of cells) {
        if (squares[cell] === UNTRIED) counts[Math.floor(cell / BOARD_SIZE)][cell % BOARD_SIZE]++
      }
    }
  }
  return { counts, positions }
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

function tieNote(ties: number): string {
  return ties > 1 ? ` (picked at random from ${ties} equally likely squares)` : ''
}

/** Only reachable if the reported results break the placement rules (e.g. touching ships). */
function fallback(ai: AiState, mode: AiMode, untried: Coord[], random: RandomSource): AiDecision {
  for (const key of ai.unresolvedHits) {
    const hit = fromKey(key)
    const neighbours = ORTHOGONAL_STEPS.map((step) => offset(hit, step)).filter((cell) => isUntried(ai, cell))
    if (neighbours.length === 0) continue
    const coord = pick(neighbours, random)
    return {
      coord,
      mode,
      reason: `No ship position fits the results so far; probing ${formatCoord(coord)} next to the hit at ${formatCoord(hit)}.`,
    }
  }
  const coord = pick(untried, random)
  return {
    coord,
    mode,
    reason: `No ship position fits the results so far; picked ${formatCoord(coord)} at random from ${plural(untried.length, 'untried square')}.`,
  }
}

/** Picks the next shot. Always returns a square the AI has never fired at. */
export function chooseShot(ai: AiState): AiDecision {
  const random = randomForNextShot(ai)
  const mode: AiMode = ai.unresolvedHits.length > 0 ? 'target' : 'hunt'
  const untried = ALL_COORDS.filter((coord) => isUntried(ai, coord))
  if (untried.length === 0) throw new Error('No untried squares remain')

  const { counts, positions } = countShipPositions(ai)
  let best = 0
  let bestSquares: Coord[] = []
  let ruledOut = 0
  for (const coord of untried) {
    const score = counts[coord.row][coord.col]
    if (score === 0) ruledOut++
    else if (score > best) {
      best = score
      bestSquares = [coord]
    } else if (score === best) bestSquares.push(coord)
  }
  if (best === 0) return fallback(ai, mode, untried, random)

  const coord = pick(bestSquares, random)
  const square = formatCoord(coord)
  if (mode === 'hunt') {
    const skipped = ruledOut > 0 ? ` ${plural(ruledOut, 'untried square')} can't hold any ship and ${ruledOut === 1 ? 'is' : 'are'} skipped.` : ''
    return {
      coord,
      mode,
      reason:
        `No unsunk hits; ${square} fits a ship in ${plural(best, 'possible way')}, ` +
        `the most of any untried square${tieNote(bestSquares.length)}.${skipped}`,
    }
  }
  const hits = ai.unresolvedHits.map((key) => formatCoord(fromKey(key)))
  return {
    coord,
    mode,
    reason:
      `Unsunk ${hits.length === 1 ? 'hit' : 'hits'} at ${hits.join(', ')}; ${square} is part of ${best} of the ` +
      `${plural(positions, 'possible ship position')} through ${hits.length === 1 ? 'it' : 'them'}, ` +
      `the most of any square${tieNote(bestSquares.length)}.`,
  }
}

/**
 * When a ship sinks, the AI is told only its name (and therefore its length).
 * It infers which unresolved hits belonged to that ship: a straight run of that
 * length containing the sinking shot, preferring runs that end at the sinking
 * shot and that include the oldest unresolved hit.
 */
function inferSunkCells(unresolvedHits: CoordKey[], sinkingShot: Coord, length: number): CoordKey[] {
  const unresolved = new Set(unresolvedHits)
  const age = (key: CoordKey) => unresolvedHits.indexOf(key)
  const candidates: { keys: CoordKey[]; endsAtShot: boolean; oldest: number }[] = []

  for (const axis of AXES) {
    const step = AXIS_STEP[axis]
    for (let shift = -(length - 1); shift <= 0; shift++) {
      const cells = Array.from({ length }, (_, i) => offset(sinkingShot, step, shift + i))
      const keys = cells.map(toKey)
      if (!cells.every(isInBounds) || !keys.every((key) => unresolved.has(key))) continue
      candidates.push({
        keys,
        endsAtShot: shift === 0 || shift === -(length - 1),
        oldest: Math.min(...keys.map(age)),
      })
    }
  }

  candidates.sort(
    (a, b) => Number(b.endsAtShot) - Number(a.endsAtShot) || a.oldest - b.oldest,
  )
  return candidates[0]?.keys ?? [toKey(sinkingShot)]
}

/** Records the result of a shot the AI fired. */
export function recordShot(ai: AiState, coord: Coord, report: ShotReport): AiState {
  const key = toKey(coord)
  if (report.result === 'miss') {
    return { ...ai, shots: { ...ai.shots, [key]: 'miss' } }
  }

  const shots = { ...ai.shots, [key]: 'hit' as const }
  const unresolvedHits = [...ai.unresolvedHits, key]
  if (report.result === 'hit' || !report.sunkShipType) return { ...ai, shots, unresolvedHits }

  const { length } = getShipDefinition(report.sunkShipType)
  const sunk = new Set(inferSunkCells(unresolvedHits, coord, length))
  return {
    ...ai,
    shots,
    unresolvedHits: unresolvedHits.filter((hit) => !sunk.has(hit)),
    sunkShips: [...ai.sunkShips, report.sunkShipType],
  }
}
