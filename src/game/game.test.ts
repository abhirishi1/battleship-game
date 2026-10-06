import { describe, expect, it } from 'vitest'
import { createEmptyBoard, randomFleet, seededRandom } from './board'
import { toKey } from './coords'
import { createInitialState, gameReducer, type GameAction, type GameState } from './game'
import { buildBoard, columnFleet, stackedFleet } from './testFleets'

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state)
}

function battleState(): GameState {
  return run(
    createInitialState(),
    { type: 'setPlayerFleet', board: stackedFleet() },
    { type: 'startGame', computerBoard: columnFleet(), aiSeed: 1 },
  )
}

describe('placement phase', () => {
  it('starts in placement with an empty player fleet', () => {
    const state = createInitialState()
    expect(state.phase).toBe('placement')
    expect(state.player.ships).toHaveLength(0)
    expect(state.winner).toBeNull()
    expect(state.score).toEqual({ player: 0, computer: 0 })
  })

  it('places ships and rejects out-of-bounds or overlapping placements', () => {
    let state = run(createInitialState(), {
      type: 'placeShip',
      shipType: 'carrier',
      origin: { row: 0, col: 0 },
      orientation: 'horizontal',
    })
    expect(state.player.ships).toHaveLength(1)

    const outOfBounds = gameReducer(state, {
      type: 'placeShip',
      shipType: 'battleship',
      origin: { row: 0, col: 8 },
      orientation: 'horizontal',
    })
    expect(outOfBounds).toBe(state)

    const overlap = gameReducer(state, {
      type: 'placeShip',
      shipType: 'battleship',
      origin: { row: 0, col: 2 },
      orientation: 'vertical',
    })
    expect(overlap).toBe(state)

  })

  it('cannot start until all five ships are placed', () => {
    const partial = run(createInitialState(), {
      type: 'placeShip',
      shipType: 'carrier',
      origin: { row: 0, col: 0 },
      orientation: 'horizontal',
    })
    expect(gameReducer(partial, { type: 'startGame', computerBoard: columnFleet(), aiSeed: 1 })).toBe(partial)
    expect(battleState().phase).toBe('battle')
    expect(battleState().turn).toBe('player')
  })

  it('rejects an invalid fleet from randomize or for the computer', () => {
    const state = createInitialState()
    const incomplete = buildBoard([['carrier', { row: 0, col: 0 }, 'horizontal']])
    expect(gameReducer(state, { type: 'setPlayerFleet', board: incomplete })).toBe(state)
    const overlapping = {
      ...stackedFleet(),
      ships: stackedFleet().ships.map((ship) =>
        ship.type === 'destroyer' ? { ...ship, cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }] } : ship,
      ),
    }
    expect(gameReducer(state, { type: 'setPlayerFleet', board: overlapping })).toBe(state)

    const ready = gameReducer(state, { type: 'setPlayerFleet', board: stackedFleet() })
    expect(gameReducer(ready, { type: 'startGame', computerBoard: createEmptyBoard(), aiSeed: 1 })).toBe(ready)
  })

  it('accepts randomized fleets', () => {
    const state = gameReducer(createInitialState(), {
      type: 'setPlayerFleet',
      board: randomFleet(seededRandom(3)),
    })
    expect(state.player.ships).toHaveLength(5)
  })

  it('locks placement once the battle starts', () => {
    const state = battleState()
    expect(gameReducer(state, { type: 'clearFleet' })).toBe(state)
    expect(gameReducer(state, { type: 'setPlayerFleet', board: columnFleet() })).toBe(state)
  })
})

describe('battle turns', () => {
  it('records a player miss and hands the turn to the computer', () => {
    const state = gameReducer(battleState(), { type: 'playerFire', coord: { row: 0, col: 0 } })
    expect(state.computer.shots['0,0']).toBe('miss')
    expect(state.turn).toBe('computer')
    expect(state.history.at(-1)).toMatchObject({ shooter: 'player', result: 'miss' })
  })

  it('records a player hit without revealing the ship name', () => {
    const state = gameReducer(battleState(), { type: 'playerFire', coord: { row: 0, col: 1 } })
    expect(state.history.at(-1)).toMatchObject({ result: 'hit', sunkShipType: undefined })
  })

  it('names the ship when the player sinks it', () => {
    const state = run(
      battleState(),
      { type: 'playerFire', coord: { row: 0, col: 9 } },
      { type: 'computerFire' },
      { type: 'playerFire', coord: { row: 1, col: 9 } },
    )
    expect(state.history.at(-1)).toMatchObject({ result: 'sunk', sunkShipType: 'destroyer' })
  })

  it('rejects duplicate player shots without changing state', () => {
    const state = run(
      battleState(),
      { type: 'playerFire', coord: { row: 5, col: 5 } },
      { type: 'computerFire' },
    )
    expect(gameReducer(state, { type: 'playerFire', coord: { row: 5, col: 5 } })).toBe(state)
  })

  it('rejects player shots out of turn and computer shots on the player turn', () => {
    const start = battleState()
    expect(gameReducer(start, { type: 'computerFire' })).toBe(start)
    const computerTurn = gameReducer(start, { type: 'playerFire', coord: { row: 5, col: 5 } })
    expect(gameReducer(computerTurn, { type: 'playerFire', coord: { row: 6, col: 6 } })).toBe(computerTurn)
  })

  it('lets the computer take exactly one shot per player shot', () => {
    const afterPlayer = gameReducer(battleState(), { type: 'playerFire', coord: { row: 5, col: 5 } })
    const afterComputer = gameReducer(afterPlayer, { type: 'computerFire' })
    expect(Object.keys(afterComputer.player.shots)).toHaveLength(1)
    expect(afterComputer.turn).toBe('player')
    expect(afterComputer.history.at(-1)).toMatchObject({ shooter: 'computer', mode: 'hunt' })
    expect(afterComputer.history.at(-1)?.reason).toBeTruthy()
    expect(gameReducer(afterComputer, { type: 'computerFire' })).toBe(afterComputer)
  })

  it('never lets either side shoot the same square twice over a full game', () => {
    let state = run(
      createInitialState(),
      { type: 'setPlayerFleet', board: randomFleet(seededRandom(11)) },
      { type: 'startGame', computerBoard: randomFleet(seededRandom(12)), aiSeed: 1 },
    )
    const squares = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10 }))
    for (const coord of squares) {
      if (state.phase !== 'battle') break
      state = gameReducer(state, { type: 'playerFire', coord })
      state = gameReducer(state, { type: 'computerFire' })
    }
    expect(state.phase).toBe('gameOver')
    for (const shooter of ['player', 'computer'] as const) {
      const keys = state.history.filter((shot) => shot.shooter === shooter).map((shot) => toKey(shot.coord))
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

function playerWins(start: GameState): GameState {
  let state = start
  const targets = columnFleet().ships.flatMap((ship) => ship.cells)
  targets.forEach((coord, i) => {
    state = gameReducer(state, { type: 'playerFire', coord })
    if (i < targets.length - 1) state = gameReducer(state, { type: 'computerFire' })
  })
  return state
}

function startBattle(state: GameState): GameState {
  return run(
    state,
    { type: 'setPlayerFleet', board: stackedFleet() },
    { type: 'startGame', computerBoard: columnFleet(), aiSeed: 1 },
  )
}

describe('victory and reset', () => {
  it('declares the player the winner and stops the computer from firing', () => {
    const state = playerWins(battleState())
    expect(state.phase).toBe('gameOver')
    expect(state.winner).toBe('player')
    expect(state.score).toEqual({ player: 1, computer: 0 })
    expect(gameReducer(state, { type: 'computerFire' })).toBe(state)
    expect(gameReducer(state, { type: 'playerFire', coord: { row: 9, col: 0 } })).toBe(state)
  })

  it('declares the computer the winner when it sinks the player fleet', () => {
    let state = battleState()
    const shipKeys = new Set(columnFleet().ships.flatMap((ship) => ship.cells).map(toKey))
    const misses = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10 })).filter(
      (coord) => !shipKeys.has(toKey(coord)),
    )
    for (const coord of misses) {
      if (state.phase !== 'battle') break
      state = run(state, { type: 'playerFire', coord }, { type: 'computerFire' })
    }
    expect(state.winner).toBe('computer')
    expect(state.phase).toBe('gameOver')
    expect(state.score).toEqual({ player: 0, computer: 1 })
  })

  it('resets everything for a new game', () => {
    const played = run(battleState(), { type: 'playerFire', coord: { row: 0, col: 1 } }, { type: 'computerFire' })
    expect(gameReducer(played, { type: 'newGame' })).toEqual(createInitialState())
  })

  it('carries the score into the next game and does not count an abandoned game', () => {
    const won = playerWins(battleState())
    const next = gameReducer(won, { type: 'newGame' })
    expect(next.phase).toBe('placement')
    expect(next.score).toEqual({ player: 1, computer: 0 })

    const abandoned = run(startBattle(next), { type: 'playerFire', coord: { row: 9, col: 0 } }, { type: 'newGame' })
    expect(abandoned.score).toEqual({ player: 1, computer: 0 })

    const wonAgain = playerWins(startBattle(abandoned))
    expect(wonAgain.score).toEqual({ player: 2, computer: 0 })
  })

  it('resets the score without changing the current game', () => {
    const next = gameReducer(playerWins(battleState()), { type: 'newGame' })
    const mid = run(startBattle(next), { type: 'playerFire', coord: { row: 9, col: 0 } })
    const reset = gameReducer(mid, { type: 'resetScore' })
    expect(reset.score).toEqual({ player: 0, computer: 0 })
    expect({ ...reset, score: mid.score }).toEqual(mid)
  })
})
