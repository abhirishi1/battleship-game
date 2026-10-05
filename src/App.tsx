import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import './App.css'
import { Board } from './components/Board'
import { enemyCellView, playerCellView } from './components/cellViews'
import { FleetStatus } from './components/FleetStatus'
import { describePlacement, describeShot, shipName } from './components/messages'
import { PlacementControls } from './components/PlacementControls'
import { StatusPanel } from './components/StatusPanel'
import { checkPlacement, hasBeenShot, randomFleet } from './game/board'
import { FLEET } from './game/constants'
import { formatCoord } from './game/coords'
import { createInitialState, gameReducer, type GameState } from './game/game'
import type { Board as BoardState, Coord, Orientation, ShipType } from './game/types'

export const COMPUTER_DELAY_MS = 700

interface AppProps {
  /** Pause before the computer fires, so the player can follow the game. */
  computerDelayMs?: number
  /** Creates a random legal fleet; injectable so tests can use known layouts. */
  createFleet?: () => BoardState
}

const defaultCreateFleet = () => randomFleet()

function nextUnplacedShip(board: BoardState, after?: ShipType): ShipType | null {
  const unplaced = FLEET.filter(({ type }) => type !== after && !board.ships.some((ship) => ship.type === type))
  return unplaced[0]?.type ?? null
}

function battleAnnouncement(state: GameState): string {
  const last = state.history.at(-1)
  if (!last) return 'Battle started. Your turn: choose a square in the enemy waters.'
  if (state.phase === 'gameOver') {
    const result = describeShot(last)
    return state.winner === 'player'
      ? `${result} You win — every enemy ship is sunk!`
      : `${result} The computer wins — your fleet is sunk.`
  }
  if (last.shooter === 'player') return `${describeShot(last)} Computer is aiming…`
  const previous = state.history.at(-2)
  const playerPart = previous?.shooter === 'player' ? `${describeShot(previous)} ` : ''
  return `${playerPart}${describeShot(last)} Your turn.`
}

export default function App({ computerDelayMs = COMPUTER_DELAY_MS, createFleet = defaultCreateFleet }: AppProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState)
  const [selectedShip, setSelectedShip] = useState<ShipType | null>('carrier')
  const [orientation, setOrientation] = useState<Orientation>('horizontal')
  const [hovered, setHovered] = useState<Coord | null>(null)
  const [notice, setNotice] = useState('')
  const newGameRef = useRef<HTMLButtonElement>(null)

  // The computer replies with exactly one shot after each player shot.
  useEffect(() => {
    if (state.phase !== 'battle' || state.turn !== 'computer') return
    const timer = window.setTimeout(() => dispatch({ type: 'computerFire' }), computerDelayMs)
    return () => window.clearTimeout(timer)
  }, [state.phase, state.turn, computerDelayMs])

  useEffect(() => {
    if (state.phase === 'battle') {
      document.querySelector<HTMLButtonElement>('#enemy-grid button[tabindex="0"]')?.focus()
    } else if (state.phase === 'gameOver') {
      newGameRef.current?.focus()
    }
  }, [state.phase])

  const rotate = useCallback(() => {
    setOrientation((current) => (current === 'horizontal' ? 'vertical' : 'horizontal'))
    setNotice('')
  }, [])

  useEffect(() => {
    if (state.phase !== 'placement') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'r' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      rotate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.phase, rotate])

  const preview =
    state.phase === 'placement' && selectedShip && hovered
      ? checkPlacement(state.player, selectedShip, hovered, orientation)
      : null

  function placeAt(coord: Coord) {
    if (!selectedShip) {
      setNotice('All ships are placed. Choose a ship from the list to move it, or start the battle.')
      return
    }
    const check = checkPlacement(state.player, selectedShip, coord, orientation)
    if (!check.ok) {
      setNotice(describePlacement(selectedShip, orientation, check))
      return
    }
    dispatch({ type: 'placeShip', shipType: selectedShip, origin: coord, orientation })
    const placedBoard = { ...state.player, ships: [...state.player.ships, { type: selectedShip, cells: check.cells }] }
    const next = nextUnplacedShip(placedBoard, selectedShip)
    setSelectedShip(next)
    setNotice(
      `${shipName(selectedShip)} placed at ${formatCoord(check.cells[0])}–${formatCoord(check.cells.at(-1)!)}. ` +
        (next ? `Next: ${shipName(next)}.` : 'All ships placed — start the battle when ready.'),
    )
  }

  function fireAt(coord: Coord) {
    if (state.phase !== 'battle') return
    if (state.turn !== 'player') {
      setNotice("Wait for the computer's shot.")
      return
    }
    if (hasBeenShot(state.computer, coord)) {
      setNotice(`You already fired at ${formatCoord(coord)}. Choose another square.`)
      return
    }
    setNotice('')
    dispatch({ type: 'playerFire', coord })
  }

  function randomize() {
    dispatch({ type: 'setPlayerFleet', board: createFleet() })
    setSelectedShip(null)
    setNotice('Fleet placed at random. Start the battle, randomize again, or pick a ship to move it.')
  }

  function clearFleet() {
    dispatch({ type: 'clearFleet' })
    setSelectedShip('carrier')
    setNotice('Board cleared. Place your Carrier.')
  }

  function startGame() {
    dispatch({ type: 'startGame', computerBoard: createFleet() })
    setHovered(null)
    setNotice('')
  }

  function newGame() {
    dispatch({ type: 'newGame' })
    setSelectedShip('carrier')
    setOrientation('horizontal')
    setHovered(null)
    setNotice('')
  }

  let announcement: string
  if (notice) announcement = notice
  else if (state.phase === 'placement') {
    announcement = selectedShip
      ? `Place your ${shipName(selectedShip)} (${orientation}).`
      : 'All ships placed — start the battle when ready.'
  } else announcement = battleAnnouncement(state)

  const placementFeedback =
    preview && selectedShip ? describePlacement(selectedShip, orientation, preview) : null

  return (
    <div className="app">
      <header className="app__header">
        <h1>Battleship</h1>
        <p>Sink the computer's fleet before it sinks yours.</p>
      </header>

      <main className="app__main">
        <StatusPanel state={state} announcement={announcement} onNewGame={newGame} newGameRef={newGameRef} />

        <div className={`arena arena--${state.phase}`}>
          <section className="panel board-panel" aria-labelledby="player-board-heading">
            <h2 id="player-board-heading">Your fleet</h2>
            <Board
              id="player-grid"
              label="Your fleet"
              getCell={(coord) => playerCellView(state, coord, preview, selectedShip !== null)}
              onActivate={state.phase === 'placement' ? placeAt : undefined}
              onFocusCell={state.phase === 'placement' ? setHovered : undefined}
            />
            {state.phase === 'placement' ? (
              <p className={`placement-feedback${preview && !preview.ok ? ' placement-feedback--invalid' : ''}`}>
                {placementFeedback ?? 'Hover over or focus a square to preview the selected ship.'}
              </p>
            ) : (
              <FleetStatus title="Your ships" board={state.player} />
            )}
          </section>

          {state.phase === 'placement' ? (
            <PlacementControls
              board={state.player}
              selectedShip={selectedShip}
              orientation={orientation}
              onSelectShip={(type) => {
                setSelectedShip(type)
                setNotice(`${shipName(type)} selected. Choose where to place it.`)
              }}
              onRotate={rotate}
              onRandomize={randomize}
              onClear={clearFleet}
              onStart={startGame}
            />
          ) : (
            <section className="panel board-panel" aria-labelledby="enemy-board-heading">
              <h2 id="enemy-board-heading">Enemy waters</h2>
              <Board
                id="enemy-grid"
                label="Enemy waters"
                getCell={(coord) => enemyCellView(state, coord)}
                onActivate={fireAt}
                disabled={state.phase !== 'battle' || state.turn !== 'player'}
              />
              <FleetStatus title="Enemy ships" board={state.computer} concealed />
            </section>
          )}
        </div>

        <section className="panel legend" aria-labelledby="legend-heading">
          <h2 id="legend-heading">Legend</h2>
          <ul>
            <li><span className="cell cell--ship legend__swatch" aria-hidden="true" /> Your ship</li>
            <li><span className="cell cell--hit legend__swatch" aria-hidden="true">✕</span> Hit</li>
            <li><span className="cell cell--sunk legend__swatch" aria-hidden="true">✕</span> Sunk ship</li>
            <li><span className="cell cell--miss legend__swatch" aria-hidden="true">•</span> Miss</li>
            <li><span className="cell cell--revealed legend__swatch" aria-hidden="true" /> Enemy ship revealed after defeat</li>
          </ul>
        </section>
      </main>

      <footer className="app__footer">
        <p>
          Runs entirely in your browser — no accounts, tracking, or network requests. Built with React,
          TypeScript and Vite, with Devin as the AI coding agent.
        </p>
      </footer>
    </div>
  )
}
