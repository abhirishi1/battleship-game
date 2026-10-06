# Bug Report and Fix Log

## Scope and test approach

This log covers the first complete version of the game (placement, battle, the hunt/target
computer opponent, game over, and restart). It lists only problems that were actually seen while
building and testing it. Nothing has been added to make the list look longer.

How the game was tested:

- **Automated tests** (`npm test`, Vitest + React Testing Library): 65 tests in 5 files. They cover
  coordinates, placement rules, firing, sinking, victory, turn order and reset, the computer
  opponent, and the React UI.
- **Simulation:** the AI test suite plays 500 complete games against random fleets. It checks that
  no shot is repeated or off the board, that every game finishes, and that the AI is deterministic.
  A separate one-off run of 2,000 games needed 54.2 shots on average to win (minimum 27, median 55,
  maximum 66). After the owner asked for a randomised opponent (seeded per game; see the README),
  the suite checks that the same seed replays the same game, and a new 2,000-game run needed 51.2
  shots on average (minimum 24, median 52, maximum 67).
- **Browser checks** (Chromium, scripted with Playwright): placement preview by mouse and keyboard,
  a full battle, the 375 px mobile layout, the production build served by `vite preview` with its
  Content-Security-Policy, no console errors, and no network requests beyond the site's own files.
- **Static checks:** `npm run lint` (Oxlint) and `tsc -b` in strict mode.
- **Manual test cases** for the project owner are in [`TEST_PLAN.md`](TEST_PLAN.md).

## Bugs found and fixed

The first three items were defects in the application, found by the automated UI tests or by
reviewing the running app. Items 4 and 5 were mistakes in the tests themselves; the game code was
correct. No defect has been found in the rules engine or the AI logic so far.

### 1. Two headings with the same text during placement

- **Symptom:** after *New game*, the page showed two headings that both said "Deploy your fleet":
  the status banner and the placement panel. The UI test for restarting could not identify a single
  heading, and screen-reader users would hear the same heading twice.
- **Root cause:** the status panel used the same wording for its placement-phase title as the
  placement controls.
- **Fix:** the status title during placement is now "Placement phase". "Deploy your fleet" is used
  only by the placement panel (`src/components/StatusPanel.tsx`).
- **Verification:** the restart test in `src/App.test.tsx` now looks up each heading by its exact
  name and passes.

### 2. AI reasoning and battle log were not exposed as named regions

- **Symptom:** a UI test that looked for the battle log by its accessible name failed. The panels
  had visible titles, but assistive technology could not jump to them as landmarks.
- **Root cause:** the panels were plain `<div>`s, and their titles were not linked to them.
- **Fix:** both panels are now `<section>` elements with `aria-labelledby` pointing at their
  headings ("Computer's reasoning", "Battle log").
- **Verification:** `src/App.test.tsx` finds them with
  `getByRole('region', { name: 'Battle log' })`, and the test passes.

### 3. Battle log numbers ran in the wrong direction

- **Symptom:** the log shows the newest shot first, but the list numbers still started at 1 at the
  top. So the most recent shot was labelled "1", which read like the first shot of the game.
- **Root cause:** the list of shots was reversed for display, but the `<ol>` element still used its
  default numbering.
- **Fix:** the list now uses `<ol reversed start={history.length}>`, so each shot keeps its real
  number (the newest shot has the highest number). The left padding was widened so numbers of two
  or three digits fit.
- **Verification:** checked in the browser during a multi-turn game. Each shot's number now matches
  its position in the game.

### 4. (Test defect) AI corner test expected the wrong first probe

- **Symptom:** a new AI test failed. It expected the AI to probe J9 after a hit at J10, but the AI
  chose I10.
- **Root cause:** the test was wrong. The AI's documented probe order is up, right, down, left, so
  for J10 the first square on the board is I10 (up).
- **Fix:** the test now expects I10 first, and J9 after I10 is reported as a miss
  (`src/game/ai.test.ts`).
- **Verification:** the test passes and now also checks the full order of fallback probes.
- **Later change:** the owner later asked for a randomised opponent, so the fixed probe order was
  replaced by a random choice among untried neighbours. The test now checks the set of possible
  probes instead (for J10 after an I10 miss, only J9).

### 5. (Test defect) Computer-victory test did not guarantee a computer win

- **Symptom:** the test meant to show that the computer can win, and that the game then rejects
  further shots, did not reliably reach the game-over state.
- **Root cause:** the player's scripted shots in the test could sink the computer's fleet first, so
  the computer did not always win.
- **Fix:** the test now fires only at squares that are known to be empty water on the computer's
  fixed test fleet. That way only the computer can win (`src/game/game.test.ts`).
- **Verification:** the test passes and checks that the winner is the computer and that later
  `playerFire` and `computerFire` actions are ignored.

## Verification performed

- `npm ci`: clean install from the lockfile.
- `npm run lint`: 0 warnings, 0 errors.
- `npm test`: 5 test files, 65 tests passed.
- `npm run build`: type check plus Vite production build, written to `dist/`.
- Production preview (`npm run preview`) in Chromium: no console errors or CSP violations. The only
  requests were for `index.html`, one JS file, one CSS file, and the favicon.
- Visual checks of the placement screen (valid and invalid preview), the battle screen, and the
  mobile layout at 375 px wide.
- GitHub Actions CI runs the same lint, test, and build steps on the pull request.
- The project owner's manual testing, following `docs/TEST_PLAN.md`, takes place before deployment
  is approved. Any defects found then will be added to this log.

## Known limitations

- The computer opponent has a single difficulty level. Its hunt and probe choices are random per game
  (originally a fixed order that a player could learn and exploit), but it always fires on one
  checkerboard colour and always follows a line of hits, so an experienced player can still
  anticipate its general strategy.
- A game in progress is not saved; reloading the page starts a new game.
- Automated browser checks used Chromium only. Firefox, Safari, and real screen readers (NVDA,
  VoiceOver) have not been tested yet; they are covered by manual cases in `TEST_PLAN.md`.
- On very narrow screens (under about 340 px), the squares shrink to their minimum size of 26 px.

## Use of Devin

Devin was used as an AI coding agent. The project owner defined the requirements, tested the
application, reviewed the changes, and approved the release.
