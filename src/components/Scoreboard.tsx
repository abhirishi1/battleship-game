import { useEffect, useRef, useState } from 'react'
import { gamesPlayed, type Score } from '../game/scoreboard'

interface ScoreboardProps {
  score: Score
  onReset: () => void
}

export function Scoreboard({ score, onReset }: ScoreboardProps) {
  const [confirming, setConfirming] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const played = gamesPlayed(score)

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (returnFocus.current) (resetRef.current?.disabled ? headingRef.current : resetRef.current)?.focus()
    returnFocus.current = false
  }, [confirming])

  function finish(reset: boolean) {
    if (reset) onReset()
    returnFocus.current = true
    setConfirming(false)
  }

  return (
    <section className="panel scoreboard" aria-labelledby="scoreboard-heading">
      <div className="scoreboard__header">
        <h2 id="scoreboard-heading" ref={headingRef} tabIndex={-1}>
          Scoreboard
        </h2>
        {confirming ? (
          <div className="scoreboard__confirm" role="group" aria-label="Confirm reset">
            <span>Reset all scores to 0?</span>
            <button type="button" ref={confirmRef} onClick={() => finish(true)}>
              Yes, reset
            </button>
            <button type="button" onClick={() => finish(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" ref={resetRef} disabled={played === 0} onClick={() => setConfirming(true)}>
            Reset scores
          </button>
        )}
      </div>
      <dl className="scoreboard__tally">
        <div className="scoreboard__item scoreboard__item--player">
          <dt>You</dt>
          <dd>{score.player}</dd>
        </div>
        <div className="scoreboard__item scoreboard__item--computer">
          <dt>Computer</dt>
          <dd>{score.computer}</dd>
        </div>
        <div className="scoreboard__item">
          <dt>Games played</dt>
          <dd>{played}</dd>
        </div>
      </dl>
      <p className="hint">Scores last for this visit only; reloading the page resets them.</p>
    </section>
  )
}
