# Continuation prompt — v20.24.0

We are continuing the Football Board Sandbox Game Engine migration from build `v20.24.0`.

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
- v20.21.1: Bonus MOVE Engine, card/direct-board equivalence, and Tracker empty-circle visual clarity
- v20.22.0: Engine-owned End Turn, automatic numbered-turn advance, and normal-MOVE interaction lock
- v20.22.1: inactive-phase card-action presentation lock
- v20.23.0: Engine-owned End B.A. closure and final-turn completion
- v20.24.0: Engine-owned Match start and Match Over presentation

Current Match lifecycle contract:

- `MATCH_STARTED` is the sole offline Single Player Match Mode start command. The Engine validates a valid selected opening team and an unstarted Match; it creates canonical turn one / attack state and resets temporary interaction state.
- Timeline cursor zero intentionally remains the playable opening MatchState. `MATCH_STARTED` remains the audit entry in History; do not change this baseline convention without a separately approved recording/replay migration.
- `TRACKER_PHASE_ENDED` is the sole offline Single Player End Turn command. Attack End Turn enters defense; defense End Turn begins the next numbered turn if one exists; final defense enters `complete`.
- `BONUS_ACTION_ENDED` closes a Bonus Action through Engine. An out-of-range requested next turn enters `complete` rather than clamping back to the final turn.
- `MATCH OVER` is a transient UI popup after a live Engine result from final End Turn or End B.A. reaches `complete`. It is not MatchState and must not display merely when loading, replaying, Undoing, or Redoing a completed state.
- Halves, extra time, penalties and score are deliberately not implemented. They need a future dedicated Match Lifecycle contract; do not introduce fragments of them incidentally.

Bonus Action contract:

- Bonus Action is canonical `actionContinuation`, never Tracker economy.
- It permits exactly one individual card action: MOVE, PASS, DRIBBLE, CROSS, SHOT, or TACKLING. GROUP MOVE is excluded.
- It ends voluntarily only through `END B.A.`. End Turn, Free Move, Free Ball, normal actions, and Group Move are blocked in offline Single Player while it exists.
- `BONUS_MOVE_STARTED`, `BONUS_MOVE_CANCELLED`, and `BONUS_MOVE_COMMITTED` are the canonical Single Player Bonus MOVE commands. Card MOVE may be cancelled only before first physical movement; direct-board Move starts and commits atomically.
- 3/2 is independent and can be used before or during Bonus MOVE by any player who has not already used 3/2 that turn. Do not write or infer a separate inactive-player rule until the product owner defines that state.

Recommended next architectural target:

- Audit and propose Pass initiation and cancellation only (`PASS_STARTED` / `PASS_CANCELLED`) as the first narrow Pass vertical slice. Do not migrate targeting, routes, interceptor choice, dice, resolution or possession in that same build unless explicitly approved after audit.

Verification status for v20.24.0:

- Focused Engine/Controller/Match/Timeline/Tracker tests passed: `node --test src/engine/*.test.mjs src/match/*.test.mjs src/timeline/*.test.mjs src/tracker/*.test.mjs` (111 passing).
- Full `npm test` has one pre-existing environment failure because dependencies are absent: `src/board/extractedComponents.test.mjs` cannot import `react`.
- `npm run build` cannot run in this archive because `vite` is absent (`node_modules` is not included).

Before proposing the next build, inspect the current build and documentation, compare them, explain the precise scope, and wait for approval. Do not infer a new game-rule change from an apparent bug.
