# Continuation prompt — v20.28.1

We are continuing the Football Board Sandbox Game Engine migration from build `v20.28.1`.

Read in full before proposing or implementing anything:

1. `README.md`
2. `docs/GAME_ENGINE_ARCHITECTURE.md`
3. `docs/GAME_ENGINE_MIGRATION_PLAN.md`
4. `docs/ARCHITECTURE_DECISIONS.md`
5. `docs/ACTION_RESOLUTION_ENGINE.md`

Non-negotiable rules:

- Automated multiplayer work remains frozen. Manual Multiplayer must remain unchanged.
- No implementation before inspection, a narrow proposal, and explicit user approval.
- Do not make cosmetic refactors, renames, broad moves, or formatting-only edits.
- Every build must have one testable architectural objective, updated documentation, exact manual tests, focused tests, a ZIP with files directly at root, and a complete next-chat prompt.

Current Single Player contract:

- MatchState at the Timeline cursor is the official gameplay state; MatchContext is frozen per match.
- UI sends commands. The pure Engine validates and returns state plus semantic event. Controller writes Timeline. React only presents Timeline state.
- Offline Pass start, target, route, interceptor choice, interception-roll input, and cancellation are Engine-owned.
- `PASS_INTERCEPTION_ROLL_SUBMITTED` consumes the exact requested D20 RollEvent and ends at `awaiting-interception-resolution`. The existing delayed UI resolver still calculates the outcome temporarily.
- Normal dice controls are disabled in offline Match Mode unless a mechanic requests that exact roll. `EXTRA_ROLL_SUBMITTED` is a visible administrative Timeline/AI event, consumes no Tracker action and cannot answer a pending mechanic request.
- Goalkeepers block pass routes but the separate goalkeeper-target prohibition is still deferred.

v20.28.1 correction:

- v20.28.0 had a blank-screen startup regression because the presentation-only Extra Roll reset Hook referenced `sessionCode` before its state declaration. v20.28.1 only relocates that Hook. No gameplay, Engine, Timeline, dice, Editor, or Manual Multiplayer rule changed.

Recommended next step, subject to approval:

- Audit and propose one narrow Engine-owned Pass interception-outcome-resolution slice. Do not silently include later interceptor advancement, final Pass completion, possession/turn reset, Natural 20 Bonus Action, or goalkeeper-target restriction.

Verification completed for v20.28.1:

- React startup smoke test passed.
- `npm run build` passed with installed dependencies.
- Focused Engine/Controller/AI tests passed: 83/83.
- The build environment must install dependencies before using `npm` commands; no `node_modules` directory belongs in the release archive.
