import { placeShip, createEmptyBoard } from './board'
import type { Board, Coord, Orientation, ShipType } from './types'

type Spec = [ShipType, Coord, Orientation]

export function buildBoard(specs: Spec[]): Board {
  return specs.reduce((board, [type, origin, orientation]) => {
    const result = placeShip(board, type, origin, orientation)
    if (!result.ok) throw new Error(`Invalid test placement for ${type}: ${result.reason}`)
    return result.board
  }, createEmptyBoard())
}

/** Every ship horizontal, starting in column 1 of rows A, C, E, G, I. */
export function stackedFleet(): Board {
  return buildBoard([
    ['carrier', { row: 0, col: 0 }, 'horizontal'],
    ['battleship', { row: 2, col: 0 }, 'horizontal'],
    ['cruiser', { row: 4, col: 0 }, 'horizontal'],
    ['submarine', { row: 6, col: 0 }, 'horizontal'],
    ['destroyer', { row: 8, col: 0 }, 'horizontal'],
  ])
}

/** Every ship vertical, in columns 2, 4, 6, 8, 10 from row A. */
export function columnFleet(): Board {
  return buildBoard([
    ['carrier', { row: 0, col: 1 }, 'vertical'],
    ['battleship', { row: 0, col: 3 }, 'vertical'],
    ['cruiser', { row: 0, col: 5 }, 'vertical'],
    ['submarine', { row: 0, col: 7 }, 'vertical'],
    ['destroyer', { row: 0, col: 9 }, 'vertical'],
  ])
}
