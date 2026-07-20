# Multiplayer Architecture Refactor Plan

**STATUS: OPEN**

This is a temporary migration plan. It documents a known scalability and reliability problem that must be solved after Pass is feature-complete.

## Current problem

The live session document currently carries several responsibilities at once: board projection, tracker projection, dice projection, Timeline metadata, assignments, and session administration. Historically, Timeline synchronization also resent the complete board and the Timeline `initialState` for small events such as a D20 roll. As the state grows, Firestore commits can become too large and background writes can overlap with `End Session`.

Observed failure:

```text
FirebaseError: Transaction too big. Decrease transaction size.
```

Possible consequences if the storage model is not refactored:

- a guest can receive stale or incomplete state;
- an authoritative resolution can fail to publish;
- long sessions can exceed practical Firestore transaction limits;
- reconnect and late join become increasingly expensive;
- session deletion can race with older writes.

## Required future architecture

The final architecture should separate compact live metadata from event and snapshot storage. Exact collection names may change after code audit, but responsibilities must remain separate.

```text
sessions/{sessionId}
  status, ownership, currentRevision, compact live metadata

sessions/{sessionId}/timeline/{eventId or sequence}
  one immutable Timeline event

sessions/{sessionId}/snapshots/{revision}
  periodic reconstructible gameplay snapshot

sessions/{sessionId}/cards/{cardId}
  session card data
```

A small gameplay change must create a small write. A dice roll must not resend the full board.

## Mandatory properties

- Host remains authoritative for deterministic gameplay resolution.
- Every command/event has a unique identity and is idempotent.
- State changes carry monotonic revision information.
- Guest applies canonical revisions in order.
- Missing revisions trigger rehydration rather than guessing.
- Replay and Undo/Redo remain based on the same Timeline semantics.
- Late join and reconnect reconstruct the exact current state.
- Firebase echo cannot resolve an event twice.
- `End Session` blocks new writes and drains existing queues before deletion.

## Migration stages

1. Measure current document and write sizes during representative long matches.
2. Define canonical revision and event schemas.
3. Separate immutable Timeline entries from compact session metadata.
4. Introduce periodic snapshots for bounded rehydration cost.
5. Remove full-board rewrites from action and dice events.
6. Add reconnect and missing-revision recovery.
7. Migrate existing active-session creation and hydration.
8. Remove legacy projection paths only after parity tests pass.

## Required tests

- host action and guest action;
- guest roll resolved once by host;
- repeated identical roll values with distinct event IDs;
- reconnect during pending decision and pending roll;
- reconnect during delayed resolution;
- late join after a long Timeline;
- missing revision recovery;
- stale Firebase echo;
- simultaneous local UI updates and remote canonical update;
- Undo/Redo and branching;
- replay/save/export parity;
- End Session with board save pending;
- End Session with Timeline queue pending;
- repeated End Session request;
- session deletion after a failed earlier write.

## Completion rule

This plan is complete only after the new architecture is implemented, the legacy large-write path is removed, and all migration tests pass in single-player-equivalent host flow and real host/guest sessions.

---

# DELETE THIS DOCUMENT WHEN RESOLVED

When every requirement in this plan has been implemented and validated, **delete this file from the repository**. It is a temporary migration plan and must not remain as an apparently unresolved architecture problem.

## v19.16 investigation — Multiplayer Debug Tracer and failed optimistic commits

### Validated failure path

1. In v19.15 every multiplayer dice roll first called `reserveDiceRoll()`.
2. That function required a transaction against `sessions/{code}/runtime/dice`.
3. Any `permission-denied` / “Missing or insufficient permissions” response returned `false`.
4. `rollTeamDie()` therefore exited before creating `DICE_ROLLED`; the guest had no roll button outcome and the host had no canonical event to resolve.
5. Separately, Timeline publication errors were caught by the queue and only logged. The client retained the optimistic local revision. Because reconciliation rejects older remote revisions, that client could remain indefinitely on `Resolving interception…` after the failed publication.

### Implemented development instrumentation

A permanent centralized tracer now lives in `src/multiplayer/debugTracer.mjs`.

Activation:

- `window.DEBUG_MULTIPLAYER = true`, or
- `window.__DEBUG_MULTIPLAYER__ = true`, or
- `localStorage.setItem("DEBUG_MULTIPLAYER", "true")` followed by reload.

The tracer emits structured events under `[MultiplayerTrace]` and carries a Trace ID through roll creation, Timeline queueing, Firebase commit, host resolution, guards, rollback, retry and commit confirmation. Guard exits include an explicit reason; no gameplay result is changed by the tracer.

### v19.16 correction

- The runtime dice lock is explicitly treated as advisory coordination, not gameplay authority. When that separate runtime document is unavailable because of permissions or transient service availability, the client uses the existing local cooldown and proceeds to canonical Timeline revision validation.
- A failed optimistic Timeline publication now rolls the local client back to the exact previous canonical Timeline only when the failed revision is still current. A newer local revision is never overwritten.
- The Timeline remains the canonical multiplayer authority; Pass rules and the Generic Action Resolution Engine are unchanged.

### Regression evidence

Automated coverage includes tracer activation/guard output, rollback eligibility, Action Resolution, Pass, multiple interceptors, identical consecutive rolls, Undo/Redo transaction behavior, Bonus Action continuation and AI export. Browser/Firebase two-client verification remains required against the deployed project rules to validate Host, Guest and Reconnect end to end.


## v19.17 validated bugfix — stale host ownership closure

### Reproduction evidence

- The guest successfully recorded `DICE_ROLLED`; Timeline commits were confirmed.
- Both clients remained on `Resolving interception...`.
- The session snapshot and Timeline-entry listeners were mounted with dependencies `[user, sessionCode]`.
- At mount time `sessionOwnerUid` had not yet been hydrated, therefore `isSessionHost` was `false`.
- The listener callbacks retained that render-time value and every later call to `scheduleDelayedResolution()` on the actual host aborted as `not host`.

### Validated correction

- Added one authoritative `sessionAuthorityRef` for code, user UID, owner UID, and current host status.
- The session snapshot updates this authority synchronously before Timeline hydration.
- Long-lived Firebase callbacks and delayed timers read the ref rather than a stale React closure.
- The timer revalidates ownership when it fires, so a client that lost host authority cannot commit a resolution.
- No Pass rule, outcome calculation, Timeline schema, Undo/Redo behavior, or AI export format changed.
