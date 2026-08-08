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

## ADR-058 — A partial mechanic may stop only at an explicit canonical checkpoint

**Status:** Active

**Decision:** v20.56.27 Shot is allowed as a deliberately partial vertical
slice because its endpoint is a persisted, hard-blocking `result-display`
state, not a pseudo-restart. The Engine has recorded the exact D20 calculation
and outcome, while score, board coordinates, possession, turn and restart
state remain intentionally unchanged.

**Consequences:**

- a result dialog has no acknowledge, close, continue or `Restart ready`
  control; Timeline Undo/Redo or a new match is the only exit in this release;
- follow-up Goal/Goal Kick/Corner/goalkeeper-retains work must be Engine
  commands that consume this state and create physical canonical transitions;
- Board target selection and route choice remain selector-projected Engine
  facts, so a future consequence cannot depend on UI-local geometry;
- Manual Multiplayer/Firebase retain no knowledge of this offline checkpoint.

**Update (v20.56.33 — Goalkeeper Retains):** the "no exit but Undo/Redo or a
new match" clause above is narrowed to the outcomes that still have no
consequence (Goal, Goal Kick, Corner). Goalkeeper Retains now shows a
Continue button, exactly like Lofted Through Ball's and Pass's own
non-terminal result screens, instead of gaining a novel third behavior. The
button dispatches the real canonical `SHOT_CONSEQUENCE_DUE` transition (ball
to the goalkeeper's cell, new turn for the goalkeeper's team) — it is not a
fake control under rule 11 because it performs the actual consequence, the
same way Lofted's own Continue button already does. No timed auto-advance
was added; a first attempt at one was reverted after testing showed a 1
second hold reads as too abrupt and inconsistent with every other result
screen's own exit pattern. Goal, Goal Kick and Corner remain exactly the
ADR's original terminal checkpoint, with no Continue control at all, until
their own future builds land.

## ADR-059 — Invalid direct-board targets are canonical previews, not UI errors

**Status:** Active

**Decision:** A board-first action may accept an attempted cell that fails its
action target domain. The Engine persists the attempt and rejection reason as a
non-actionable preview, while the UI renders its geometry and message. Shot uses
this for cells outside the opponent GoalGrid.

**Consequences:**

- no UI-local target legality or hidden target-only click surface is required;
- invalid previews consume no Tracker/personal action and offer no route command;
- Timeline/Undo/Redo/Replays can reconstruct the attempted target and its grey
  presentation exactly.

## ADR-049 — Offline Match projection has one Engine-backed read boundary

**Status:** Active

**Decision:** Offline Single Player Match UI reads gameplay-facing previews, availability, badges and resolution details only through `matchPresentationSelectors.mjs` and canonical MatchState. Selectors may reuse pure Engine evaluators; `main.jsx` must not reimplement or directly import them for offline Match.

**Consequences:**

- a move, 3/2 or Group Move preview uses the same evaluator as its command; Group Move preserves its deliberate crossing exception;
- a projection field that cannot exist for invalid presentation input is explicitly nullable; its consumer must render an illegal/unavailable presentation and must never recreate the missing gameplay fact locally;
- Inspector availability and frozen Rule Set values cannot drift from the active Timeline cursor and MatchContext; this includes Group Move draft activation, whose local band shape is supplied by an Engine-command preview rather than by `main.jsx` reading Rule Set or Tracker fields;
- a persisted Pass/Interception fact is displayed rather than reconstructed by a popup fallback;
- preview-only evaluator options are not command payload fields, so UI presentation cannot grant a submitted command additional authority;
- Free Ball/Free Move, Inspector, End Turn and Bonus controls consume the same boundary, and active-decision card values come from frozen MatchContext cards;
- Manual Multiplayer remains on its frozen legacy branch and is not routed through this contract implicitly.

## ADR-050 — Every offline Match mechanic has a mandatory integration gate

**Status:** Active

**Decision:** A new or materially changed offline Single Player Match mechanic cannot be proposed for approval or released without the explicit seven-row Mechanic Integration Gate defined in `GAME_ENGINE_ARCHITECTURE.md`: Rule Set/compatibility, frozen MatchContext, Engine commands, official projection, canonical Timeline history, AI Analysis Export, and mode-boundary/verification evidence.

**Consequences:**

- UI may offer only official projected command routes and must not acquire a temporary gameplay fallback while a mechanic is incomplete;
- every gameplay-facing display, including badges, popups and results, has a named canonical source before implementation;
- Timeline, Undo/Redo, Replay and AI review are completion requirements rather than follow-up work;
- Editor and frozen Manual Multiplayer/session compatibility are explicitly classified instead of being altered by implication;
- structural sentinels protect the established offline UI-to-selector-to-gateway boundary, while the Gate makes the design review itself auditable for each future mechanic.

## ADR-051 — Pass family separates measurement, execution route and interception eligibility

**Status:** Active

**Decision:** Offline Single Player PASS is one Engine command with a canonical Short/Long classification. Every range measurement is source-square-centre to target-square-centre; a selected corner is execution geometry only. Short and Long both require an active outfield target. Short retains the ground-route plan. Long uses its frozen Rule Set stable attacker stat and ignores bodies/defensive areas in the aerial middle route. At launch and landing only, Long applies Short's per-traversed-defensive-cell visibility rule in the existing endpoint neighbourhood (endpoint square plus its eight adjacent squares); it never requires the area to contain the passer or receiver square. An opposing body blocks only when that line crosses its occupied square; a passer or receiver is never globally ignored. Both groups resolve through the existing generic Interception engine.

**Consequences:**

- Rule Set schema v8 owns the threshold; MatchContext resolves and freezes the stable global `Long Pass` stat ID without exposing a Rule Set selector.
- Compact MatchContext gameplay cards retain stable stat IDs, so visible stat renames cannot alter a frozen match.
- The Long plan persists the activated endpoint group, each eligible defender's physically crossed defensive cells, reaction points and progressive/Natural-1 sequencing from origin through destination; Timeline, Replay and AI display stored facts rather than recomputing geometry or values. Activation is symmetric: the passer/receiver body must belong to the defender's area; aerial-middle crossings alone cannot activate a defender.
- Every Pass plan persists one direct-contact fact and its canonical route verdict. The Single Player projection converts it into a shared Short/Long segmented route; a selected target is not an intermediate impact, and UI neither discovers contact nor independently chooses a conflicting colour verdict.
- The frozen Manual Multiplayer/session branch remains on its legacy Pass plan and is not silently migrated by this decision.

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

## ADR-016 — Action identity is lossless across official consumers

**Status:** Active

**Decision:** Every Engine action recorded in the Tracker action log stores a canonical semantic `type` and an Engine-owned `trackerMarker`. MatchState normalization may validate malformed data, but must retain malformed/unknown identity explicitly as `UNKNOWN`; it must never substitute another valid gameplay action. Tracker UI, History/Replay projections and AI Export display or export stored action identity rather than deducing it from geometry, labels or current UI state.

**Reason:** Rewriting an unrecognized action as `PASS` hid a Through Ball record while leaving all surrounding gameplay state apparently valid. That made a data-integrity fault look like a visual label defect.

**Consequences:**

- Pass classification is stored by Engine as `SP` or `LP`; Through Ball is `TB`; manual Lofted Through is `LT` until its full mechanic exists.
- Unknown action records are visible to tests and diagnostics as `UNKNOWN` / `?` instead of silently changing game meaning.
- Any new action must add its Engine record, tracker marker, normalization coverage, Timeline/Replay preservation and AI Export mapping in the same build.
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

**Decision:** In offline Single Player, 3/2 is requested through `THREE_TWO_MOVE_COMMITTED` and resolved solely by the Game Engine. It consumes no Tracker action and remains legal after the active team has exhausted normal Tracker actions. It remains limited to the active team phase or to the owning active Bonus Action, one use per player, its established straight/diagonal range, a ball destination, and a destination not occupied by another player. A successful Through Ball or Lofted Through Ball grants the opportunity immediately; it may be used later in that same turn/BA context while the ball remains there. Clicking the visible ball with an eligible selected player is only a UI entry to that same command.

If that same destination also has a legal normal-MOVE route, the UI presents `Rule 3/2`, `Normal move`, and `Cancel`. It projects both routes from Engine evaluation. Normal Move commits directly only when the player already has `moveAuthorized`; otherwise the direct-board entrance uses the established atomic `NORMAL_MOVE_STARTED` then `NORMAL_MOVE_COMMITTED` command sequence. This is the same gameplay route as pressing MOVE in Inspector, not a third movement mechanic.

**Reason:** Legacy UI gates treated a free action as unavailable when Tracker was exhausted, while the ball pointer handler stopped a direct destination click before 3/2 validation could run. Both paths made the rule unreliable and created a second gameplay interpretation outside canonical MatchState.

**Consequences:**

- `THREE_TWO_MOVE` remains the semantic Timeline/AI event.
- Choosing Normal Move retains the existing `MOVE_ACTIVATED` and `PIECE_MOVED` Timeline/AI semantics; the popup choice itself is not a gameplay event.
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

Players must begin in the confirmed zone, have no ball, and have no gameplay movement during the turn; administrative Free Move does not disqualify them. Each player moves once, ignores card Speed, and cannot finish on a player or ball. Horizontal/vertical movement respects the frozen orthogonal limit; exact diagonal movement respects the separately frozen diagonal limit. The first successful move fixes orientation and optionally exact direction for the group. Unlike normal movement, Group Move may cross players: this is a deliberate tactical tool for moving a line and creating an offside attempt.

**Consequences:**

- Rule Set schema v6 owns Group Move's separate orthogonal and diagonal limits; MatchContext freezes both at Match start, and zone confirmation copies both into canonical active Group Move state. Old Rule Sets and old canonical Group Move state migrate their one historical limit into both values at their normalization boundary.
- Preview-zone repositioning is UI-only; only confirmation and physical moves enter Timeline.
- End Turn clears the active Group Move state before recording the next phase; the Engine lock can never cross to the opposing team.
- UI eligibility marks are presentation only and derive from the Engine's pure eligibility evaluator. Before the draft band opens, its availability, frozen length, centred default start and drag boundary derive from a preview of `GROUP_MOVE_ZONE_CONFIRMED`; `main.jsx` does not independently read Group Move Rule Set or Tracker fields. Destination preview derives from the corresponding pure Engine evaluator, including the Engine-projected applicable distance limit; it never derives geometry limits from normal-MOVE or card-Speed rules.
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

## ADR-052 — New Match setup is distinct from continuing a Match

**Status:** Active

**Decision:** Offline Single Player Tracker distinguishes `Start New Game` from
`Continue Game`. Continue Game uses the existing canonical restart transition:
it preserves board coordinates but clears Match runtime and begins turn one.
Start New Game is a future-Match Workspace boundary before `MATCH_STARTED`: it
reapplies selected coordinate-only formations while preserving card links,
performs the central opening placement, then creates a fresh Timeline and
MatchContext. Leaving Match Mode for Editor clears Match runtime but preserves
the Workspace board and card assignment.

**Consequences:**

- a former Match Timeline cannot leak into a newly started Match;
- active-match formation selection uses the established live formation
  application path and preserves every card link; Continue Game remains the
  explicit choice that preserves a current board unchanged;
- the Engine remains authority for Continue Game runtime reset and Match start;
- Manual Multiplayer retains its frozen lifecycle.

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

Unimplemented individual action buttons (`SHOT`, `CROSS`, `DRIBBLE`, `TACKLING`) remain available for manual test matches, but only as canonical declarations. A normal declaration consumes the existing Tracker action; a Bonus declaration consumes the chosen Bonus Action and remains awaiting explicit `END B.A.`. Neither declaration invents a board consequence, probability, die result or rule outcome. AI Analysis must explicitly say that manual resolution is required. **Superseded for `SHOT` (v20.56.29):** Shot is now a full canonical Engine mechanic (`src/engine/shotRules.mjs`) with its own roll, hold and resolution commands — this manual-declaration path no longer applies to it. `CROSS`, `DRIBBLE` and `TACKLING` remain manual declarations as described above.

Editor Workspace setup is locked after an offline Match starts whenever a change could contradict frozen MatchContext or rewrite live Match setup. Editor Mode remains unrestricted and Manual Multiplayer remains unchanged.

**Consequences:**

- Future implementations of Dribble, Cross and Tackling (Shot already delivered, v20.56.29) replace only the Engine treatment of their already-wired commands; UI, Timeline and action economy do not need another migration.
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

## ADR-048 — Match presentation is a view-only mode boundary

**Status:** Active.

**Decision:** `BoardCanvas` receives an explicit `presentationMode`. Offline Single Player Match supplies `match`; Editor Mode and the frozen Manual Multiplayer route supply the existing `editor` presentation. The mode changes only CSS presentation wrappers and must not alter board geometry, hitboxes, legal previews, commands, MatchState, Timeline or Firebase data.

**Consequences:**

- later 2.5D terrain, tactical figures and Match UI work can target one stable Match-only visual boundary;
- Editor remains a precise technical workspace;
- Manual Multiplayer can adopt the same presentation later through an explicit, separately approved route rather than being changed accidentally;
- visual work remains reusable for a future authoritative Multiplayer implementation because it consumes rendered state only.

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

## ADR-053 — Bonus Action capability and token lifetime are Engine facts

**Status:** Active.

**Decision:** Offline Bonus Action has one Engine-owned capability list. Only an implemented action type may transition a ready continuation to an active action; its ordinary typed command then carries the mechanic through Timeline. The UI may disable or present those capabilities but cannot create a local BA action or reinterpret Tracker state. Free Move remains an explicitly permitted administrative Engine action while BA is pending.

The pre-v20.56.24 AV/AVM opportunity wording is superseded by ADR-057's canonical complete team-token model. The Engine resolves a selected eligible token into the pending-roll projection and consumes it with the submitted roll. A token earned during a Bonus Action with an advance-turn resume policy is assigned to that resumed numbered turn, not to the transient BA boundary. Each Engine turn advance prunes expired tokens and records the loss in event metadata.

## ADR-054 — Natural-roll consequences are structured Engine facts

**Status:** Active

**Decision:** Every resolved natural outcome records a structured effect with its recipient and time window. UI result prompts may translate that effect into text but must not infer it from an event name, natural value, or legacy continuation shape.

**Consequences:** Configuring Natural 20 as `none`, AV or AVM cannot leave a stale Bonus Action sentence in an Interception or Lofted Through popup. Future roll mechanics reuse the same presentation contract. Manual Multiplayer is unchanged.

**Consequences:**

- BA Move, Pass, Through Ball and Lofted Through share one typed contract and atomic Timeline grouping where applicable.
- Rejected BA movement retains Engine geometry for render-safe feedback; UI never reads an internal command envelope as a preview result.
- Prompt values, roll math, Undo/Redo, Replay and AI all retain the same token state and source facts.
- Manual Multiplayer is not routed through this offline capability contract.

## ADR-055 — Card roles are the only Single Player role authority

**Status:** Active.

**Decision:** In Single Player, a football role belongs exclusively to the
assigned card's `position`. A puck is a stable physical board identity and a
formation is a spatial coordinate template. Neither may create, override or
preserve a second role source. Applying a formation must retain the existing
card-to-puck link.

**Consequences:**

- legacy `[label, coordinate]` formation data remains readable but migrates to
  coordinates only;
- roster validation and future positional zones read card data only;
- Timeline and AI export no longer infer a Single Player role from a puck
  label;
- Manual Multiplayer's existing label compatibility path remains unchanged
  and is not an authorization to extend that system.

## ADR-056 — Active-Match tactics are distinct from Workspace formations

**Status:** Accepted for the future interruption/restart vertical slice; not
implemented in v20.56.23.

**Decision:** A selected Workspace formation prepares a future new Match. An
active Match instead owns a separate tactical formation in MatchState. A
tactical change is an Engine command recorded in Timeline and AI export, but
it does not itself move a player or ball on the live board. Only the explicitly
authorised placement phase of a canonical restart may reposition pieces.

**Consequences:**

- the active-Match tactical selector must not call the Workspace live-template
  application path;
- a tactical preview is presentation only, while the confirmed tactic is a
  canonical gameplay fact;
- a substitution may extend the same interruption draft, validate the proposed
  eleven and place its incoming reserve in a chosen legal free cell;
- Kick-off initializes from the Workspace formation for a new Match and later
  uses the active Match tactic;
- Manual Multiplayer remains outside this future feature.

## ADR-057 — Team modifier tokens are canonical MatchState facts

**Status:** Active.

**Decision:** Single Player stores team-owned AV, AVM, DV and DVM as canonical
`teamModifierTokens` in MatchState. Tokens declare their team, type, granting
source, action source, eligible roll scope and turn expiry. Same-tier opposites
cancel on receipt; capacity is frozen from Tracker Settings into MatchContext.
Tracker is a projection only. Action-specific numeric components remain action
formula facts unless they are explicitly granted as a team token.

**Consequences:** Timeline, Undo/Redo, Replay and AI export reconstruct the
same token state. Existing Interception and Lofted Through AV/AVM effects use
the model without changing their rule outcome. Manual Multiplayer and Firebase
do not consume or publish this Single Player feature.

## ADR-060 — Shared roll-cap, corner-badge and cancel contracts

**Status:** Active.

**Decision:** Every manual-D20 mechanic (Pass/Interception, Through Ball,
Lofted Through Ball, Shot, and any future Cross/Dribbling/Tackling roll)
computes its capped roll modifier through the one shared
`sumAndCapRollModifier(sources, modifierCap)` in `src/rules/rollModifierMath.mjs`.
The rolling subject's own base card stat is a modifier source like any
other: every source sums first, and the combined total is capped
symmetrically exactly once at the frozen `diceModifiers.stackCap`. A
mechanic must never cap situational modifiers alone and add its own stat
back in afterward.

Every board-first mechanic's corner/route picker converges on the one
`selectRouteCornerBadges(routes, { actionLabel, footLabel })` projection in
`matchPresentationSelectors.mjs`. A corner blocked by the acting player's own
body is shown disabled; it is never removed from the projected list.

Reselecting an already-chosen target during `route-selection` always fully
cancels the action, for every mechanic, through one shared
`cancelActiveResolutionTargeting()` dispatcher in `main.jsx`. There is no
"return to targeting only" partial-cancel command; a mechanic exposes one
full-cancel Engine command (for example `SHOT_CANCELLED`,
`THROUGH_BALL_CANCELLED`) and registers it in that dispatcher.

**Reason:** Shot and Lofted Through Ball capped situational modifiers alone
and added the rolling subject's card stat back afterward, letting the
combined total silently exceed the frozen cap; Pass's pre-roll Interception
prompt had the identical bug relative to its own later `resolveInterception`
math. Separately, Pass hid an origin-blocked corner from its route picker
while Through Ball, Lofted Through Ball and Shot already showed it disabled,
and reselecting a route-selection target fully cancelled Pass but only
returned Through Ball/Lofted Through Ball to targeting while leaving their
Cancel control active. Fixing each mechanic independently would have left
the same three defects reachable by every future mechanic; a shared
contract closes the whole class at once and is now a Mechanic Integration
Gate requirement (ADR-050) rather than an implicit convention.

**Consequences:**

- `resolveInterception` is refactored onto the shared cap function with an
  identical numeric result; no Interception rule or test outcome changed.
- The uncapped per-source modifier facts remain intact for AI Export in
  every mechanic; only the displayed/resolved capped total's composition
  changed for Shot, Lofted Through Ball and the Pass Interception prompt.
- `LOFTED_THROUGH_BALL_ROUTE_CANCELLED` and `THROUGH_BALL_ROUTE_CANCELLED`
  are removed as dead code; their sole UI callers now dispatch the full
  cancel instead.
- `docs/ACTION_RESOLUTION_ENGINE.md` records these three utilities as
  mandatory for any future mechanic under this contract.
- Manual Multiplayer, Firebase and Editor Mode do not consume this
  Single Player projection/cancel contract.

## ADR-061 — Goal's Kick-off moves only the ball and the kickoff piece to the board's true geometric centre

**Status:** Active. Amended once already — see the postmortem below.

**Decision:** Build B of the Shot consequence vertical slice introduces
canonical `state.score`, `state.kickoffRestart`, and reuses/extends
`state.goalkeeperRestartException` (added with Goalkeeper Retains, Build A).
A Goal's consequence (`applyShotConsequence`'s `applyGoalConsequence` in
`src/engine/shotRules.mjs`) computes the board's true geometric centre cell
directly from `context.boardSettings` (`floor(cols/2), floor(rows/2)`),
finds the entitled (conceding) team's first `position: "ST"` piece (falling
back to any outfield piece if no ST exists), and moves only that piece and
the ball onto that centre cell. **Every other piece is left exactly where it
already is** — this build does not attempt a full 22-piece formation reset.
`state.kickoffRestart = { team, pieceId }` gates every command except the
whitelisted Pass/Through Ball/Lofted Through Ball set (`gameEngine.mjs`)
until that one player acts. **Updated (v20.56.42):** that action is no
longer a forced free backward Short Pass — it may be any pass type, any
direction, at ordinary normal Tracker cost, exactly like any other pass
(`passStartRules.mjs`/`throughBallRules.mjs`/`loftedThroughBallRules.mjs`,
all keyed off `kickoffRestart.pieceId`, cleared via the shared
`kickoffRestartAfterAction` in `kickoffMomentRules.mjs`). Only the piece
restriction remains.

**Postmortem — the first version of this ADR was wrong in production.** The
original decision snapshotted `state.pieces` into `state.kickoffLayout` at
every `MATCH_STARTED`/`MATCH_RESTARTED` and restored the full layout from it.
This is unsound: `main.jsx`'s "Continue Game" path (see
`prepSelectionBoundary.test.mjs`'s "Offline Continue starts an unstarted
current board without Prep" contract) deliberately starts a Match from
whatever is currently on the board, with **no** Prep/formation step at all —
by design, not a bug in that path. A user who tested through "Continue Game"
got `kickoffLayout` frozen as an arbitrary mid-match snapshot, not a
formation; the very next Goal then placed the conceding team's kickoff piece
directly on top of the scoring player, because the "centre" cell it computed
was wherever the ball happened to be at that arbitrary snapshot moment (right
next to the goal the shot was just taken from), and no other piece moved at
all because the "restored" layout was nearly identical to the current board.
The Engine has no way to distinguish a genuine Prep-derived formation from an
arbitrary "Continue" snapshot, and there is no dedicated
"committed-formation" concept anywhere in the codebase to snapshot instead
(confirmed by search: no `readyLineup`/`formationSnapshot`/equivalent
exists). Rather than depend on a snapshot whose validity secretly depends on
*how the Match was started*, this ADR now computes the centre cell from pure
board geometry, which is correct unconditionally, and drops the full-layout
restore entirely as out of scope for this build.

**Reason:** A pure Engine module cannot depend on Editor-only formation
application without violating Phase 1's "engine imports no React, DOM, or
UI-layer module" contract (`docs/GAME_ENGINE_MIGRATION_PLAN.md`), and no
Engine-owned concept of "the currently committed starting formation" exists
to snapshot safely regardless of how a Match started. Board geometry alone
(`cols`/`rows`) is always correct and needs no such concept.

**Consequences:**

- A Goal's Kick-off does **not** reset the rest of both teams to a starting
  formation in this build — only the ball and the entitled team's kickoff
  piece move. Restoring a full formation on every Kick-off remains a
  documented gap for a future build, contingent on a real Prep-committed
  layout concept being added first.
  **Superseded (v20.56.42).** That concept now exists: `state.activeFormation
  = { blue, red }` (`src/game/gameState.mjs`), set at `MATCH_STARTED` from
  Prep's selected formations and updated by the canonical
  `FORMATION_TACTIC_CONFIRMED` command (`src/engine/formationTacticRules.mjs`)
  — this is the "Engine-owned concept of the currently committed starting
  formation" this ADR's Reason section said did not exist. A Goal now DOES
  re-lay out both teams into whichever tactic is active for them
  (`applyGoalConsequence`), still computing the centre cell from pure board
  geometry exactly as this ADR decided, then unconditionally pinning the
  ball and the kick-off piece there regardless of what that formation says
  for their slot — so the postmortem's core lesson (never trust a raw
  `state.pieces` snapshot to represent "the formation") remains fully
  respected; nothing here reintroduces `kickoffLayout`. Continue Game is
  still unaffected: it never populates `activeFormation`, so nothing is ever
  reapplied for it. See `docs/TEAM_COMPOSITION_AND_FORMATIONS.md` section
  5.8 and `docs/FINALISATION_AND_RESTARTS_RULES.md` section 3.2.
- The kickoff piece can, in principle, still land on another piece that
  happens to already occupy the exact centre cell — a rare coincidence now,
  not the systematic overlap the snapshot-based version produced. No
  rejection guard was added for this narrower case per explicit user
  direction; it may be revisited later.
- `kickoffRestart` is a hard gate (`gameEngine.mjs`'s `kickoffRestartActive`
  guard) — unlike `goalkeeperRestartException` below, which never blocks a
  command, only relaxes geometry for the one matching piece.
- The Goalkeeper Retains restart exception (`docs/SHOOTING_RULES.md`:
  opposing bodies and defensive areas inside the goalkeeper's own penalty
  area are ignored for that one restart) is now shared, exported geometry:
  `insideOwnPenaltyArea(settings, cell, team)` in `src/rules/passEngine.mjs`
  covers both the large and small box. `buildPassPlan`, `planThroughBall` and
  `planLoftedThroughBall` each accept an optional `restartException: {team,
  pieceId}` and filter it into their own existing defensive-area/body-block
  computations; a mechanic's own completion path (`completePass`,
  `completeNormalInterception`, Through Ball's and Lofted Through Ball's
  terminal transitions) clears `state.goalkeeperRestartException` once that
  one restart resolves, exactly mirroring how `kickoffRestart` is consumed.
  **Amended — the first version of this bullet was wrong.** It originally
  left `firstPlayerHit`/`endpointBodyContact` (the mechanic that redirects a
  Pass onto the first body it meets along the route) untouched, reasoning
  that the exception should be scoped to defensive-area crossings and
  origin/segment body-blocks only. Live testing showed this was incorrect:
  "opposing bodies... are ignored" (docs/SHOOTING_RULES.md) means exactly
  that — an opponent's body sitting on the goalkeeper's restart route inside
  its own box must not become the pass's effective target either, or the
  ball is redirected straight into that opponent instead of reaching the
  real intended receiver. `firstPlayerHit` and `endpointBodyContact` now
  accept an `ignorePieceIds` set (bodies inside the box under the active
  exception, computed once in `buildPassPlan`, always excluding whoever
  occupies the requested target cell — the intended receiver is never an
  obstruction to clear) and exclude them from hit-detection entirely, so the
  ball passes through to whatever body (or empty cell) is actually next.
  `occupied`-style target-cell checks (Through Ball/Lofted Through Ball)
  were already correctly left untouched — see the note there.
  **Amended a second time.** The exception was first re-scoped to still only
  ignore an *opponent's* body, reasoning it should mirror
  `docs/SHOOTING_RULES.md`'s literal "opposing bodies... are ignored"
  wording. The user clarified this was also wrong for this specific
  restart: a teammate's body standing in a box that is necessarily crowded
  right after a save must be ignored too, not just an opponent's — this was
  confirmed as an intentional rule change, not a documentation-reading
  error, and `docs/SHOOTING_RULES.md` and `docs/CROSS_RULES.md` were updated
  to say "every body (teammate or opponent)" rather than "opposing bodies"
  for this one restart. `bodyIgnoredByException` (renamed from
  `opponentIgnoredByException`) and `originBlocker`'s exemption in
  `buildPassPlan`, and Through Ball's `bodyBlocked` check in
  `planThroughBall`, no longer filter by team. The general Pass rule itself
  (`docs/PASS_AND_INTERCEPTION_RULES.md`: a teammate's body along an
  ordinary, non-exception route "receives directly" rather than blocking)
  is unrelated and unchanged — that is a different concept (a completed
  short pass to whoever is physically in the way) from this restart's
  crowded-box exemption.
- Goal Kick's own, textually similar but narrower exception ("opposing
  defensive areas ignored... does NOT state that opponents' bodies are
  ignored") is a different rule and a separate future build (Build C); it
  must not reuse `goalkeeperRestartException`'s body-ignoring behavior
  wholesale.
- The Goal/Goalkeeper Retains result screens both use a **Continue** button
  (`confirmShotConsequence` in `main.jsx`) rather than a timed auto-advance,
  matching Lofted Through Ball's and Pass's own non-terminal result screens
  (see ADR-058's v20.56.33 update). **Superseded (v20.56.45):** Corner and
  Goal Kick now use the same Continue button — see ADR-062.

## ADR-062 — A shared restart-setup engine owns Corner and Goal Kick, not two bespoke mechanics

**Status:** Active.

**Decision:** `src/engine/restartSetupRules.mjs` is one generic state
machine (`state.restartSetup`) covering every fixed-restart type documented
in `docs/FINALISATION_AND_RESTARTS_RULES.md` section 9's routing principle —
Corner and Goal Kick today; Free Kick Direct/Indirect and Throw-in are
Rule-Set-configured the same way but have no trigger mechanic yet, so they
never reach this engine in a live Match. Kick-off and Penalty are
deliberately excluded — Kick-off is a whole-team automatic tactical reset
(ADR-061, a structurally different shape), and Penalty is a single fixed
roll with no wall/reposition/execution-choice phases at all.

Four phases, each skippable via Rule-Set config (`wallSize`/`repositionCount`
= 0): **wall** (`RESTART_WALL_SET`, coach picks which of its own pieces, the
Engine computes their board cells) → **reposition** (`RESTART_PIECE_REPOSITIONED`
/`RESTART_REPOSITION_PASSED`, alternating turns starting with the attacking
side) → **executor** (`RESTART_EXECUTOR_SELECTED`, the coach's one true
choice — which piece executes; the cell is never chosen here) →
**execution** (`gameEngine.mjs` restricts every command to the entitled
executor and to that restart type's Rule-Set-configured `availableActions`
list). `selectSinglePlayerRestartSetupPresentation`
(`matchPresentationSelectors.mjs`) is the one read boundary the UI's
restart-setup panel uses (ADR-049's pattern): it exposes which team may act,
which of its own pieces are clickable, and the ball cell, and decides
nothing — every board click only stages a local selection; the real
`RESTART_*` command fires only from the panel's Done/Confirm button, exactly
like Shot's own target-then-confirm flow.

**Consequences:**

- The ball cell itself is always fixed automatically by whichever mechanic
  triggers the stoppage, echoing which half of the goal the shot that
  produced it was aimed at (falls back to random only for a dead-centre
  attempt) — never a coach choice, for any restart type, including Goal
  Kick (a deliberate reversal from this document's original "coach places
  the executing player" wording for Goal Kick).
- A cell the Engine itself computes (the wall line, or the ball cell before
  the executor lands there) automatically, freely relocates whoever already
  stands on it, as early as possible, so that displaced piece is still a
  normal, manually-repositionable piece for whatever phase follows rather
  than a placement the coach has no further chance to adjust.
- Hardcoded per-(restart-type × action) exceptions live where that action's
  own plan is built, gated on `state.restartSetup`, exactly like the
  existing `goalkeeperRestartException` pattern: Corner Shot's board-boundary
  exemption/mandatory DVM/wall DV and Free-Kick-Direct Shot's no-body-block/
  wall-DV-instead-of-defensive-DV live in `shotRules.mjs`'s
  `buildShotRoutePlan`; Free Kick's Lofted Through Ball difficulty override
  lives in `loftedThroughBallRules.mjs`'s `planLoftedThroughBall`; Corner's
  illegal-Long-Pass-into-the-box lives in `passEngine.mjs`'s `buildPassPlan`.
  Only the exception's own numbers (e.g. the Lofted Through Ball difficulty)
  are Rule-Set-editable; which exceptions apply to which pair is not.
- Goal Kick alone additionally forbids the non-executing side from ever
  finishing its reposition turn (by `RESTART_REPOSITION_PASSED` or by
  exhausting its allotted moves) while any of its own pieces remains inside
  the executing team's own box — Corner has no such restriction, since the
  attacking team is meant to be able to stack the box it is attacking.
