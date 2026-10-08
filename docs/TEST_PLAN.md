# Manual Test Plan

Run the game locally with `npm run dev` (http://localhost:5173), or the production build with
`npm run build && npm run preview` (http://localhost:4173). Use a desktop browser unless the case
says otherwise. Mark each case Pass/Fail and note anything unexpected in `docs/BUG_REPORT.md`.

## Placement

| # | Steps | Expected result |
| --- | --- | --- |
| P1 | Load the page. | Heading "Placement phase"; Carrier is selected; *Start battle* is disabled; the enemy board is not shown yet. |
| P2 | Hover over square C3. | Five green squares C3–C7 and the text "Carrier fits horizontally at C3–C7." |
| P3 | Hover over A8. | Red dashed preview; text "Carrier can't go there: it would run off the board." |
| P4 | Click A8. | Nothing is placed; the status line repeats the off-board message. |
| P5 | Click A1. | Carrier occupies A1–A5; status says "Carrier placed at A1–A5. Next: Battleship."; the list shows Carrier as placed. |
| P6 | With Battleship selected, hover/click A3. | Red preview and "...it would overlap your Carrier."; nothing is placed. |
| P6a | With Battleship still horizontal, hover/click B1 (right under the Carrier), then B6 (touching the Carrier's corner). | Red preview and "...it would touch your Carrier. Leave at least one square of water between ships."; nothing is placed. |
| P7 | Press <kbd>R</kbd>, then click C1. | The Rotate button reads "Rotate: Vertical"; Battleship occupies C1–F1. |
| P8 | Select Carrier in the list and click a new legal square. | The Carrier moves; it is not duplicated. |
| P9 | Place the remaining ships. | The counter reads "5 of 5 placed"; *Start battle* becomes enabled. |
| P10 | Click *Clear*. | All ships are removed; *Start battle* is disabled again. |
| P11 | Click *Randomize fleet* several times. | Each time, five ships appear fully on the board, none overlapping or touching (not even at a corner); *Start battle* is enabled. |

## Battle

| # | Steps | Expected result |
| --- | --- | --- |
| B1 | Click *Start battle*. | Heading "Your turn"; the enemy board appears with no ships visible; focus moves to the enemy board. |
| B2 | Click any enemy square. | It shows ✕ (hit) or • (miss); the status line reports it; heading changes to "Computer is aiming…" and the enemy board is inactive. |
| B3 | Wait about one second. | The computer fires exactly one shot (one new marker on your board and one new log entry); heading returns to "Your turn". |
| B4 | Click a square you already fired at. | Status says "You already fired at X. Choose another square."; no new shot; the computer does not fire. |
| B5 | Click quickly on several enemy squares during the computer's turn. | None of them register; the computer still fires once, then it is your turn. |
| B6 | Watch the *Computer's reasoning* panel during the first turns, then start a new game and compare. | "Hunt mode … X fits a ship in N possible ways, the most of any untried square"; the first shot is one of E5, E6, F5, F6, and a new game usually picks a different one or a different order. |
| B7 | After the computer hits one of your ships. | The next reason says "Target mode … Unsunk hit at X; Y is part of N of the M possible ship positions through it"; the shot is directly above/right/below/left of the hit (never diagonal), favouring the side with more room (e.g. along the edge rather than off it). |
| B8 | After it hits the same ship twice in a line. | The reason lists both hits ("Unsunk hits at X, Y") and it keeps firing along that line, reversing after a miss or the board edge. |
| B9 | When a ship is sunk (either side). | The status names the ship ("you sank the computer's Destroyer" / "it sank your Cruiser"); the fleet list marks it Sunk; its squares turn dark red. A plain hit never names the ship. |
| B10 | Throughout a full game. | No square on either board is ever fired at twice (check the log and the boards). |
| B11 | During your turn, double-click an untried enemy square. | One shot is fired; after the computer replies, the status line shows its result and "Your turn." (it does not stay on "Wait for the computer's shot."). |
| B12 | After the computer sinks one of your ships, keep playing. | It never fires at any of the squares around that ship (including corners); the reasoning may say "N untried squares can't hold any ship and are skipped". |

## Game over and restart

| # | Steps | Expected result |
| --- | --- | --- |
| G1 | Sink all five enemy ships. | Heading "Victory — you win!"; status announces the win; summary shows your shot count; the enemy board no longer accepts clicks; the computer does not fire again. |
| G2 | Lose a game (let the computer sink all your ships). | Heading "Defeat — the computer wins"; enemy ships you did not find are shown with dashed outlines. |
| G3 | Click *New game* (after a game, or in the middle of one). | Returns to the placement phase with an empty board, Carrier selected, horizontal orientation, and an empty log. |
| G4 | Load the page, then win a game. | Scoreboard starts at You 0, Computer 0, Games played 0 (*Reset scores* disabled), then shows You 1, Games played 1; the status announces "Score: You 1, Computer 0." |
| G5 | Lose a game, then click *New game*. | Computer's count goes up by 1; the scores stay after *New game*. |
| G6 | Start a battle, fire a few shots, then click *New game* before anyone wins. | Scoreboard does not change. |
| G7 | Click *Reset scores*, then *Cancel*; click it again, then *Yes, reset*. | Cancel keeps the scores; Yes sets all three numbers to 0. The current game is not affected. |
| G8 | Play a game to the end, then reload the page. | Scoreboard is back to 0 (scores last for the current visit only). |
| G9 | Using only the keyboard, press *New game* after a finished game. | Focus moves to square A1 of your grid, ready to place the Carrier. |

## Keyboard and accessibility

| # | Steps | Expected result |
| --- | --- | --- |
| A1 | Use only Tab / Shift+Tab through the page. | Every button is reachable; each board is a single Tab stop; a yellow focus ring is always visible. |
| A2 | On your board, use the arrow keys, Home and End, then press Enter. | Focus moves square by square; the preview follows the focus; Enter places the selected ship. |
| A3 | In battle, use the arrow keys and Enter/Space on the enemy board. | Fires at the focused square. |
| A4 | With a screen reader (e.g. NVDA, VoiceOver), place a ship and fire a shot. | Squares are read as e.g. "B4, miss"; results and turn changes are announced automatically. |
| A5 | Turn on "reduce motion" in the OS and fire a shot. | No splash animation. |
| A6 | Zoom to 200%. | Content stays usable without horizontal scrolling of the whole page. |

## Responsive layout

| # | Steps | Expected result |
| --- | --- | --- |
| R1 | Desktop width (≥ 940 px). | Boards sit side by side. |
| R2 | Phone width (~375 px), e.g. browser dev tools device mode. | Boards stack vertically and fit the screen; all squares remain tappable. |

## Privacy / static-only

| # | Steps | Expected result |
| --- | --- | --- |
| S1 | Open dev tools → Network, reload the production build and play a few turns. | Only the page's own HTML, JS, CSS and favicon load; no other requests. |
