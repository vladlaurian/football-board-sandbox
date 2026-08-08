# Action Resolution Engine — integration contract

Player-rule contracts for the implemented passing family are
[`PASS_AND_INTERCEPTION_RULES.md`](PASS_AND_INTERCEPTION_RULES.md),
[`THROUGH_BALL_RULES.md`](THROUGH_BALL_RULES.md) and
[`LOFTED_THROUGH_BALL_RULES.md`](LOFTED_THROUGH_BALL_RULES.md). This document
remains the technical command/decision/roll/Timeline lifecycle contract.

## Purpose

This document is the canonical contract for automated Match Mode actions. Read it before implementing Pass, Dribble, Tackle, Shot, Cross, or any future action that contains user decisions, manual rolls, reactions, deterministic resolution, or bonus continuation.

The broader ownership boundary is defined in [`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md). This Action Resolution Engine is a reusable subsystem of the Game Engine; it must not become a parallel UI, Timeline, or Firebase resolution path.

The generic engine is in `src/match/actionResolutionEngine.mjs`. Action-specific rule modules remain separate (for example `src/rules/passEngine.mjs`). UI code must not become a second rules engine.

## Shot checkpoint (v20.56.28, roll parity in v20.56.29)

`SHOT_STARTED`, `SHOT_TARGET_SELECTED`, `SHOT_ROUTE_CONFIRMED`, generic
`GAMEPLAY_ROLL_SUBMITTED` and `SHOT_RESOLUTION_DUE` are normal offline Engine
commands. `shotRules.mjs` owns attempted board-target legality, Pass-compatible
corner route physics, route modifiers, Tracker cost, stat comparison and
immutable result calculation. `matchPresentationSelectors.mjs` projects the
goal cells and persisted route facts; the board never calculates a route or
moves a piece locally. A rejected board target is an accepted canonical
targeting preview with grey routes and a persisted rejection reason; it has no
Tracker cost.

As of v20.56.29, Shot follows the exact Pass/Lofted Through Ball roll
contract: `GAMEPLAY_ROLL_SUBMITTED` consumes the RollEvent and any selected
Tracker token, writes canonical `state.dice`, and opens the shared
`createSinglePlayerRollResultHold({ kind: "shot" })` hold as `SHOT_ROLLED`. It
calculates no outcome. `SHOT_RESOLUTION_DUE` performs the deterministic
calculation afterward, validating the exact Shot and RollEvent identity, and
emits `SHOT_RESOLVED`. `SHOT_ROLLED` and `SHOT_RESOLVED` share one atomic
Timeline transaction (`metadata.undoTransaction`), so `undoAtomicTimelineTransaction`
returns to `awaiting-roll` and Redo restores the same outcome in one step.
Every roll modifier source (non-dominant foot, each distinct defensive area,
the Distant Long Shot band, and a consumed Tracker AV/AVM/DV/DVM token) is
summed and then capped symmetrically at the frozen `diceModifiers.stackCap`
(default ±4) — the same rule Lofted Through Ball and Interception already
apply. The pre-roll prompt and the result screen both read the shared
`selectSinglePlayerRollPromptPresentation` / `renderRollBreakdown` conduit;
`main.jsx` performs no Shot modifier arithmetic.

After resolution, Shot enters `result-display`, with the consumed RollEvent
and capped result persisted in MatchState and Timeline. This remains
intentionally terminal: it has no delayed consequence, acknowledgement command
or restart command. Timeline Undo/Redo changes the canonical state; UI has no
"ready" button. Future Goal/Goal Kick/Corner/goalkeeper-retains work must
extend this state with explicit Engine consequences rather than bypassing it.

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

UI presentation is not a Timeline step and must never be required to reconstruct gameplay. A Single Player gameplay roll with an automatic consequence persists a canonical delayed-resolution deadline: after the die face is revealed, the consequence cannot run for the fixed `1000 ms` result-hold interval. The timer is projection-only, but its `createdAt`/`resolveAt` descriptor is Timeline data, so Undo/Redo/replay never invent a second result or resolve an old roll. New automatic actions must create this shared hold through `createSinglePlayerRollResultHold(...)` and register their Engine resolution with the common delayed-resolution adapter; they must not add a mechanic-local timer. A roll with no automatic consequence (for example Extra Roll) has no artificial wait.

## Canonical flow

```text
start action
→ select target/option
→ validate action-specific rules
→ pendingDecision (when a choice is required)
→ pendingRoll (when a manual roll is required)
→ unique RollEvent
→ canonical 1000 ms result hold (when the consequence is automatic)
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

For a future Dribble, Cross or Tackling action:

1. Create `src/rules/dribbleEngine.mjs` (or the equivalent module) for legal target, opponent eligibility, modifiers and outcome calculation.
2. Create the action state with a stable action ID and empty `consumedEventIds`.
3. Use `createPendingDecision()` when the player/defender must choose.
4. Use `createPendingRoll()` when a manual D20 is required.
5. Create a `RollEvent` from either Roll or Choose Roll.
6. Call `consumeActionEvent()` before applying the action-specific result.
7. Record the state transition in the common Timeline.
8. Keep modal, animation and result notices outside the gameplay state.

Do not add mechanic-specific branches to generic Dice, Undo/Redo or Firebase code unless the generic contract itself genuinely needs expansion.

### Mandatory shared utilities (added v20.56.30)

A new mechanic with a manual D20 roll or a board-first target/route must use these three shared modules rather than re-implementing their own version. This is a Mechanic Integration Gate requirement (ADR-050), not an optional convenience:

- **Roll modifier sum and cap** — `sumAndCapRollModifier(sources, modifierCap)` in `src/rules/rollModifierMath.mjs`. The rolling subject's own base card stat is one modifier source among the others; every source is summed first, then the combined total is capped symmetrically exactly once at the frozen `diceModifiers.stackCap`. A mechanic must never cap situational modifiers alone and add its own stat back afterward — that lets the cap silently drift, which is exactly the bug this contract closes for Shot, Lofted Through Ball and the Pass/Interception prompt.
- **Corner/route badge projection** — `selectRouteCornerBadges(routes, { actionLabel, footLabel })` in `src/engine/matchPresentationSelectors.mjs`. Every board-first mechanic's corner/route picker converges on this one badge shape; a blocked corner is shown disabled rather than removed from the list. This unifies only the *shape* of the badge (legal/illegal, disabled, foot, modifier label) — it deliberately does not force one shared meaning for "risk" (red) across mechanics, because that meaning is mechanic-specific and must stay so: **Pass** marks a corner "risk" only when an opposing defender is actually eligible to intercept it (`plan.interceptors?.length`), because that is the corner's real chance of failure; a non-dominant-foot penalty alone stays "clear" (green) because it is informational and never triggers a roll by itself. **Shot** marks a corner "risk" whenever it carries any roll modifier at all (`route.modifierSources?.length`), because a Shot always resolves through one D20 roll and every modifier affects that roll's real outcome. A future mechanic must pick its own "risk" criterion based on whether the mechanic has a roll and what actually threatens it — do not "fix" this apparent inconsistency by forcing one mechanic's criterion onto another.
- **Cancel by reselecting a target** — a mechanic with `targeting`/`route-selection` stages and a `target` field must expose a full-cancel command (see `SHOT_CANCELLED`, `THROUGH_BALL_CANCELLED`, `LOFTED_THROUGH_BALL_CANCELLED`, `PASS_CANCELLED`) and register it in `main.jsx`'s `cancelActiveResolutionTargeting()` dispatcher rather than adding a new parallel Escape/re-click/Inspector branch. Reselecting an already-chosen target always cancels the action entirely; there is no "return to targeting only" partial-cancel command.

### Mandatory shared hold and UI components (added v20.56.32)

A mechanic whose manual D20 roll has an automatic post-roll consequence must split the roll into two Engine commands — a roll-only command that writes canonical `state.dice`, opens `createSinglePlayerRollResultHold()` (`src/match/delayedResolution.mjs`) and stores a `status` meaning "awaiting resolution", then a second `..._RESOLUTION_DUE` command that performs the actual outcome math once the shared 1000 ms hold elapses. Do not resolve the outcome inside the roll-submission command itself, even if the math is trivial; the hold exists so every mechanic's roll reads the same way regardless of how fast its consequence would otherwise resolve. See `resolveLoftedThroughBallRoll` in `src/rules/loftedThroughBallRules.mjs` for the reference split (added to bring Lofted Through Ball to parity with Pass/Shot, which already had it).

A mechanic's UI must use the shared presentation components rather than writing its own modal or prompt markup:

- **`RollPromptCard`** (`src/main.jsx`, defined above `App()`) for the pre-roll prompt shown while `status` is `awaiting-roll`/`awaiting-interception-roll`. Takes `promptKey`, `title`, `subject`, `breakdown` (from `renderRollBreakdown`), `comparisonLabel` (what this roll must beat — always visible, unconditional on the roll having already happened), optional `extra`, and `modifierChoice` (from `renderRollModifierChoice`).
- **`ActionResultModal`** (`src/main.jsx`, defined above `App()`) for a terminal or continuable result screen. Takes `title`, `team`, `historyControls`, and `onContinue` only when the screen is not deliberately terminal (see ADR-058 for Shot) or has become continuable because a real canonical consequence now exists to trigger (see ADR-058's v20.56.33 update for Goal/Goalkeeper Retains — the button is not a fake control under rule 11 as long as it dispatches the actual consequence command, never a local-only dismiss).
- **`ActionDecisionModal`** (`src/main.jsx`, defined above `App()`) for an equal-priority choice screen (interceptor, recoverer). Takes `title`, `team`, `historyControls`, `message`, and `options`.

A component's `title` is the action's own name only (e.g. "Shot", "Lofted Through Ball") — never a wordy suffix like "resolution", "result" or "recovered". What happened is communicated by the body content, not the title. A future Dribble, Cross or Tackling screen reuses these same three components; it must not add a fourth hand-written modal shape.

### Mandatory comparison-label format (added v20.56.3x)

Any roll screen's "what this roll must beat" line — `RollPromptCard`'s `comparisonLabel` prop pre-roll, and `renderRollBreakdown`'s second argument post-roll in `main.jsx` — must read **value first, then whose stat it is (position + name), then the attribute name**: `13 — GK Noah Diving Saves`, not `GK Noah fixed Diving Saves 13`. Where no player identity applies (Lofted Through Ball's Difficulty), the value still comes first: `12 — Difficulty`. This must be identical on the pre-roll prompt and the post-roll result screen, and identical across every mechanic (Shot, Lofted Through Ball, Pass/Interception, and any future roll). A future mechanic's comparison label must follow this same value-first ordering; do not invent a per-mechanic phrasing.

### Mandatory goalkeeper-restart-exception geometry (added v20.56.3x)

A mechanic that can execute the Goalkeeper Retains restart (Short Pass, Long Pass, Through Ball, Lofted Through Ball — see `docs/SHOOTING_RULES.md`) must accept an optional `restartException: { team, pieceId }` parameter in its plan-building function and filter it through `insideOwnPenaltyArea(settings, cell, team)` in `src/rules/passEngine.mjs`, which covers both the large and small box. It must ignore a defensive-area cell or a **body** — **teammate or opponent alike** — only when that cell/body sits inside the executing goalkeeper's own penalty area, and only for the one piece named in `restartException.pieceId`. (Defensive areas remain an opponent-only concept regardless, since a teammate's card never produces one — only the body-ignoring half is team-neutral.) "Body ignored" is not limited to origin-corner blocking — it also covers direct-contact/hit-redirection mechanics (Pass's `firstPlayerHit`/`endpointBodyContact`, which otherwise redirect the pass onto the first body the route touches), always excluding whoever occupies the requested target cell (the intended receiver is never an obstruction to clear). Two earlier versions of this rule were wrong in production: the first excluded direct-contact mechanics as out of scope entirely; the second restricted the exemption to opponent bodies only, both live-reported bugs — see ADR-061's amendments. Target-cell occupancy checks that decide whether a cell is legal to target at all (Through Ball/Lofted Through Ball's `occupied`) remain untouched, since those are about board-shape legality, not about who contests or receives the ball. The mechanic's own terminal completion path must then clear `state.goalkeeperRestartException` once that one restart action resolves (successfully or via interception/recovery), mirroring `kickoffRestartAfterPass`'s "consumed by pieceId match" pattern in `passStartRules.mjs`. See `buildPassPlan`, `planThroughBall` and `planLoftedThroughBall` for the three existing implementations.

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

## v20.28.1 — startup regression correction

No action-resolution contract changed. This build only relocates the Extra Roll UI reset effect below the `sessionCode` state declaration so React can mount the application without a temporal-dead-zone exception.

## v20.29.0 — canonical Pass interception mathematical result

After the existing cosmetic wait, offline Single Player sends `PASS_INTERCEPTION_RESOLUTION_DUE`. The Engine accepts it only while the current Pass is `awaiting-interception-resolution`, the declared Pass ID and RollEvent ID match the consumed canonical input, and the selected defender still exists in frozen MatchContext. It calculates the exact generic interception result from the frozen Pass plan, frozen Interception rules and frozen defender card, then records `PASS_INTERCEPTION_RESOLVED` and changes only `actionResolution` to `interception-resolved` with `lastResolution`.

This slice deliberately does not move the ball, apply possession or turn changes, create a Bonus Action, advance another interceptor, or complete the Pass. The existing downstream resolver temporarily reads the Engine-owned `lastResolution` and performs those old consequences. AI export now records this intermediate deterministic outcome explicitly.

## v20.29.1 — Extra Roll remains administrative during Bonus Action

`EXTRA_ROLL_SUBMITTED` is permitted during an active Bonus Action because it is a one-roll administrative safeguard, not a card action. It updates only canonical dice/Timeline state and leaves the active Bonus Action intact. This restores the same automatic one-roll closure and Undo/Redo behavior that Extra Roll has outside Bonus Action.

## v20.30.0 — canonical ordinary Pass consequences

Offline Single Player now sends `PASS_CONSEQUENCE_DUE` after either a confirmed Pass that needs no interception or a frozen `PASS_INTERCEPTION_RESOLVED` result. The Engine checks the exact Pass identity and, for interception outcomes, the consumed RollEvent identity. It then owns the established non-Natural-20 consequences: complete the Pass to its effective target, transfer the ball on a direct opponent hit, transfer possession and start a clean next turn after an ordinary interception, or create the exact next interceptor decision/roll after a miss.

Natural 1 remains a global interception invariant: the current interceptor misses and the next eligible interceptor receives the cumulative `-1` penalty in canonical `actionResolution`. When no interceptor remains, the same command completes the Pass. A completed Bonus Pass advances its canonical continuation to `awaiting-end-bonus-action` without consuming Tracker economy. `natural-20-interception` is deliberately rejected by this command and remains the one deferred Pass-consequence branch, because it creates or replaces a Bonus Action continuation.

## v20.31.0 — canonical Natural 20 Pass consequence

`PASS_CONSEQUENCE_DUE` now accepts the frozen `natural-20-interception` result as the final Pass branch. It validates the same current Pass and RollEvent identity, moves the ball to the canonical interceptor, clears `actionResolution`, and creates a ready `bonus-card-action` continuation for the interceptor's team. Tracker possession, action economy, movement state and current turn deliberately remain unchanged at this point: `END B.A.` alone applies the continuation's existing `advance-turn` policy.

The continuation identity is deterministically derived from the Pass and RollEvent identities. If a prior Bonus Action exists, it is replaced rather than resumed; the new origin records its `parentContinuationId` and the event metadata records the superseded continuation. The roll, calculation and Natural 20 consequence share the existing resolution undo transaction. Pass is therefore now fully Engine-owned in offline Single Player from initiation through every current consequence.

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
