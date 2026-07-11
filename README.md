# Final Board v9.5 — Layout Style Tools

Stable build based on v9.4.1.

## Changes

- Added **Copy Layout Style** for the currently selected layout.
- Added **Paste Layout Style** for the equivalent layout on another card.
- Added **Apply Layout Style To All Cards** to propagate one layout presentation across the complete card library.
- Copies layout position, size, font, font size, alignment, weight, colors, and other visual settings that belong to that layout.
- Does **not** copy player values or content: name, position, attributes, bonuses, Preferred Foot selection, Special Ability text, images, or star count remain card-specific.
- Updates existing equivalent layouts instead of creating duplicate layouts.
- Front star layout propagation preserves each card's star count while copying only visual star sizing/spacing/offset settings.
- Custom layouts are supported when the equivalent custom layout already exists on the destination card.
- Keeps v9.4.1 Preferred Foot behavior, Storage V2 backups, separate Firestore card documents, and reliable multiplayer card-assignment synchronization.
- README, in-app version, `package.json`, and ZIP filename identify v9.5.

## Firestore

- Personal board state: `/users/{uid}/footballBoard/mainStateV2`
- Personal cards: `/users/{uid}/footballBoardCards/{cardId}`
- Multiplayer sessions: `/sessions/{sessionId}`
- Live multiplayer assignments: `cardAssignments` inside the session document

## Backup format

Native Storage V2 backup remains unchanged and automatically includes the copied layout styles stored on each card.
