# Bug Report and Fix Log

## Scope and test approach

This log covers the first complete version of the game (placement, battle, the hunt/target
computer opponent, game over, and restart). It lists only problems that were actually seen while
building and testing it. Nothing has been added to make the list look longer.

How the game was tested:

- **Automated tests** (`npm test`, Vitest + React Testing Library): 75 tests in 7 files. They cover
  coordinates, placement rules, firing, sinking, victory, turn order and reset, the computer
  opponent, the scoreboard, and the React UI.
- **Simulation:** the AI test suite plays 500 complete games against random fleets. It checks that
  no shot is repeated or off the board, that every game finishes, and that the randomized AI
  replays exactly the same game from the same seed. A one-off run of 2,000 games with the original
  fixed-order AI needed 54.2 shots on average to win (minimum 27, median 55, maximum 66). After the
  owner asked for a randomized AI (seeded per game; see the README), a new 2,000-game run needed
  51.2 shots on average (minimum 24, median 52, maximum 67). Ships may no longer touch, which
  spreads fleets out, and against such fleets that AI needed 53.0 shots. The owner then asked for a
  smarter opponent, a "most likely square" heat map that also uses the no-touch rule (see the README).
  On the same 2,000 fleets it needs 38.6 shots on average (minimum 22, median 38, maximum 57).
- **Browser checks** (Chromium, scripted with Playwright): placement preview by mouse and keyboard,
  a full battle, the 375 px mobile layout, the production build served by `vite preview` with its
  Content-Security-Policy, no console errors, and no network requests beyond the site's own files.
- **Static checks:** `npm run lint` (Oxlint) and `tsc -b` in strict mode.
- **Manual test cases** for the project owner are in [`TEST_PLAN.md`](TEST_PLAN.md).
- **Scoreboard (owner-requested feature):** wins per side and games played for the current visit,
  with a confirmed reset. Its new unit and UI tests passed on their first run, and no defects were
  found while building it, so it adds no entries below.

## Bugs found and fixed

Items 1–3, 7–10 and 12 were defects in the application, found by the automated UI tests, by reviewing
the running app, by the project owner while playing, or in a dedicated bug hunt the owner requested. Items 4 to 6 and 11 were mistakes in the tests
themselves; the game code was correct. No defect has been found in the AI logic so far.

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

### 6. (Test defect) Scoreboard UI test timed out on CI

- **Symptom:** on GitHub Actions, the test "resets scores only after confirmation, and a reload
  starts from zero" failed with "Test timed out in 5000ms". The same test passed locally, and the
  change being tested (a wording-only edit) did not touch the game.
- **Root cause:** this test plays two complete games through the UI (34 clicks with screen updates).
  On the slower CI runner it took just over Vitest's default 5-second limit per test; another
  full-game UI test took about 3.6 seconds, close to the same limit.
- **Fix:** the test time limit is raised to 15 seconds in `vite.config.ts` (`testTimeout`). The game
  code was correct and is unchanged.
- **Verification:** all 71 tests passed locally and in CI at the time.

### 7. Touching ships looked like extra ships (reported by the project owner)

- **Symptom:** while playing the live site, the project owner saw what looked like two Battleships
  (4 squares in a row) in the enemy grid, although the fleet has only one.
- **Investigation:** 100,000 generated fleets all had exactly one ship of each type, the right
  lengths, and no shared squares, and three full games on the live site each had exactly one
  4-square Battleship. So there was no overlap. The rules let ships touch, and the grid draws touching
  ships as one block. For example, a 3-square ship ending next to the Carrier's side reads as 4 in a
  row. About 1 in 5 random fleets contained two or more such 4-in-a-row lookalikes.
- **Root cause:** the placement rule allowed ships to touch, and nothing on screen shows where one ship
  ends and the next begins.
- **Fix (rule chosen by the owner):** ships may no longer touch, not even at a corner.
  `checkPlacement` returns a new `too-close` reason, so manual placement shows "…it would touch your
  Carrier. Leave at least one square of water between ships." `randomFleet` follows the same rule
  and starts over if early ships leave no room. The game also checks the computer's fleet with the same
  rule before a battle starts.
- **Verification:** new unit tests reject side, end and corner contact and accept a one-square gap;
  2,000 seeded random fleets are checked to have no touching ships; the UI test checks the new
  message. All 73 tests pass.

### 8. Status line stuck on "Wait for the computer's shot."

- **Found by:** a bug hunt the project owner requested after item 7, reproduced in the production build
  in Chromium.
- **Symptom:** after double-clicking an enemy square (or clicking or pressing Enter twice), the status
  line showed "Wait for the computer's shot." and stayed that way after the computer had fired. The
  heading said "Your turn", but the computer's result ("Computer fired at G8: miss.") was never shown
  in the status line or announced to screen readers until the player fired again.
- **Root cause:** the second click arrives during the computer's turn and sets a one-off notice. A
  notice takes priority over the normal announcement, and nothing cleared it when the computer fired.
- **Fix:** `App.tsx` clears the notice at the moment the computer takes its shot.
- **Verification:** a new UI test double-clicks a square and expects the computer's result followed
  by "Your turn." in the status line. It failed before the fix and passes after it.

### 9. Keyboard focus lost after "New game"

- **Found by:** the same bug hunt, in Chromium (focus moved to the page body).
- **Symptom:** the New game button disappears when pressed, so keyboard and screen-reader users were
  sent back to the top of the page and had to tab all the way back to the board.
- **Root cause:** nothing moved focus when the focused button was removed.
- **Fix:** `Board` takes a `focusRequest` counter; `App` bumps it on New game, so focus moves to square
  A1 of the player's grid, ready to place the Carrier.
- **Verification:** the existing win-and-restart UI test now checks that A1 has focus after New game.
  It failed before the fix and passes after it.

### 10. Enemy ship names missing on hit squares after a defeat

- **Found by:** the same bug hunt, by reading the screen-reader labels of the enemy grid.
- **Symptom:** after the computer won, enemy squares the player had not hit were labelled with their ship
  ("Carrier, not found"), but squares of the same unsunk ship that the player had hit said only "hit".
- **Root cause:** `enemyCellView` hid the ship name on unsunk hits in every phase. That is right during
  the battle, but not once the fleet is revealed.
- **Fix:** after the game ends, those squares read "hit, Carrier" (and so on). During the battle they
  still say only "hit", so nothing leaks.
- **Verification:** new unit tests in `cellViews.test.ts` check both phases. The game-over test failed
  before the fix and passes after it.

### 11. (Test defect) Heat-map test expected the wrong score for D5

- **Symptom:** a new AI test for the heat map failed. It expected square D5 on an empty board to be
  covered by 30 possible ship positions, but the AI counted 33.
- **Root cause:** the test was wrong. When working out the expected number by hand, the vertical
  positions through D5 were added up with only one of the two 3-square ships (Cruiser and
  Submarine), so 3 positions were missing. 17 across plus 16 down is 33.
- **Fix:** the test now expects 33 (`src/game/ai.test.ts`).
- **Verification:** the test passes. The other hand-worked scores in the same tests (10 for A1,
  34 for E5, 12 and 22 after a hit at E1) were rechecked the same way and were already right.

### 12. Lint warning introduced by the fix for item 9

- **Found by:** running `npm run lint` while building the heat-map AI. It reported one warning
  (`react(set-state-in-effect)` in `src/components/Board.tsx`), so this log's claim of
  "0 warnings" had been wrong since the fix for item 9.
- **Symptom:** no visible effect in the game; lint still passed, because warnings don't fail it.
- **Root cause:** the new focus effect in `Board` set its own state (`setActive`) and then moved
  focus. Setting state inside an effect causes an extra render, and it wasn't needed: each square's
  `onFocus` handler already makes the focused square the active one.
- **Fix:** the effect now only moves focus to A1, and `onFocus` updates the active square.
- **Verification:** `npm run lint` reports 0 warnings and 0 errors. The UI test from item 9 (focus
  on A1 after New game) still passes.

## Verification performed

- `npm ci`: clean install from the lockfile.
- `npm run lint`: 0 warnings, 0 errors.
- `npm test`: 7 test files, 75 tests passed.
- `npm run build`: type check plus Vite production build, written to `dist/`.
- Production preview (`npm run preview`) in Chromium: no console errors or CSP violations. The only
  requests were for `index.html`, one JS file, one CSS file, and the favicon.
- Visual checks of the placement screen (valid and invalid preview), the battle screen, and the
  mobile layout at 375 px wide.
- GitHub Actions CI runs the same lint, test, and build steps on the pull request.
- The project owner's manual testing, following `docs/TEST_PLAN.md`, takes place before deployment
  is approved. Any defects found then will be added to this log.

## Known limitations

- The computer opponent has a single difficulty level. It always fires at the most likely square,
  choosing at random only between ties, so its opening shots cluster around the centre (E5, E6, F5,
  F6 on an empty board) and an experienced player can anticipate its general strategy. It does not
  learn from where a player has placed ships in earlier games.
- A game in progress is not saved; reloading the page starts a new game.
- The scoreboard is kept in memory only (the owner's choice), so reloading the page resets it to 0.
- Automated browser checks used Chromium only. Firefox, Safari, and real screen readers (NVDA,
  VoiceOver) have not been tested yet; they are covered by manual cases in `TEST_PLAN.md`.
- On very narrow screens (under about 340 px), the squares shrink to their minimum size of 26 px. At
  320 px wide (for example the first iPhone SE) the page scrolls sideways by about 50 px; at 375 px
  and wider it fits.

## Use of Devin

Devin was used as an AI coding agent. The project owner defined the requirements, tested the
application, reviewed the changes, and approved the release.
