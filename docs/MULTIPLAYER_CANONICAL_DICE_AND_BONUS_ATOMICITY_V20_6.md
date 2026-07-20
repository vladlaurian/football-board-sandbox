# Multiplayer canonical dice and Bonus Action atomicity — v20.6

## Scope

v20.6 addresses the multiplayer failure sequence observed when the guest rolls an interception die, receives or uses a Bonus Action, and later enters Pass targeting.

The reported trace contained:

- `DICE_ROLLED` committed with `isHost: false`;
- `timeline-conflict`;
- optimistic rollback;
- `RESOLUTION_ABORTED: not host`;
- repeated `PASS_TARGET_INTENT_SENT` requests at the same base revision.

## 1. Host-authoritative dice intent

In Match multiplayer, a non-host no longer records `DICE_ROLLED` directly.

The guest sends `diceRollIntent` containing:

- team;
- optional chosen test result;
- active pass action id;
- canonical pending-roll request id;
- requesting uid/client;
- base Timeline revision.

The host validates:

- requesting uid owns the requested team;
- the action and pending-roll request still match canonical state;
- the requested team is the required roller;
- a chosen result is legal and test-roll mode is enabled;
- no die or delayed resolution is already active.

Only the host runs the roll and records `DICE_ROLLED` in Timeline.

## 2. Canonical turn calculation

Pass possession changes no longer calculate the next turn from render-local `trackerCurrentTurn`.

The current turn is read from the transition's canonical `before.tracker` snapshot:

```js
normalizeTrackerSnapshot(before.tracker).currentTurn + 1
```

This applies to:

- normal rolled interception;
- Natural 20 Bonus Action resume policy;
- direct-hit interception;
- recorded interception resolution.

Therefore a guest interception at Turn 7 creates Turn 8, rather than falling back to a stale local Turn 1 and creating Turn 2.

## 3. Atomic Bonus Move completion

Previously a Bonus Move produced two guest-side Timeline commits:

1. `PIECE_MOVED`;
2. `BONUS_CARD_ACTION_COMPLETED`.

A conflict between those commits could leave the canonical continuation in `action-active`, even though the guest displayed `END B.A.`.

v20.6 completes the continuation inside the physical movement transition. The one Timeline commit contains both:

- the new piece and ball positions;
- the continuation status `awaiting-end-bonus-action`.

A legal partial move is sufficient. The player is not required to consume every available movement square.

## 4. Central transient cleanup

`resetTransientGameplayUI()` now clears:

- selected piece;
- hover cell;
- Pass Target pending intent;
- Pass Cancel pending intent;
- Bonus Action End pending intent;
- Dice Roll pending intent;
- pending auto/3-2 movement UI;
- delayed-resolution timer.

It is used by optimistic rollback, Undo and Redo. Rejected dice intents can also restore the canonical cursor state before cleanup.

## 5. Ownership retained from v20.5

The shared resolution remains visible on both clients, but target selection, route corners, Cancel and other Pass controls remain interactive only for the team that owns the resolution.

## Validation

- `npm test -- --run`: 110/110 passed.
- `npm run build`: passed.
- Vite emitted only the existing bundle-size warning.

## Required multiplayer playtest

1. Guest Red rolls an interception at Turn 7 without Natural 20: next turn must be Turn 8.
2. Guest Red rolls Natural 20 at Turn 7 and declines/ends the Bonus Action: next turn must be Turn 8.
3. Guest Red uses Bonus Move for one legal square: `END B.A.` must become canonically available and end the continuation.
4. Blue Bonus Action followed by Red Bonus Action, then Red Pass: target selection must complete without a ghost cursor.
5. Host Undo during targeting: both clients must restore the same canonical state without targeting reappearing from local pending state.
