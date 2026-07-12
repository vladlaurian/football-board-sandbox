# Final Board v11.0 — Separate Position and Card Resets

Stable build based on v10.0.

## Changes

- Renamed the existing **Reset** control to **Reset Position**.
- **Reset Position** keeps its existing board-reset behavior while preserving every card assignment on the same puck ID.
- Added **Reset Cards** immediately after **Reset Position**.
- **Reset Cards** detaches all cards from all pucks without moving the pucks, ball, formations, or any other board element.
- Resetting cards does not delete cards from the card library.
- Multiplayer card assignments are explicitly synchronized when **Reset Cards** is used, so host and guest see the detach operation immediately.
- Position reset uses the current session card library when needed, preserving assignments made by either host or guest.
- Keeps editor, inspector, image export, Storage V2 backups, layout-style tools, and v10.0 Preferred Foot rendering unchanged.
- README, in-app version, `package.json`, and ZIP filename identify v11.0.

## Firestore

- Personal board state: `/users/{uid}/footballBoard/mainStateV2`
- Personal cards: `/users/{uid}/footballBoardCards/{cardId}`
- Multiplayer sessions: `/sessions/{sessionId}`
- Live multiplayer assignments: `cardAssignments` inside the session document

## Backup format

Native Storage V2 backup remains unchanged.
