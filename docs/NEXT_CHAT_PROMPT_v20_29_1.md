# Continuation prompt — v20.29.1

Continue the Football Board Sandbox Game Engine migration from `v20.29.1`.

Read before proposing implementation: `README.md`, `docs/GAME_ENGINE_ARCHITECTURE.md`, `docs/GAME_ENGINE_MIGRATION_PLAN.md`, `docs/ARCHITECTURE_DECISIONS.md`, and `docs/ACTION_RESOLUTION_ENGINE.md`.

Constraints: automated multiplayer remains frozen; Manual Multiplayer remains unchanged; no implementation before inspection, narrow proposal and explicit approval; no cosmetic refactors; every build needs docs, manual tests, focused tests, root-level ZIP and next-chat prompt.

Current Single Player contract:

- Timeline-cursor MatchState is canonical; MatchContext is frozen. UI sends commands; Engine validates; Controller records Timeline; UI presents state.
- Offline Pass start, target, route, interceptor choice, roll input and deterministic mathematical result are Engine-owned. Consequences (ball/possession/turn/follow-up/Natural 20/Pass completion) remain temporarily legacy downstream work.
- Normal dice require an exact active mechanic request. Extra Roll is an administrative Timeline/AI event, consumes no Tracker action and cannot satisfy a mechanic roll.
- Extra Roll is allowed during Bonus Action for either team and must leave the Bonus Action unchanged. It still closes after exactly one accepted roll and supports History/Undo/Redo.
- Goalkeeper route blocking is Engine-owned; goalkeeper target prohibition remains deferred.

Recommended next audit, subject to approval: migrate one first Pass consequence branch — ordinary successful interception (ball to interceptor plus possession/turn transition), excluding Natural 20, missed-interceptor advancement and Pass completion.

v20.29.1 verification: focused Engine/Controller/AI tests passed 87/87. Full build/test should be run with dependencies installed. Test Extra Roll during a Blue and Red Bonus Action, for both team dice, then verify auto-close, History, Undo/Redo and unchanged Bonus Action.
