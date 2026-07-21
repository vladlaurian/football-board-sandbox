# Continuation prompt — v20.20.0

We are continuing the Football Board Sandbox Game Engine migration from build `v20.20.0`.

Read these documents in full before proposing or implementing anything:

1. `README.md`
2. `docs/GAME_ENGINE_ARCHITECTURE.md`
3. `docs/GAME_ENGINE_MIGRATION_PLAN.md`
4. `docs/ARCHITECTURE_DECISIONS.md`
5. `docs/ACTION_RESOLUTION_ENGINE.md`

Non-negotiable constraints:

- Automated multiplayer development remains frozen.
- Manual Multiplayer must remain unchanged.
- Do not make cosmetic refactors, renames, formatting changes, or broad moves.
- Propose one narrow, independently testable build and wait for approval before implementation.
- At the end of an approved build, update documentation, provide exact manual tests, run focused tests, report known environment failures separately, archive the build, and provide the next complete continuation prompt.

Current architecture:

- MatchState at the Timeline cursor is the canonical Single Player gameplay state.
- MatchContext is frozen per tracked match.
- UI sends commands; the pure Game Engine validates and returns next state plus semantic event; the Single Player Controller records it in Timeline; React renders Timeline state.
- Firebase must not gain game rules. Manual Multiplayer retains its legacy paths until explicitly reopened.

Completed migrations:

- v20.13: Free Ball
- v20.14–v20.16: Normal MOVE and direct-board entry
- v20.17: 3/2
- v20.18: shared physical path blocking
- v20.19: Free Move
- v20.20: Group Move configuration foundation

Free Move final contract in v20.19:

- Offline Single Player uses `FREE_MOVE_STARTED`, `FREE_MOVE_COMMITTED`, and `FREE_MOVE_ENDED` through the Engine.
- It is administrative, visible in Timeline, Undo/Redo, Replay, and AI export (`FREE_MODE`, `MANUAL_CORRECTION`), but consumes no Tracker action.
- While active it blocks every other offline Match Mode action and Free Ball.
- It can move the active player any distance, through anything, in any number of segments; it ignores axis, Speed, phase, path, and Tracker restrictions.
- It cannot end on another player, but may share the ball square.
- It moves only the player: the ball never follows, is never picked up, and is never displaced.
- Editor Mode and Manual Multiplayer Free Move remain unchanged.

Approved Group Move contract:

- It is selectable only when the active team has exactly one normal Tracker action remaining; it is optional.
- Rule Set fields are frozen in MatchContext: maximum players 4, full-width area length 10, maximum movement 6, reverse movement disabled by default.
- Initial area placement is temporary UI-only: full-width overlay, drag/drop with zoom allowed but pan/player/actions blocked; Cancel leaves no history.
- Confirming the area consumes the final action and starts canonical Group Move. Undo is the only cancellation after confirmation.
- Eligible players are own-team players inside the confirmed area who are not GK, inactive, carrying the ball, or physically moved by gameplay this turn. Free Move does not disqualify them.
- Group-ineligible own players require a distinct visual lock treatment; do not reuse inactive/ghost semantics.
- Each player moves once, up to its frozen maximum. The first segment locks an exact direction; reverse is only the exact opposite if configuration permits it.
- Group Move may traverse players and ball, but may not finish on a player or ball.
- 3/2, Free Move, Free Ball and all other actions are unavailable while Group Move is active; it ends through End Turn.
- Timeline/Undo/Redo/AI must represent one Group Move action and all its segments explicitly.

Next recommended scope:

Do not implement immediately. Audit current Group Move code and propose the complete offline Single Player Engine/UI migration. Replace the legacy offline path only after approval; Manual Multiplayer must remain unchanged.

Separate deferred rule: when Offside is formally defined, a player beginning normal MOVE in offside has both axis and exact direction locked by its first segment for the rest of that normal MOVE. It may still use a subsequently legal 3/2. Do not implement this rule as part of Group Move.

Verification status for v20.19:

- Focused tests passed: `node --test src/rules/*.test.mjs src/engine/*.test.mjs src/timeline/aiAnalysisExport.test.mjs src/multiplayer/freeToolsAuthority.test.mjs` (64 passing).
- Full `npm test` has one pre-existing environment failure because dependencies are absent: `src/board/extractedComponents.test.mjs` cannot import `react`.
- `npm run build` cannot run in this archive because `vite` is absent (`node_modules` is not included).
