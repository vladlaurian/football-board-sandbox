# Final Board v10.0 — Preferred Foot Text Rendering Fix

Stable build based on v9.5.

## Changes

- Fixed the lower edge of letters with descenders, such as the `g` in `Preferred Foot: Right`, being visually clipped.
- Removed the Preferred Foot text rules that caused the clipping: forced `line-height: 1`, text-level `overflow: hidden`, and ellipsis clipping.
- Uses a safe single-line height while keeping `Preferred Foot: Left / Right / Both` on one continuous line.
- The correction is applied through the shared card rendering style, preserving visual consistency between editor, inspector, and image export.
- Keeps all v9.5 Layout Style Tools unchanged:
  - **Copy Layout Style**
  - **Paste Layout Style**
  - **Apply Layout Style To All Cards**
- Keeps Storage V2 backups, separate Firestore card documents, and reliable multiplayer card-assignment synchronization unchanged.
- README, in-app version, `package.json`, and ZIP filename identify v10.0.

## Firestore

- Personal board state: `/users/{uid}/footballBoard/mainStateV2`
- Personal cards: `/users/{uid}/footballBoardCards/{cardId}`
- Multiplayer sessions: `/sessions/{sessionId}`
- Live multiplayer assignments: `cardAssignments` inside the session document

## Backup format

Native Storage V2 backup remains unchanged.
