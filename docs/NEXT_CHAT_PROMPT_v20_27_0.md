# Continuation prompt — v20.27.0

We are continuing the Football Board Sandbox Game Engine migration from build `v20.27.0`.

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

- In offline Single Player Match Mode, `PASS_STARTED`, `PASS_TARGET_SELECTED`, `PASS_ROUTE_CONFIRMED`, `PASS_INTERCEPTOR_SELECTED`, and `PASS_CANCELLED` are Engine commands.
- Route confirmation validates frozen path mode, origin blockers and goalkeeper route blockers before Tracker consumption, then creates the canonical Pass plan.
- The plan includes selected origin, foot, distance, requested/effective target, direct hit, goalkeeper route status, defensive crossings and ordered interceptors.
- `PASS_INTERCEPTOR_SELECTED` validates the active canonical `CHOOSE_INTERCEPTOR` decision, the matching Pass/decision identities, stored candidates and equal-priority plan candidates. It reorders the plan with frozen rules, appends selection metadata and creates the exact next pending-roll descriptor.
- Normal Pass choice is stepwise Timeline History; Bonus Pass choice remains atomic with its continuation. Neither consumes another Tracker action.
- No Engine Pass slice yet submits a die, consumes a RollEvent, resolves interception, changes possession, moves the ball, advances the reaction chain, or creates/closes Bonus Action.
- Manual Multiplayer retains legacy route and interceptor-selection paths.

Deferred goalkeeper target rule:

- A frozen gameplay card with `position: "GK"` must not be selectable as a requested Pass target, whether it belongs to the passer's team or opponent team.
- It is deliberately still unimplemented. It belongs to a separately approved amendment of `PASS_TARGET_SELECTED`; do not silently bundle it into another action migration.
- A goalkeeper already blocks a pass route in offline Single Player: a route that intersects one is grey, unavailable and Engine-rejected before Tracker consumption.

Editor and lifecycle boundary:

- Editor Mode is an unrestricted workspace, not Match Engine gameplay. Do not route Editor controls to Match Engine without a separately approved Editor Workspace audit.
- `MATCH_STARTED` and `MATCH_RESTARTED` are offline Engine transitions. Timeline cursor zero intentionally remains playable after Match start.
- Halves, extra time, penalties and score remain deliberately unimplemented; they need a future Match Lifecycle contract.

Recommended next architectural target:

- Audit and propose only Engine-owned Pass interception die submission (`PASS_INTERCEPTION_ROLL_SUBMITTED` or a deliberately chosen contract-consistent command name): validate the exact pending-roll identity and a supplied RollEvent, consume it once, store the existing canonical roll result/input, and hand off to the existing downstream delayed resolver without migrating the outcome.
- Do not migrate delayed resolution, Natural 1/Natural 20 consequences, interception outcome, possession, ball movement, later interceptor advancement, or Pass completion unless separately approved after audit.
- Do not bundle the deferred goalkeeper target rule without explicit approval.

Verification status for v20.27.0:

- Focused tests passed: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/rules/passEngine.test.mjs src/multiplayer/actionStartAuthority.test.mjs` (83 passing).
- Full `npm test` must be rerun in an environment with dependencies installed. In this local workspace, the only known full-suite failure is `src/board/extractedComponents.test.mjs` cannot import `react` because the archive intentionally contains no `node_modules`.
- `npm run build` must be run in an environment with dependencies installed; this local workspace lacks `vite`.

Before proposing the next build, inspect the current build and documentation, compare them, explain the precise scope, and wait for approval. Do not infer a new game-rule change from an apparent bug.
