# Final Board v9.4 — Preferred Foot

Stable build based on v9.3.

## Changes

- Added a new **Preferred Foot** card field with three options: `Left`, `Right`, and `Both`.
- Added the Preferred Foot editor section after **Bonuses** and before **Special Ability**.
- Added the same **Text Color** and **Text** controls used by the Bonuses text.
- Card backs now display `Preferred Foot: Left`, `Preferred Foot: Right`, or `Preferred Foot: Both`.
- Moved the previously unused **Bonuses Front** layout from the card front to the card back for Preferred Foot.
- Preserved the old layout box position and all existing move/resize/layout behavior during migration.
- Kept the front stars layout unchanged.
- Renamed backup controls to **Export Cards & Board** and **Import Cards & Board**.
- Keeps native Storage V2 backups, separate Firestore card documents, and reliable multiplayer card-assignment synchronization.
- README, in-app version, `package.json`, and ZIP filename identify v9.4.

## Firestore

- Personal board state: `/users/{uid}/footballBoard/mainStateV2`
- Personal cards: `/users/{uid}/footballBoardCards/{cardId}`
- Multiplayer sessions: `/sessions/{sessionId}`
- Live multiplayer assignments: `cardAssignments` inside the session document

## Backup format

The native Storage V2 backup now also includes the `preferredFoot` field and its visual settings directly inside every card document.
