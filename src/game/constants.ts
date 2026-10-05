import type { ShipDefinition, ShipType } from './types'

export const BOARD_SIZE = 10

export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const

export const FLEET: readonly ShipDefinition[] = [
  { type: 'carrier', name: 'Carrier', length: 5 },
  { type: 'battleship', name: 'Battleship', length: 4 },
  { type: 'cruiser', name: 'Cruiser', length: 3 },
  { type: 'submarine', name: 'Submarine', length: 3 },
  { type: 'destroyer', name: 'Destroyer', length: 2 },
]

export function getShipDefinition(type: ShipType): ShipDefinition {
  const definition = FLEET.find((ship) => ship.type === type)
  if (!definition) throw new Error(`Unknown ship type: ${type}`)
  return definition
}
