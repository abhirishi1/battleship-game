import { isShipSunk } from '../game/board'
import { FLEET } from '../game/constants'
import { toKey } from '../game/coords'
import type { Board } from '../game/types'

interface FleetStatusProps {
  title: string
  board: Board
  /** The enemy fleet only shows whether each ship is afloat or sunk. */
  concealed?: boolean
}

export function FleetStatus({ title, board, concealed = false }: FleetStatusProps) {
  return (
    <section className="fleet-status" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {FLEET.map(({ type, name, length }) => {
          const ship = board.ships.find((s) => s.type === type)
          const sunk = ship ? isShipSunk(board, ship) : false
          const hits = ship ? ship.cells.filter((cell) => board.shots[toKey(cell)] === 'hit').length : 0
          const status = sunk ? 'Sunk' : !concealed && hits > 0 ? `${hits} of ${length} hit` : 'Afloat'
          return (
            <li key={type} className={sunk ? 'fleet-status__ship--sunk' : undefined}>
              <span>{name}</span>
              <span className="fleet-status__state">{status}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
