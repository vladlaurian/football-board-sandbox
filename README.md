# Final Board v13.0 — Ruler Session Cleanup Fix

Stable source build of the Football Board Sandbox.

## v13.0 changes

- Fixed intermittent ruler panels that could remain visible and become impossible to close after a multiplayer session ended, disappeared, or was left.
- Centralized local ruler cleanup in `leaveSession()` so every session-exit path clears ruler visibility, ownership, measurement points, drag state, and resize state.
- Reset the session-ending guard only after the local session code has been cleared, preserving protection during teardown without blocking later offline ruler use.
- Added a visible session status when closing the shared ruler fails, while preserving the existing multiplayer ownership and Firestore authority model.
- Shared ruler payloads, host/guest permissions, board state, tracker, cards, inspector, and export flows remain unchanged.

## v12.5 changes

- Added persistent cloud storage for the functional Match Tracker state.
- The saved tracker state now includes whether the tracker is enabled, whether a tracked game has started, current possession/attacking team, current turn, used actions for both teams, and tracker settings.
- Tracker changes now mark the cloud state as changed so they are included in autosave.
- Added one shared tracker-normalization path for cloud restoration and multiplayer snapshots.
- Kept multiplayer authority unchanged: live sessions still use only the dedicated `sharedTracker` document field, with host control and guest read-only behavior.
- Cloud restoration does not write into or override an active multiplayer tracker.
- Tracker window position, size, minimize state, and guest-local visibility remain local UI preferences.
- Removed an invalid residual `sharedAssignments` reference from personal cloud restoration.

## Preserved v12.4 behavior

- Manual possession control remains independent of turn parity.
- Advancing or revisiting a turn resets action circles while preserving possession.
- **Change Possession** swaps attacking and defending teams and resets both action trackers.
- The attacking team is selected explicitly when starting or restarting a tracked game.
- Multiplayer synchronization remains host-controlled: guests see tracker changes in real time but cannot modify them.

## Preserved card and sandbox behavior

- Inspector Front / Back memory and private multiplayer flip permissions.
- Session card subcollection architecture and protected host End Session behavior.
- Card editor, inspector, imported graphics, front/back rendering, and export logic are unchanged by this build.
- Board, pieces, formations, dice, ruler, snap, coordinates, and cloud card storage retain their existing architecture.

## Run

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```


## v13.0
- Click/tap a player or ball, then click/tap a destination cell to move.
- Desktop board pan starts only after a 5 px drag threshold and preserves selection.
- Touch board pan/zoom uses two fingers; one-finger taps select and move.
- Player pieces cannot enter a cell occupied by another player; the ball can share a player cell.
- Touch double-tap on a player opens label editing; desktop double-click remains available.
- Grid snapping is always enabled; Snap Off and its saved/session state were removed.
- Added Redo alongside Undo.
