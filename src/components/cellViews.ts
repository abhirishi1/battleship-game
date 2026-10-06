/** Decides how each square looks and what a screen reader says about it. */
import { isShipSunk, shipAt, type PlacementCheck } from '../game/board'
import { isInBounds, sameCoord, toKey } from '../game/coords'
import type { GameState } from '../game/game'
import type { Coord } from '../game/types'
import type { CellView } from './Board'
import { shipName } from './messages'

export function playerCellView(
  state: GameState,
  coord: Coord,
  preview: PlacementCheck | null,
  canPlace: boolean,
): CellView {
  const board = state.player
  const ship = shipAt(board, coord)
  const mark = board.shots[toKey(coord)]

  if (state.phase === 'placement') {
    if (preview && preview.cells.some((cell) => isInBounds(cell) && sameCoord(cell, coord))) {
      return {
        appearance: preview.ok ? 'preview-valid' : 'preview-invalid',
        description: ship ? `your ${shipName(ship.type)}` : 'empty water',
        actionable: canPlace,
      }
    }
    return {
      appearance: ship ? 'ship' : 'water',
      description: ship ? `your ${shipName(ship.type)}` : 'empty water',
      actionable: canPlace,
    }
  }

  if (mark === 'miss') return { appearance: 'miss', description: 'computer missed', actionable: false }
  if (mark === 'hit' && ship) {
    const sunk = isShipSunk(board, ship)
    return {
      appearance: sunk ? 'sunk' : 'hit',
      description: `your ${shipName(ship.type)}, ${sunk ? 'sunk' : 'hit'}`,
      actionable: false,
    }
  }
  return {
    appearance: ship ? 'ship' : 'water',
    description: ship ? `your ${shipName(ship.type)}` : 'water',
    actionable: false,
  }
}

export function enemyCellView(state: GameState, coord: Coord): CellView {
  const board = state.computer
  const mark = board.shots[toKey(coord)]
  const ship = shipAt(board, coord)

  if (mark === 'miss') return { appearance: 'miss', description: 'miss', actionable: false }
  if (mark === 'hit' && ship) {
    return isShipSunk(board, ship)
      ? { appearance: 'sunk', description: `hit, ${shipName(ship.type)} sunk`, actionable: false }
      : { appearance: 'hit', description: 'hit', actionable: false }
  }
  if (state.phase === 'gameOver' && ship) {
    return { appearance: 'revealed', description: `${shipName(ship.type)}, not found`, actionable: false }
  }
  return {
    appearance: 'water',
    description: 'not fired at',
    actionable: state.phase === 'battle' && state.turn === 'player',
  }
}
