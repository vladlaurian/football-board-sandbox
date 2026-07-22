# Continuation prompt — v20.28.0

We are continuing the Football Board Sandbox Game Engine migration from build `v20.28.0`.

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

Completed Pass boundary:

- In offline Single Player Match Mode, `PASS_STARTED`, `PASS_TARGET_SELECTED`, `PASS_ROUTE_CONFIRMED`, `PASS_INTERCEPTOR_SELECTED`, `PASS_INTERCEPTION_ROLL_SUBMITTED`, and `PASS_CANCELLED` are Engine commands.
- Route confirmation creates the canonical plan. Interceptor selection validates and records the canonical equal-priority choice. Roll submission validates the exact pending D20 request and unique RollEvent, consumes it, records its raw value and creates the existing delayed-resolution handoff.
- The Engine-owned raw roll ends at `awaiting-interception-resolution`; the existing downstream delayed resolver still computes the outcome temporarily.
- Pass roll input does not yet calculate outcome, move the ball, change possession, apply Natural 1/Natural 20, advance the reaction chain or create/close a Bonus Action.
- Normal Pass transitions are stepwise History; Bonus Pass transitions remain atomic with the continuation. Tracker economy is consumed only once at route confirmation.

Dice boundary:

- In offline Match Mode, normal team-roll buttons are disabled unless an active mechanic requests that exact team roll.
- `EXTRA ROLL` beside the die selector arms exactly one explicit administrative random or chosen roll. It closes after use, creates `EXTRA_ROLL` in Timeline/AI analysis, consumes no Tracker action and cannot satisfy or resolve a gameplay action.
- Editor Mode and Manual Multiplayer retain legacy dice behavior.

Deferred goalkeeper target rule:

- A frozen gameplay card with `position: "GK"` must not be selectable as a requested Pass target, whether it belongs to the passer's team or opponent team.
- It is deliberately still unimplemented. It belongs to a separately approved amendment of `PASS_TARGET_SELECTED`; do not silently bundle it into another action migration.
- A goalkeeper already blocks a pass route in offline Single Player: a route that intersects one is grey, unavailable and Engine-rejected before Tracker consumption.

Recommended next architectural target:

- Audit and propose only Engine-owned Pass interception outcome resolution. Decide the narrow command/timer handoff that consumes the already canonical raw roll and applies the established deterministic result for one interceptor.
- Do not silently bundle later interceptor advancement, final Pass completion, possession/turn reset, Natural 20 Bonus Action, or the deferred goalkeeper target rule. If outcome branches require separate transitions, state that explicitly and wait for approval.

Verification status for v20.28.0:

- Focused tests passed: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/timeline/aiAnalysisExport.test.mjs src/match/delayedResolution.test.mjs src/multiplayer/actionStartAuthority.test.mjs` (92 passing).
- Full `npm test` must be rerun in an environment with dependencies installed. In this local workspace, the only known full-suite failure is `src/board/extractedComponents.test.mjs` cannot import `react` because the archive intentionally contains no `node_modules`.
- `npm run build` must be run in an environment with dependencies installed; this local workspace lacks `vite`.

Before proposing the next build, inspect the current build and documentation, compare them, explain the precise scope, and wait for approval. Do not infer a new game-rule change from an apparent bug.
