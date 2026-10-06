/** Turn flow and win detection. Pure: every action returns a new state or the same state if illegal. */
import { type AiMode, type AiState, chooseShot, createAiState, recordShot } from './ai'
import {
  allShipsSunk,
  checkPlacement,
  createEmptyBoard,
  fireAt,
  isFleetComplete,
  placeShip,
} from './board'
import { FLEET } from './constants'
import type { Board, Coord, Orientation, ShipType, ShotResult } from './types'

export type Phase = 'placement' | 'battle' | 'gameOver'

export type Side = 'player' | 'computer'

export interface ShotRecord {
  shooter: Side
  coord: Coord
  result: ShotResult
  /** Only set when a ship was sunk: the defender announces which ship. */
  sunkShipType?: ShipType
  /** Computer shots only: which mode it was in and why it chose this square. */
  mode?: AiMode
  reason?: string
}

export interface GameState {
  phase: Phase
  turn: Side
  /** The human's fleet, and the computer's shots against it. */
  player: Board
  /** The computer's hidden fleet, and the human's shots against it. */
  computer: Board
  ai: AiState
  winner: Side | null
  history: ShotRecord[]
}

export type GameAction =
  | { type: 'placeShip'; shipType: ShipType; origin: Coord; orientation: Orientation }
  | { type: 'setPlayerFleet'; board: Board }
  | { type: 'clearFleet' }
  | { type: 'startGame'; computerBoard: Board }
  | { type: 'playerFire'; coord: Coord }
  | { type: 'computerFire' }
  | { type: 'newGame' }

export function createInitialState(): GameState {
  return {
    phase: 'placement',
    turn: 'player',
    player: createEmptyBoard(),
    computer: createEmptyBoard(),
    ai: createAiState(),
    winner: null,
    history: [],
  }
}

/** A fleet is usable if it has exactly one legal ship of each type and no shots yet. */
export function isValidFleet(board: Board): boolean {
  if (board.ships.length !== FLEET.length || !isFleetComplete(board)) return false
  if (Object.keys(board.shots).length > 0) return false
  let rebuilt = createEmptyBoard()
  for (const ship of board.ships) {
    const [first, second] = ship.cells
    const orientation: Orientation = second && second.row !== first.row ? 'vertical' : 'horizontal'
    const check = checkPlacement(rebuilt, ship.type, first, orientation)
    const matches =
      check.ok &&
      check.cells.length === ship.cells.length &&
      check.cells.every((cell, i) => cell.row === ship.cells[i].row && cell.col === ship.cells[i].col)
    if (!matches) return false
    rebuilt = { ...rebuilt, ships: [...rebuilt.ships, ship] }
  }
  return true
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'placeShip': {
      if (state.phase !== 'placement') return state
      const result = placeShip(state.player, action.shipType, action.origin, action.orientation)
      return result.ok ? { ...state, player: result.board } : state
    }

    case 'setPlayerFleet':
      if (state.phase !== 'placement' || !isValidFleet(action.board)) return state
      return { ...state, player: action.board }

    case 'clearFleet':
      if (state.phase !== 'placement') return state
      return { ...state, player: createEmptyBoard() }

    case 'startGame':
      if (state.phase !== 'placement' || !isFleetComplete(state.player)) return state
      if (!isValidFleet(action.computerBoard)) return state
      return { ...state, phase: 'battle', turn: 'player', computer: action.computerBoard }

    case 'playerFire': {
      if (state.phase !== 'battle' || state.turn !== 'player') return state
      const outcome = fireAt(state.computer, action.coord)
      if (!outcome.ok) return state
      const record: ShotRecord = {
        shooter: 'player',
        coord: action.coord,
        result: outcome.result,
        sunkShipType: outcome.result === 'sunk' ? outcome.shipType : undefined,
      }
      const won = allShipsSunk(outcome.board)
      return {
        ...state,
        computer: outcome.board,
        history: [...state.history, record],
        phase: won ? 'gameOver' : 'battle',
        winner: won ? 'player' : null,
        turn: won ? 'player' : 'computer',
      }
    }

    case 'computerFire': {
      if (state.phase !== 'battle' || state.turn !== 'computer') return state
      const decision = chooseShot(state.ai)
      const outcome = fireAt(state.player, decision.coord)
      if (!outcome.ok) throw new Error(`AI chose an illegal square: ${outcome.reason}`)
      const sunkShipType = outcome.result === 'sunk' ? outcome.shipType : undefined
      const record: ShotRecord = {
        shooter: 'computer',
        coord: decision.coord,
        result: outcome.result,
        sunkShipType,
        mode: decision.mode,
        reason: decision.reason,
      }
      const won = allShipsSunk(outcome.board)
      return {
        ...state,
        player: outcome.board,
        ai: recordShot(state.ai, decision.coord, { result: outcome.result, sunkShipType }),
        history: [...state.history, record],
        phase: won ? 'gameOver' : 'battle',
        winner: won ? 'computer' : null,
        turn: 'player',
      }
    }

    case 'newGame':
      return createInitialState()
  }
}
