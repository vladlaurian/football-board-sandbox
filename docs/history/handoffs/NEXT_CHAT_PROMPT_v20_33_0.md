# Continuation prompt — v20.33.0

Continue the Football Board Sandbox Game Engine migration from `v20.33.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting the relevant code and tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete prompt for a new chat.

## Current architecture

- Offline Single Player Match mechanics already Engine-own Move, 3/2, Free Ball, Free Move, Group Move, Bonus Move, Match lifecycle, Bonus Action closure, Extra Roll and the complete Pass/Interception/Natural 20 flow.
- MatchState at the active Timeline cursor is authoritative. MatchContext freezes Rule Set, board geometry and gameplay cards at Match start.
- `src/engine/singlePlayerController.mjs` is pure: Engine command to Timeline result. `src/engine/singlePlayerMatchGateway.mjs` is the only offline Match UI gateway: it calls that Controller and publishes only an accepted Timeline/cursor-state pair. `main.jsx` retains only React projection and presentation follow-up.
- v20.32.0 completed Phase 8A: activity, tracker safety controls and manual declarations are Engine-owned; setup-changing Editor Workspace operations lock after offline Match start.
- v20.33.0 completed Phase 8B: all existing offline Match command, sequence and Match-start routes share the command gateway and no handler repeats Timeline replacement plus React projection.
- Goalkeeper route blocking is Engine-owned. The separately approved goalkeeper-as-Pass-target prohibition remains deferred.

## Next approved direction, subject to a fresh narrow proposal

Proceed to **Phase 8C — Editor Workspace and persistence boundary**. First audit the Editor-only setup, scenario, formation, card-profile and local/cloud persistence paths around `main.jsx`. Propose the smallest boundary that preserves unrestricted Editor behavior, never recreates a competing active Match authority, and does not touch Manual Multiplayer. This is the intended point to discuss the user’s deferred menu/editor changes, but do not implement those changes without a specific approval.

## v20.33.0 verification already completed

- `npm test` — 223 passing.
- `npm run build` — passed; existing Vite bundle-size warning only.

## Exact manual tests for v20.33.0

1. Start an offline Match. Make a normal MOVE, then Undo and Redo. Confirm board, Tracker, History cursor and selected state restore exactly as before.
2. Use direct-board MOVE: select a player and make its first segment by clicking the board. Confirm it still creates the correct Move history and consumes exactly one normal Tracker action.
3. Start a PASS, choose a target and route, then cancel a still-cancellable Pass. Confirm the normal action is restored and History/Undo/Redo remain correct.
4. Create a Bonus Action and use Bonus MOVE, including one partial segment followed by `END B.A.`. Confirm it uses no Tracker dot and the next permitted turn behavior remains unchanged.
5. Use one administrative route in offline Match: Free Move or Change Possession. Confirm it enters History and Undo/Redo restores the correct canonical state.
6. Start or restart an offline Match from Tracker. Confirm the Match-start History entry, opening team and first turn are correct.
7. Confirm an ordinary Manual Multiplayer session retains its established behavior.
