# Game Engine Migration Plan

## Status: OPEN

This is the temporary execution checklist. Permanent architecture is in [`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md). Delete this plan only when all phases are complete and durable decisions are retained in the Architecture Decision Log.

## Scope guard

- Automated multiplayer development is frozen.
- Manual multiplayer remains unchanged.
- No game-design or rule change is authorized by this plan unless separately approved by the product owner and recorded in the relevant build documentation.
- Each implementation build has one precise, independently testable objective.
- A migrated mechanic must not retain a second active legacy mutation path.

## Phase 0 — Documentation foundation

**Status:** Complete in this build.

- [x] Define MatchState, MatchContext, command, event, Controller, Timeline, and persistence boundaries.
- [x] Define frozen card and Rule Set behavior per match.
- [x] Define command-driven and timer boundaries.
- [x] Define migration and architectural-test rules.
- [x] Link the contract from orientation and workflow documentation.

## Phase 1 — Engine kernel

**Status:** Complete in v20.12.0.

Create the minimal pure engine contract and focused tests. Do not route UI gameplay through it yet.

Acceptance:

- engine accepts MatchState + MatchContext + Command;
- accepted and rejected results are deterministic;
- engine imports no React, Firebase, DOM, `window`, timer, storage, or network APIs;
- no existing gameplay behavior changes;
- contract tests exist before the first migrated mechanic.

Delivered files and tests:

- `src/engine/gameEngine.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEvents.mjs`
- `src/engine/matchContext.mjs`
- `src/engine/gameEngine.test.mjs`
- focused command: `node --test src/engine/*.test.mjs`

The kernel supports a pure `FREE_BALL_MOVED` transition only as its first real contract fixture. It is not wired to UI, Timeline, or any live gameplay route until Phase 2.

## Phase 2 — Free Ball vertical slice

**Status:** Complete in v20.13.0.

Migrate only final administrative ball placement through `FREE_BALL_MOVED`. Arming/cancelling the visible tool stays UI-local.

Acceptance:

- Match Mode Free Ball no longer directly mutates pieces from UI;
- event remains `BALL_MOVED` with `movementReason: "FREE_BALL"`;
- Undo/Redo, Replay, and AI export remain correct;
- Editor Mode and Manual Multiplayer remain unchanged;
- old active Match Mode Free Ball mutation path is removed.

Delivered files and tests:

- `src/engine/singlePlayerController.mjs`
- `src/engine/singlePlayerController.test.mjs`
- offline Match Mode branch of `commitFreeBallMove()` in `src/main.jsx`
- focused command: `node --test src/engine/*.test.mjs src/timeline/aiAnalysisExport.test.mjs`

The offline path now uses `FREE_BALL_MOVED -> Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. The existing session/manual-multiplayer branch remains deliberately unchanged.

## Phase 3 — Normal MOVE

**Status:** Complete in v20.14.0.

Migrate `MOVE_STARTED`, `MOVE_CANCELLED`, and `MOVE_COMMITTED`, including Tracker activation, cancellation before physical movement, action refund, physical movement, action consumption, and active-movement closure.

Acceptance:

- UI does not directly mutate pieces, action log, used actions, or active movement for normal MOVE;
- cancel/refund semantics match current behavior;
- Timeline and Undo semantics remain identical;
- Interaction Layer remains presentation-only.

Delivered files and tests:

- `src/engine/normalMoveRules.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEngine.mjs`
- `src/engine/gameEngine.test.mjs`
- `src/engine/singlePlayerController.test.mjs`
- offline Match Mode branches of `commitNormalMoveStart()`, `commitNormalMoveCancellation()`, and `commitPieceMove()` in `src/main.jsx`
- focused command: `node --test src/engine/*.test.mjs src/timeline/aiAnalysisExport.test.mjs`

The normal-MOVE Engine path uses a compact immutable MatchContext created at offline tracked-match start. It reads Speed only from the frozen card projection. A rare compatibility fallback creates the same Context once for an older active local match that predates this build; it does not alter session/manual-multiplayer behavior. Existing Timeline event names (`MOVE_ACTIVATED`, `MOVE_CANCELLED`, `PIECE_MOVED`) and their stepwise Undo/Redo behavior are preserved.

### v20.14.1 correction — Auto Move boundary

v20.14.0 accidentally let the Phase 3 normal-MOVE interception capture the pre-existing offline direct-board path that begins from a confirmation and uses an authorization override. That path did not create the Phase 3 `activeMovement` state, so the Engine correctly rejected its physical commit after the legacy path had already consumed Tracker state. v20.14.1 temporarily restored the old path. v20.16.0 replaces that temporary boundary: offline direct-board confirmation now runs the same Engine command sequence as card-started normal MOVE. Manual multiplayer remains unchanged.

### v20.15.0 correction — progressive normal MOVE

The intended normal-MOVE rule is progressive for the active team phase: one Tracker action authorizes one player to move in any number of legal segments without further Tracker consumption. `moveUsed` records the paid action; `moveAuthorized` is the remaining turn-scoped right to move; `activeMovement` is only the temporary interaction before the first physical segment and therefore supports Cancel/refund only at that point. After the first segment, the Engine accepts later `NORMAL_MOVE_COMMITTED` commands from the existing `moveAuthorized` state, retains the original `moveGroupId`, validates the active team phase, axis, occupancy and total Speed, and records each physical segment as `PIECE_MOVED`. Existing turn reset clears authorization. There is deliberately no End Move command.

### v20.16.0 correction — one offline normal-MOVE workflow

The direct-board confirmation is not an independent Auto Move gameplay mechanic in Single Player. It is a second UI entrance to normal MOVE. The modal remains UI-local, but its confirmation evaluates `NORMAL_MOVE_STARTED` followed by the first `NORMAL_MOVE_COMMITTED` through `dispatchSinglePlayerGameCommandSequence()`. The Controller publishes neither result if either command is rejected. This removes the previous React/Timeline split in direct-board movement while preserving the two existing Timeline events and their Undo/Redo semantics. The session/manual-multiplayer direct-board path is deliberately unchanged.

## Phase 4 — Remaining movement family

**Status:** In progress. 3/2 is complete in v20.17.0; Free Move is complete in v20.19.0; Group Move remains pending.

Migrate Group Move. Audit any remaining distinct movement prompt before treating it as a separate mechanic. Split into separate builds if focused tests show this phase is too broad.

### v20.19.0 — offline Single Player Free Move Engine migration

Free Move now has one offline Match Mode mutation path: `FREE_MOVE_STARTED`, `FREE_MOVE_COMMITTED`, and `FREE_MOVE_ENDED` flow through the Game Engine and Single Player Controller into Timeline. It is deliberately an administrative correction rather than a Tracker action. The three Timeline entries are ordinary reversible history, so Undo/Redo may step across them and AI export retains the correction as `FREE_MODE` with `MANUAL_CORRECTION` provenance.

The Engine owns the active Free Move lock, selected-piece identity, player-only destination occupancy, player-only movement, and the guarantee that the ball never follows a Free-Moved player. While it is active, all other Engine commands are rejected. UI guards extend the same lock to remaining legacy offline Match Mode action entrances and Free Ball. Free Move retains its intended exemption from distance, path, axis, phase, and Tracker limits. Manual Multiplayer and Editor Mode remain on their existing paths.

### v20.17.0 — offline Single Player 3/2 vertical slice

The 3/2 action now uses `THREE_TWO_MOVE_COMMITTED -> Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. Its engine rule is isolated in `src/engine/threeTwoMoveRules.mjs`; its accepted semantic event remains `THREE_TWO_MOVE`, which existing AI Export already classifies as `THREE_TWO`.

The product owner explicitly approved the rule clarification: 3/2 is a free action that consumes no Tracker action and may be used after the active team has exhausted normal Tracker actions. It is still limited to one use per player in that player's active phase and cannot enter a ball square occupied by another player. The engine validates this from canonical MatchState. Offline clicking the ball with an eligible selected player opens the existing 3/2 confirmation and dispatches the same command. The session/manual-multiplayer branch remains unchanged.

Focused acceptance:

- deterministic acceptance and rejection for active phase, exhausted Tracker, occupancy, reuse, range, and Match start;
- no MatchState mutation on rejection;
- Timeline Undo/Redo for the semantic `THREE_TWO_MOVE` event;
- no UI, Firebase, or browser dependencies in the new rule module;
- focused command: `node --test src/engine/*.test.mjs src/timeline/aiAnalysisExport.test.mjs`.

### v20.18.0 — offline Single Player movement path blocking

`src/engine/movementPathRules.mjs` is the single pure source for physical movement corridors. It enumerates only legal straight or diagonal path squares and finds the first non-ball player blocking an intermediate square. Normal MOVE and 3/2 call it inside the Engine. The existing offline Single Player Bonus Move and Group Move validators reuse the same module until they receive their own Engine migrations.

The product owner approved the gameplay rule: teammates and opponents both block physical movement; the ball does not. Free Move remains intentionally exempt as an unrestricted administrative safety tool, except for the existing destination occupancy invariant. Editor Mode, Free Ball, and all session/manual-multiplayer paths are unchanged.

Focused acceptance:

- horizontal, vertical, and diagonal path enumeration;
- teammate and opponent blockers; ball ignored;
- Engine rejection without state mutation for Normal MOVE and 3/2;
- focused command: `node --test src/engine/*.test.mjs src/timeline/aiAnalysisExport.test.mjs src/multiplayer/freeToolsAuthority.test.mjs`.

Acceptance:

- every Match Mode physical move has explicit command and semantic reason;
- AI export distinguishes existing movement causes;
- no direct UI mutation path remains for migrated movement;
- no game-rule change is bundled.

## Phase 5 — Tracker, turns, and possession

**Status:** Pending.

Migrate Match start, phase completion, turn change, possession change, action reset, and currently existing match-completion behavior.

Acceptance:

- engine is sole owner of turn progression and action-economy reset;
- Timeline/Replay/AI export retain current turn and possession semantics;
- React Tracker panels are presentation and command input only.

## Phase 6 — Pass initiation and decisions

**Status:** Pending.

Migrate Pass start/cancel, target, route, plan creation, interceptor choice, pending decision, and pending roll. Reuse existing Pass, Interception, and generic action-resolution modules without changing rules.

Acceptance:

- `main.jsx` no longer creates or mutates Pass resolution directly;
- Cancel Pass acts from canonical action state;
- existing geometry and eligibility remain unchanged;
- Timeline and AI semantic coverage remains intact.

## Phase 7 — Dice, Interception, and Bonus Action

**Status:** Pending.

Migrate RollEvent submission, delayed resolution, Natural 1/20, interception outcome, possession consequence, Bonus continuation, completion/decline, and atomic Undo.

Acceptance:

- engine resolves a Pass end-to-end;
- Controller only schedules and sends `RESOLUTION_DUE`;
- stale or duplicate roll/timer paths cannot resolve twice;
- AI export preserves identity, modifiers, outcome, possession, and Bonus distinctions;
- no automated multiplayer work is added.

## Phase 8 — Single Player Controller completion

**Status:** Pending.

Centralize Single Player dispatch and remove remaining direct Match Mode mutation paths from `main.jsx`, preserving Editor Mode, card editing, and Manual Multiplayer.

Acceptance:

- all existing Single Player Match Mode routes use engine;
- current MatchState comes from Timeline cursor;
- gameplay refs no longer compete as authority;
- only presentation/DOM/timer-cleanup refs remain;
- full regression audit passes.

## Phase 9 — Pre-multiplayer engine audit

**Status:** Pending. No automated multiplayer feature is implemented here.

Acceptance:

- current mechanics are engine-backed and testable without UI;
- MatchContext is frozen per match;
- Timeline, Undo/Redo, Replay, and AI Export use same state;
- Manual Multiplayer remains unchanged from baseline;
- Firebase contains no newly introduced rule or deterministic-resolution logic.

## Required update after every implementation build

- mark only completed items complete;
- add exact files and tests used;
- record discovered blockers without silent scope expansion;
- update permanent architecture when its durable contract changed;
- provide complete new-chat handoff with phase, baseline, scope, prohibitions, acceptance criteria, and tests.
