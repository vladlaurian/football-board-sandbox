# Architecture Decision Log

This document is permanent and must remain current.

## Maintenance rule

Every major architectural change must add or update an ADR in this file. Do not silently replace old decisions. When a decision changes, mark the old ADR as `Superseded by ADR-XXX` and add the new decision with its context and consequences.

README records release changes. This file records durable architectural decisions and their reasons.

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


## ADR-007 — Separate ephemeral runtime locks from canonical session gameplay writes

**Status:** Accepted

**Decision:** Ephemeral coordination values such as the shared dice cooldown live in small runtime documents under `sessions/{code}/runtime/*`. They must not be written into the canonical session document used to publish Timeline metadata. Canonical Timeline entry + metadata publication uses an atomic batch after semantic revision validation, with bounded retry for transient transport/service failures.

**Reason:** A Firestore transaction on the main session document acquired an update-time precondition. Heartbeat or dice-cooldown writes changed that same document and caused `failed-precondition`, preventing the host from publishing `PASS_INTERCEPTED` while both clients remained at `Resolving interception…`.

**Consequences:**

- Unrelated runtime writes no longer invalidate gameplay publication.
- Timeline entry and metadata remain atomically visible in one batch.
- Semantic revision conflicts remain explicit and are not silently overwritten.
- Runtime subcollection documents must be deleted when ending a session.


## ADR — v19.21: Free Ball is an administrative ball-placement flow

**Decision:** Match Mode Free Ball is implemented as independent transient UI state and a dedicated direct ball-placement function. It must not use player selection, player movement authorization, movement accounting, Free Move authorization, the 3/2 rule, Pass resolution, or Tracker action consumption.

**Reason:** The ball is not a player and administrative repositioning has different semantics from an authorized player move. Reusing the player movement pipeline previously coupled unrelated rules and created invalid locks and state transitions.

**Consequences:**

- The next valid board click while Free Ball is armed changes only the `BALL` piece position and then automatically disarms the mode.
- PASS targeting retains higher click priority than Free Ball.
- Temporary selection, hover and pending movement prompts are cleared when Free Ball is activated, cancelled, consumed, or Match Mode is exited.
- The resulting position is still recorded as canonical `BALL_MOVED` Timeline state for Undo/Redo, replay and multiplayer parity.
- The internal Tracker property remains named `freeMode` for backward compatibility; only the visible feature name is Free Move.
