# Final Board v9.2 — Stable Firestore Storage

Stable post-migration build.

- Uses only `/users/{uid}/footballBoard/mainStateV2` for personal board state.
- Stores cards separately in `/users/{uid}/footballBoardCards/{cardId}`.
- Writes only cards that were created, changed, or deleted since the last cloud load/save.
- Keeps Export Full Backup and Restore Full Backup.
- Full backups from v9.0.1 and v9.1 remain compatible.
- Multiplayer session storage under `/sessions/{sessionId}` is unchanged.
- The legacy `mainState` document is not read, modified, or deleted.
