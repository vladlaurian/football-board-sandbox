# Football Board Sandbox v14.2

Source build of the football board sandbox.

## v14.2 — Ruler targets, inspector selection and movement symbols

- The ruler can now start or end on a cell occupied by a player or the match ball. Pieces no longer block ruler cell selection.
- The Inspector follows the active board selection. Deselecting a piece clears the Inspector instead of leaving stale player information visible.
- Selecting the ball displays a football icon and `Match Ball` in the Inspector.
- The movement preview now shows axis symbols: `↔` horizontal, `↕` vertical, `⤡` NW–SE diagonal, and `⤢` NE–SW diagonal.
- Speed-limit previews use `⚠ cost / remaining`; invalid axis or mixed movement previews use `🚫`.
- A selected player that already locked an axis in Match Mode shows a small persistent axis badge beside the piece.

## v14.1 — Selection and multiplayer match-rule fixes

- Clicking or tapping the currently selected player or ball now deselects it.
- Deselecting clears the destination highlight and the movement-cost badge, so another piece can be selected immediately.
- Fixed multiplayer guests remaining effectively in Editor Mode when the shared tracker window was disabled.
- Editor Mode / Match Mode is now treated as a session-wide rule independent of tracker visibility.
- The host remains the only user allowed to change the session mode; the guest button stays visible but disabled.
- Guest movement validation now uses the host-selected Match Mode, including Speed, movement axis, remaining movement, occupied cells, and mixed-movement restrictions.
- Multiplayer moves now write the board position and per-turn movement consumption together in one Firebase update. This prevents the movement allowance from being consumed while the piece position fails to update.
- The synchronized movement-state ref is updated immediately on every session snapshot, avoiding stale rule validation after a host or guest move.

## v14.0 — Editor Mode / Match Mode

- Added a host-authoritative Editor Mode / Match Mode control next to Tracker Settings.
- Editor Mode keeps free sandbox movement and shows only the straight/diagonal movement cost under the cursor. Mixed destinations show an em dash.
- Match Mode reads the assigned card's numeric `Speed` passive attribute.
- The first movement of each player in a turn locks one axis: horizontal, vertical, NW–SE diagonal, or NE–SW diagonal. The player may reverse direction on that same axis.
- Movement cost accumulates across multiple selections during the same turn. Diagonal cost follows `1, 3, 4, 6, 7, 9...`.
- Illegal moves are blocked and display a single `OK` dialog. There is no Ignore option.
- Starting/restarting a tracked game and changing tracker turn reset all per-player movement usage.
- Undo/Redo snapshots include both piece positions and per-turn movement state.
- Game mode and movement state persist in cloud saves and synchronize in multiplayer.

## v13 interaction changes retained

- Click or tap a player or the ball to select it.
- Click or tap a destination cell to move the selected piece.
- A player may share a cell with the ball but not with another player.
- Desktop board panning begins after a 5 px drag threshold and preserves selection.
- Touch uses one finger for selection/movement and two fingers for board pan/zoom.
- Grid snapping is always enabled.
- Undo and Redo are available in the top controls.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```
