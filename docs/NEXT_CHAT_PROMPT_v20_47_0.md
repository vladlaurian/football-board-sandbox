# Continuation prompt — v20.47.0

Continue the Football Board Sandbox from `Final_Board_v20_47_0_phase_9_pre_multiplayer_engine_audit.zip`.

## Confirmed state

- Application runtime remains `v20.46.7`; v20.47.0 is a documentation-only Phase 9 audit release.
- Phase 8 and Phase 9 of the Single Player Engine migration are complete.
- Offline Single Player Match has one canonical MatchState at the active Timeline cursor. Commands pass through the Single Player Controller and gateway into the pure Engine.
- MatchContext freezes the Rule Set, board settings and compact gameplay cards at Match start.
- Timeline, Undo/Redo, Replay recording and AI Analysis Export use the same canonical state/history.
- Full verification is green: `npm test` = 231 passing; `npm run build` passes.
- Current Match presentation is frozen. Do not continue visual/2.5D work unless the user explicitly asks.

## Hard boundaries

- Automated Multiplayer remains frozen. Do not repair Host Authority, synchronization, Firebase multiplayer rules or automated multiplayer mechanics.
- Manual Multiplayer remains unchanged. Do not refactor, extract or alter it without a separately approved clean-room phase.
- Editor Mode remains an unrestricted future-Match workspace and must not be forced through Match gameplay rules.
- Do not silently change game rules, rename stable code, reformat files or make unrelated cleanup.

## Audit result

Read `docs/PHASE_9_PRE_MULTIPLAYER_ENGINE_AUDIT.md` before proposing the next phase. It accepts the current Single Player foundation but explicitly does not authorize Multiplayer work.

## Next likely task, subject to fresh approval

Propose the `DRIBBLE` mechanic as a narrow Engine-first contract:

1. exact MatchState/MatchContext inputs;
2. commands, semantic events and resolution stages;
3. Tracker and Bonus Action behavior;
4. dice/manual-roll contract, legality and consequences;
5. Timeline/Undo/Redo/Replay/AI semantics;
6. UI merely sends commands and renders canonical state;
7. explicit exclusions: no Multiplayer changes, no unrelated visual work, no Shot/Cross/Tackling bundle.

Do not implement it until the user approves the proposed contract and build scope.
