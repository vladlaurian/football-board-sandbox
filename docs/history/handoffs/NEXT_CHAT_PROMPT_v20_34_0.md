# Continuation prompt — v20.34.0

Continue the Football Board Sandbox Game Engine migration from `v20.34.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting the relevant code and tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete prompt for a new chat.

## Current architecture

- Offline Single Player Match mechanics use Game Engine, pure Controller, Timeline and the single UI command gateway.
- MatchState at the active Timeline cursor is authoritative. MatchContext freezes Rule Set, board geometry and gameplay cards at Match start.
- v20.34.0 completes Phase 8C.1: `src/workspace/workspaceSnapshot.mjs` defines Workspace persistence separately from Match Runtime. Cloud, full Cards & Board backup and compatibility loading use WorkspaceSnapshot. Legacy storage is readable, but no longer restores old Match fields outside Timeline.
- An active offline Match blocks Cloud Save, autosave and Workspace import. Workspace export uses the frozen Match-start board setup. Match Recording/AI Export remains the only Match persistence path.
- Manual Multiplayer persistence remains a frozen legacy path and is untouched.

## Next approved direction, subject to a fresh narrow proposal

Proceed to **Phase 8C.2 — Editor Workspace UI/controller boundary**. Audit the remaining Editor-only handlers in `main.jsx` for board settings, formations, scenarios, cards, Rule Sets and backup UI. Propose a cohesive extraction that uses the new WorkspaceSnapshot contract, keeps Editor unrestricted outside Match, and does not touch Manual Multiplayer or gameplay rules.

Before or after 8C.2, perform the separately approved documentation consolidation audit: retain active architecture/rule documents, retain only the current continuation prompt in source, and explicitly classify historical Multiplayer documents before moving or deleting anything. Do not delete historical documentation without a specific approved plan.

## v20.34.0 verification already completed

- `npm test` — 225 passing.
- `npm run build` — passed; existing Vite bundle-size warning only.

## Exact manual tests for v20.34.0

1. In Editor Mode, change a visible setup value (for example a formation or a board setting), press Cloud Save, refresh/reopen the app, then Cloud Load if necessary. Confirm the Editor setup persists.
2. In Editor Mode, export `Cards & Board`, change the board or a card, then import the exported file. Confirm the setup and card assignment return correctly.
3. Start an offline Match, move a player, then confirm Cloud Save and Cards & Board import are disabled. Confirm Match Recording export remains available as before.
4. During that active Match, export `Cards & Board`; finish/leave the Match and import that backup. Confirm the restored board is the Match-start setup, not the player position after the Match move.
5. Start an offline Match and verify Tracker progress, Undo/Redo and normal mechanics remain unchanged.
6. Confirm an ordinary Manual Multiplayer session retains its established behavior.
