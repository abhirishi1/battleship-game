import { BOARD_SIZE, ROW_LABELS } from './constants'
import type { Coord, CoordKey } from './types'

export function toKey({ row, col }: Coord): CoordKey {
  return `${row},${col}`
}

export function fromKey(key: CoordKey): Coord {
  const [row, col] = key.split(',').map(Number)
  return { row, col }
}

export function isInBounds({ row, col }: Coord): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < BOARD_SIZE &&
    col >= 0 &&
    col < BOARD_SIZE
  )
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col
}

/** Human-readable label, e.g. { row: 1, col: 3 } -> "B4". */
export function formatCoord(coord: Coord): string {
  if (!isInBounds(coord)) throw new Error(`Coordinate out of bounds: ${coord.row},${coord.col}`)
  return `${ROW_LABELS[coord.row]}${coord.col + 1}`
}

/** Parses labels such as "B4" or "j10" (case-insensitive). Returns null if invalid. */
export function parseCoord(label: string): Coord | null {
  const match = /^([A-Ja-j])(10|[1-9])$/.exec(label.trim())
  if (!match) return null
  return { row: match[1].toUpperCase().charCodeAt(0) - 65, col: Number(match[2]) - 1 }
}

export function allCoords(): Coord[] {
  const coords: Coord[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) coords.push({ row, col })
  }
  return coords
}
