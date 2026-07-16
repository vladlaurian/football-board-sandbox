# Football Board Sandbox v13.2

Source build of the football board sandbox.

## v13.2 — click-to-move routing fix

- Fixed selected players not moving when an empty destination cell was clicked.
- Fixed the misleading case where the ball could move only by clicking a cell already occupied by a player.
- Destination clicks are now resolved by the same board-level interaction that distinguishes a click from a pan.
- A desktop drag that exceeds the 5 px threshold pans the board and does not move the selected piece.
- A simple desktop click moves the selected piece and then clears the selection.
- Panning preserves the current selection.
- Piece and ball hover use the normal arrow cursor.
- While a piece is selected, the board uses the normal arrow cursor.

## v13.0 — interaction redesign

- Click or tap a player or the ball to select it.
- Click or tap a destination cell to move the selected piece.
- Players cannot move into a cell occupied by another player.
- The ball may share a cell with a player; clicking that player while the ball is selected moves the ball onto the player's cell.
- Desktop board panning starts only after a 5 px drag threshold.
- Touch uses one finger for selection and movement, and two fingers for board pan/zoom.
- Desktop double-click and touch double-tap open player label editing.
- Grid snapping is always enabled; the Snap Off control and stored snap state were removed.
- Added Redo next to Undo. A new move clears the redo stack.

## Preserved systems

- Multiplayer ownership and synchronization rules.
- Cloud save and autosave.
- Match Tracker persistence and host authority.
- Ruler and ruler session cleanup.
- Cards, inspector, formations, dice, history, imported graphics, and export flows.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```
