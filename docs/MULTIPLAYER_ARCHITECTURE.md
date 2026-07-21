# Multiplayer Architecture

## Status and version

This is the authoritative description of the multiplayer model in Sandbox `v20.7` / Git package `20.7.0`.

Historical fixes are recorded in [`MULTIPLAYER_CHANGELOG.md`](MULTIPLAYER_CHANGELOG.md). Permanent cross-system decisions also appear in [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md).

## 1. Authority model

In Match multiplayer, the host is the sole publisher of canonical gameplay transitions.

```text
Guest chooses locally
→ Guest sends a typed semantic intent
→ Host validates against canonical Timeline state
→ Host executes the transition
→ Host publishes one canonical Timeline revision
→ Both clients hydrate that revision
```

A guest intent is transport state, not gameplay history. It must not be exported to replay or AI Analysis and must never be treated as a second source of truth.

## 2. Canonical state versus local UI

Canonical shared state includes:

- board and ball positions;
- Tracker state and current turn;
- active action resolution;
- action continuation and Bonus Action lifecycle;
- dice result and pending canonical roll request;
- Timeline cursor, entries and revision.

Local transient state includes:

- selected piece and hover cell;
- target cursor and route-corner hover;
- pending intent indicators;
- temporary button feedback;
- local timers used only to request or display canonical work.

Shared visibility does not imply shared control:

```text
visible = canonical resolution exists
interactive = offline OR resolution.team === myTeam
```

The ownership rule is enforced both in rendered controls and defensively inside action handlers.

## 3. Current semantic command flows

### Pass target

```text
Guest selects target
→ passTargetIntent
→ Host validates action ID, team, target and base revision
→ PASS_TARGET_SELECTED
```

Only one target request may be pending locally. Acceptance, rejection, rollback or resolution change clears it.

### Pass cancel

```text
Guest presses Cancel
→ passCancelIntent
→ Host validates canonical pass/action/team
→ PASS_CANCELLED
```

### Dice roll

```text
Guest requests required team roll
→ diceRollIntent
→ Host validates team owner, active action, roll request ID and base revision
→ Host generates or accepts an allowed test result
→ DICE_ROLLED
```

A multiplayer guest never records `DICE_ROLLED` directly.

### Bonus Action end

```text
Owner presses END B.A.
→ bonusActionEndIntent
→ Host validates continuation, team owner and canonical status
→ BONUS_ACTION_ENDED
```

### Normal Pass start

```text
Guest selects Pass
→ actionStartIntent(mode: normal-pass)
→ Host validates owner, piece, possession, revision and resolution compatibility
→ PASS_TARGETING_STARTED
```

### Bonus Action start

```text
Guest chooses a Bonus Action
→ actionStartIntent(mode: bonus-action)
→ Host validates continuation ID, team, piece, action type and revision
→ canonical action start
```

For Bonus Action Pass, continuation activation and Pass targeting are one atomic transition:

```text
BONUS_PASS_TARGETING_STARTED
```

There is no canonical intermediate state with an active continuation but no Pass resolution.

## 4. Pass UI ownership

Both clients may observe that a Pass is targeting or resolving. Only the client controlling `actionResolution.team` may:

- select the target piece or destination;
- select route corners;
- confirm route choices;
- cancel the pass;
- operate any other owner-only prompt.

The opponent receives passive canonical state only.

## 5. Canonical turn calculation

Possession changes and post-interception progression derive the next turn from the transition snapshot:

```js
normalizeTrackerSnapshot(before.tracker).currentTurn + 1
```

Render-local React Tracker values must not be used to calculate canonical progression. This prevents guest resolutions from falling back to a stale Turn 1 and producing Turn 2.

## 6. Atomic Bonus Move

A legal Bonus Move is one logical transition. The same canonical commit contains:

- new piece and ball positions;
- continuation status `awaiting-end-bonus-action`.

A partial legal move is sufficient. The system does not require every available movement square to be consumed.

## 7. Host validation requirements

A host-authoritative intent must normally validate:

- authenticated requesting UID and client identity;
- team assignment and ownership;
- canonical Timeline base revision;
- referenced piece/action/continuation IDs;
- current action stage and compatible active resolution;
- possession or other action prerequisites;
- request uniqueness/idempotency;
- legal target, movement or roll constraints.

A stale or invalid request is rejected without mutating gameplay.

## 8. Rejection, rollback and resynchronization

Transient cleanup is centralized. Rejection, optimistic rollback, Undo and Redo clear, as applicable:

- selected piece;
- hover cell;
- Pass target/cancel pending state;
- Bonus Action end pending state;
- Dice intent pending state;
- action-start pending state;
- pending Auto Move and 3/2 UI;
- delayed-resolution timer;
- stale target and route-corner interaction state.

After cleanup, the client restores the current canonical Timeline projection. A local cursor or pending request must not resurrect an older resolution.

## 9. Timeline and delayed resolution

The Timeline remains the canonical multiplayer gameplay authority. Host ownership is read from current authority refs inside long-lived listeners and delayed timers rather than stale React closures. Before committing a delayed outcome, the host revalidates:

- current host ownership;
- expected canonical entry/action/request IDs;
- current Timeline revision and cursor;
- unresolved status of the expected action.

Firebase echo or repeated listener delivery must not resolve an event twice.

## 10. Debugging contract

The centralized tracer is `src/multiplayer/debugTracer.mjs`. When enabled, it carries trace IDs through intent creation, queueing, host validation, Timeline publication, rejection, rollback and resolution. Guard exits must include explicit reasons.

## 11. Required regression scenarios

Multiplayer changes should cover at minimum:

- host action and guest action;
- guest roll resolved exactly once by host;
- repeated equal die values with distinct request IDs;
- repeated Natural 20 → Bonus Action → Pass chains;
- Bonus Move using fewer than all available squares;
- opponent cannot operate another team's resolution controls;
- stale intent rejection and cleanup;
- reconnect during targeting, pending roll and delayed resolution;
- Undo/Redo and Timeline branching;
- late join and canonical rehydration;
- End Session while writes are pending.

## 12. Open storage refactor

The current session storage still combines compact live metadata with larger Timeline and projection responsibilities. Long sessions can create large Firestore writes and expensive rehydration.

Target separation:

```text
sessions/{sessionId}
  status, ownership, currentRevision, compact live metadata

sessions/{sessionId}/timeline/{eventId or sequence}
  immutable Timeline event

sessions/{sessionId}/snapshots/{revision}
  periodic reconstructible gameplay snapshot

sessions/{sessionId}/cards/{cardId}
  session card data
```

Required properties:

- small gameplay changes create small writes;
- commands/events have unique IDs and are idempotent;
- revisions are monotonic and applied in order;
- missing revisions trigger canonical rehydration;
- periodic snapshots bound reconnect cost;
- replay and Undo/Redo retain existing Timeline semantics;
- End Session blocks new writes and drains or cancels queues safely.

This section remains OPEN until the large-write legacy path is removed and real two-client migration tests pass.

## 13. Extension rule

Shot, Dribble, Cross and future actions must follow the same model:

1. local preview and selection remain local;
2. action ownership controls interactivity;
3. committed gameplay uses typed semantic intents;
4. host validates and publishes canonical state;
5. logical operations are atomic where intermediate state would be invalid;
6. rejection and resync clear all transient UI.
