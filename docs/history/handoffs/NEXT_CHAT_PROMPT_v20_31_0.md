# Continuation prompt — v20.31.0

Continue the Football Board Sandbox Game Engine migration from `v20.31.0`.

Read before proposing implementation: `README.md`, `docs/GAME_ENGINE_ARCHITECTURE.md`, `docs/GAME_ENGINE_MIGRATION_PLAN.md`, `docs/ARCHITECTURE_DECISIONS.md`, and `docs/ACTION_RESOLUTION_ENGINE.md`.

Constraints: automated multiplayer remains frozen; Manual Multiplayer remains unchanged; no implementation before inspection, narrow proposal and explicit approval; no cosmetic refactors; every build needs docs, manual tests, focused tests, root-level ZIP and next-chat prompt.

Completed Single Player Pass contract:

- Timeline-cursor MatchState is canonical; MatchContext is frozen. UI sends commands; Engine validates; Controller records Timeline; UI presents it.
- Pass is Engine-owned end-to-end in offline Single Player: start, cancellation, target, route/plan, interceptor choice, RollEvent submission, delayed mathematical result, direct hit, ordinary interception, missed interception, Natural 1, completion and Natural 20.
- `PASS_CONSEQUENCE_DUE` owns every existing Pass result. Natural 20 moves the ball to the interceptor, grants a ready Bonus Action and delays Tracker turn/possession transition until `END B.A.`.
- A Natural 20 during an existing Bonus Action replaces it. The new continuation records `parentContinuationId`; Timeline/AI metadata records the superseded continuation. The continuation ID is deterministic from Pass + RollEvent.
- Roll, frozen outcome and any consequence are one atomic resolution Undo/Redo transaction. A granted Bonus Action remains its own later atomic transaction.
- Extra Roll remains administrative and permitted during Bonus Action; it does not alter the continuation.
- Goalkeeper route blocking is Engine-owned. Goalkeeper target prohibition remains an approved but separate deferred rule.
- Manual Multiplayer remains entirely legacy and untouched.

Next work is not a new game mechanic. First audit the remaining offline Single Player direct Match Mode mutations in `src/main.jsx` and classify them into: already Engine-owned, UI-only presentation, Editor-only workspace, retained Manual Multiplayer branch, or genuine gameplay logic still needing extraction. Propose the smallest safe separation plan for the remaining responsibilities (including Editor Workspace, gameplay-card/profile boundaries, persistence/export interaction boundaries) before implementation. Do not alter Manual Multiplayer or start the planned menu/editor changes without a separate approved scope.

v20.31.0 verification: focused Engine/Controller/Timeline/AI tests passed during build. Run full `npm test` and `npm run build`. Manual-test a normal Natural 20 interception, `END B.A.` after declining it, `END B.A.` after using one bonus action, a Natural 20 that interrupts an opponent Bonus Pass, and Undo/Redo across the Natural 20 result. Confirm that ordinary Manual Multiplayer still follows its existing behavior.
