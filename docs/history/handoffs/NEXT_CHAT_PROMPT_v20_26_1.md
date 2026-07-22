# Continuation prompt — v20.26.1

We are continuing the Football Board Sandbox Game Engine migration from build `v20.26.1`.

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

- In offline Single Player Match Mode, `PASS_STARTED`, `PASS_TARGET_SELECTED`, `PASS_ROUTE_CONFIRMED` and `PASS_CANCELLED` are Engine commands.
- Route confirmation validates the selected route against frozen MatchContext path mode, rejects an opponent-blocked origin and a goalkeeper-blocked route before Tracker consumption, builds the canonical Pass plan, then consumes one normal Tracker action or no Bonus Tracker action.
- A Pass plan now includes selected origin, foot, distance, Long/Short classification, requested/effective target, direct hit, `goalkeeperRouteBlocked`, defensive crossings and ordered interceptors.
- A goalkeeper encountered by the route is a blocker, not a direct-hit recipient: the ball cannot cross or finish at that square. In Single Player it is shown grey and unselectable. Manual Multiplayer retains legacy preview/interaction.
- A direct hit on an opponent is red in Single Player route preview, including when no defensive-area interceptor exists. This is a presentation correction using canonical plan truth, not a new resolution rule.
- Confirming the route may only place canonical state into `completing`, `awaiting-interceptor-choice`, or `awaiting-interception-roll`. It does not choose an interceptor, roll, resolve outcome, move ball, possession, or Bonus Action.
- Normal Pass entries are stepwise History. Bonus Pass entries remain one atomic continuation transaction.

Deferred goalkeeper target rule:

- A frozen gameplay card with `position: "GK"` must not be selectable as a requested Pass target, whether it belongs to the passer's team or opponent team.
- This is deliberately still unimplemented. It belongs to a separately approved amendment of `PASS_TARGET_SELECTED`; do not silently bundle it into another action migration.

Editor and lifecycle boundary:

- Editor Mode is an unrestricted workspace, not Match Engine gameplay. Do not route Editor controls to Match Engine without a separately approved Editor Workspace audit.
- `MATCH_STARTED` and `MATCH_RESTARTED` are offline Engine transitions. Timeline cursor zero intentionally remains playable after Match start.
- Halves, extra time, penalties and score remain deliberately unimplemented; they need a future Match Lifecycle contract.

Recommended next architectural target:

- Audit and propose only Engine-owned Pass interceptor choice (`PASS_INTERCEPTOR_SELECTED`): validate the explicit canonical pending choice, deterministically reorder/interceptor modifiers, and create the next pending-roll descriptor.
- Do not migrate die submission, delayed resolution, interception outcome, possession or Pass completion unless separately approved after audit.
- Do not bundle the deferred goalkeeper target rule without explicit approval.

Verification status for v20.26.1:

- Focused tests passed: `node --test src/rules/passEngine.test.mjs src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/multiplayer/actionStartAuthority.test.mjs` (79 passing).
- Full `npm test` ran 196 tests: 195 passed; the sole failure is the pre-existing environment issue `src/board/extractedComponents.test.mjs` cannot import `react` because this archive intentionally contains no `node_modules`.
- `npm run build` must be run in an environment with dependencies installed; this local workspace lacks `vite`.

Before proposing the next build, inspect the current build and documentation, compare them, explain the precise scope, and wait for approval. Do not infer a new game-rule change from an apparent bug.
