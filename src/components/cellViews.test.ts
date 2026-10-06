import { describe, expect, it } from 'vitest'
import { createInitialState, gameReducer, type GameAction, type GameState } from '../game/game'
import { columnFleet, stackedFleet } from '../game/testFleets'
import { enemyCellView } from './cellViews'

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state)
}

describe('enemyCellView', () => {
  // columnFleet: the Carrier runs down column 2 (A2–E2).
  const hitCarrier = run(
    createInitialState(),
    { type: 'setPlayerFleet', board: stackedFleet() },
    { type: 'startGame', computerBoard: columnFleet(), aiSeed: 1 },
    { type: 'playerFire', coord: { row: 0, col: 1 } },
  )

  it('does not name a hit ship during the battle', () => {
    expect(enemyCellView(hitCarrier, { row: 0, col: 1 }).description).toBe('hit')
    expect(enemyCellView(hitCarrier, { row: 1, col: 1 }).description).toBe('not fired at')
  })

  it('names the ship on every square after the game is over, hit or not', () => {
    const over: GameState = { ...hitCarrier, phase: 'gameOver', winner: 'computer' }
    expect(enemyCellView(over, { row: 0, col: 1 })).toMatchObject({ appearance: 'hit', description: 'hit, Carrier' })
    expect(enemyCellView(over, { row: 1, col: 1 }).description).toBe('Carrier, not found')
  })
})
