# Final Board v12.4 — Manual Possession Tracker

Stable source build of the Football Board Sandbox.

## v12.4 changes

- Removed the automatic attack/defense alternation tied to turn parity.
- Advancing or revisiting a turn now resets the action circles while preserving the current possession.
- Added a centered **Change Possession** control between **Restart Game** and **Reset Trackers**.
- **Change Possession** swaps the attacking and defending teams immediately and resets both action trackers.
- The attacking team is still selected explicitly when starting or restarting a tracked game.
- Multiplayer synchronization remains host-controlled: guests see possession changes in real time but cannot modify them.

## Preserved v12.3 behavior

- The **INACTIVE / ACTIVE** control appears in the Inspector's top piece-information row.
- Reactivated players restore their Inspector card immediately.
- Inactive players are translucent, selectable but immovable, and excluded from defensive-area display.
- Each multiplayer team can change inactive status only for its own pieces.

## Preserved tracker and multiplayer behavior

- Host-controlled multiplayer Tracker with guest read-only synchronization.
- Guest-local Tracker move, resize, minimize, and hide behavior.
- Responsive compact layout, sequential turns, completed-turn highlighting, and manual action tracking.
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
