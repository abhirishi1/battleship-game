export type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer'

export type Orientation = 'horizontal' | 'vertical'

/** Zero-based grid position. Row 0 is labelled "A", column 0 is labelled "1". */
export interface Coord {
  row: number
  col: number
}

/** Stable string form of a coordinate, used as an object key: "row,col". */
export type CoordKey = `${number},${number}`

export interface ShipDefinition {
  type: ShipType
  name: string
  length: number
}

export interface Ship {
  type: ShipType
  cells: Coord[]
}

export type ShotMark = 'hit' | 'miss'

/** One side's ocean: where its ships are and which squares have been fired at. */
export interface Board {
  ships: Ship[]
  shots: Partial<Record<CoordKey, ShotMark>>
}

export type ShotResult = 'miss' | 'hit' | 'sunk'

export type PlacementError = 'out-of-bounds' | 'overlap' | 'too-close'

export type FireError = 'out-of-bounds' | 'duplicate'
