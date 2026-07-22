# Continuation prompt — v20.44.0

Continue the Football Board Sandbox from `v20.44.0`.

## Mandatory constraints

- Automated Multiplayer remains frozen. Do not repair Host Authority, Firebase synchronization, automated multiplayer mechanics, or Manual Multiplayer behavior.
- Manual Multiplayer is a retained legacy compatibility path and must remain unchanged.
- Do not implement anything before reading the complete documentation, inspecting relevant code/tests, proposing one narrow scope, and receiving explicit user approval.
- No cosmetic refactor, renaming, reformatting or file movement without a clear architectural purpose.
- Each build must be independently testable, update canonical documentation, include exact manual tests, a root-level ZIP excluding `node_modules`, `dist` and `package-lock.json`, and a complete continuation prompt.

## Current architecture and presentation boundary

- Single Player Match uses Game Engine, pure Controller, Timeline and one UI command gateway. The active Timeline cursor owns MatchState; MatchContext freezes gameplay inputs at Match start.
- Manual Multiplayer was audited as a frozen hybrid legacy system. Retain its working manual lifecycle and synchronization; do not change it before a separate approved clean-room phase.
- `BoardCanvas` has a view-only `presentationMode`: offline Single Player Match supplies `match`; Editor and frozen Manual Multiplayer supply `editor`.
- v20.44 adds `match-ui-presentation` to the offline Match app shell only. It is a CSS presentation route for existing Tracker, Dice, History, notices and prompts; it must not own their state, layout controls or callbacks.
- Board selection derives only a visual selected-team wrapper class from the already-selected piece. Blue/Red/Ball colors never change selection, input or game state behavior.

## Next direction, subject to a fresh narrow proposal

The approved Match Presentation Mode 2.5D roadmap is complete through board, pucks, interaction feedback and floating Match panels. Before further visual work, review user feedback and decide whether the next priority is a visual refinement, a new gameplay mechanic, or the broader post-engine separation/audit phase. Do not assume a new scope.

## v20.44.0 verification

- BoardCanvas component render coverage asserts the Match presentation and Blue selected-team class.
- Full verification is required before delivery: `npm test` and `npm run build`.

## Exact manual tests for v20.44.0

1. In Editor Mode, confirm pieces, ball, selection, Tracker, Dice, History and prompts retain their previous appearance.
2. In Single Player Match, put the ball on a player and confirm it is opaque, premium and independently selectable.
3. Select Blue, Red and Ball in turn. Normal selection must use Blue, Red and neutral-white highlights; the old yellow normal highlight must not appear.
4. Verify existing special feedback stays distinct: Move legal/illegal, Pass routes, Group Move, INACTIVE, Free tools and Bonus Action.
5. Open Tracker, Dice and History in Match. Confirm the glass presentation is visible but drag, resize, minimize, close and all existing controls still work.
6. Trigger a turn prompt, action prompt, dice notice and Match Over. Confirm their Match presentation is visible and their buttons work as before.
7. Test Undo/Redo, End Turn and automatic turn change.
8. Create or join an ordinary Manual Multiplayer session. It must retain the existing visuals and manual behavior. Do not test or alter automated multiplayer behavior.
