# Final Board v12.5 — Tracker Persistence Fix

Stable source build of the Football Board Sandbox.

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
