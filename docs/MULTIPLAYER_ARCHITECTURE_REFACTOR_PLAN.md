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
