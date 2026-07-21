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
- The release archive must place project files directly at the ZIP root; never wrap them in an additional top-level project folder.

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
- v20.20: Group Move and its Rule Set editor

Free Move final contract in v20.19:

- Offline Single Player uses `FREE_MOVE_STARTED`, `FREE_MOVE_COMMITTED`, and `FREE_MOVE_ENDED` through the Engine.
- It is administrative, visible in Timeline, Undo/Redo, Replay, and AI export (`FREE_MODE`, `MANUAL_CORRECTION`), but consumes no Tracker action.
- While active it blocks every other offline Match Mode action and Free Ball.
- It can move the active player any distance, through anything, in any number of segments; it ignores axis, Speed, phase, path, and Tracker restrictions.
- It cannot end on another player, but may share the ball square.
- It moves only the player: the ball never follows, is never picked up, and is never displaced.
- Editor Mode and Manual Multiplayer Free Move remain unchanged.

Group Move final contract in v20.20:

- Pressing GROUP MOVE opens a UI-only, full-width repositionable zone preview; it consumes nothing.
- Confirming the zone dispatches `GROUP_MOVE_ZONE_CONFIRMED`, consumes the final normal action, locks the zone, and records `GROUP_MOVE_ACTIVATED`.
- Eligible players are then moved one at a time through `GROUP_MOVE_PLAYER_COMMITTED`; there is no preselected roster.
- A candidate must begin in the zone, belong to the active team, have no ball, and have no gameplay movement in the turn. Administrative Free Move does not disqualify it.
- Each player moves once; configured defaults are four players, ten-square zone, six-square maximum distance, and strict same direction.
- Group Move may cross players deliberately, but cannot finish on a player or ball. Its first successful move fixes orientation and configured direction. End Turn closes it.
- Rule Set schema is v4 and MatchContext freezes Group Move rules at Match start.

Next recommended scope:

Do not implement immediately. Audit the remaining Bonus Move path and propose its standalone contract. It still uses temporary legacy Single Player validation and must be evaluated separately before migration. Do not reopen automated multiplayer.

Verification status for v20.20:

- Focused tests passed: `node --test src/engine/*.test.mjs src/rules/ruleSets.test.mjs src/tracker/*.test.mjs src/timeline/aiAnalysisExport.test.mjs src/multiplayer/freeToolsAuthority.test.mjs` (58 passing).
- Full `npm test` has one pre-existing environment failure because dependencies are absent: `src/board/extractedComponents.test.mjs` cannot import `react`.
- `npm run build` cannot run in this archive because `vite` is absent (`node_modules` is not included).
