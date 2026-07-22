# Continuation prompt — v20.30.0

Continue the Football Board Sandbox Game Engine migration from `v20.30.0`.

Read before proposing implementation: `README.md`, `docs/GAME_ENGINE_ARCHITECTURE.md`, `docs/GAME_ENGINE_MIGRATION_PLAN.md`, `docs/ARCHITECTURE_DECISIONS.md`, and `docs/ACTION_RESOLUTION_ENGINE.md`.

Constraints: automated multiplayer remains frozen; Manual Multiplayer remains unchanged; no implementation before inspection, narrow proposal and explicit approval; no cosmetic refactors; every build needs docs, manual tests, focused tests, root-level ZIP and next-chat prompt.

Current Single Player contract:

- Timeline-cursor MatchState is canonical; MatchContext is frozen. UI sends commands; Engine validates; Controller records Timeline; UI presents it.
- Offline Pass start, target, route, interceptor choice, roll input, deterministic mathematical result and all ordinary consequences are Engine-owned.
- `PASS_CONSEQUENCE_DUE` completes no-reaction passes, direct opponent hits, ordinary interceptions, missed-interceptor advancement, Natural 1's next-interceptor `-1`, final pass completion and Bonus Pass completion.
- A completed Bonus Pass becomes `awaiting-end-bonus-action` and remains atomic without Tracker consumption.
- Natural 20 is intentionally the only remaining legacy downstream Pass consequence. Do not fold it into another change: it creates/replaces Bonus Action continuation and needs a dedicated audited slice.
- Extra Roll remains administrative and permitted during Bonus Action; it does not alter the continuation.
- The History panel follows its active Timeline cursor after live commits, Undo, Redo and replay navigation.
- Goalkeeper route blocking is Engine-owned; goalkeeper target prohibition remains deferred.

Recommended next audit, subject to approval: migrate only the Natural 20 Pass consequence into the Engine. Verify how a Natural 20 replaces an existing continuation, moves the ball, establishes the next team/turn resume policy, preserves atomic Undo/Redo, and represents its chain identity in Timeline/AI export. Preserve Manual Multiplayer completely.

v20.30.0 verification: full `npm test` passed 213/213 and `npm run build` passed. Manual test the ordinary Pass branches (no reaction, direct opponent hit, regular interception, ordinary miss, Natural 1 with a later interceptor, final miss completion, Bonus Pass completion) plus Undo/Redo/History scrolling. Natural 20 must retain its established legacy behavior pending the next approved slice.
