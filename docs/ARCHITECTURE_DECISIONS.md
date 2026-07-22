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

## ADR-022 — Physical movement uses one player-blocking path rule

**Status:** Active

**Decision:** Offline Single Player physical gameplay movement cannot pass through another player. The rule is shared by Normal MOVE, 3/2, and Bonus Move: teammates and opponents block identically, while the ball does not. Existing destination occupancy remains separate. Group Move is the deliberate tactical exception: it may cross players but may not finish on a player or the ball. Free Move is deliberately exempt from path, distance, axis, phase, and Tracker restrictions because it is the administrative recovery tool; it continues to preserve the board invariant that two players cannot end on the same square.

**Reason:** Destination-only validation permitted players to jump over other players. Applying the rule selectively by team would create an arbitrary ghost-player exception, while constraining Free Move would remove the safety tool needed to recover from faulty or incomplete game states.

**Consequences:**

- `movementPathRules.mjs` is the sole pure corridor implementation.
- Normal MOVE and 3/2 enforce it in the Engine; temporary legacy Single Player Bonus paths reuse the same module.
- Editor Mode, Free Ball, and Manual Multiplayer are unchanged.

## ADR-024 — Group Move is a zone-confirmed Engine action with a deliberate crossing exception

**Status:** Active

**Decision:** In offline Single Player, pressing GROUP MOVE opens only a local zone preview. The action is not consumed until `GROUP_MOVE_ZONE_CONFIRMED` establishes a full-width longitudinal zone in canonical MatchState. The draft band is positioned by drag and is UI-only. The confirmed zone consumes the final normal Tracker action and cannot be moved afterward; it is retained for Engine validation but deliberately not rendered after confirmation. `GROUP_MOVE_PLAYER_COMMITTED` then moves eligible players one at a time under the same canonical Group Move state until its configured player limit or End Turn.

Players must begin in the confirmed zone, have no ball, and have no gameplay movement during the turn; administrative Free Move does not disqualify them. Each player moves once, ignores card Speed, respects configured maximum distance, and cannot finish on a player or ball. The first successful move fixes orientation and optionally exact direction for the group. Unlike normal movement, Group Move may cross players: this is a deliberate tactical tool for moving a line and creating an offside attempt.

**Consequences:**

- Rule Set schema v4 owns Group Move limits and MatchContext freezes them at Match start.
- Preview-zone repositioning is UI-only; only confirmation and physical moves enter Timeline.
- End Turn clears the active Group Move state before recording the next phase; the Engine lock can never cross to the opposing team.
- UI eligibility marks are presentation only and derive from the Engine's pure eligibility evaluator. Destination preview derives from the corresponding pure Engine evaluator, never from normal-MOVE or card-Speed rules.
- Timeline preserves `GROUP_MOVE_ACTIVATED` and `GROUP_MOVE_PIECE`; Undo/Redo, Replay, and AI export retain their existing semantic vocabulary.
- Manual Multiplayer and Editor Mode retain their legacy behavior.

## ADR-025 — Bonus Action is a generic, non-Tracker continuation

**Status:** Active

**Decision:** A Bonus Action is canonical `actionContinuation` state, not a Tracker action and not a Pass-only mechanic. Its legacy `source` remains for replay compatibility, while structured `origin` identifies the source action, outcome, reason, source Timeline entry, and optional parent continuation. A new Bonus Action replaces any existing one atomically; it does not stack and the superseded continuation's resume policy never executes.

In offline Single Player, an active Bonus Action blocks End Turn, Free Move, Free Ball, normal actions, and Group Move. It permits one selected individual card action (MOVE, PASS, DRIBBLE, CROSS, SHOT, or TACKLING), its valid cancellation flow, and `END B.A.`. 3/2 remains independent of MOVE and Tracker: it may be used by the Bonus Action owner under its existing range, occupancy, path, and one-use rules, without consuming or ending the continuation.

**Consequences:**

- Timeline and AI Export retain Bonus Action origin and replacement-chain provenance.
- Manual Multiplayer retains its existing Bonus Action path until explicitly reopened.
- Bonus MOVE is now a typed Engine transition with the same canonical path from card and direct-board entrances; Manual Multiplayer still retains its legacy path.

## ADR-026 — Bonus MOVE is a canonical progressive Engine action

**Status:** Active

**Decision:** Offline Single Player Bonus MOVE is resolved only through `BONUS_MOVE_STARTED`, `BONUS_MOVE_CANCELLED`, and `BONUS_MOVE_COMMITTED`. Its active piece and `movementStarted` state live in canonical `actionContinuation`, never in Tracker or transient UI. Card MOVE and direct-board player selection plus destination use these same commands; direct board start and first movement are evaluated before either Timeline transition is published.

**Consequences:**

- The Engine owns ownership, cancellation before first physical movement, Speed, axis, path, destination occupancy, and ball carry.
- Bonus MOVE does not consume Tracker economy and remains active until `END B.A.`, including after a partial segment.
- 3/2 remains independent before or during Bonus MOVE.
- Manual Multiplayer and Editor Mode retain their existing behavior.

## ADR-027 — Phase closure owns automatic numbered-turn advancement

**Status:** Active

**Decision:** Offline Single Player Match Mode resolves `END TURN` only through `TRACKER_PHASE_ENDED`. The Engine moves attack to defense without resetting state. When defense ends, it starts the next numbered turn automatically if one remains, resets the turn-scoped Tracker and movement state, and returns to attack. The final defense reaches `complete` without creating an out-of-range turn.

**Consequences:**

- Numbered Tracker controls are presentation-only in offline Match Mode; UI cannot manually advance or reverse the live match turn.
- `PHASE_ENDED` remains the Timeline semantic event and carries automatic-advance metadata. The Turn popup is UI-only presentation of committed state.
- A normal MOVE before its first physical segment locks every gameplay command except commit or cancel. This prevents a temporary Move interaction from crossing a phase boundary.
- Group Move may end normally through End Turn and is cleared canonically. Free Move, Bonus Action and active action-resolution continue to block phase closure.
- Editor Mode and Manual Multiplayer retain their existing paths.

## ADR-028 — Inactive-phase card controls are presentation-only locks

**Status:** Active

**Decision:** In offline Single Player Match Mode, the card action row is disabled for a team outside the canonical Tracker phase. This applies only to gameplay actions: Move, Group Move, Pass, Shot, Cross, Dribble and Tackling. Selection and inspection never depend on phase ownership. Free Move, Free Ball, INACTIVE and card-flip flows remain outside this presentation lock. A canonical Bonus Action remains an explicit exception for its owner.

**Consequences:**

- The UI no longer suggests that the inactive team can begin a normal action.
- No game rule, Tracker state or Engine transition changes in this build.
- Manual Multiplayer remains untouched.

## ADR-029 — Bonus Action closure is an Engine-owned continuation transition

**Status:** Active

**Decision:** In offline Single Player Match Mode, `END B.A.` is resolved only by the `BONUS_ACTION_ENDED` command. The Engine derives whether the continuation was declined or used from canonical `actionContinuation`, accepts ready, active, and awaiting-end states, clears that continuation, and emits the established `BONUS_ACTION_DECLINED` or `BONUS_ACTION_ENDED` semantic event. The optional continuation ID prevents a stale UI control from closing a replacement Bonus Action.

An `advance-turn` resume policy resets only the next numbered turn and makes its designated team the attacker. If its requested turn is past the configured final turn, the Match enters `complete`; it must never clamp back to the final numbered turn. A `resume-phase` policy returns to its declared phase without changing its existing Tracker economy. The transition remains part of the continuation's atomic Timeline transaction.

**Consequences:**

- History, Undo/Redo, Replay and AI Export receive the same existing Bonus Action semantic vocabulary and metadata.
- The `TURN X` popup remains UI-only and is displayed only after Engine-produced state starts a valid next turn.
- Manual Multiplayer keeps its existing End B.A. intent/host path and is intentionally outside this migration.

## ADR-030 — Match start is an Engine transition; Match Over is presentation

**Status:** Active

**Decision:** Offline Single Player Match start is requested only by `MATCH_STARTED`. The Engine validates the selected opening team and an unstarted Match, creates the canonical playable turn-one state, resets temporary gameplay state, and emits the existing Match Started semantic event. The Controller initializes Timeline from that Engine-produced state and records the audit event as a no-op, preserving the established playable cursor-zero baseline.

`MATCH OVER` is intentionally not stored in MatchState. It is a transient UI notice shown only after a live Engine-produced result enters `turnPhase: complete`. Replaying, loading, Undoing, or Redoing a completed Match must not create a popup.

**Consequences:**

- The Match lifecycle has Engine-owned opening and closing boundaries without prematurely adding halves, extra time, penalties, score, or other match-format rules.
- A future Match Lifecycle build may add periods to MatchState and Engine transitions without reintroducing UI-owned Match start/final state.
- Manual Multiplayer retains its existing Match-start and final presentation behavior.

## ADR-031 — Editor Workspace remains outside Match Engine; Match restart is explicit

**Status:** Active

**Decision:** Editor Mode remains an unrestricted workspace and must not dispatch Match Engine lifecycle commands. Its Tracker controls retain their legacy sandbox behavior. Offline Single Player Match Mode distinguishes an unstarted `MATCH_STARTED` transition from `MATCH_RESTARTED` for an existing Match.

Restart uses the same canonical lifecycle reset as Match start, but deliberately preserves all current board pieces and ball positions. It emits the existing `MATCH_STARTED` semantic event with `restarted: true` metadata rather than creating a second Timeline/AI event vocabulary.

**Consequences:**

- Start/Restart behavior remains coherent without forcing Editor workspace operations into gameplay rule validation.
- A later dedicated Editor Workspace ↔ Match boundary audit may formalize setup and snapshot behavior; it must not migrate unrestricted editor manipulation into Match Engine by default.
- Manual Multiplayer remains unchanged.

## ADR-032 — Pass begins and cancels through canonical action resolution

**Status:** Active

**Decision:** Offline Single Player Match Mode begins Pass only through `PASS_STARTED` and cancels its pre-resolution state only through `PASS_CANCELLED`. The Engine owns the legality check and targeting-shaped `actionResolution`; it emits existing Pass Timeline semantics and never consumes Tracker economy merely for opening or cancelling targeting. A Bonus Pass transitions its owned ready continuation to active on start and back to ready on cancellation inside the continuation's atomic Timeline transaction.

**Consequences:**

- An Engine-created Pass resolution blocks unrelated Engine commands until it is cancelled or a later approved Pass slice resolves it.
- UI selection, hover and visual targeting remain transient presentation. They cannot create or clear canonical Pass resolution directly in offline Match Mode.
- Target selection, geometry/route, interceptor choice, dice, delayed resolution, interception, possession and completion remain separate migration slices. They must use this same resolution rather than create a second Pass state path.
- Manual Multiplayer remains unchanged until the frozen multiplayer track is explicitly reopened.

## ADR-033 — Pass target is canonical; active-match route inputs are frozen

**Status:** Active

**Decision:** Offline Single Player Match Mode selects a Pass target only through `PASS_TARGET_SELECTED`. The Engine validates the current targeting resolution, matching Pass identity and integer board coordinate against the immutable MatchContext board, then stores the requested target and advances to `route-selection`. An occupied target remains legal because the established Pass plan may shorten to the first player physically hit; target selection must not pre-judge that later route rule.

Until route confirmation receives its own Engine migration, both offline route preview and its remaining legacy plan construction read Rule Set, board settings and gameplay-card values from MatchContext rather than the live editor.

**Consequences:**

- Target choice is ordinary canonical Timeline state with deterministic Undo/Redo; it does not consume Tracker economy or create a plan, roll, interception or possession change.
- An edit made after Match start cannot change the routes displayed or calculated for that active Match.
- Route confirmation remains a distinct future slice because it is the actual action-consumption and resolution-entry boundary.
- Manual Multiplayer remains unchanged.

## ADR-034 — Pass route confirmation owns the plan and action-economy boundary

**Status:** Active

**Decision:** Offline Single Player Match Mode confirms a selected Pass route only through `PASS_ROUTE_CONFIRMED`. The Engine validates route identity and origin against the frozen path mode, rejects a blocked origin before consumption, builds the deterministic Pass plan from MatchState and MatchContext, then consumes exactly one normal Tracker action or retains Bonus Pass outside Tracker economy.

The transition may create the existing explicit pending interceptor decision or pending roll request when the frozen plan requires one. It must not choose an interceptor, submit/consume a roll, resolve interception, move the ball, alter possession or create a Bonus Action.

**Consequences:**

- The selected origin, foot, distance, effective target, direct hit, defensive crossings and interceptor ordering are one canonical plan rather than UI-owned pre-resolution data.
- `PASS_CONFIRMED` remains the semantic Timeline event; normal confirmation is stepwise and Bonus confirmation remains atomic with its continuation.
- A later Engine slice may consume the declared `pendingDecision` or `pendingRoll` without recomputing a competing plan.
- Manual Multiplayer remains unchanged.

## ADR-035 — Goalkeepers cannot be selected as Pass targets

**Status:** Approved, pending a dedicated target-rule amendment.

**Decision:** A player whose frozen gameplay-card position is `GK` cannot be selected as a requested Pass target, irrespective of team. This is a target-selection rule, not an interception, route-origin or resolution exception.

**Consequences:**

- The future `PASS_TARGET_SELECTED` amendment must reject a goalkeeper square before route selection begins.
- A goalkeeper remains a normal physical player for geometry, but a pass route that intersects one is invalid: the ball cannot pass through or finish at that goalkeeper. This route-blocker part is active in offline Single Player as of v20.26.1.
- The rule must not be hidden in UI-only disabled styling; Engine validation is required. Manual Multiplayer remains unchanged until that track is explicitly reopened.

## ADR-036 — Pass interceptor choice is a canonical decision transition

**Status:** Active

**Decision:** In offline Single Player Match Mode, an equal-priority interceptor is selected only by `PASS_INTERCEPTOR_SELECTED`. The command must match the active canonical Pass and its explicit `CHOOSE_INTERCEPTOR` decision. The Engine verifies the persisted decision against the equally ranked candidates still present in the canonical plan, applies the established deterministic reorder and frozen modifier cap, then creates the matching pending interception roll.

**Consequences:**

- React may render the decision and send an intent, but may not reorder the plan, select the roller or write the semantic Timeline event directly.
- The selection is independently reversible for a normal Pass and remains atomic within a Bonus Pass continuation.
- Tracker economy, ball position, possession, dice consumption, outcome resolution and later reaction advancement remain outside this boundary.
- Manual Multiplayer retains its legacy decision path until explicitly reopened.

## ADR-037 — Requested dice and Extra Roll are separate canonical inputs

**Status:** Active

**Decision:** In offline Single Player Match Mode, an ordinary die button may submit only an active canonical pending-roll request. `PASS_INTERCEPTION_ROLL_SUBMITTED` validates and consumes the exact unique RollEvent, then records the raw value and canonical delayed-resolution handoff. An `EXTRA_ROLL_SUBMITTED` is an explicit administrative event, not a substitute for a pending mechanic roll.

**Consequences:**

- The UI cannot create a gameplay die result merely because a user presses a team button; Engine validation requires the matching action, request, team, subject and reaction identity.
- Extra Roll is visible in Timeline and AI analysis, consumes no Tracker action, has no action-resolution consequence and automatically closes its one-roll UI arm.
- Existing delayed Pass outcome logic remains temporarily downstream, but must consume the Engine-recorded input rather than a UI-owned roll.
- Editor Mode and Manual Multiplayer keep legacy dice controls until explicitly migrated.

## Implementation note — v20.28.1 UI startup correction

The Extra Roll reset effect is presentation-only. Its Hook dependency expressions must be declared only after every referenced state value exists in component initialization order. This correction preserves ADR-037 exactly; it does not create a new gameplay decision.

## ADR-038 — Pass roll calculation precedes Pass consequence migration

**Status:** Active

**Decision:** `PASS_INTERCEPTION_RESOLUTION_DUE` owns only the deterministic calculation for a consumed Pass interception RollEvent. The Engine stores `lastResolution` and the explicit outcome before any state consequence is applied.

**Consequences:**

- The dice result, frozen rules and frozen gameplay-card values now have one authoritative mathematical interpretation.
- Timeline, Undo/Redo and AI export can inspect the actual result independently of later ball or turn changes.
- Ball movement, possession, turn change, Bonus Action, next interceptor and Pass completion remain separate migration boundaries; they must not be silently folded into the calculation command.
- Manual Multiplayer remains unchanged.

## Implementation note — v20.29.1 Extra Roll and Bonus Action

Extra Roll is administrative rather than a Bonus card action. An active Bonus Action must block unrelated gameplay commands but must not block `EXTRA_ROLL_SUBMITTED`; the command leaves its continuation untouched.

## ADR-039 — Frozen Pass result and Pass consequence remain separate commands

**Status:** Active

**Decision:** `PASS_INTERCEPTION_RESOLUTION_DUE` records only deterministic interception mathematics. `PASS_CONSEQUENCE_DUE` applies the corresponding ordinary board/Tracker/action-resolution consequence only after that frozen result exists. The latter deliberately rejects Natural 20 until its Bonus Action continuation branch is migrated as its own vertical slice.

**Consequences:**

- A consumed roll and its exact calculation remain independently inspectable in Timeline, Undo/Redo and AI export before any resulting possession change.
- Normal Pass completion, direct opponent hit, ordinary interception and missed-interceptor advancement now have one Engine-owned state transition in offline Single Player.
- Natural 1's next-interceptor penalty is durable canonical state, rather than a UI calculation.
- Manual Multiplayer keeps its legacy downstream route, including its existing Natural 20 handling, until that mode receives a separately approved audit.

## ADR-040 — Natural 20 grants a deterministic replacement continuation

**Status:** Active

**Decision:** The existing `PASS_CONSEQUENCE_DUE` command owns Natural 20 after the frozen interception result. It creates the Bonus Action continuation from a deterministic Pass/RollEvent-derived identity, moves the ball to the interceptor and defers the Tracker turn/possession transition to the established `END B.A.` resume policy.

**Consequences:**

- Natural 20 is not a UI-created exception and no Engine randomness or clock value participates in MatchState.
- A Natural 20 occurring during another Bonus Action replaces that continuation; its origin records the parent and Timeline records the superseded identity.
- Roll, frozen result and granted continuation remain one atomic resolution transaction; the granted Bonus Action remains its own later atomic action transaction.
- Manual Multiplayer remains untouched.

## ADR-041 — Phase 8A keeps test safety and manual declarations canonical

**Status:** Active.

**Decision:** The remaining offline Match controls discovered by the Phase 8 audit must not retain direct UI state mutation. `INACTIVE` / `ACTIVE`, Reset Trackers and Change Possession are Engine commands with normal Timeline/Undo/Redo/AI visibility. Reset and possession remain temporary administrative safety tools while Match automation is still under construction.

Unimplemented individual action buttons (`SHOT`, `CROSS`, `DRIBBLE`, `TACKLING`) remain available for manual test matches, but only as canonical declarations. A normal declaration consumes the existing Tracker action; a Bonus declaration consumes the chosen Bonus Action and remains awaiting explicit `END B.A.`. Neither declaration invents a board consequence, probability, die result or rule outcome. AI Analysis must explicitly say that manual resolution is required.

Editor Workspace setup is locked after an offline Match starts whenever a change could contradict frozen MatchContext or rewrite live Match setup. Editor Mode remains unrestricted and Manual Multiplayer remains unchanged.

**Consequences:**

- Future implementations of Dribble, Shot, Cross and Tackling replace only the Engine treatment of their already-wired commands; UI, Timeline and action economy do not need another migration.
- Safety controls can later be retired from Match Mode without leaving hidden direct mutation paths.
- Phase 8B may centralize the Controller gateway without re-auditing the completed 8A mutation inventory.

## ADR-042 — Single Player Match commands publish through one gateway

**Status:** Active

**Decision:** An offline Single Player Match UI handler must use `singlePlayerMatchGateway` to call the pure Controller and publish an accepted result. The gateway publishes the Controller-returned Timeline and its exact cursor state together; rejected results never reach React projection.

**Consequences:**

- Engine, Controller, Timeline commit and UI projection retain separate responsibilities without creating a second gameplay state.
- `main.jsx` keeps only the React-specific projection callback and local presentation behavior such as selection clearing, notices and timers.
- One-command, dependent command sequence and Match-start flows share the same acceptance/publication rule.
- Manual Multiplayer and Editor Workspace retain their existing independent paths until their separately approved audits.

## ADR-043 — Workspace persistence never restores a partial Match

**Status:** Active

**Decision:** Cloud, Local Workspace backup and future Workspace persistence use an explicit WorkspaceSnapshot that excludes Match Runtime. A live Match is represented only by its Timeline/MatchContext and may be exported through Match Recording, not through Workspace persistence.

**Consequences:**

- old flat persistence remains readable for the board/setup fields, but its former Match fields are ignored;
- active offline Match blocks Workspace save, autosave and import; export uses its frozen opening setup;
- the Editor remains free outside Match and Manual Multiplayer Firebase remains unchanged;
- persistence and Editor UI extraction can proceed without creating another Match authority.

## ADR-044 — Structural Editor mutations are planned outside React

**Status:** Active

**Decision:** The structural Workspace mutations that define a future Match setup use pure Workspace operation planners. The React layer may request user confirmation, publish the accepted plan, add existing History information and invoke legacy Manual Multiplayer persistence, but does not own the underlying transformation.

**Consequences:**

- board settings, formations, scenario save, Rule Set commit and card assignment/removal are independently testable without browser or Firebase APIs;
- the Match Engine remains separate because unrestricted Editor operations are not gameplay commands;
- visual card editor controls remain where they are until a specifically justified UI extraction, avoiding cosmetic file movement.

## ADR-045 — Structural Card Library operations are separate from Card Editor presentation

**Status:** Active.

**Decision:** Card Library save/upsert, clone preparation, deletion with puck detachment and Reset Cards are pure Workspace operations. Their callers supply generated IDs/timestamps, inline-artwork classification and application-specific piece sanitation. React owns only confirmation, visual selection, publication, History and retained Manual Multiplayer synchronization.

**Consequences:**

- Card deletion remains one structural operation that returns both the next library and the detached board pieces; it cannot leave a puck pointing at the removed card.
- The visual Card Editor remains an existing UI surface until a separately justified component boundary is approved. Its field/layout controls continue through `updateCardState`; no second card-data mutation path is introduced.
- Card Library transformations are testable without React, Firebase, browser clock or randomness.

## ADR-046 — Shared card rendering is a UI component boundary

**Status:** Active.

**Decision:** `CardVisualCanvas` is the shared presentation renderer for Editor previews, Inspector, Assign Card preview and PNG export. It owns only visual rendering and local pointer/resize presentation. Its caller supplies presentation helpers and existing layout-change callbacks through the `CardPreview` render context.

**Consequences:**

- The same card-zone rendering path remains in every surface; no second renderer is introduced.
- Canvas cannot own card-library mutation, Timeline, Firebase, Match rules or Manual Multiplayer synchronization.
- `main.jsx` no longer owns Canvas JSX or its DOM interaction implementation. Card Editor form and panel composition are a separate UI boundary under ADR-047.
- Every extracted renderer context must be tested on each visual side it supports; v20.37.1 adds the Back-card regression case.

## ADR-047 — Card workspace surfaces receive a controller, not application authority

**Status:** Active.

**Decision:** `CardEditorPanel`, `CardsPanel` and `AssignCardModal` own card-workspace presentation. `main.jsx` supplies each surface a controller prop containing its existing display data, UI selections and callbacks. The controller may bridge to Workspace planners, browser file inputs and retained Manual Multiplayer synchronization, but those operations do not move into the UI components.

**Consequences:**

- there is one Card State and one existing mutation path through `updateCardState` and the Workspace/Card Library planners;
- Editor and Assign previews continue to use `CardPreview`, therefore Front/Back rendering cannot diverge by surface;
- UI component tests render the Editor, Library and Assign boundaries without a live Firebase session;
- no Match Engine, Timeline or automated Multiplayer ownership is introduced in the card UI.

## ADR-023 — Free Move is a visible, reversible administrative Engine action

**Status:** Active

**Decision:** In offline Single Player Match Mode, Free Move is resolved only through `FREE_MOVE_STARTED`, `FREE_MOVE_COMMITTED`, and `FREE_MOVE_ENDED`. It is a visible administrative correction, not a gameplay action: every start, segment, and end remains in Timeline History and participates in normal Undo/Redo, Replay, and AI export. AI export marks it `movementReason: "FREE_MODE"` and `eventSource: "MANUAL_CORRECTION"`; it never consumes Tracker economy.

While Free Move is active, no other offline Match Mode action may proceed. Its selected player can move in any number of segments with no distance, axis, path, phase, Speed, or Tracker restriction, but may not finish on another player. The ball square is permitted. A Free Move changes only the selected player position: it never carries, takes, or dislodges the ball.

**Reason:** The tool is a recovery route for a test-stage board state, so hiding it from history or allowing normal gameplay to interleave with it would make the canonical record misleading. Treating the correction as a normal, clearly-labelled Timeline event keeps every later state explainable and reversible while preserving its non-gameplay status.

**Consequences:**

- Engine-level command lock prevents migrated mechanics from bypassing the active correction.
- UI-level lock prevents remaining legacy offline action entrances and Free Ball from interleaving.
- Undoing an end restores active Free Move; undoing a segment restores its prior board position; Redo reapplies the same sequence.
- Manual Multiplayer and Editor Mode remain unchanged.
