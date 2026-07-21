# Game Engine Migration Plan

## Status: OPEN

This is the temporary execution checklist. Permanent architecture is in [`GAME_ENGINE_ARCHITECTURE.md`](GAME_ENGINE_ARCHITECTURE.md). Delete this plan only when all phases are complete and durable decisions are retained in the Architecture Decision Log.

## Scope guard

- Automated multiplayer development is frozen.
- Manual multiplayer remains unchanged.
- No game-design or rule change is authorized by this plan.
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

## Phase 4 — Remaining movement family

**Status:** Pending.

Migrate Free Move, 3/2, Group Move, and Auto Move. Split into separate builds if focused tests show this phase is too broad.

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
