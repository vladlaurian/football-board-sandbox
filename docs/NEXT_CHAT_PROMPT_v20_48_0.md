# Continuation prompt — v20.48.0

Continue the Football Board Sandbox from `Final_Board_v20_48_0_personal_action_limits.zip`.

## Confirmed state

- Runtime is `v20.48.0`.
- Phase 8 and Phase 9 of the Single Player Engine migration are complete; Phase 9 did not reopen Multiplayer.
- Offline Single Player Match has one canonical MatchState at the active Timeline cursor. Game commands travel through the Single Player Controller into the pure Engine.
- `MatchContext` freezes the Rule Set, board settings and compact gameplay cards at Match start.
- Timeline, Undo/Redo, Replay recording and AI Analysis Export use the same canonical state/history.
- The Match visual presentation is frozen. Do not resume visual/2.5D work unless the user explicitly asks.
- Full verification at this handoff: `npm test` = 233 passing; `npm run build` passes.

## Latest approved rule: Personal Action Limits

Read `docs/PERSONAL_ACTION_LIMITS.md` before changing action economy.

- Attack: maximum 3 personal actions per player / numbered turn.
- Defense: maximum 2 personal actions per player / numbered turn.
- Actions may be non-consecutive.
- `tracker.personalActionsByPieceId` is canonical MatchState in offline Single Player.
- Normal MOVE, normal PASS, each actual Group Move participant and normal manual DRIBBLE/SHOT/CROSS/TACKLING declarations consume one.
- 3/2, Bonus Action, Free Move, Free Ball, Extra Roll and Group Move activation itself do not consume one.
- The count resets only at a new numbered turn, Match restart, Reset Trackers or Change Possession.
- Inspector panel: automatic in offline Match; manual Editor workspace marker. Pucks show green usage dots.
- Manual Multiplayer is excluded both visually and behaviorally.

## Hard boundaries

- Automated Multiplayer remains frozen. Do not repair Host Authority, synchronization, Firebase multiplayer rules or automated multiplayer mechanics.
- Manual Multiplayer remains unchanged. Do not refactor, extract or alter it without a separately approved clean-room phase.
- Editor Mode is an unrestricted future-Match workspace and must not be forced through Match gameplay rules.
- Do not silently change game rules, rename stable code, reformat files or make unrelated cleanup.

## Next likely task, subject to fresh approval

Propose `DRIBBLE` as a narrow Engine-first contract:

1. exact MatchState/MatchContext inputs;
2. commands, semantic events and resolution stages;
3. Tracker, Personal Action and Bonus Action behavior;
4. dice/manual-roll contract, legality and consequences;
5. Timeline/Undo/Redo/Replay/AI semantics;
6. UI only submits commands and renders canonical state;
7. explicit exclusions: no Multiplayer changes, no unrelated visual work, no Shot/Cross/Tackling bundle.

Do not implement it until the user approves the proposed contract and build scope.
