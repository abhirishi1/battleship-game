import { describe, expect, it } from 'vitest'
import {
  allShipsSunk,
  checkPlacement,
  createEmptyBoard,
  fireAt,
  isFleetComplete,
  placeShip,
  randomFleet,
  seededRandom,
  shipCells,
} from './board'
import { FLEET } from './constants'
import { isInBounds, toKey } from './coords'
import { isValidFleet } from './game'
import { buildBoard, stackedFleet } from './testFleets'
import type { Board } from './types'

function mustFire(board: Board, row: number, col: number) {
  const outcome = fireAt(board, { row, col })
  if (!outcome.ok) throw new Error(`Unexpected rejection: ${outcome.reason}`)
  return outcome
}

describe('ship placement', () => {
  it('computes cells for horizontal and vertical ships', () => {
    expect(shipCells({ row: 2, col: 3 }, 'horizontal', 3)).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ])
    expect(shipCells({ row: 2, col: 3 }, 'vertical', 2)).toEqual([
      { row: 2, col: 3 },
      { row: 3, col: 3 },
    ])
  })

  it('accepts valid placements, including ships touching the edges', () => {
    const horizontal = placeShip(createEmptyBoard(), 'carrier', { row: 9, col: 5 }, 'horizontal')
    const vertical = placeShip(createEmptyBoard(), 'carrier', { row: 5, col: 9 }, 'vertical')
    expect(horizontal.ok).toBe(true)
    expect(vertical.ok).toBe(true)
  })

  it('rejects ships that would run off the board', () => {
    expect(placeShip(createEmptyBoard(), 'carrier', { row: 0, col: 6 }, 'horizontal')).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    })
    expect(placeShip(createEmptyBoard(), 'destroyer', { row: 9, col: 0 }, 'vertical')).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    })
    expect(placeShip(createEmptyBoard(), 'destroyer', { row: -1, col: 0 }, 'vertical').ok).toBe(false)
  })

  it('rejects overlapping ships and reports which ship is in the way', () => {
    const board = buildBoard([['carrier', { row: 4, col: 2 }, 'horizontal']])
    const check = checkPlacement(board, 'battleship', { row: 2, col: 4 }, 'vertical')
    expect(check).toMatchObject({ ok: false, reason: 'overlap', conflictsWith: 'carrier' })
    expect(placeShip(board, 'battleship', { row: 2, col: 4 }, 'vertical')).toEqual({
      ok: false,
      reason: 'overlap',
    })
  })

  it('rejects ships that touch side by side, end to end, or at a corner', () => {
    const board = buildBoard([['carrier', { row: 4, col: 2 }, 'horizontal']])
    const tooClose = { ok: false, reason: 'too-close', conflictsWith: 'carrier' }
    expect(checkPlacement(board, 'battleship', { row: 5, col: 2 }, 'horizontal')).toMatchObject(tooClose)
    expect(checkPlacement(board, 'destroyer', { row: 4, col: 7 }, 'horizontal')).toMatchObject(tooClose)
    expect(checkPlacement(board, 'destroyer', { row: 5, col: 7 }, 'vertical')).toMatchObject(tooClose)
    expect(checkPlacement(board, 'destroyer', { row: 2, col: 1 }, 'vertical')).toMatchObject(tooClose)
    expect(placeShip(board, 'battleship', { row: 5, col: 2 }, 'horizontal')).toEqual({ ok: false, reason: 'too-close' })
  })

  it('accepts ships with at least one square of water between them', () => {
    const board = buildBoard([['carrier', { row: 4, col: 2 }, 'horizontal']])
    expect(placeShip(board, 'battleship', { row: 6, col: 2 }, 'horizontal').ok).toBe(true)
    expect(placeShip(board, 'destroyer', { row: 4, col: 8 }, 'horizontal').ok).toBe(true)
    expect(placeShip(board, 'destroyer', { row: 6, col: 8 }, 'vertical').ok).toBe(true)
  })

  it('random fleets never have two ships touching, even at a corner', () => {
    const random = seededRandom(7)
    for (let i = 0; i < 2000; i++) {
      const board = randomFleet(random)
      expect(board.ships).toHaveLength(5)
      for (const ship of board.ships) {
        for (const other of board.ships) {
          if (other === ship) continue
          for (const a of ship.cells) {
            for (const b of other.cells) {
              expect(Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col))).toBeGreaterThan(1)
            }
          }
        }
      }
    }
  })

  it('moves a ship when the same type is placed again', () => {
    const first = buildBoard([['cruiser', { row: 0, col: 0 }, 'horizontal']])
    const result = placeShip(first, 'cruiser', { row: 0, col: 1 }, 'horizontal')
    if (!result.ok) throw new Error('expected success')
    expect(result.board.ships).toHaveLength(1)
    expect(result.board.ships[0].cells[0]).toEqual({ row: 0, col: 1 })
  })

  it('knows when the fleet is complete', () => {
    expect(isFleetComplete(createEmptyBoard())).toBe(false)
    const withoutDestroyer = stackedFleet().ships.filter((ship) => ship.type !== 'destroyer')
    expect(isFleetComplete({ ...stackedFleet(), ships: withoutDestroyer })).toBe(false)
    expect(isFleetComplete(stackedFleet())).toBe(true)
  })

  it('generates valid random fleets for many seeds', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const board = randomFleet(seededRandom(seed))
      expect(isValidFleet(board)).toBe(true)
      const cells = board.ships.flatMap((ship) => ship.cells)
      expect(cells).toHaveLength(FLEET.reduce((sum, ship) => sum + ship.length, 0))
      expect(cells.every(isInBounds)).toBe(true)
      expect(new Set(cells.map(toKey)).size).toBe(cells.length)
    }
  })

  it('generates the same fleet for the same seed', () => {
    expect(randomFleet(seededRandom(42))).toEqual(randomFleet(seededRandom(42)))
  })
})

describe('firing', () => {
  it('reports a miss on open water', () => {
    const outcome = mustFire(stackedFleet(), 1, 0)
    expect(outcome.result).toBe('miss')
    expect(outcome.shipType).toBeUndefined()
    expect(outcome.board.shots['1,0']).toBe('miss')
  })

  it('reports a hit on a ship that is not yet sunk', () => {
    const outcome = mustFire(stackedFleet(), 0, 0)
    expect(outcome.result).toBe('hit')
    expect(outcome.board.shots['0,0']).toBe('hit')
  })

  it('does not mutate the original board', () => {
    const board = stackedFleet()
    mustFire(board, 0, 0)
    expect(board.shots).toEqual({})
  })

  it('rejects a second shot at the same square', () => {
    const { board } = mustFire(stackedFleet(), 3, 3)
    expect(fireAt(board, { row: 3, col: 3 })).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('rejects off-board shots', () => {
    expect(fireAt(stackedFleet(), { row: 10, col: 0 })).toEqual({ ok: false, reason: 'out-of-bounds' })
  })

  it('reports sunk with the ship type when the last square is hit', () => {
    let board = stackedFleet()
    board = mustFire(board, 8, 0).board
    const outcome = mustFire(board, 8, 1)
    expect(outcome.result).toBe('sunk')
    expect(outcome.shipType).toBe('destroyer')
  })

  it('detects victory only when every ship is sunk', () => {
    let board = stackedFleet()
    expect(allShipsSunk(board)).toBe(false)
    const cells = board.ships.flatMap((ship) => ship.cells)
    cells.forEach((cell, i) => {
      board = mustFire(board, cell.row, cell.col).board
      expect(allShipsSunk(board)).toBe(i === cells.length - 1)
    })
  })

  it('does not treat an empty board as defeated', () => {
    expect(allShipsSunk(createEmptyBoard())).toBe(false)
  })
})
