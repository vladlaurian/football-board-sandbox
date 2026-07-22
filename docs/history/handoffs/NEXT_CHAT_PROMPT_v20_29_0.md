# Continuation prompt — v20.29.0

We are continuing the Football Board Sandbox Game Engine migration from build `v20.29.0`.

Before proposing any implementation, read in full:

1. `README.md`
2. `docs/GAME_ENGINE_ARCHITECTURE.md`
3. `docs/GAME_ENGINE_MIGRATION_PLAN.md`
4. `docs/ARCHITECTURE_DECISIONS.md`
5. `docs/ACTION_RESOLUTION_ENGINE.md`

Non-negotiable constraints:

- Automated multiplayer development remains frozen. Manual Multiplayer remains unchanged.
- Do not implement before inspection, a narrow proposal and explicit user approval.
- No cosmetic refactor, renaming, broad moves or formatting-only edits.
- Every build needs one independently testable objective, updated docs, exact manual tests, focused tests, ZIP files directly at root and a complete new-chat prompt.

Current contract:

- Timeline-cursor MatchState is canonical Single Player state. MatchContext is frozen per match. UI sends commands; pure Engine validates and returns state/events; Controller records Timeline; UI presents it.
- Offline Pass start, target, route, interceptor choice, interception-roll input and cancellation are Engine commands.
- `PASS_INTERCEPTION_ROLL_SUBMITTED` consumes the exact requested D20 RollEvent. After cosmetic waiting, `PASS_INTERCEPTION_RESOLUTION_DUE` validates that same consumed event and calculates its deterministic mathematical result from frozen plan/rules/cards. It records `PASS_INTERCEPTION_RESOLVED`, `lastResolution` and `interception-resolved` state.
- v20.29.0 does not yet migrate ball movement, possession/turn transition, next-interceptor advancement, Pass completion or Natural 20 Bonus Action. The legacy downstream resolver temporarily performs those effects after reading the Engine-owned result.
- Normal dice controls are disabled in offline Match Mode except exact mechanic requests. Extra Roll is an administrative Timeline/AI event; it consumes no Tracker action and cannot answer a pending mechanic request. Its visual control now matches the die selector.
- Goalkeeper route blocking is Engine-owned. Goalkeeper pass-target prohibition remains a separate deferred amendment.

Recommended next audit, subject to approval:

- Isolate one first consequence branch after an Engine-owned interception result. Recommended order: ordinary successful interception only (ball to interceptor, possession/turn change), excluding Natural 20 Bonus Action, Pass completion and next-interceptor advancement.

Verify v20.29.0 before proposing the next build:

- Normal interception, failed interception and Natural 20 still look and behave as before.
- Undo/Redo across the interception roll and its result/consequence still behave as before.
- Extra Roll has the same visual control height/style as the die selector.
- Manual Multiplayer remains unchanged.
- Focused tests passed: Engine/Controller/AI/delayed-resolution suite (98 passing during build). Full suite passed 208/208 and Vite build passed with dependencies installed.
