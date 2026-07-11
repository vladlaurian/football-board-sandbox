# Final Board v9.2.3 — Reliable Multiplayer Card Assignment Sync

Stable build based on v9.2.1, replacing the unsuccessful v9.2.2 assignment patch.

## Changes

- Fixed live card assignment synchronization between host and guest.
- Card assignments now use a dedicated session field instead of depending on full-board autosave timing.
- Prevents an older in-flight board save from overwriting a newer card assignment.
- Existing assignments stored in older session board data remain compatible.
- Removed the obsolete dirty-card assignment save path introduced by v9.2.2.
- Keeps the v9.2.1 Full Backup restore hotfix.
- Displays `v9.2.3` in the application header.
- `package.json`, ZIP filename, README, and in-app version now match.

## Firestore

- Personal board state: `/users/{uid}/footballBoard/mainStateV2`
- Personal cards: `/users/{uid}/footballBoardCards/{cardId}`
- Multiplayer sessions: `/sessions/{sessionId}`
- Live multiplayer assignments: `cardAssignments` inside the session document

## Compatibility

- Full backups from v9.0.1 and later remain supported.
- Multiplayer session library and existing assigned cards remain supported.
- Legacy personal `mainState` is not read, modified, or deleted.
