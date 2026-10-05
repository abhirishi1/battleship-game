/**
 * Deterministic computer opponent.
 *
 * The AI never sees the player's board. It only knows the squares it has fired at
 * and the ordinary result of each shot: miss, hit, or "sunk <ship name>".
 *
 * Hunt mode: fire down a fixed checkerboard sequence (A1, A3, ... B2, B4, ...).
 *   Every ship is at least two squares long, so each one covers a checkerboard square.
 * Target mode: while any hit is not yet explained by a sunk ship,
 *   1. if two or more of those hits line up, extend the line (right/down end first);
 *   2. otherwise probe the squares next to a hit in the order up, right, down, left.
 */
import { BOARD_SIZE, getShipDefinition, ROW_LABELS } from './constants'
import { formatCoord, fromKey, isInBounds, toKey } from './coords'
import type { Coord, CoordKey, ShipType, ShotMark, ShotResult } from './types'

export type AiMode = 'hunt' | 'target'

export interface AiState {
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

function sequence(parity: 0 | 1): Coord[] {
  const coords: Coord[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === parity) coords.push({ row, col })
    }
  }
  return coords
}

/** Fixed hunt order: the checkerboard squares, row by row. */
export const HUNT_SEQUENCE: readonly Coord[] = sequence(0)

/** Safety net only; the checkerboard always finds every ship first. */
const FALLBACK_SEQUENCE: readonly Coord[] = sequence(1)

export function createAiState(): AiState {
  return { shots: {}, unresolvedHits: [] }
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

/** Contiguous unresolved hits through `coord` along `axis`, ordered top/left first. */
function runThrough(unresolved: Set<CoordKey>, coord: Coord, axis: Axis): Coord[] {
  const step = AXIS_STEP[axis]
  let start = coord
  while (unresolved.has(toKey(offset(start, step, -1)))) start = offset(start, step, -1)
  const run: Coord[] = []
  for (let cell = start; unresolved.has(toKey(cell)); cell = offset(cell, step)) run.push(cell)
  return run
}

function extendLine(ai: AiState, unresolved: Set<CoordKey>): AiDecision | null {
  for (const key of ai.unresolvedHits) {
    const hit = fromKey(key)
    for (const axis of AXES) {
      const run = runThrough(unresolved, hit, axis)
      if (run.length < 2) continue
      const first = run[0]
      const last = run[run.length - 1]
      const step = AXIS_STEP[axis]
      for (const candidate of [offset(last, step), offset(first, step, -1)]) {
        if (!isUntried(ai, candidate)) continue
        return {
          coord: candidate,
          mode: 'target',
          reason:
            `Hits ${formatCoord(first)}–${formatCoord(last)} line up along ${lineLabel(axis, first)}; ` +
            `continuing the line at ${formatCoord(candidate)}.`,
        }
      }
    }
  }
  return null
}

function probeNeighbours(ai: AiState): AiDecision | null {
  for (const key of ai.unresolvedHits) {
    const hit = fromKey(key)
    for (const { name, step } of PROBE_DIRECTIONS) {
      const candidate = offset(hit, step)
      if (!isUntried(ai, candidate)) continue
      return {
        coord: candidate,
        mode: 'target',
        reason: `Unsunk hit at ${formatCoord(hit)}; probing the adjacent square ${formatCoord(candidate)} (${name}).`,
      }
    }
  }
  return null
}

function hunt(ai: AiState): AiDecision | null {
  const index = HUNT_SEQUENCE.findIndex((coord) => isUntried(ai, coord))
  if (index !== -1) {
    const coord = HUNT_SEQUENCE[index]
    return {
      coord,
      mode: 'hunt',
      reason: `No unsunk hits; next square in the checkerboard search is ${formatCoord(coord)} (${index + 1} of ${HUNT_SEQUENCE.length}).`,
    }
  }
  const fallback = FALLBACK_SEQUENCE.find((coord) => isUntried(ai, coord))
  if (!fallback) return null
  return {
    coord: fallback,
    mode: 'hunt',
    reason: `Checkerboard exhausted; sweeping remaining square ${formatCoord(fallback)}.`,
  }
}

/** Picks the next shot. Always returns a square the AI has never fired at. */
export function chooseShot(ai: AiState): AiDecision {
  const unresolved = new Set(ai.unresolvedHits)
  const decision = extendLine(ai, unresolved) ?? probeNeighbours(ai) ?? hunt(ai)
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
  if (report.result === 'hit' || !report.sunkShipType) return { shots, unresolvedHits }

  const { length } = getShipDefinition(report.sunkShipType)
  const sunk = new Set(inferSunkCells(unresolvedHits, coord, length))
  return { shots, unresolvedHits: unresolvedHits.filter((hit) => !sunk.has(hit)) }
}

export function currentMode(ai: AiState): AiMode {
  return ai.unresolvedHits.length > 0 ? 'target' : 'hunt'
}
