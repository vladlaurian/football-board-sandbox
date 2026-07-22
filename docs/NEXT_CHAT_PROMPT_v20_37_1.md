# Continuation prompt — v20.37.1

Continue the Football Board Sandbox Game Engine migration from `v20.37.1`.

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
- `CardVisualCanvas.jsx` owns the shared visual card renderer used by Editor, Inspector, Assign Card and PNG export. Its Front and Back rendering are covered by the extracted-component regression test.
- The Card Editor form, Card Library panel and Assign Card modal remain in `main.jsx`; they are the pending 8C.2c.2 UI boundary.
- Manual Multiplayer remains an untouched legacy Firebase path.

## Next direction, subject to a fresh narrow proposal

Phase 8C.2c.2: extract the Card Editor form, Card Library panel and Assign Card modal through a controller-prop boundary. Keep all data operations in the existing Workspace modules and callbacks. Then complete the pre-mechanics audit of every direct Match Runtime mutation still in `main.jsx`. Do not implement a new gameplay mechanic before these audits are resolved.

## v20.37.1 verification

- Focused extracted-component test renders CardPreview Front and Back through the extracted Canvas.
- Full verification remains required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.37.1

1. In Editor Mode, open Cards and click an existing card. The application must remain visible and show both Front and Back previews.
2. Change between cards in Card Library; confirm no black screen appears.
3. Open Assign Card and inspect a card preview; flip it. Confirm both sides render.
4. Inspect a player card outside the Cards panel; confirm its normal preview/flip behavior remains correct.
5. Export Front PNG and Back PNG for a card.
6. Confirm Manual Multiplayer retains its ordinary card preview and assignment behavior.
