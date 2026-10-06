import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { columnFleet, stackedFleet } from './game/testFleets'

function setup() {
  const user = userEvent.setup()
  // Player's "Randomize" and the computer's fleet both come from createFleet in call order.
  const fleets = [stackedFleet(), columnFleet()]
  let calls = 0
  render(<App computerDelayMs={0} createFleet={() => fleets[calls++ % fleets.length]} createSeed={() => 1} />)
  return { user }
}

function playerGrid() {
  return screen.getByRole('grid', { name: 'Your fleet' })
}

function enemyGrid() {
  return screen.getByRole('grid', { name: 'Enemy waters' })
}

function enemyCell(label: string) {
  return within(enemyGrid()).getByRole('button', { name: new RegExp(`^${label},`) })
}

async function startWithRandomFleet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Randomize fleet' }))
  await user.click(screen.getByRole('button', { name: 'Start battle' }))
}

async function winGame(user: ReturnType<typeof userEvent.setup>) {
  const labels = columnFleet()
    .ships.flatMap((ship) => ship.cells)
    .map(({ row, col }) => `${'ABCDEFGHIJ'[row]}${col + 1}`)
  for (const [i, label] of labels.entries()) {
    await user.click(enemyCell(label))
    if (i < labels.length - 1) await screen.findByText(/Your turn\./)
  }
}

function scoreboard() {
  return screen.getByRole('region', { name: 'Scoreboard' })
}

describe('App', () => {
  it('only enables Start once all five ships are placed', async () => {
    const { user } = setup()
    const start = screen.getByRole('button', { name: 'Start battle' })
    expect(start).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Randomize fleet' }))
    expect(start).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(start).toBeDisabled()
  })

  it('places ships manually, rejects bad placements, and rotates with R', async () => {
    const { user } = setup()
    const grid = playerGrid()
    const cell = (label: string) => within(grid).getByRole('button', { name: new RegExp(`^${label},`) })

    await user.click(cell('A7'))
    expect(screen.getByRole('status')).toHaveTextContent("Carrier can't go there: it would run off the board.")

    await user.click(cell('A1'))
    expect(screen.getByRole('status')).toHaveTextContent('Carrier placed at A1–A5. Next: Battleship.')

    await user.click(cell('A3'))
    expect(screen.getByRole('status')).toHaveTextContent('it would overlap your Carrier')

    await user.click(cell('B1'))
    expect(screen.getByRole('status')).toHaveTextContent(
      "Battleship can't go there: it would touch your Carrier. Leave at least one square of water between ships.",
    )

    await user.keyboard('r')
    expect(screen.getByRole('button', { name: 'Rotate: Vertical' })).toBeInTheDocument()
    await user.click(cell('C1'))
    expect(screen.getByRole('status')).toHaveTextContent('Battleship placed at C1–F1')

    for (const label of ['C3', 'C5', 'C7']) await user.click(cell(label))
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeEnabled()
  })

  it('supports keyboard placement with arrow keys and Enter', async () => {
    const { user } = setup()
    const first = within(playerGrid()).getByRole('button', { name: /^A1,/ })
    first.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('Carrier placed at C1–C5')
  })

  it('plays a turn: the player fires once and the computer replies once', async () => {
    const { user } = setup()
    await startWithRandomFleet(user)
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeInTheDocument()

    await user.click(enemyCell('A1'))
    expect(await screen.findByText(/Computer fired at [A-J]\d+: (hit on your fleet|miss)\. Your turn\./)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You fired at A1: miss.')
    expect(screen.getByRole('region', { name: "Computer's reasoning" })).toHaveTextContent(
      /picked [A-J]\d+ at random from 50 untried checkerboard squares/,
    )
    expect(within(screen.getByRole('region', { name: 'Battle log' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('blocks a duplicate shot and does not give the computer an extra turn', async () => {
    const { user } = setup()
    await startWithRandomFleet(user)
    await user.click(enemyCell('A2'))
    await screen.findByText(/Your turn\./)
    await user.click(enemyCell('A2'))
    expect(screen.getByRole('status')).toHaveTextContent('You already fired at A2. Choose another square.')
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(within(screen.getByRole('region', { name: 'Battle log' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('announces a sunk ship, declares the winner, and restarts', async () => {
    const { user } = setup()
    await startWithRandomFleet(user)
    const targets = columnFleet().ships.flatMap((ship) => ship.cells)
    const labels = targets.map(({ row, col }) => `${'ABCDEFGHIJ'[row]}${col + 1}`)
    for (const [i, label] of labels.entries()) {
      await user.click(enemyCell(label))
      if (i < labels.length - 1) await screen.findByText(/Your turn\./)
      if (label === 'B10') expect(screen.getByRole('status')).toHaveTextContent("you sank the computer's Destroyer")
    }
    expect(screen.getByRole('heading', { name: 'Victory — you win!' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You win')
    expect(enemyCell('J1')).toHaveAttribute('aria-disabled', 'true')

    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(screen.getByRole('heading', { name: 'Deploy your fleet', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled()
  })

  it('counts a won game once, keeps it across new games, and ignores abandoned games', async () => {
    const { user } = setup()
    expect(scoreboard()).toHaveTextContent(/You\s*0\s*Computer\s*0\s*Games played\s*0/)
    expect(within(scoreboard()).getByRole('button', { name: 'Reset scores' })).toBeDisabled()

    await startWithRandomFleet(user)
    await winGame(user)
    expect(screen.getByRole('status')).toHaveTextContent('Score: You 1, Computer 0.')
    expect(scoreboard()).toHaveTextContent(/You\s*1\s*Computer\s*0\s*Games played\s*1/)

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await startWithRandomFleet(user)
    await user.click(enemyCell('J1'))
    await screen.findByText(/Your turn\./)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(scoreboard()).toHaveTextContent(/You\s*1\s*Computer\s*0\s*Games played\s*1/)
  })

  it('resets scores only after confirmation, and a reload starts from zero', async () => {
    const { user } = setup()
    await startWithRandomFleet(user)
    await winGame(user)
    const board = within(scoreboard())

    await user.click(board.getByRole('button', { name: 'Reset scores' }))
    expect(board.getByRole('button', { name: 'Yes, reset' })).toHaveFocus()
    await user.click(board.getByRole('button', { name: 'Cancel' }))
    expect(scoreboard()).toHaveTextContent(/Games played\s*1/)
    expect(board.getByRole('button', { name: 'Reset scores' })).toHaveFocus()

    await user.click(board.getByRole('button', { name: 'Reset scores' }))
    await user.click(board.getByRole('button', { name: 'Yes, reset' }))
    expect(scoreboard()).toHaveTextContent(/You\s*0\s*Computer\s*0\s*Games played\s*0/)
    expect(board.getByRole('heading', { name: 'Scoreboard' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Victory — you win!' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await startWithRandomFleet(user)
    await winGame(user)
    cleanup()
    setup()
    expect(scoreboard()).toHaveTextContent(/Games played\s*0/)
  })
})
