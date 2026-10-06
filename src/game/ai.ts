/**
 * Computer opponent: random, but explainable and repeatable.
 *
 * The AI never sees the player's board. It only knows the squares it has fired at
 * and the ordinary result of each shot: miss, hit, or "sunk <ship name>".
 *
 * Each game has a seed. Every random choice is derived from that seed and the number of
 * shots fired so far, so the same seed and the same results always replay the same game.
 *
 * Hunt mode: fire at a random untried square of this game's checkerboard colour.
 *   Every ship is at least two squares long, so each one covers a square of either colour.
 * Target mode: while any hit is not yet explained by a sunk ship,
 *   1. if two or more of those hits line up, extend the line at a random open end;
 *   2. otherwise probe a random untried square next to the oldest such hit.
 */
import { BOARD_SIZE, getShipDefinition, ROW_LABELS } from './constants'
import { formatCoord, fromKey, isInBounds, toKey } from './coords'
import { pick, seededRandom, type RandomSource } from './random'
import type { Coord, CoordKey, ShipType, ShotMark, ShotResult } from './types'

export type AiMode = 'hunt' | 'target'

type Parity = 0 | 1

export interface AiState {
  /** Drives every random choice in this game; the same seed replays the same game. */
  seed: number
  /** Every square the AI has fired at, with the result it was told. */
  shots: Partial<Record<CoordKey, ShotMark>>
  /** Hits not yet attributed to a sunk ship, oldest first. */
  unresolvedHits: CoordKey[]
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

type Axis = 'horizontal' | 'vertical'

const AXES: readonly Axis[] = ['horizontal', 'vertical']

const AXIS_STEP: Record<Axis, Coord> = {
  horizontal: { row: 0, col: 1 },
  vertical: { row: 1, col: 0 },
}

const PROBE_DIRECTIONS: readonly { name: string; step: Coord }[] = [
  { name: 'up', step: { row: -1, col: 0 } },
  { name: 'right', step: { row: 0, col: 1 } },
  { name: 'down', step: { row: 1, col: 0 } },
  { name: 'left', step: { row: 0, col: -1 } },
]

function checkerboard(parity: Parity): Coord[] {
  const coords: Coord[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === parity) coords.push({ row, col })
    }
  }
  return coords
}

const CHECKERBOARDS: Record<Parity, readonly Coord[]> = { 0: checkerboard(0), 1: checkerboard(1) }

export function createAiState(seed = 0): AiState {
  return { seed: seed >>> 0, shots: {}, unresolvedHits: [] }
}

/** The checkerboard colour this game hunts on: 0 includes A1, 1 includes A2. */
export function huntParity(ai: AiState): Parity {
  return (ai.seed & 1) as Parity
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

function lineLabel(axis: Axis, coord: Coord): string {
  return axis === 'horizontal' ? `row ${ROW_LABELS[coord.row]}` : `column ${coord.col + 1}`
}

function fromChoices(count: number, noun: string): string {
  return count === 1 ? `the only untried ${noun}` : `picked at random from ${count} untried ${noun}s`
}

/** Contiguous unresolved hits through `coord` along `axis`, ordered top/left first. */
function runThrough(unresolved: Set<CoordKey>, coord: Coord, axis: Axis): Coord[] {
  const step = AXIS_STEP[axis]
  let start = coord
  while (unresolved.has(toKey(offset(start, step, -1)))) start = offset(start, step, -1)
  const run: Coord[] = []
  for (let cell = start; unresolved.has(toKey(cell)); cell = offset(cell, step)) run.push(cell)
  return run
}

function extendLine(ai: AiState, random: RandomSource): AiDecision | null {
  const unresolved = new Set(ai.unresolvedHits)
  for (const key of ai.unresolvedHits) {
    const hit = fromKey(key)
    for (const axis of AXES) {
      const run = runThrough(unresolved, hit, axis)
      if (run.length < 2) continue
      const first = run[0]
      const last = run[run.length - 1]
      const step = AXIS_STEP[axis]
      const ends = [offset(last, step), offset(first, step, -1)].filter((end) => isUntried(ai, end))
      if (ends.length === 0) continue
      const candidate = pick(ends, random)
      return {
        coord: candidate,
        mode: 'target',
        reason:
          `Hits ${formatCoord(first)}–${formatCoord(last)} line up along ${lineLabel(axis, first)}; ` +
          `continuing the line at ${formatCoord(candidate)} (${fromChoices(ends.length, 'end')}).`,
      }
    }
  }
  return null
}

function probeNeighbours(ai: AiState, random: RandomSource): AiDecision | null {
  for (const key of ai.unresolvedHits) {
    const hit = fromKey(key)
    const options = PROBE_DIRECTIONS.map(({ name, step }) => ({ name, coord: offset(hit, step) })).filter(
      ({ coord }) => isUntried(ai, coord),
    )
    if (options.length === 0) continue
    const { name, coord } = pick(options, random)
    return {
      coord,
      mode: 'target',
      reason:
        `Unsunk hit at ${formatCoord(hit)}; probing the adjacent square ${formatCoord(coord)} (${name}), ` +
        `${fromChoices(options.length, 'neighbour')}.`,
    }
  }
  return null
}

function hunt(ai: AiState, random: RandomSource): AiDecision | null {
  const parity = huntParity(ai)
  const options = CHECKERBOARDS[parity].filter((coord) => isUntried(ai, coord))
  if (options.length > 0) {
    const coord = pick(options, random)
    return {
      coord,
      mode: 'hunt',
      reason:
        options.length === 1
          ? `No unsunk hits; ${formatCoord(coord)} is the only untried checkerboard square.`
          : `No unsunk hits; picked ${formatCoord(coord)} at random from ${options.length} untried checkerboard squares.`,
    }
  }
  const leftovers = CHECKERBOARDS[parity === 0 ? 1 : 0].filter((coord) => isUntried(ai, coord))
  if (leftovers.length === 0) return null
  const coord = pick(leftovers, random)
  return {
    coord,
    mode: 'hunt',
    reason: `Checkerboard exhausted; sweeping remaining square ${formatCoord(coord)}.`,
  }
}

/** Picks the next shot. Always returns a square the AI has never fired at. */
export function chooseShot(ai: AiState): AiDecision {
  const random = randomForNextShot(ai)
  const decision = extendLine(ai, random) ?? probeNeighbours(ai, random) ?? hunt(ai, random)
  if (!decision) throw new Error('No untried squares remain')
  return decision
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
  return { ...ai, shots, unresolvedHits: unresolvedHits.filter((hit) => !sunk.has(hit)) }
}
