# Continuation prompt — v20.21.0

We are continuing the Football Board Sandbox Game Engine migration from build `v20.21.0`.

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
- The release archive must place project files directly at the ZIP root; never wrap it in an additional top-level project folder.

Current architecture:

- MatchState at the Timeline cursor is canonical Single Player gameplay state.
- MatchContext is frozen per tracked match.
- UI sends commands; the pure Game Engine validates and returns next state plus semantic event; the Single Player Controller records Timeline; React renders Timeline state.
- Firebase must not gain game rules. Manual Multiplayer retains legacy paths until explicitly reopened.

Completed migrations:

- v20.13: Free Ball
- v20.14–v20.16: Normal MOVE and direct-board entry
- v20.17: 3/2
- v20.18: shared physical path blocking
- v20.19: Free Move
- v20.20–v20.20.1: Group Move Engine and UI/turn closure
- v20.21.0: Bonus Action foundation, origin chain, offline locks, and 3/2 during Bonus Action

Bonus Action contract:

- Bonus Action is canonical `actionContinuation`, never Tracker economy.
- It permits exactly one individual card action: MOVE, PASS, DRIBBLE, CROSS, SHOT, or TACKLING. GROUP MOVE is excluded.
- It ends voluntarily only through `END B.A.`; End Turn, Free Move, Free Ball, normal actions, and Group Move are blocked in offline Single Player while it exists.
- A new exceptional result can replace the active Bonus Action. It does not stack; the old resume policy never executes. The replacement stores `origin.parentContinuationId`.
- `source` remains as legacy compatibility data. Structured `origin` holds action type, outcome, reason, source Timeline entry, and optional parent continuation.
- 3/2 is independent of MOVE and Tracker. The Bonus Action owner can use it even outside the current Tracker phase if all existing 3/2 rules pass. It does not consume or end Bonus Action.
- Manual Multiplayer behavior remains unchanged.

Mandatory next scope — `v20.21.1 Bonus MOVE Engine migration`:

- Do not implement before a targeted audit and approved contract.
- Bonus MOVE must use Engine commands and Timeline, never Tracker.
- It keeps normal MOVE physical rules: Speed, progressive segments, first axis, path blocking, destination occupancy, and ball carry.
- It may finish with unused Speed only through `END B.A.`.
- `CANCEL MOVE` is allowed only before the first physical Bonus MOVE segment; after movement, use `END B.A.` or Undo.
- 3/2 remains available during Bonus MOVE and returns to the same Bonus Action afterward.
- It requires two equivalent offline Single Player entrances: card MOVE and direct-board player selection plus destination. The direct-board entrance is mandatory and must not be omitted.
- Manual Multiplayer remains unchanged.

Verification status for v20.21.0:

- Focused tests passed: `node --test src/engine/*.test.mjs src/match/*.test.mjs src/timeline/aiAnalysisExport.test.mjs src/tracker/*.test.mjs src/multiplayer/freeToolsAuthority.test.mjs src/multiplayer/bonusActionAuthority.test.mjs` (81 passing).
- Full `npm test` has one pre-existing environment failure because dependencies are absent: `src/board/extractedComponents.test.mjs` cannot import `react`.
- `npm run build` cannot run in this archive because `vite` is absent (`node_modules` is not included).
