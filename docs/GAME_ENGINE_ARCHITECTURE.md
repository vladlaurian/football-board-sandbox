# Game Engine Architecture

## Status

**Active architectural contract.** This document governs the Match Mode Game Engine, Single Player Controller, Timeline, Replay, AI Analysis Export, and future automated multiplayer work. The permitted migration stage is tracked in [`GAME_ENGINE_MIGRATION_PLAN.md`](GAME_ENGINE_MIGRATION_PLAN.md).

## Purpose

The Sandbox must have one reusable, deterministic gameplay core:

```text
UI -> Controller -> Pure Game Engine -> Match State transition -> Timeline / persistence / render
```

Manual multiplayer is preserved as-is while migration is open. Automated multiplayer work is frozen until the migration plan explicitly permits a new vertical slice.

## 1. Authoritative match model

### MatchState

`MatchState` is the single mutable, serializable gameplay state. It contains only facts that affect legality, future resolution, replay, Undo/Redo, or AI analysis:

- board pieces and ball position;
- movement authorization and movement state;
- Tracker turn, phase, possession, action economy, and action log;
- action resolution, pending decisions, pending rolls, and consumed roll-event identity;
- action continuation such as Bonus Action;
- gameplay-relevant dice results and durable delayed-resolution state;
- schema/version information needed to normalize state.

It excludes local presentation: selection, Inspector target, hover, focus, cursor, panels, drag state, zoom, pan, animation values, notices, timers, Firebase connection state, session identity, and user identity.

During live Match Mode, the authoritative current MatchState is the state at the active Timeline cursor. React may cache render data but must not maintain or mutate a competing gameplay truth.

### MatchContext

`MatchContext` is immutable for the life of a match. It is not a second gameplay state. At Match start it captures:

- active normalized Rule Set;
- board geometry and gameplay-relevant settings;
- compact gameplay-card data keyed by card ID, including stat values, Preferred Foot, Defensive Area, Special Ability, and stable stat IDs;
- context/schema identifiers required by recordings and export.

Editing cards, Rule Sets, or Editor settings after a match starts affects future matches only. It must never alter an active match, replay, or past AI export.

### Timeline

Timeline is the canonical gameplay history. It retains initial state, semantic transitions, snapshots, cursor, Undo/Redo, Replay, and branching. It does not validate gameplay rules. The Controller reads state at the active cursor, asks the engine for a transition, then records the accepted result.

## 2. Command-driven engine

Every gameplay change begins as a serializable command:

```js
{
  id: "cmd_...", // required unique command identity
  type: "PASS_STARTED",
  payload: { pieceId: "blue_7" }
}
```

The public contract is conceptually `applyGameCommand({ state, context, command })`. It returns either:

```js
{
  accepted: true,
  nextState,
  events: [{ type, commandId, team, metadata }],
  timeline: { groupId, undoMode, allowNoop }
}
```

or `{ accepted: false, reason: "STABLE_REASON_CODE" }`.

An invalid command never changes MatchState or produces a gameplay Timeline event. Rejection reasons are stable machine codes; UI owns user-facing wording.

The engine must not use `Math.random()`, browser clock reads, React, Firebase, DOM APIs, `window`, timers, localStorage, or network APIs. Required identities, roll values, and time-related inputs are supplied explicitly by commands or durable state.

## 3. Commands and semantic events

A command is an attempted action. An event is a confirmed gameplay fact emitted only by the engine. UI must never create a gameplay Timeline event directly.

| Family | Commands |
|---|---|
| Match | `MATCH_STARTED`, `MATCH_ENDED` |
| Administrative ball placement | `FREE_BALL_MOVED` |
| Normal movement | `MOVE_STARTED`, `MOVE_CANCELLED`, `MOVE_COMMITTED` |
| Special movement | `FREE_MOVE_STARTED`, `FREE_MOVE_COMMITTED`, `FREE_MOVE_ENDED`, `GROUP_MOVE_COMMITTED`, `AUTO_MOVE_CONFIRMED` |
| 3/2 | `THREE_TWO_MOVE_COMMITTED` |
| Tracker | `TURN_PHASE_ENDED`, `TURN_CHANGED`, `POSSESSION_CHANGED` |
| Pass | `PASS_STARTED`, `PASS_CANCELLED`, `PASS_TARGET_SELECTED`, `PASS_ROUTE_SELECTED`, `PASS_INTERCEPTOR_SELECTED` |
| Dice and resolution | `ROLL_SUBMITTED`, `RESOLUTION_DUE` |
| Bonus Action | `BONUS_ACTION_STARTED`, `BONUS_ACTION_ENDED` |

Future Dribble, Shot, Tackle, and Cross commands use this same contract; they must not introduce separate UI, Timeline, Dice, or Firebase gameplay paths.

Existing Timeline event names remain authoritative wherever possible, including `MOVE_ACTIVATED`, `MOVE_COMMITTED`, `BALL_MOVED`, `PASS_TARGETING_STARTED`, `PASS_TARGET_SELECTED`, `DICE_ROLLED`, `PASS_INTERCEPTION_MISSED`, `PASS_COMPLETED`, `PASS_INTERCEPTED`, `BONUS_ACTION_ENDED`, and `BONUS_ACTION_DECLINED`. Cosmetic renaming is prohibited.

## 4. Ownership boundaries

| Layer | Owns | Must not own |
|---|---|---|
| UI | local presentation and command intent | gameplay validation or direct gameplay mutation |
| Single Player Controller | engine dispatch, Timeline recording, render synchronization, cosmetic timer scheduling | gameplay rules or alternate transitions |
| Game Engine | validation, deterministic state transition, semantic events | React, Firebase, DOM, timers, persistence |
| Timeline | history, cursor, Undo/Redo, Replay branch | rules validation |
| AI Analysis Export | semantic interpretation of Timeline and MatchContext | rule reconstruction from UI state |
| Persistence / Firebase | save, load, transport, future delivery of commands/state | gameplay logic or deterministic resolution |

Future multiplayer identity and assigned-team authorization belong to its adapter before dispatch. Gameplay legality remains in the engine.

## 5. Delayed resolution and manual dice

Manual roll remains a permanent rule. `ROLL_SUBMITTED` carries a unique RollEvent and is validated against the pending request. Chosen and random manual rolls use the same contract.

Visible delay is presentation scheduling, not game logic:

1. engine accepts `ROLL_SUBMITTED` and stores durable pending-resolution state;
2. Controller schedules cosmetic waiting;
3. Controller sends `RESOLUTION_DUE`;
4. engine revalidates action, request, event identity, and current state before resolving.

Undo, Redo, reload, replay, and future multiplayer must reconstruct or reject obsolete scheduling safely. A stale timer is never authority.

## 6. Controller and Timeline contract

For every gameplay intent, Controller must:

1. read MatchState from the active Timeline cursor;
2. dispatch the command to the engine with immutable MatchContext;
3. leave Timeline untouched if rejected;
4. on acceptance, commit engine-produced event data and nextState to Timeline;
5. render UI from the new cursor state.

Controller must not independently call direct gameplay setters such as `setPieces`, `setMovementStateByPieceId`, `setTrackerUsedActions`, `setMatchActionState`, `setActionResolution`, or `setActionContinuation` as parts of an accepted Match Mode action.

One command may be a valid intermediate gameplay step. When roll and automatic consequence must undo together, the engine marks the existing atomic Timeline contract.

## 7. Required architectural tests

Every migrated engine area must prove:

- deterministic accepted and rejected commands;
- no state mutation on rejection;
- event content sufficient for Timeline and AI export;
- Undo/Redo reconstruction through Timeline;
- no React/Firebase/browser dependency in engine modules;
- frozen MatchContext behavior for cards and Rule Sets;
- removal of the old direct Match Mode mutation path for that mechanic.

Visual success alone is not migration completion.

## 8. Migration and completion rules

Use vertical migration. A mechanic remains legacy until its engine path is complete and tested. In the build that activates it, remove its old direct gameplay path. Do not retain two active engines as a fallback.

Do not use migration to change game rules, rename unrelated functions, reformat files, reorganize stable UI, repair automated multiplayer, or change Manual Multiplayer.

Single Player migration completes only when every current Match Mode mutation flows through Game Engine; Timeline/Undo/Redo/Replay/AI Export use the same canonical MatchState; MatchContext is frozen per match; and `main.jsx` no longer owns direct Match Mode rules or transitions. Only then may automated multiplayer be reconsidered through a new engine-backed vertical slice.
