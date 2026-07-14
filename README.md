# Final Board v12.3 — Inspector Inactive-State Refresh Fix

Stable source build of the Football Board Sandbox.

## v12.3 changes

- Moved the **INACTIVE / ACTIVE** control to the Inspector's top piece-information row.
- The status control now appears immediately before the flip-permission controls and uses the same compact dimensions while preserving its red/green status styling.
- Fixed the Inspector card not returning immediately after an inactive player was reactivated.
- The Inspector card viewport now reattaches its `ResizeObserver` whenever the inspected player's inactive state changes.
- Reactivating the currently inspected player resets the card viewport to neutral zoom and pan so the restored card is immediately visible.
- Removed the old lower status-button render path and its obsolete CSS selectors.
- Removed a duplicated tracker cross-browser CSS normalization block.

## Preserved v12.2 behavior

- Players with attached cards can be marked inactive from the Inspector.
- Inactive players are clearly translucent, remain selectable, and cannot be moved.
- Inactive players do not display a defensive area in either selected-player or full-team D.A. modes.
- The Inspector replaces the card with a clear **INACTIVE** state while the player is inactive.
- In multiplayer, each team can change inactive status only for its own pieces; spectators and opponents cannot use the control.
- Inactive status remains synchronized through the normal shared piece state.

## Preserved tracker and multiplayer behavior

- Host-controlled multiplayer Tracker with guest read-only synchronization.
- Guest-local Tracker move, resize, minimize, and hide behavior.
- Responsive compact Tracker layout, sequential turns, completed-turn highlighting, and manual action tracking.
- Inspector Front / Back memory and private multiplayer flip permissions.
- Session card subcollection architecture and protected host End Session behavior.

## Run

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```
