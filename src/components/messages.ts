/** Plain-English text for the UI. Kept separate from components so it is easy to test. */
import { getShipDefinition } from '../game/constants'
import { formatCoord } from '../game/coords'
import type { PlacementCheck } from '../game/board'
import type { ShotRecord } from '../game/game'
import type { Orientation, ShipType } from '../game/types'

export function shipName(type: ShipType): string {
  return getShipDefinition(type).name
}

export function describeShot(shot: ShotRecord): string {
  const where = formatCoord(shot.coord)
  if (shot.shooter === 'player') {
    if (shot.result === 'miss') return `You fired at ${where}: miss.`
    if (shot.result === 'hit') return `You fired at ${where}: hit!`
    return `You fired at ${where}: hit — you sank the computer's ${shipName(shot.sunkShipType!)}!`
  }
  if (shot.result === 'miss') return `Computer fired at ${where}: miss.`
  if (shot.result === 'hit') return `Computer fired at ${where}: hit on your fleet.`
  return `Computer fired at ${where}: hit — it sank your ${shipName(shot.sunkShipType!)}.`
}

export function describePlacement(type: ShipType, orientation: Orientation, check: PlacementCheck): string {
  const name = shipName(type)
  if (check.ok) {
    const first = formatCoord(check.cells[0])
    const last = formatCoord(check.cells[check.cells.length - 1])
    return `${name} fits ${orientation === 'horizontal' ? 'horizontally' : 'vertically'} at ${first}–${last}.`
  }
  if (check.reason === 'out-of-bounds') return `${name} can't go there: it would run off the board.`
  if (check.reason === 'too-close') {
    return `${name} can't go there: it would touch your ${shipName(check.conflictsWith!)}. Leave at least one square of water between ships.`
  }
  return `${name} can't go there: it would overlap your ${shipName(check.conflictsWith!)}.`
}
