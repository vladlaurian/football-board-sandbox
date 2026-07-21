# Architecture Decision Log

This document is permanent and must remain current.

## Maintenance rule

Every major architectural change must add or update an ADR in this file. Do not silently replace old decisions. When a decision changes, mark the old ADR as `Superseded by ADR-XXX` and add the new decision with its context and consequences.

README records the current release. Changelogs record implementation history. This file records only durable architectural decisions and their reasons. Build names, version metadata, patch narratives, and test summaries do not belong here unless they are essential context for a still-active decision.

## ADR-001 — Editor, Inspector and Export share card rendering truth

**Status:** Active

**Decision:** `EDITOR = INSPECTOR = EXPORT`. Card appearance and model changes must use common rendering/model sources and must be verified in all three surfaces.

## ADR-002 — Timeline is the common history model

**Status:** Active

**Decision:** History is the visual representation of the Match Timeline. Undo moves backward, Redo moves forward, and Replay loads/reviews the same model. Cosmetic UI must not create independent gameplay stops.

## ADR-003 — UI presentation is not gameplay state

**Status:** Active

**Decision:** Dialog visibility, hover, focus, Dice animation and suspense timers are derived/local presentation. Pending decisions, pending rolls, action flow and continuations are persistent gameplay state.

## ADR-004 — Manual roll only

**Status:** Active

**Decision:** The application never rolls automatically. A user explicitly rolls D20. Choose Roll is a test input that creates the same RollEvent and follows the same resolver path.

## ADR-005 — Unique roll-event identity

**Status:** Active

**Decision:** A roll is identified by event/request/action/subject identity, never by its numeric natural result. Distinct consecutive results such as `8 → 8` are separate events; the same event ID cannot be consumed twice.

## ADR-006 — Generic action-resolution engine

**Status:** Active

**Decision:** Pass is the first client of the generic action-resolution contract built around action stage, `pendingDecision`, `pendingRoll`, unique RollEvent consumption, deterministic resolution and continuation. Dribble, Tackle, Shot and Cross must integrate with this engine rather than creating parallel Dice/Timeline systems.

**Reference:** `docs/ACTION_RESOLUTION_ENGINE.md`.

## ADR-007 — Bonus card action is a generic continuation

**Status:** Active

**Decision:** A bonus card action is represented by generic continuation state. It may be used or explicitly declined. `END B.A.` applies the configured resume policy and the Timeline/export must distinguish `BONUS_ACTION_ENDED` from `BONUS_ACTION_DECLINED`.

## ADR-008 — Host-authoritative multiplayer resolution

**Status:** Active

**Decision:** Firebase is the shared session source of truth and the host is authoritative for deterministic gameplay consequences. A guest may provide an authorized decision or roll event, but the host publishes the canonical resolution. Processing must be idempotent.

## ADR-009 — Match Timeline owns gameplay during multiplayer Match Mode

**Status:** Active

**Decision:** During an active Match Timeline, the Timeline is authoritative. The session board document is a projection/persistence surface and must not overwrite newer Timeline gameplay with delayed projections.

## ADR-010 — Temporary migration plans are deleted after completion

**Status:** Active

**Decision:** Large pending refactors are documented in a separate `*_PLAN.md` file with an explicit OPEN status and checklist. After implementation and validation, that temporary document must be deleted. Permanent consequences and final decisions remain here as ADRs.

## ADR-011 — This log must be maintained continuously

**Status:** Active

**Decision:** Every future chat or engineer making a major architectural change must update this file in the same build. A release is not architecturally complete when durable decisions changed but this log did not.


## ADR-012 — Separate ephemeral runtime locks from canonical session gameplay writes

**Status:** Accepted

**Decision:** Ephemeral coordination values such as the shared dice cooldown live in small runtime documents under `sessions/{code}/runtime/*`. They must not be written into the canonical session document used to publish Timeline metadata. Canonical Timeline entry + metadata publication uses an atomic batch after semantic revision validation, with bounded retry for transient transport/service failures.

**Reason:** A Firestore transaction on the main session document acquired an update-time precondition. Heartbeat or dice-cooldown writes changed that same document and caused `failed-precondition`, preventing the host from publishing `PASS_INTERCEPTED` while both clients remained at `Resolving interception…`.

**Consequences:**

- Unrelated runtime writes no longer invalidate gameplay publication.
- Timeline entry and metadata remain atomically visible in one batch.
- Semantic revision conflicts remain explicit and are not silently overwritten.
- Runtime subcollection documents must be deleted when ending a session.


## ADR-013 — Free Ball is an administrative ball-placement flow

**Decision:** Match Mode Free Ball is implemented as independent transient UI state and a dedicated direct ball-placement function. It must not use player selection, player movement authorization, movement accounting, Free Move authorization, the 3/2 rule, Pass resolution, or Tracker action consumption.

**Reason:** The ball is not a player and administrative repositioning has different semantics from an authorized player move. Reusing the player movement pipeline previously coupled unrelated rules and created invalid locks and state transitions.

**Consequences:**

- The next valid board click while Free Ball is armed changes only the `BALL` piece position and then automatically disarms the mode.
- PASS targeting retains higher click priority than Free Ball.
- Temporary selection, hover and pending movement prompts are cleared when Free Ball is activated, cancelled, consumed, or Match Mode is exited.
- The resulting position is still recorded as canonical `BALL_MOVED` Timeline state for Undo/Redo, replay and multiplayer parity.
- The internal Tracker property remains named `freeMode` for backward compatibility; only the visible feature name is Free Move.

## ADR-014 — AI Analysis Export is a required semantic integration surface

**Status:** Active

**Decision:** Every new or modified Match Mode feature must be reviewed for AI Analysis Export in the same build. Gameplay actions, relevant player decisions, movement reasons, possession/action-economy changes, rolls, resolutions, and meaningful administrative interventions must be represented semantically and covered by regression tests. Pure presentation state is excluded.

**Reason:** A primary purpose of the Football Board Sandbox is to generate a match record that an AI can reconstruct and analyze. A board-state change alone may be insufficient when identical outcomes can result from different user decisions.

**Consequences:**

- AI export is part of feature completeness, not an optional follow-up.
- New Match events must be checked against Timeline recording and semantic export mapping.
- Distinct relevant causes must remain distinct in export, such as `FREE_BALL` versus a generic manual movement.
- If a feature cannot yet be exported accurately, the release must document that limitation as unresolved work.
- Export schema changes require tests and a schema-version review.

**Reference:** `docs/DEVELOPMENT_WORKFLOW.md`.
## ADR-015 — Back-card stat definitions are global; card values remain local

**Status:** Active

**Decision:** Attributes and Bonuses on the back of player cards have one authoritative global schema for existence, stable ID, name, section, order, shared visual styling, and shared zone layout. Each card owns only the numeric value and `showOnCard` state for each stat. Adding, renaming, reordering, or deleting a stat is a global operation. A newly added stat is initialized on every card with `Value = 10` and `Show = On`.

Gameplay systems request stat values through stable IDs resolved from the global schema and the card's local value. `showOnCard` affects rendering only. Materialized legacy card lists may exist only as compatibility projections and must not become a parallel authoring source of truth.

**Reason:** Per-card structural ownership allowed card definitions, order, names, and presentation to drift and made every new stat require repetitive manual edits. Display-name-only gameplay lookup was also fragile under renaming.

**Consequences:**

- Every card always shares the same Attribute/Bonus structure and order.
- Per-player differentiation is preserved through Value and Show only.
- Pass and Interception use stable global IDs, with legacy name lookup limited to old imports and recordings.
- Attributes Front, Bonuses Front, Duplicate Content, duplicate blocks, and Duplicate buttons are removed.
- Stars remain an independent front-card system; the historical front `attributes` layout key is retained internally to preserve saved Stars placement.
- Preferred Foot, Defensive Area, and Special Ability remain individual per card.
- Editor, Inspector, and PNG export continue to share `CardPreview` as required by ADR-001.
- Migration must create a pre-migration backup, validate common structure/presentation, and preserve every existing Value and Show state.

**Reference:** `docs/GLOBAL_BACK_STATS.md`.


## ADR-016 — Interception resolution is independent from Pass geometry

**Status:** Active

**Decision:** Interception roll resolution is a generic action service owned by `src/rules/interceptionEngine.mjs`. Pass and future actions determine eligibility and provide defender/attacker values; they do not own the mathematical resolver. Rule Sets store Interception configuration under `actions.interception`, separately from `actions.pass`.

The Interception configuration owns the defender roll stat ID, standard-modifier toggle, progressive-bonus toggle, symmetric modifier cap, and equal-total outcome. Natural 1, Natural 20, and manual dice remain global invariants.

**Reason:** Long Pass and future action types must reuse one interception formula while being free to use different attacker target statistics and different eligibility geometry. Keeping resolution inside Pass would create parallel engines and duplicate editor settings.

**Consequences:**

- Pass remains responsible for route geometry and eligible-interceptor discovery.
- Rule Set schema version 3 migrates legacy Pass interception settings into `actions.interception`.
- Gameplay looks up the configured defender statistic through a stable global stat ID.
- AI Analysis exports Pass and Interception configuration separately.
- Future Long Pass work must call the same Interception resolver rather than create a Long Pass roll engine.

**Reference:** `docs/INTERCEPTION_ENGINE.md`.

## ADR-017 — Shared resolution state does not imply shared UI control

In multiplayer, action resolution state is canonical and visible to every client. Interactive controls are local and require ownership of the resolution team. UI components receive explicit interactivity flags, and action handlers repeat the same authority check defensively. Future Shot, Dribble, Cross and other resolution interfaces must follow this rule.

## ADR-018 — Guest dice are intents and canonical snapshots drive resolution

In Match multiplayer, dice input is a semantic request, not a guest Timeline transition. The host validates team ownership and the canonical pending-roll request, generates or accepts the permitted test result, and commits `DICE_ROLLED`.

Turn progression must be derived from the transition's canonical `before.tracker` snapshot. Render-local Tracker state must not participate in possession-change calculations.

A Bonus Move is one logical transition: physical movement and continuation completion are committed together. No UI may depend on a second optimistic guest commit to unlock `END B.A.`.

## ADR-019 — Host-authoritative action starts and atomic Bonus Pass

A multiplayer guest may choose an action locally, but may not publish the transition that starts gameplay state. Normal Pass and Bonus Action starts are semantic runtime intents. The host validates ownership, canonical revision, piece, action type, continuation identity, active resolution compatibility, and possession requirements before executing the transition and publishing Timeline.

Bonus Pass activation and Pass targeting are one atomic canonical transition (`BONUS_PASS_TARGETING_STARTED`). Repeated Natural 20 → Bonus Action → Pass chains must never expose an intermediate state in which the continuation is active but Pass targeting is absent or locally owned by the guest. Stale intents are rejected and local pending state is restored from the canonical Timeline.

**Historical reason:** v20.6 made dice host-authoritative but still allowed guests to commit `BONUS_CARD_ACTION_STARTED` and `PASS_TARGETING_STARTED` directly. That remaining optimistic boundary could race with host commits during repeated Bonus Action chains and leave Pass targeting stuck. v20.7 closes that boundary.

## Selection is not action authorization

**Decision:** Player selection and card inspection are always local UI operations. Turn ownership, Pass ownership, Bonus Action ownership, and multiplayer team ownership are enforced only when a gameplay action is attempted. A canonical action may therefore block mutation without blocking inspection.

## Interaction Layer is a derived projection (v20.10)

Canonical gameplay state remains the only authority for active interactions. The UI must not use `selectedId` or `inspectedPieceId` as a substitute for active gameplay state.

The local Interaction Layer is derived from:

- `actionResolution` for active Pass flows;
- `actionContinuation` for Bonus Action flows;
- `matchActionState.freeMode` for Free Move;
- local authority context for whether the client may control the interaction.

The projection supplies the active piece, interaction type, cursor mode and canonical controls. Local free selection and Inspector state remain separate and are never synchronized as gameplay.

Consequences:

- Timeline hydration, Undo/Redo, rollback and guest synchronization automatically reconstruct the active gameplay presentation/highlight;
- `CANCEL PASS` executes from the canonical Pass resolution; its familiar card placement may be contextual to the canonical passer, but the command must not consume the inspected piece as gameplay authority;
- `END B.A.` executes from the canonical Bonus Action continuation; its card placement must not make the inspected piece an input to continuation completion;
- inspection remains locally free even while another piece is canonically active;
- transient UI cleanup may clear local selection without destroying the active interaction context;
- `activePieceId` is presentation-only. It must not replace `selectedId` in movement, hover, touch, pointer, Pass, or Interception input paths;
- the Interaction Layer may observe the general resolution engine, Pass Engine, and Interception state, but may not absorb or redirect their responsibilities.


# ARCHITECTURAL DIRECTION – POST v20.11.6

## Status

Following an architectural audit, development priority changed. The Game Engine contract and migration plan are now approved; implementation may proceed only through the current approved phase of `GAME_ENGINE_MIGRATION_PLAN.md`.

This remains a strategic decision, not a multiplayer bug-fix task.

## Current priorities

1. Freeze AUTOMATED multiplayer development.
2. Do NOT continue patching Host Authority.
3. Preserve the existing Manual Multiplayer Sandbox.
4. Build a stable architecture for Single Player first.
5. Only after the single-player engine is stable should automated multiplayer be reconsidered.

## Why

The audit concluded that the current automated multiplayer problems are symptoms of architectural coupling rather than isolated bugs.

The central issue is that main.jsx currently mixes:
- UI
- game orchestration
- multiplayer
- Firebase
- timeline
- undo
- temporary interaction state

Continuing to patch multiplayer before extracting the game engine is expected to increase technical debt.

## New architectural objective

The next development phase is to transform the application into:

UI
→ Game Controller
→ Pure Game Engine
→ Persistence / Multiplayer Adapter

The Game Engine must become reusable by:
- single player
- replay
- automated tests
- future multiplayer

## Important

No decision has been made yet regarding Firebase vs Colyseus.

That decision is intentionally postponed until:
- the engine exists,
- the single-player architecture is stable,
- the engine is command-driven.

Current expectation is that Firebase Host Authority may be sufficient for the intended scale (2 players + optional spectator), but this must be evaluated AFTER the engine refactor, not before.

## Instructions for future AI chats

Before implementing code:

1. Read the complete documentation.
2. Read `GAME_ENGINE_ARCHITECTURE.md` and `GAME_ENGINE_MIGRATION_PLAN.md`.
3. Inspect the current phase's relevant code and tests.
4. Propose only the current phase's approved scope and wait for user approval.
5. Only then implement that phase.

Do NOT continue automated multiplayer bug fixing before the architectural refactor.

## ADR-020 — Command-driven Game Engine with one canonical MatchState

**Status:** Active

**Decision:** Match Mode gameplay is migrated to a pure, command-driven Game Engine. `MatchState` is the single mutable, serializable gameplay authority; the state at the active Timeline cursor is the authoritative current state. Every gameplay mutation is requested through a serializable command and is accepted or rejected by the engine. An accepted result contains next MatchState and semantic event data consumed by Timeline, Undo/Redo, Replay, and AI Analysis Export.

`MatchContext` is immutable for the life of a match and freezes gameplay-relevant Rule Set, board settings, and compact card data at Match start. Editing cards or rules later affects future matches, never an active match or replay.

UI, Controller, timers, Firebase, and future multiplayer adapters may request or transport commands but must not implement alternate rules or directly mutate gameplay state. Manual multiplayer remains unchanged while the engine migration is open. Automated multiplayer is reconsidered only after completed Single Player migration and a dedicated pre-multiplayer audit.

**Reason:** `main.jsx` currently combines UI, gameplay orchestration, Timeline, Firebase, and transient state. This creates parallel state paths and made Host Authority bugs structural rather than isolated. A reusable engine is required before safely extending Single Player or returning to automated multiplayer.

**Consequences:**

- Permanent contract: [`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md).
- Temporary execution checklist: [`GAME_ENGINE_MIGRATION_PLAN.md`](GAME_ENGINE_MIGRATION_PLAN.md).
- Existing pure rule modules are reused; game design is unchanged by migration.
- Timeline remains canonical history but does not validate rules.
- A mechanic is migrated only when its legacy direct Match Mode mutation path is removed and required engine, Timeline, Undo/Redo, Replay, and AI-export tests pass.

## ADR-021 — 3/2 is a canonical free active-phase action

**Status:** Active

**Decision:** In offline Single Player, 3/2 is requested through `THREE_TWO_MOVE_COMMITTED` and resolved solely by the Game Engine. It consumes no Tracker action and remains legal after the active team has exhausted normal Tracker actions. It remains limited to the active team phase, one use per player, its established straight/diagonal range, a ball destination, and a destination not occupied by another player. Clicking the visible ball with an eligible selected player is only a UI entry to that same command.

**Reason:** Legacy UI gates treated a free action as unavailable when Tracker was exhausted, while the ball pointer handler stopped a direct destination click before 3/2 validation could run. Both paths made the rule unreliable and created a second gameplay interpretation outside canonical MatchState.

**Consequences:**

- `THREE_TWO_MOVE` remains the semantic Timeline/AI event.
- Undo/Redo reconstructs the same engine-produced state.
- Manual multiplayer keeps its legacy 3/2 implementation until multiplayer migration is explicitly reopened.
