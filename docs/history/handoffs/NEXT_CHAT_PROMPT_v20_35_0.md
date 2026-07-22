# Continuation prompt — v20.35.0

Continue the Football Board Sandbox Game Engine migration from `v20.35.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Workspace persistence is separate from Match Runtime. `WorkspaceSnapshot` owns future-Match setup; Cloud/backup never restores partial Match state. Active offline Match blocks Workspace save/autosave/import.
- `workspaceOperations.mjs` now owns pure structural Workspace planning: board setting, formation apply/save, scenario save, Rule Set commit and card assignment/removal. `main.jsx` is the React/prompt/History adapter for those results.
- Visual card editor controls remain in `main.jsx` because they already converge through `updateCardState`; they were not moved cosmetically.
- Manual Multiplayer remains an untouched legacy Firebase path.

## Next direction, subject to a fresh narrow proposal

Documentation consolidation is complete: active contracts remain at `docs/`, completed handoffs are in `docs/history/handoffs/`, and `CHANGELOG.md` contains compact release history. Do not reopen, move or delete documentation unless a new audit identifies a concrete need.

Next, inspect and propose one narrow architectural extraction. Likely candidates are Phase 8C.2b only if the user is ready to define concrete Editor UI changes, or a pre-mechanics audit of remaining direct Match Runtime paths. Do not implement a new gameplay mechanic before this decision.

## v20.35.0 verification already completed

- `npm test` — 228 passing.
- `npm run build` — passed; existing Vite bundle-size warning only.

## Exact manual tests for v20.35.0

1. In Editor Mode, change each available board setting. Confirm that existing pucks do not move, disappear, change team, or lose/change their card assignment unless the chosen Editor operation explicitly does so. Editor Mode has no Match History.
2. Apply a Blue formation and a Red formation, then save a formation slot. Reload/apply that slot and confirm player positions and card assignments behave as before.
3. Save a Scenario, alter the board, then load the Scenario. Confirm board, cards, die selection and History behavior are unchanged.
4. Create/duplicate/save/load a Rule Set. Confirm active Rule Set and Editor behavior are unchanged; confirm Rule Set editing remains locked during Match.
5. Assign one card, reassign it to another player, then remove it. Confirm one-card-per-player behavior, board state and History remain correct.
6. Start an offline Match and confirm all Workspace setup controls remain locked exactly as in v20.34.0.
7. Confirm an ordinary Manual Multiplayer session retains its established behavior.

## Documentation consolidation completed after v20.35.0

- No runtime code changed.
- README is now orientation/current-release only; compact history is in `CHANGELOG.md`.
- `WORKSPACE_PERSISTENCE.md` is listed as an active contract.
- Historical handoffs are retained under `history/handoffs/`; this file is the sole active handoff.
- Automated Multiplayer documents are explicitly labelled frozen legacy references.
