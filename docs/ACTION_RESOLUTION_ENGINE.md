# Action Resolution Engine — integration contract

## Purpose

This document is the canonical contract for automated Match Mode actions. Read it before implementing Pass, Dribble, Tackle, Shot, Cross, or any future action that contains user decisions, manual rolls, reactions, deterministic resolution, or bonus continuation.

The broader ownership boundary is defined in [`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md). This Action Resolution Engine is a reusable subsystem of the Game Engine; it must not become a parallel UI, Timeline, or Firebase resolution path.

The generic engine is in `src/match/actionResolutionEngine.mjs`. Action-specific rule modules remain separate (for example `src/rules/passEngine.mjs`). UI code must not become a second rules engine.

## Ownership boundary

### Generic engine owns

- explicit pending decisions;
- explicit pending roll requests;
- unique roll-event identity;
- matching a roll event to exactly one pending request;
- preventing duplicate event consumption;
- generic action stages;
- serializable state suitable for Timeline, Replay, Undo/Redo and Firebase.

### Action module owns

- legal targets/options;
- geometry and eligibility;
- statistics and modifiers;
- deterministic action-specific result calculation;
- action-specific consequences supplied to the application adapter.

### UI owns only presentation

- modal visibility derived from `pendingDecision`;
- Dice window visibility derived from `pendingRoll`;
- animation, focus, hover, cursor and cosmetic suspense;
- result dialogs.

UI presentation is not a Timeline step and must never be required to reconstruct gameplay.

## Canonical flow

```text
start action
→ select target/option
→ validate action-specific rules
→ pendingDecision (when a choice is required)
→ pendingRoll (when a manual roll is required)
→ unique RollEvent
→ deterministic action-specific resolution
→ next decision/roll OR completion OR continuation
```

## Required state

An automated action state must contain a stable `id`, `kind`, `status`, and when applicable:

```js
{
  pendingDecision: {
    id,
    type,
    team,
    options,
    context
  } | null,

  pendingRoll: {
    requestId,
    actionId,
    team,
    dieType,
    subjectId,
    reactionIndex,
    context
  } | null,

  consumedEventIds: [],
  lastRollEvent: null
}
```

Do not identify a roll by its numeric result. Two consecutive rolls may both be 8 and must still be two different events.

## Roll event contract

Both a random D20 and Choose Roll must create the same event shape:

```js
{
  id,              // unique event identity
  requestId,       // exact pending request being answered
  actionId,
  team,
  dieType,
  natural,
  source,          // RANDOM | CHOSEN
  createdAt,
  subjectId,
  reactionIndex
}
```

The event may be consumed only when all identity fields match the current `pendingRoll`. Replaying the same event ID must be a no-op. A different event ID with the same `natural` value must be processed normally.

## Timeline and Undo/Redo

Gameplay state, pending decisions, pending rolls and consumed event IDs belong in snapshots. Modals, timers and animations do not.

Undo must cancel local timers and restore the snapshot. Redo must reconstruct the pending decision/roll from the snapshot. A pending modal must not block access to host Timeline controls.

A roll and its deterministic automatic consequence use the existing atomic transaction mechanism. Cosmetic suspense does not create a separate Timeline stop.

## Multiplayer

Firebase synchronizes the Timeline/game state. Host and guest must receive the same action ID, request ID, event ID and consumed-event set. Firebase echoes of an already consumed event must not create a second resolution.

Choose Roll is only a different source of the same `RollEvent`; it is not a separate resolution path.

## Adding a new action

For a future Dribble action:

1. Create `src/rules/dribbleEngine.mjs` for legal target, opponent eligibility, modifiers and outcome calculation.
2. Create the action state with a stable action ID and empty `consumedEventIds`.
3. Use `createPendingDecision()` when the player/defender must choose.
4. Use `createPendingRoll()` when a manual D20 is required.
5. Create a `RollEvent` from either Roll or Choose Roll.
6. Call `consumeActionEvent()` before applying the Dribble-specific result.
7. Record the state transition in the common Timeline.
8. Keep modal, animation and result notices outside the gameplay state.

Do not add Dribble-specific branches to generic Dice, Undo/Redo or Firebase code unless the generic contract itself genuinely needs expansion.

## Timeline event rule added in v19.12

A roll is a gameplay event even when its visible number equals the previous die result. Timeline transitions for `DICE_ROLLED` must therefore be committed with explicit event semantics (`allowNoop`) so metadata identity is not discarded merely because `before` and `after` board snapshots are numerically equal.

The unique `RollEvent.id` and `requestId`, not the die number, determine whether an event is new.

## Bonus continuation completion

A bonus-card continuation may finish in two valid ways:

- `BONUS_ACTION_ENDED`: one bonus card action was used and resolved, then `END B.A.` was pressed;
- `BONUS_ACTION_DECLINED`: `END B.A.` was pressed while the continuation was still `ready`, before any bonus action started.

Both outcomes apply the same serialized `resumePolicy`. The distinction must remain in Timeline and AI export. `END B.A.` must remain unavailable while a bonus action is `action-active`, because that action must resolve or be undone first.

## Pass migration in v19.11

Pass remains responsible for its current geometry and rules. It uses explicit pending decisions, pending roll requests and unique roll events. This is the reference implementation for future automated actions.

## Multiplayer canonical resolution rule added in v19.13

A remote user may create an authorized pending decision or RollEvent, but only the host applies the deterministic consequence. Host scheduling must be derived from the canonical hydrated Timeline state, not exclusively from a one-time "new entry" notification. Repeated Firestore snapshots for the same entry must not restart its cosmetic delay, and an already consumed RollEvent must remain idempotent.

A direct hit on a teammate is an effective-target shortening rule, not an automatic completion rule. If eligible reactions remain on the shortened path, the generic action flow must resolve them before completing the Pass.

## Canonical host resolution rule added in v19.14

For a multiplayer delayed resolution, the host must derive both the request and
its action state from the live Timeline cursor entry. A local React ref may lag
behind Firestore hydration and must not be allowed to veto the canonical roll.
The cosmetic resolving state is cleared only after validation and event
consumption succeed.


## v19.21 integration boundary: PASS ownership and Free Ball

- PASS eligibility in Match Mode is gated by the initiating player's current co-location with the `BALL` piece before the existing Pass Action Resolution flow begins. This gate does not alter Pass geometry, interception order, rolls, outcomes, or cancellation behavior. Editor/Sandbox PASS remains unrestricted.
- Free Move is the visible name of the existing player free-placement authorization. Its internal `freeMode` state is retained for compatibility.
- Free Ball is intentionally outside the Generic Action Resolution Engine. It is a one-click administrative ball placement that consumes no Tracker action and does not create an action request, decision, roll, continuation, or player movement authorization.
- The final ball position is nevertheless recorded as a canonical `BALL_MOVED` Timeline transition, preserving Undo/Redo, replay, export, and multiplayer state parity.

## AI Analysis Export completion rule added in v19.22

Every Match Mode action integrated with this engine must also be reviewed in `src/timeline/aiAnalysisExport.mjs`. A feature is not complete merely because its canonical Timeline state is correct: the semantic export must preserve action type, relevant choices, roll/resolution identity, movement reason, possession effects and action-economy effects needed for later AI analysis. Add or update regression tests for the exported semantics.

Free Ball remains outside this engine, but its canonical `BALL_MOVED` transition is exported explicitly with `movementReason: "FREE_BALL"` so AI analysis can distinguish administrative ball placement from an ambiguous manual move.
