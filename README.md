# Football Board Sandbox v16.0

Source build of the football board sandbox.




## v16.0 — Legal Group Move and persistent Free Mode

- GROUP MOVE now uses the normal movement engine: Speed, axis locking, diagonal cost, 3/2 state, and movement-ended restrictions remain active.
- FREE was renamed FREE MODE and now toggles a persistent free-placement mode for the selected player.
- While FREE MODE is active, all action buttons and END TURN are locked, the active player remains selected after each placement, and other players cannot be selected.
- The Match Ball can still be selected while FREE MODE is active; the locked player can be reselected, and the mode ends only by pressing FREE MODE again.
- Added the `Exit FREE MODE first.` feedback message.
- Updated the in-app Sandbox version and package version to v16.0.

## v15.8 — Group Move continuation and End Turn locking

- END TURN now becomes disabled as soon as that team has ended its phase.
- GROUP MOVE now remains a valid movement authorization after consuming the final tracker action.
- While GROUP MOVE is active, all other action buttons (including FREE) are locked; END TURN remains available.
- Multiplayer tracker ownership remains unchanged: the host continues to control tracker editing.
- Updated the in-app Sandbox version and package version to v15.8.

## v15.7 — Reopen ended phases and restore tablet tap movement

- Removing the latest tracker action now reopens that team's phase when `END TURN` had already advanced the turn flow.
- Removing a MOVE after `END TURN` again restores the player position and movement state recorded when MOVE was activated.
- Reopening the attack phase from defense or complete, and reopening the defense phase from complete, is synchronized through the shared tracker state.
- Restored one-finger tablet movement: after selecting a piece, tapping an empty destination cell now executes the same movement flow used on desktop.
- Preserved two-finger board pan/zoom, piece taps, ruler touch behavior, FREE, GROUP MOVE, 3/2, and direct MOVE confirmation.
- Updated the in-app Sandbox version and package version to v15.7.

## v15.6 — Inspector compaction, completed-action messaging, and selection consistency

- Further reduced the Inspector header, title, window controls, status row, and action-row height without resizing the rendered card.
- Added a smaller dedicated font for `GROUP MOVE`.
- When the active team has used every tracker action but has not pressed `END TURN`, movement and action attempts now show: `All actions are complete. Press END TURN to finish your turn.`
- Kept the existing post-`END TURN` phase messages unchanged.
- Unified Inspector content with the board's actual selected piece, preventing the Match Ball from appearing in Inspector while a player remains selected on the pitch.
- Updated the in-app Sandbox version and package version to v15.6.

## v15.5 — Compact Inspector controls and direct MOVE confirmation

- Reduced the height, font size, padding, and gaps of all controls above the Inspector card without changing the card size or rendering path.
- Aligned INACTIVE, flip controls, END TURN, and FREE on the same horizontal line.
- Ensured GROUP MOVE and TACKLING fit inside their buttons without horizontal scrolling.
- Added direct board movement confirmation when a player has not yet activated MOVE: “Do you want to move this player?”
- Yes records the normal MOVE action and executes the requested legal movement; No cancels without moving or consuming an action.
- Once MOVE has been activated for that player in the current turn, later legal movement continues without another prompt.
- Kept MOVE, FREE, GROUP MOVE, and the free 3/2 flow compatible with the existing action authorization rules.
- Updated the in-app Sandbox version and package version to v15.5.



## v15.3 — Movement preview and free 3/2 access

- Movement preview is now shown immediately after selecting a player, without requiring MOVE or FREE first.
- Preview remains informational only; normal movement still requires MOVE, FREE, or GROUP MOVE authorization.
- The 3/2 rule is checked before action authorization, so an eligible player can move directly to the ball without consuming a MOVE action.
- Declining the 3/2 confirmation no longer bypasses normal movement authorization.
- Updated the in-app Sandbox version and package version to v15.3.

## v15.2 — Inspector card-action layout fix

- Kept Reset Tracker behavior unchanged: it clears tracker actions without reverting player positions.
- Removed the sticky overlay behavior from Assign Card / Edit Card / Remove Card.
- The three card-management buttons now remain in normal document flow below the Inspector card and never cover the card artwork.
- Preserved the shared Editor = Inspector = Export card-rendering path.
- Updated the in-app Sandbox version and package version to v15.2.

## v15.1 — single-player tracker and movement authorization fixes

- Restored manual tracker-dot toggling in Editor Mode.
- Match Mode keeps typed action initials and only allows removing the latest logged action.
- Hardened GROUP MOVE authorization: free team movement is now allowed only when the team’s final tracker entry is a valid GROUP MOVE that fills the tracker.
- Prevented stale or restored `groupMove.active` state from granting the attacking team unintended Editor-like movement.
- Updated the in-app Sandbox version and package version to v15.1.


## v15.0 — action workflow, tracker clarity, and movement rollback

- Promoted the match-action system to v15.0 and updated the in-app Sandbox version.
- Kept the action row on one line in this order: MOVE, GROUP MOVE, PASS, SHOT, CROSS, DRIBBLE, TACKLING.
- Moved FREE beside the ACTIVE/INACTIVE control at the top of the Inspector.
- Removing the latest MOVE action now restores that player's position and movement state to the moment MOVE was activated.
- Tracker action circles are larger, action abbreviations are white and unobstructed, and consumed actions remain fully visible.
- Match movement feedback now distinguishes an exhausted team from a player who simply has not activated MOVE.
- Exhaustion messages direct the user to wait for the opponent or advance to the next turn; when both teams are exhausted, the game explicitly requests the next turn.
- The locked movement-axis icon remains visible from actual movement state even if MOVE authorization is later removed.
- Stabilized the Inspector footer so Assign Card, Edit Card, and Remove Card are not pushed out of view by the action row or card resize calculations.
- Preserved the Editor = Inspector = Export rendering rule; no card-rendering path was forked or restyled.


## v14.6 — explicit movement-ended state

- Added an explicit `movementEnded` flag to each player movement state.
- Using the 3/2 rule after at least one normal movement sets `movementEnded: true`.
- The central movement evaluator now rejects every later destination for that player during the same turn.
- Cursor preview shows the move as unavailable instead of displaying remaining movement points.
- The locked-axis badge is hidden because no movement direction remains available.
- The flag is normalized, saved, restored, included in Undo/Redo, and synchronized through multiplayer state.
- The flag resets together with the rest of movement state when the turn changes.

## v14.5 — 3/2 repeat-use feedback and occupied ball-cell protection

- A second 3/2 attempt by the same player in the same turn now explicitly states that the 3/2 rule has already been used, in addition to the normal illegal-move explanation.
- The 3/2 confirmation is no longer shown when the ball cell is already occupied by another player.
- A player can never enter a ball cell occupied by another player through the 3/2 rule.
- The checks use the synchronized live board and movement state, so the same protection applies in multiplayer.


## v14.3 — Cumulative diagonal cost, private movement information, turn confirmation

- Fixed the diagonal movement exploit caused by splitting movement into repeated one-cell moves.
- Movement state now stores both cumulative movement cost and cumulative distance for each piece during the turn.
- Diagonal cost is calculated against the total diagonal distance already travelled that turn. For example, two separate one-cell diagonal moves cost `1 + 2 = 3`, exactly like one two-cell diagonal move.
- Older saved/session movement states that contain only `spent` are normalized by inferring the travelled distance.
- In multiplayer, movement previews for an opponent's piece are now controlled by card visibility:
  - **Open Cards:** movement preview is visible.
  - **Private Cards:** movement preview is visible only when that attached card has been revealed/flipped for the viewer.
- Hidden opponent cards no longer expose destination highlights, movement-cost badges, Speed-based availability, or the already-locked movement-axis badge.
- Clicking a different tracker turn now opens a confirmation dialog before changing the turn:
  - `Advance Turn?` with `Yes / No` when moving forward.
  - `Reverse Turn?` with `Yes / No` when moving backward.
- Turn state, action counters, and per-piece movement usage reset only after explicit confirmation with `Yes`.

## v14.2 — Ruler, Inspector, and movement symbols

- The ruler can select empty cells and cells occupied by players or the ball.
- Ruler interaction measures the cell coordinate without selecting or moving the occupying piece.
- Deselecting a piece clears the Inspector and shows `No selection`.
- Selecting the ball displays `⚽ Match Ball` in the Inspector.
- Movement previews use axis symbols: `↔`, `↕`, `⤡`, and `⤢`.
- Speed violations show `⚠ cost / remaining`; mixed-axis and axis-change violations show `🚫`.
- A selected piece with an axis already locked during the turn displays a small axis badge when the viewer is allowed to see its movement information.

## v14.1 — Selection and multiplayer match-rule fixes

- Clicking or tapping the currently selected player or ball deselects it.
- Fixed multiplayer guests remaining effectively in Editor Mode when the shared tracker window was disabled.
- Multiplayer moves write the board position and movement consumption together in one Firebase update.
- The synchronized movement-state ref updates immediately on every session snapshot.

## v14.0 — Editor Mode / Match Mode

- Added a host-authoritative Editor Mode / Match Mode control.
- Match Mode reads the assigned card's numeric `Speed` passive attribute.
- The first movement of each player in a turn locks one axis.
- Movement accumulates across multiple selections during the same turn.
- Illegal moves are blocked and display a single `OK` dialog.
- Starting a tracked game or confirming a turn change resets per-player movement usage.
- Undo/Redo snapshots include both piece positions and movement state.
- Game mode and movement state persist in cloud saves and synchronize in multiplayer.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## v14.4 — 3/2 rule

The 3/2 possession rule is active only in Match Mode.

- A player may enter the ball cell for free when the ball is on a legal movement line at a maximum distance of 3 orthogonal cells or 2 diagonal cells.
- Valid distances are 1, 2, or 3 cells orthogonally and 1 or 2 cells diagonally.
- The rule may be used once per player per turn.
- Entering the ball cell with 3/2 does not charge the travelled cells.
- If the player had not moved earlier in the turn, all movement points remain available and no movement axis is locked by the 3/2 entry.
- If the player had already moved at least one cell, 3/2 may change to any legal orthogonal or diagonal line leading to the ball, but all remaining movement points are then lost and that player's movement ends.
- The rule remains available even when the player has no movement points remaining, provided all other 3/2 conditions are met.
- A Yes/No confirmation is shown before applying 3/2. Choosing No attempts the move using the normal movement rules.
- The used state and resulting board position are synchronized atomically in multiplayer and reset with the turn movement state.

## v14.7 — Match action authorization
- Inspector action buttons on one row: MOVE, GROUP MOVE, PASS, SHOT, CROSS, DRIBBLE, TACKLING, FREE.
- Typed tracker action log with abbreviations and latest-action removal confirmation.
- MOVE authorizes normal movement once per player per turn.
- FREE authorizes one unrestricted placement without consuming an action.
- GROUP MOVE is available only when one tracker action remains and enables unrestricted team repositioning until reset/turn change.
- PASS/SHOT/CROSS/DRIBBLE/TACKLING currently consume and label tracker actions only.
- Match movement requires MOVE, GROUP MOVE, or FREE authorization; ball and Editor Mode remain free.
- Action state is persisted and synchronized in multiplayer.

## v15.4
- Added explicit Match Mode phases: attack, defense, complete.
- Added team-colored END TURN and FREE controls with confirmation for END TURN.
- The defending team must wait for the attacking team to end its phase; only FREE remains available outside the active phase.
- After both phases end, normal actions are blocked until the next turn; FREE remains available.
- Compact team-colored action controls remove the Inspector horizontal scrollbar.
- Turn phase is included in local saves and shared tracker state for multiplayer compatibility.
