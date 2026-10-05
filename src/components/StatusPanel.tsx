import type { Ref } from 'react'
import type { GameState, ShotRecord } from '../game/game'
import { describeShot } from './messages'

interface StatusPanelProps {
  state: GameState
  announcement: string
  onNewGame: () => void
  newGameRef?: Ref<HTMLButtonElement>
}

function turnLabel(state: GameState): string {
  if (state.phase === 'placement') return 'Placement phase'
  if (state.phase === 'gameOver') return state.winner === 'player' ? 'Victory — you win!' : 'Defeat — the computer wins'
  return state.turn === 'player' ? 'Your turn' : 'Computer is aiming…'
}

function lastComputerShot(history: ShotRecord[]): ShotRecord | undefined {
  return history.findLast((shot) => shot.shooter === 'computer')
}

export function StatusPanel({ state, announcement, onNewGame, newGameRef }: StatusPanelProps) {
  const aiShot = lastComputerShot(state.history)
  const recent = state.history.slice(-8).reverse()
  const playerShots = state.history.filter((shot) => shot.shooter === 'player').length

  return (
    <section className={`panel status status--${state.phase}`} aria-labelledby="turn-heading">
      <div className="status__header">
        <h2 id="turn-heading" className={`turn turn--${state.phase === 'battle' ? state.turn : state.phase}`}>
          {turnLabel(state)}
        </h2>
        {state.phase !== 'placement' && (
          <button
            type="button"
            ref={newGameRef}
            className={state.phase === 'gameOver' ? 'primary' : undefined}
            onClick={onNewGame}
          >
            New game
          </button>
        )}
      </div>

      <p className="status__announcement" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {state.phase === 'gameOver' && (
        <p className="status__summary">
          {state.winner === 'player'
            ? `You sank the entire enemy fleet in ${playerShots} shots.`
            : 'Your fleet has been sunk. The enemy ships you missed are now revealed.'}
        </p>
      )}

      {state.phase !== 'placement' && (
        <div className="status__details">
          <section className="ai-reasoning" aria-labelledby="ai-reasoning-heading">
            <h3 id="ai-reasoning-heading">Computer's reasoning</h3>
            {aiShot ? (
              <p>
                <span className={`mode-badge mode-badge--${aiShot.mode}`}>
                  {aiShot.mode === 'target' ? 'Target mode' : 'Hunt mode'}
                </span>{' '}
                {aiShot.reason}
              </p>
            ) : (
              <p>The computer has not fired yet.</p>
            )}
          </section>
          <section className="battle-log" aria-labelledby="battle-log-heading">
            <h3 id="battle-log-heading">Battle log</h3>
            {recent.length === 0 ? (
              <p>No shots fired yet.</p>
            ) : (
              <ol reversed start={state.history.length}>
                {recent.map((shot) => (
                  <li key={`${shot.shooter}-${shot.coord.row}-${shot.coord.col}`} className={`log--${shot.result}`}>
                    {describeShot(shot)}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
