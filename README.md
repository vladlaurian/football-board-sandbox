# Football Board Sandbox v14.3

Source build of the football board sandbox.

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
