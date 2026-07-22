# Continuation prompt — v20.36.0

Continue the Football Board Sandbox Game Engine migration from `v20.36.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Workspace persistence is separate from Match Runtime. `WorkspaceSnapshot` owns future-Match setup; Cloud/backup never restores partial Match state. Active offline Match blocks Workspace save/autosave/import.
- `workspaceOperations.mjs` owns pure board/formation/scenario/Rule Set/card-assignment operations. `cardLibraryOperations.mjs` owns card upsert, clone preparation, deletion/detachment and Reset Cards.
- The visual Card Editor remains in `main.jsx` through the centralized `updateCardState` path. It has not been moved cosmetically.
- Manual Multiplayer remains an untouched legacy Firebase path.

## Next direction, subject to a fresh narrow proposal

Phase 8C.2c: audit whether Card Editor visual composition can be extracted into an explicit UI component boundary without duplicating card state or moving JSX only for appearance. Then complete the pre-mechanics audit of every direct Match Runtime mutation still in `main.jsx`. Do not implement a new gameplay mechanic before these audits are resolved.

## v20.36.0 verification

- Focused Workspace tests: `node --test src/workspace/*.test.mjs` — 8 passing.
- Full verification remains required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.36.0

1. In Editor Mode create a new card, edit its name, close and reopen Cards; confirm it remains saved.
2. Clone a card with a custom local front/back image. Confirm the clone has a new name and no copied local image data, while the original is unchanged.
3. Assign one card to a player, then delete that card. Confirm the player has no card, no other player loses a different card, and the card disappears from Card Library.
4. Assign cards to several players, press Reset Cards and confirm every player loses only their assignment; cards remain in Card Library.
5. Start an offline Match. Confirm Create, Clone, Delete, Assign, Remove and Reset Cards remain locked as before.
6. Confirm a normal Manual Multiplayer session retains its established card assignment/removal behavior.
