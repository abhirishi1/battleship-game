import { describe, expect, it } from 'vitest'
import { allCoords, formatCoord, fromKey, isInBounds, parseCoord, sameCoord, toKey } from './coords'

describe('coordinates', () => {
  it('formats zero-based coordinates as letter + number labels', () => {
    expect(formatCoord({ row: 0, col: 0 })).toBe('A1')
    expect(formatCoord({ row: 1, col: 3 })).toBe('B4')
    expect(formatCoord({ row: 9, col: 9 })).toBe('J10')
  })

  it('refuses to format off-board coordinates', () => {
    expect(() => formatCoord({ row: 10, col: 0 })).toThrow()
  })

  it('parses labels case-insensitively and rejects invalid ones', () => {
    expect(parseCoord('A1')).toEqual({ row: 0, col: 0 })
    expect(parseCoord('j10')).toEqual({ row: 9, col: 9 })
    expect(parseCoord(' c7 ')).toEqual({ row: 2, col: 6 })
    for (const bad of ['', 'K1', 'A0', 'A11', '1A', 'AA', 'B 4']) {
      expect(parseCoord(bad)).toBeNull()
    }
  })

  it('round-trips through format and parse for every square', () => {
    for (const coord of allCoords()) {
      expect(parseCoord(formatCoord(coord))).toEqual(coord)
    }
  })

  it('round-trips through keys', () => {
    expect(toKey({ row: 3, col: 7 })).toBe('3,7')
    expect(fromKey('3,7')).toEqual({ row: 3, col: 7 })
  })

  it('checks bounds, including negative and fractional values', () => {
    expect(isInBounds({ row: 0, col: 0 })).toBe(true)
    expect(isInBounds({ row: 9, col: 9 })).toBe(true)
    expect(isInBounds({ row: -1, col: 0 })).toBe(false)
    expect(isInBounds({ row: 0, col: 10 })).toBe(false)
    expect(isInBounds({ row: 1.5, col: 2 })).toBe(false)
  })

  it('lists all 100 squares exactly once', () => {
    const keys = allCoords().map(toKey)
    expect(keys).toHaveLength(100)
    expect(new Set(keys).size).toBe(100)
  })

  it('compares coordinates by value', () => {
    expect(sameCoord({ row: 2, col: 3 }, { row: 2, col: 3 })).toBe(true)
    expect(sameCoord({ row: 2, col: 3 }, { row: 3, col: 2 })).toBe(false)
  })
})
