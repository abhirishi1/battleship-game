import { FLEET } from '../game/constants'
import type { Board, Orientation, ShipType } from '../game/types'

interface PlacementControlsProps {
  board: Board
  selectedShip: ShipType | null
  orientation: Orientation
  onSelectShip: (type: ShipType) => void
  onRotate: () => void
  onRandomize: () => void
  onClear: () => void
  onStart: () => void
}

export function PlacementControls({
  board,
  selectedShip,
  orientation,
  onSelectShip,
  onRotate,
  onRandomize,
  onClear,
  onStart,
}: PlacementControlsProps) {
  const placedCount = FLEET.filter(({ type }) => board.ships.some((ship) => ship.type === type)).length
  const ready = placedCount === FLEET.length

  return (
    <section className="panel placement" aria-labelledby="placement-heading">
      <h2 id="placement-heading">Deploy your fleet</h2>
      <p className="hint">
        Choose a ship, then click a square (or use the arrow keys and Enter) to place its top/left end.
        Press <kbd>R</kbd> to rotate.
      </p>

      <fieldset className="ship-picker">
        <legend>Ships ({placedCount} of {FLEET.length} placed)</legend>
        <ul>
          {FLEET.map(({ type, name, length }) => {
            const placed = board.ships.some((ship) => ship.type === type)
            return (
              <li key={type}>
                <button
                  type="button"
                  className="ship-option"
                  aria-pressed={selectedShip === type}
                  onClick={() => onSelectShip(type)}
                >
                  <span className="ship-option__name">{name}</span>
                  <span className="ship-option__pips" aria-hidden="true">
                    {Array.from({ length }, (_, i) => (
                      <span key={i} />
                    ))}
                  </span>
                  <span className="ship-option__meta">
                    {length} squares · {placed ? 'placed' : 'not placed'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <div className="button-row">
        <button type="button" onClick={onRotate} aria-keyshortcuts="R">
          Rotate: {orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
        </button>
        <button type="button" onClick={onRandomize}>
          Randomize fleet
        </button>
        <button type="button" onClick={onClear} disabled={placedCount === 0}>
          Clear
        </button>
      </div>

      <button
        type="button"
        className="primary start-button"
        onClick={onStart}
        disabled={!ready}
        aria-describedby="start-hint"
      >
        Start battle
      </button>
      <p id="start-hint" className="hint">
        {ready ? 'All ships placed. Ready when you are.' : `Place all ${FLEET.length} ships to start.`}
      </p>
    </section>
  )
}
