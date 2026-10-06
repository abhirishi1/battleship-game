import { BOARD_SIZE, FLEET, getShipDefinition } from './constants'
import { isInBounds, sameCoord, toKey } from './coords'
import type {
  Board,
  Coord,
  FireError,
  Orientation,
  PlacementError,
  Ship,
  ShipType,
  ShotResult,
} from './types'

export type RandomSource = () => number

export function createEmptyBoard(): Board {
  return { ships: [], shots: {} }
}

/** Squares covered by a ship whose top-left end is at `origin`. */
export function shipCells(origin: Coord, orientation: Orientation, length: number): Coord[] {
  return Array.from({ length }, (_, i) =>
    orientation === 'horizontal'
      ? { row: origin.row, col: origin.col + i }
      : { row: origin.row + i, col: origin.col },
  )
}

export function shipAt(board: Board, coord: Coord): Ship | undefined {
  return board.ships.find((ship) => ship.cells.some((cell) => sameCoord(cell, coord)))
}

export type PlacementCheck =
  | { ok: true; cells: Coord[] }
  | { ok: false; reason: PlacementError; cells: Coord[]; conflictsWith?: ShipType }

/**
 * Checks whether a ship can go at `origin`. A ship of the same type already on the
 * board is ignored, so re-placing a ship moves it.
 */
export function checkPlacement(
  board: Board,
  type: ShipType,
  origin: Coord,
  orientation: Orientation,
): PlacementCheck {
  const cells = shipCells(origin, orientation, getShipDefinition(type).length)
  if (!cells.every(isInBounds)) return { ok: false, reason: 'out-of-bounds', cells }

  for (const cell of cells) {
    const occupant = shipAt(board, cell)
    if (occupant && occupant.type !== type) {
      return { ok: false, reason: 'overlap', cells, conflictsWith: occupant.type }
    }
  }
  return { ok: true, cells }
}

export type PlacementResult = { ok: true; board: Board } | { ok: false; reason: PlacementError }

export function placeShip(
  board: Board,
  type: ShipType,
  origin: Coord,
  orientation: Orientation,
): PlacementResult {
  const check = checkPlacement(board, type, origin, orientation)
  if (!check.ok) return { ok: false, reason: check.reason }
  const others = board.ships.filter((ship) => ship.type !== type)
  return { ok: true, board: { ...board, ships: [...others, { type, cells: check.cells }] } }
}

export function isFleetComplete(board: Board): boolean {
  return FLEET.every((definition) => board.ships.some((ship) => ship.type === definition.type))
}

/** Places the whole fleet at random legal positions. Pass a seeded source for repeatable layouts. */
export function randomFleet(random: RandomSource = Math.random): Board {
  let board = createEmptyBoard()
  for (const { type } of FLEET) {
    for (;;) {
      const orientation: Orientation = random() < 0.5 ? 'horizontal' : 'vertical'
      const origin = {
        row: Math.floor(random() * BOARD_SIZE),
        col: Math.floor(random() * BOARD_SIZE),
      }
      const result = placeShip(board, type, origin, orientation)
      if (result.ok) {
        board = result.board
        break
      }
    }
  }
  return board
}

export function hasBeenShot(board: Board, coord: Coord): boolean {
  return board.shots[toKey(coord)] !== undefined
}

export function isShipSunk(board: Board, ship: Ship): boolean {
  return ship.cells.every((cell) => board.shots[toKey(cell)] === 'hit')
}

export function allShipsSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((ship) => isShipSunk(board, ship))
}

export type FireOutcome =
  | { ok: true; board: Board; result: ShotResult; shipType?: ShipType }
  | { ok: false; reason: FireError }

/** Fires one shot at `board`. Off-board and repeated shots are rejected and change nothing. */
export function fireAt(board: Board, coord: Coord): FireOutcome {
  if (!isInBounds(coord)) return { ok: false, reason: 'out-of-bounds' }
  if (hasBeenShot(board, coord)) return { ok: false, reason: 'duplicate' }

  const target = shipAt(board, coord)
  const next: Board = {
    ...board,
    shots: { ...board.shots, [toKey(coord)]: target ? 'hit' : 'miss' },
  }
  if (!target) return { ok: true, board: next, result: 'miss' }
  return {
    ok: true,
    board: next,
    result: isShipSunk(next, target) ? 'sunk' : 'hit',
    shipType: target.type,
  }
}

/** Small deterministic PRNG (mulberry32) for repeatable tests. */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
