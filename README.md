# Final Board v9.3 — Native Storage V2 Backups

Stable build based on v9.2.3.

## Changes

- Full Backup now exports directly in the current Storage V2 structure.
- Backup contains `mainStateV2` and the separate card documents as `cards`.
- Restore loads the Storage V2 state and cards directly, without legacy backup migration.
- Removed support for the old `state.cardState.cards` full-backup format.
- Old v9.0.1–v9.2.3 backup files are intentionally rejected by v9.3.
- Keeps the reliable multiplayer card-assignment synchronization from v9.2.3.
- Keeps separate Firestore card documents and incremental card writes.
- README, in-app version, `package.json`, and ZIP filename identify v9.3.

## Firestore

- Personal board state: `/users/{uid}/footballBoard/mainStateV2`
- Personal cards: `/users/{uid}/footballBoardCards/{cardId}`
- Multiplayer sessions: `/sessions/{sessionId}`
- Live multiplayer assignments: `cardAssignments` inside the session document

## Backup format

```text
backupType: football-board-storage-v2-backup
backupVersion: 2
storageVersion: 2
mainStateV2: current personal board document
cards: current separate card documents
```

v9.3 accepts only this native Storage V2 backup format.
