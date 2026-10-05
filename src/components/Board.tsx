import { type KeyboardEvent, useRef, useState } from 'react'
import { BOARD_SIZE, ROW_LABELS } from '../game/constants'
import { formatCoord } from '../game/coords'
import type { Coord } from '../game/types'

export type CellAppearance =
  | 'water'
  | 'ship'
  | 'hit'
  | 'miss'
  | 'sunk'
  | 'revealed'
  | 'preview-valid'
  | 'preview-invalid'

export interface CellView {
  appearance: CellAppearance
  /** Spoken after the coordinate, e.g. "miss" -> "B4, miss". */
  description: string
  /** Whether activating this cell does anything right now. */
  actionable: boolean
}

interface BoardProps {
  id: string
  label: string
  getCell: (coord: Coord) => CellView
  onActivate?: (coord: Coord) => void
  onFocusCell?: (coord: Coord | null) => void
  disabled?: boolean
}

const SYMBOLS: Partial<Record<CellAppearance, string>> = {
  hit: '✕',
  sunk: '✕',
  miss: '•',
}

const COLUMN_NUMBERS = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1)

function clamp(value: number): number {
  return Math.min(BOARD_SIZE - 1, Math.max(0, value))
}

/**
 * A 10×10 grid of buttons. Only one cell is in the Tab order at a time
 * ("roving tabindex"); arrow keys, Home and End move between cells.
 */
export function Board({ id, label, getCell, onActivate, onFocusCell, disabled = false }: BoardProps) {
  const [active, setActive] = useState<Coord>({ row: 0, col: 0 })
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())

  function focusCell(coord: Coord) {
    setActive(coord)
    cellRefs.current.get(`${coord.row},${coord.col}`)?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, coord: Coord) {
    const moves: Record<string, Coord> = {
      ArrowUp: { row: clamp(coord.row - 1), col: coord.col },
      ArrowDown: { row: clamp(coord.row + 1), col: coord.col },
      ArrowLeft: { row: coord.row, col: clamp(coord.col - 1) },
      ArrowRight: { row: coord.row, col: clamp(coord.col + 1) },
      Home: { row: coord.row, col: 0 },
      End: { row: coord.row, col: BOARD_SIZE - 1 },
    }
    const next = moves[event.key]
    if (!next) return
    event.preventDefault()
    focusCell(next)
  }

  return (
    <div className={`board${disabled ? ' board--disabled' : ''}`}>
      <div className="board__columns" aria-hidden="true">
        <span />
        {COLUMN_NUMBERS.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="board__body">
        <div className="board__rows" aria-hidden="true">
          {ROW_LABELS.map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </div>
        <div
          id={id}
          className="board__grid"
          role="grid"
          aria-label={label}
          aria-disabled={disabled || undefined}
          onMouseLeave={() => onFocusCell?.(null)}
        >
          {ROW_LABELS.map((_, row) => (
            <div role="row" className="board__row" key={row}>
              {COLUMN_NUMBERS.map((_, col) => {
                const coord = { row, col }
                const view = getCell(coord)
                const isActive = active.row === row && active.col === col
                const inert = disabled || !view.actionable
                return (
                  <div role="gridcell" className="board__cell-wrap" key={col}>
                    <button
                      type="button"
                      ref={(element) => {
                        const key = `${row},${col}`
                        if (element) cellRefs.current.set(key, element)
                        else cellRefs.current.delete(key)
                      }}
                      className={`cell cell--${view.appearance}${inert ? ' cell--inert' : ''}`}
                      tabIndex={isActive ? 0 : -1}
                      aria-label={`${formatCoord(coord)}, ${view.description}`}
                      aria-disabled={inert || undefined}
                      onClick={() => {
                        setActive(coord)
                        onActivate?.(coord)
                      }}
                      onFocus={() => {
                        setActive(coord)
                        onFocusCell?.(coord)
                      }}
                      onMouseEnter={() => onFocusCell?.(coord)}
                      onKeyDown={(event) => handleKeyDown(event, coord)}
                    >
                      <span aria-hidden="true">{SYMBOLS[view.appearance] ?? ''}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
