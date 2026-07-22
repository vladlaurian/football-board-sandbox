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

Both outcomes apply the same serialized `resumePolicy`. The distinction must remain in Timeline and AI export. `END B.A.` remains the only voluntary closure of Bonus Action and may end an `action-active` Bonus MOVE with unused Speed; it must remain unavailable only while another action-resolution flow, such as pending Pass targeting or roll resolution, still owns required input.

Every Bonus Action also carries a structured origin alongside its legacy source string: source action, outcome, reason, source Timeline entry, and optional parent continuation ID. If an exceptional result creates a new Bonus Action while another exists, the new continuation replaces the old one atomically. The old resume policy must not execute; the parent link preserves the chain for Timeline and AI analysis. Bonus Action is outside Tracker economy. In offline Single Player it blocks End Turn and administrative Free Move/Free Ball; 3/2 remains an independent free rule for the continuation owner.

## v20.21.1 — Bonus MOVE command boundary

Offline Single Player Bonus MOVE is no longer a UI-owned placement path. `BONUS_MOVE_STARTED`, `BONUS_MOVE_CANCELLED`, and `BONUS_MOVE_COMMITTED` are typed Engine commands. The active `actionContinuation` records the selected piece and `movementStarted`, so Cancel is possible only before the first physical segment. The Engine validates the same physical rules as normal Move: Speed, accumulated cost, axis, path blocking, occupied destination, and ball carry. It does not create or alter a Tracker action.

The card starts Bonus MOVE through `BONUS_MOVE_STARTED`; board selection plus destination evaluates start and first commit as one dependent command sequence. Either route produces canonical Timeline state. Bonus MOVE remains active after partial movement until `END B.A.`; 3/2 may still occur independently before or during it. Manual Multiplayer is outside this migration.

## v20.22.0 — phase closure boundary

Offline Single Player phase closure is now a typed Engine transition: `TRACKER_PHASE_ENDED`. It is blocked by active action resolution, Bonus Action, Free Move, and an uncommitted normal MOVE interaction. It clears active Group Move as the normal End Turn closure. Attack closure moves to defense; defense closure starts the next numbered turn automatically when available and resets the turn-scoped action and movement state. The Turn popup is UI-only and appears only after the canonical transition has committed.

## Pass migration in v19.11

Pass remains responsible for its current geometry and rules. It uses explicit pending decisions, pending roll requests and unique roll events. This is the reference implementation for future automated actions.

## v20.25.1 — canonical Pass target boundary

Offline Single Player target choice is now an Engine command, `PASS_TARGET_SELECTED`. It advances only `targeting -> route-selection` after checking the current Pass identity and frozen-board coordinate. It never consumes Tracker economy or evaluates route geometry. A requested occupied square remains legal because only the later route plan determines a first physical hit and effective endpoint. Route confirmation and downstream resolution remain separate migrations.

While that route-confirmation migration is pending, its offline preview and existing plan construction must read the active MatchContext rather than mutable editor cards, Rule Set or board settings.

## v20.26.0 — canonical Pass route and plan boundary

Offline Single Player confirms a chosen Pass route through `PASS_ROUTE_CONFIRMED`. The Engine validates the origin, builds the frozen plan, consumes the normal Pass action only after that validation, and stores the existing next stage. It may create a pending interceptor choice or pending roll descriptor; this merely declares the next required input and is not itself interceptor selection, rolling or resolution. The downstream legacy resolver temporarily receives that canonical plan until its own approved migrations are complete.

## v20.26.1 — goalkeeper route blocker and route presentation truth

The canonical Pass plan now records `goalkeeperRouteBlocked` when its physical first-player intersection is a frozen gameplay card with `position: "GK"`. In offline Single Player, `PASS_ROUTE_CONFIRMED` rejects that route before Tracker consumption. A goalkeeper is therefore neither a pass-through square nor an effective direct-hit recipient. The Single Player preview may show this rejected option in grey, but that presentation is derived from the same plan field and is not the rule authority.

For the existing direct-hit rule, route presentation must treat a first hit on an opponent as risk/red even when the plan has no eligible defensive-area interceptor. This is only a correction of UI classification; it does not change direct-hit resolution or interception order. The direct-target goalkeeper restriction remains a separate future `PASS_TARGET_SELECTED` amendment. Manual Multiplayer is not migrated by this rule.

## v20.27.0 — canonical Pass interceptor-choice boundary

Offline Single Player selects an equal-priority interceptor only through `PASS_INTERCEPTOR_SELECTED`. The Engine validates the current `CHOOSE_INTERCEPTOR` descriptor, matching Pass and decision identities, the stored option list, and the corresponding equal-priority candidates in the canonical Pass plan. It then applies the existing deterministic reorder and frozen Interception modifier cap, appends the selection record, clears the decision and creates the exact next pending-roll descriptor.

This transition does not consume Tracker economy, move the ball, alter possession, create a RollEvent, resolve an interception, or advance the reaction chain. Normal selection is a stepwise Timeline entry; Bonus selection remains atomic with its continuation. Manual Multiplayer retains its legacy selection path until that track is explicitly reopened.

## v20.28.0 — canonical Pass interception-roll input and administrative dice boundary

Offline Single Player submits an interception die only through `PASS_INTERCEPTION_ROLL_SUBMITTED`. The command carries the exact RollEvent identity and raw natural value; the Engine validates it against the current pending-roll descriptor, consumes that event once, records the raw roll, and creates the existing delayed-resolution handoff from explicit command time plus frozen MatchContext delay rules. The later resolver temporarily performs the established outcome calculation from this Engine-owned input.

The roll transition does not itself resolve interception, change possession, move the ball, grant a Bonus Action or advance the reaction chain. In offline Match Mode, ordinary dice controls are therefore enabled only for an active pending mechanic roll. `EXTRA_ROLL_SUBMITTED` is a deliberately separate administrative command: it records an explicit `EXTRA_ROLL` Timeline/AI event, updates visible dice values, consumes no Tracker action and may not operate while an action resolution is active. Manual Multiplayer and Editor Mode retain legacy dice paths.

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
- Free Move is the visible name of the existing player free-placement authorization. Its internal `freeMode` state is retained for compatibility. In offline Single Player it is now an Engine-owned administrative Timeline action: start, every placement, and end are visible to Undo/Redo, Replay, and AI export, but never consume Tracker economy. It locks all other offline Match Mode actions while active and never moves the ball.
- Free Ball is intentionally outside the Generic Action Resolution Engine. It is a one-click administrative ball placement that consumes no Tracker action and does not create an action request, decision, roll, continuation, or player movement authorization.
- The final ball position is nevertheless recorded as a canonical `BALL_MOVED` Timeline transition, preserving Undo/Redo, replay, export, and multiplayer state parity.

## AI Analysis Export completion rule added in v19.22

Every Match Mode action integrated with this engine must also be reviewed in `src/timeline/aiAnalysisExport.mjs`. A feature is not complete merely because its canonical Timeline state is correct: the semantic export must preserve action type, relevant choices, roll/resolution identity, movement reason, possession effects and action-economy effects needed for later AI analysis. Add or update regression tests for the exported semantics.

Free Ball remains outside this engine, but its canonical `BALL_MOVED` transition is exported explicitly with `movementReason: "FREE_BALL"` so AI analysis can distinguish administrative ball placement from an ambiguous manual move.
