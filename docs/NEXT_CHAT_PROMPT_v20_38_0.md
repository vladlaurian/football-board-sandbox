# Continuation prompt — v20.38.0

Continue the Football Board Sandbox Game Engine migration from `v20.38.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Workspace persistence is separate from Match Runtime. `WorkspaceSnapshot` owns future-Match setup; Cloud/backup never restores partial Match state. Active offline Match blocks Workspace save/autosave/import.
- `workspaceOperations.mjs` and `cardLibraryOperations.mjs` own pure structural Workspace/Card Library transformations.
- `CardVisualCanvas.jsx` is the shared visual renderer. `CardEditorPanel.jsx`, `CardsPanel.jsx` and `AssignCardModal.jsx` own the three card-workspace UI surfaces through controller props supplied by `main.jsx`.
- `main.jsx` retains the existing card state, Workspace/card-library callback adapter, browser file handling and legacy Manual Multiplayer synchronization; it does not contain the three extracted surface components.
- Manual Multiplayer remains an untouched legacy Firebase path.

## Next direction, subject to a fresh narrow proposal

Complete the pre-mechanics audit of every direct Match Runtime mutation still in `main.jsx`. Classify each one as Engine-owned already, a remaining migration candidate, an Editor-only Workspace operation, or an intentionally retained Manual Multiplayer legacy path. Do not implement a new gameplay mechanic before that audit is reviewed and approved.

## v20.38.0 verification

- The extracted-component test renders CardPreview Front and Back, CardEditorPanel, CardsPanel and AssignCardModal through Vite.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.38.0

1. In Editor Mode, open Cards, select several cards, and inspect Front and Back. No black screen may appear.
2. Edit a normal field, a stat value, Special Ability and Defensive Area; close/reopen Cards and confirm the changes remain.
3. Create a card, clone it, delete the clone and confirm the original remains unchanged. If the original uses an imported graphic, the clone continues to use that imported graphic as before.
4. In Card Library, filter and sort cards. Verify Create, Clone and Delete retain their previous behavior.
5. Import a graphic, delete a graphic, import/export JSON, and export Front/Back PNG for an existing card.
6. Open Blue Team and Red Team rosters; assign, remove and edit a card through the existing buttons.
7. Open Assign Card from the Inspector; filter, sort, select a card, Flip its preview and Assign it.
8. Start an offline Match and confirm all Workspace card mutations remain locked exactly as before.
9. In an ordinary Manual Multiplayer session, check card preview, assign, remove and normal library behavior. Do not test or alter automated multiplayer behavior.
