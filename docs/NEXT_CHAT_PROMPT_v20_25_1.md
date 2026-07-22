# Continuation prompt — v20.25.1

We are continuing the Football Board Sandbox Game Engine migration from build `v20.25.1`.

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
- v20.24.0–v20.24.1: Engine-owned Match start/restart and Editor boundary restoration
- v20.25.0: Engine-owned Single Player Pass start/cancel
- v20.25.1: Engine-owned Single Player Pass target selection and frozen route inputs

Current Pass boundary:

- In offline Single Player Match Mode, `PASS_STARTED` creates canonical targeting state; `PASS_TARGET_SELECTED` validates matching Pass ID and a frozen-board coordinate, then stores the requested target and enters `route-selection`; `PASS_CANCELLED` clears targeting/route-selection.
- Pass start and target selection do not consume Tracker economy, create a plan, select a route, roll dice, resolve interception, move the ball or change possession.
- An occupied requested target remains legal: a later route plan owns first-player-hit and effective target behavior.
- Normal Pass start/target/cancel entries are stepwise History. Bonus Pass start/target/cancel retain the existing atomic continuation transaction.
- The offline preview and remaining legacy route-plan construction use MatchContext's frozen Rule Set, board settings and compact cards. They must not use mutable editor data for an active Match.
- Offline `beginPassTargeting()`, `commitPassTargetSelection()` and `commitPassCancellation()` dispatch Engine commands. The legacy direct route-confirmation/resolution path still follows the selected target.
- Manual Multiplayer remains unchanged, including host/guest target intent, route and resolution flows.

Current lifecycle and Editor boundary:

- `MATCH_STARTED` starts an unstarted offline Single Player Match Mode game through Engine.
- `MATCH_RESTARTED` restarts an existing offline Single Player Match Mode game through Engine while preserving pieces/ball and resetting turn-scoped match state.
- Editor Mode is an unrestricted workspace, not Match Engine gameplay. Its Tracker Start/Restart flow remains legacy by design. Do not route Editor controls to Match Engine without a separately approved Editor Workspace audit.
- Timeline cursor zero intentionally remains playable after Match start. `MATCH_STARTED` remains the audit entry in History.
- `TRACKER_PHASE_ENDED` is the offline End Turn command. Final defense enters `complete`; an out-of-range Bonus Action closure also enters `complete`.
- `MATCH OVER` is transient UI after a live Engine final transition only. It must not show from replay/load/Undo/Redo.
- Halves, extra time, penalties and score remain deliberately unimplemented; they require a future dedicated Match Lifecycle contract.

Recommended next architectural target:

- Audit and propose only Engine-owned Pass route confirmation and deterministic plan creation. This includes route-origin validation, frozen plan construction and the normal-vs-Bonus action-economy boundary. Do not migrate interceptor choice, dice submission, delayed resolution, interception outcome, possession or Pass completion unless separately approved after audit. Explain how route confirmation can enter the already-existing pending-decision/roll contract without importing their resolution behavior into the same build.

Verification status for v20.25.1:

- Focused Engine/Controller/Manual-Multiplayer-guard tests passed: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/multiplayer/actionStartAuthority.test.mjs` (57 passing).
- Full `npm test` reaches 187 passing tests, then has one existing environment failure because dependencies are absent: `src/board/extractedComponents.test.mjs` cannot import `react`.
- `npm run build` cannot run in this archive because `vite` is absent (`node_modules` is not included).

Before proposing the next build, inspect the current build and documentation, compare them, explain the precise scope, and wait for approval. Do not infer a new game-rule change from an apparent bug.
