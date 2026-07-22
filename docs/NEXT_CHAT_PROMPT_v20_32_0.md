# Continuation prompt — v20.32.0

Continue the Football Board Sandbox Game Engine migration from `v20.32.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting the relevant code and tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete prompt for a new chat.

## Current architecture

- Offline Single Player Match mechanics already Engine-own Move, 3/2, Free Ball, Free Move, Group Move, Bonus Move, Match lifecycle, Bonus Action closure, Extra Roll and the complete Pass/Interception/Natural 20 flow.
- MatchState at the active Timeline cursor is authoritative. MatchContext freezes Rule Set, board geometry and gameplay cards at Match start.
- `main.jsx` remains UI/orchestration, but it must not independently validate or mutate accepted offline Match gameplay state.
- v20.32.0 completed Phase 8A, the audited live Match boundary:
  - `PIECE_ACTIVITY_CHANGED` owns `INACTIVE` / `ACTIVE` in offline Match.
  - `TRACKER_ACTIONS_RESET` and `TRACKER_POSSESSION_CHANGED` own the temporary testing safety controls. Keep them available until the user explicitly retires them.
  - `MANUAL_ACTION_DECLARED` and `BONUS_MANUAL_ACTION_DECLARED` own temporary manual declarations for SHOT, CROSS, DRIBBLE and TACKLING. They consume the correct normal/Bonus action but intentionally resolve no board effect. AI Export identifies them as manual declarations requiring manual resolution.
  - After an offline Match starts, setup-changing Editor Workspace operations are locked. Editor Mode remains unrestricted; Manual Multiplayer is unchanged.
- Goalkeeper route blocking is Engine-owned. The separately approved goalkeeper-as-Pass-target prohibition remains deferred.

## Next approved direction, subject to a fresh narrow proposal

Proceed to **Phase 8B — Controller gateway and state-projection boundary**. Audit the repeated offline command dispatch → Timeline commit → React projection paths in `main.jsx`. Propose the smallest extraction that creates one explicit Single Player gateway and one canonical projection boundary, without changing game rules, Editor behavior or Manual Multiplayer. Do not start Phase 8C Editor Workspace/persistence separation or the deferred menu/editor changes unless explicitly approved after 8B.

## v20.32.0 verification already completed

- `npm test` — 221 passing.
- `npm run build` — passed.

## Exact manual tests for v20.32.0

1. In offline Match, toggle a carded player to `INACTIVE`, then `ACTIVE`. Confirm History has one entry each time; Undo/Redo changes the player state correctly. In Editor Mode, confirm the existing INACTIVE control still works.
2. Start offline Match, make at least one action, then press `Reset Trackers`. Confirm action dots/logs and movement authorization reset, History shows the reset, and Undo restores the prior state.
3. Start offline Match, make at least one action, then press `Change Possession`. Confirm the other team attacks in the same numbered turn, action dots reset, History records the change, and Undo/Redo work.
4. In a normal offline Match phase, press DRIBBLE, SHOT, CROSS or TACKLING. Confirm one Tracker dot is consumed, History records a manual declaration, and no puck or ball moves automatically. Export AI Analysis and confirm it identifies a manual declaration/resolution required.
5. Create a Bonus Action. Use one of DRIBBLE, SHOT, CROSS or TACKLING. Confirm no Tracker dot is consumed, the action awaits `END B.A.`, and only `END B.A.` closes the Bonus Action.
6. After `MATCH_STARTED`, confirm board dimensions, formations, scenario loading, card assignment/editing and Tracker Settings are unavailable. Confirm those controls remain available in Editor Mode before Match start.
7. Confirm an ordinary Manual Multiplayer session retains its established behavior.
