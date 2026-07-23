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

**Status:** Complete for the movement family. 3/2 is complete in v20.17.0; Free Move is complete in v20.19.0; Group Move is complete in v20.20.0, with its offline UI/turn-closure correction in v20.20.1.

Audit any remaining distinct movement prompt before treating it as a separate mechanic. Split into separate builds if focused tests show this phase is too broad.

### v20.20.0 — offline Single Player Group Move Engine migration

Group Move now has one offline Match Mode mutation path. Pressing the button creates only a local preview zone; it is intentionally not Timeline state because it has not committed a game action. `GROUP_MOVE_ZONE_CONFIRMED` consumes the final normal Tracker action and records the confirmed zone in `matchActionState.groupMove`. Every subsequent `GROUP_MOVE_PLAYER_COMMITTED` is checked by the Engine against that frozen zone and records the existing `GROUP_MOVE_PIECE` Timeline event.

The Rule Set schema is version 4 and adds `actions.groupMove.maxPlayers`, `zoneLength`, `maxDistance`, and `sameDirectionOnly`; old Rule Sets receive the approved defaults. MatchContext freezes these settings at Match start. The Engine owns zone eligibility, one move per player, maximum player count, maximum distance, first-move orientation/direction, player and ball destination restrictions, and the deliberate Group Move exception that may cross players. End Turn retains the existing turn reset and is the only normal closure. Manual Multiplayer and Editor Mode remain unchanged.

### v20.20.1 — offline Single Player Group Move UI and turn-closure correction

End Turn now clears the active canonical `matchActionState.groupMove` interaction before recording the next phase, so the Engine's intentional Group Move lock cannot leak into the opposing team's turn. The confirmed zone remains in MatchState exclusively for Engine eligibility validation; it is no longer rendered after confirmation. A local draft zone is positioned by dragging the band and remains non-canonical until confirmation.

The board derives active-team candidate marking from exported pure Group Move eligibility evaluation: eligible candidates are highlighted; candidates in the confirmed zone that cannot participate are grey-outlined and display a lock. Cursor preview uses the same pure Group Move destination evaluator as the Engine, including Group maximum distance, established direction, occupancy/ball constraints, and the deliberate no-path-blocking exception. Manual Multiplayer and Editor Mode remain unchanged.

## Phase 5 — Bonus Action foundation and Bonus MOVE

### v20.21.0 — offline Single Player Bonus Action foundation

`actionContinuation` remains the canonical Timeline state for a Bonus Action and never belongs to Tracker. This build extends it compatibly with a structured `origin` while preserving the historical `source` string used by old recordings. Origin records the source action, outcome, reason, source Timeline entry, and an optional parent continuation ID. A new Bonus Action created during an old one replaces the old continuation atomically; the previous resume policy is not applied, and the new continuation points to the replaced one for Timeline and AI analysis.

While an offline Single Player Bonus Action is present, the Engine rejects unrelated gameplay commands and UI disables End Turn, Free Move, Free Ball, normal actions, and Group Move. 3/2 remains a separate free rule: its owner may use it during Bonus Action even outside the Tracker's active phase. Existing 3/2 validation and no-Tracker economy remain unchanged. Manual Multiplayer remains unchanged.

### v20.21.1 — offline Single Player Bonus MOVE Engine migration

**Status:** Complete.

Bonus MOVE now uses `BONUS_MOVE_STARTED`, `BONUS_MOVE_CANCELLED`, and `BONUS_MOVE_COMMITTED` through the Game Engine and Single Player Controller into Timeline. `actionContinuation` owns the active Bonus MOVE identity and its `movementStarted` flag; this flag permits `CANCEL MOVE` only before the first physical segment. The Engine owns Bonus Action owner validation, Speed, progressive segments, first-axis lock, path blocking, occupied destinations, ball carry, and rejection safety. It never activates or changes Tracker state.

Both offline Single Player entrances use the same Engine commands: card MOVE starts the action and exposes Cancel before the first segment; direct board selection plus legal destination evaluates a start-and-commit sequence before publishing either Timeline transition. Direct board movement therefore has no artificial Cancel interval after the player has physically moved. `END B.A.` remains the only normal closure and may end the action with unused Speed. 3/2 remains independent before or during Bonus MOVE. Manual Multiplayer remains unchanged.

### v20.22.0 — offline Single Player phase closure and automatic turn advance

**Status:** Complete.

`TRACKER_PHASE_ENDED` now moves offline Single Player Match Mode through `Game Engine -> Single Player Controller -> Timeline -> applyTimelineGameState`. The Engine validates Match start, active team and active action-resolution state. It deliberately permits Group Move closure and clears its canonical state. It rejects Free Move and pre-first-segment normal MOVE through the existing Engine interaction locks.

Attack closure changes only `turnPhase` to defense. Defense closure automatically begins the next numbered turn when one remains: it resets Tracker action logs/economy, per-piece Move authorization, Group Move state, and movement state, then returns to attack. The existing starting/attacking team is preserved. At the configured final turn, defense closure reaches `complete` without creating another numbered turn. Tracker numbered controls are presentation-only in offline Match Mode; Editor Mode and Manual Multiplayer retain existing behavior. The `PHASE_ENDED` semantic Timeline event carries `automaticTurnAdvance` and `startedTurn` metadata for History, replay and AI export. UI presents the non-canonical `TURN X` popup after the committed state is applied.

### v20.22.1 — inactive-phase action presentation lock

**Status:** Complete.

The offline Single Player Match Mode Inspector now derives card-action availability from canonical Tracker phase ownership. Outside the active phase, Move, Group Move, Pass, Shot, Cross, Dribble and Tackling are disabled. This is deliberately UI presentation only because the migrated Engine commands already validate ownership. Selection and inspection remain unrestricted for both teams; Free Move, Free Ball, INACTIVE and card-flip flows are intentionally excluded. Canonical Bonus Action ownership remains the only normal-action exception. Manual Multiplayer remains unchanged.

### v20.23.0 — offline Single Player Bonus Action closure Engine migration

**Status:** Complete.

`END B.A.` now dispatches `BONUS_ACTION_ENDED` through the Game Engine and Single Player Controller in offline Match Mode. The Engine accepts only the canonical Bonus Action and an optional matching continuation identity; it rejects stale, missing, non-Match, or action-resolution-active requests without changing MatchState. It accepts a ready continuation as an explicit decline, an active continuation (including partial Bonus MOVE), or a completed continuation awaiting explicit closure.

The Engine emits the existing `BONUS_ACTION_DECLINED` or `BONUS_ACTION_ENDED` semantic Timeline event, preserving the AI-exported metadata. It owns continuation removal and the resume policy: `advance-turn` resets the new turn's Tracker and movement state, starts that designated team, and completes the Match rather than inventing or repeating an out-of-range final turn. `resume-phase` returns explicitly to its declared phase without a reset. The closure joins the existing continuation transaction, preserving atomic Undo/Redo. Manual Multiplayer keeps its existing End B.A. UI/Firebase path.

Delivered files and tests:

- `src/engine/bonusActionRules.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEngine.mjs`
- `src/engine/singlePlayerController.mjs`
- `src/engine/gameEngine.test.mjs`
- `src/engine/singlePlayerController.test.mjs`
- offline Match Mode branch of `endBonusAction()` in `src/main.jsx`
- focused command: `node --test src/engine/*.test.mjs src/match/*.test.mjs src/timeline/*.test.mjs src/tracker/*.test.mjs`

### v20.24.0 — offline Single Player Match start Engine migration and Match Over presentation

**Status:** Complete.

`MATCH_STARTED` now creates the playable offline Match Mode opening state through the Game Engine and Single Player Controller. The Engine validates Match Mode, chosen team and non-started state, then sets canonical turn one, attack phase, empty Tracker economy/action state, empty movement state, and no residual resolution or Bonus Action. A second start is rejected without mutation.

The Controller intentionally creates the Timeline baseline from the Engine-produced playable state, then appends the existing no-op `MATCH_STARTED` audit event. This preserves the established contract that Timeline cursor zero is playable rather than a pre-match board. The frozen MatchContext is created before dispatch and becomes active only if the Engine accepts the start. Manual Multiplayer retains its existing direct start path.

`MATCH OVER` is a non-canonical UI notice. It appears only after the live offline result of `TRACKER_PHASE_ENDED` or `BONUS_ACTION_ENDED` has `turnPhase: complete`; it never appears merely because a replay, Undo, Redo, or loaded state renders a completed Match.

Delivered files and tests:

- `src/engine/matchLifecycleRules.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEngine.mjs`
- `src/engine/singlePlayerController.mjs`
- `src/engine/gameEngine.test.mjs`
- `src/engine/singlePlayerController.test.mjs`
- offline Match Mode branch of `startTrackedGame()` and Match Over notice in `src/main.jsx`
- focused command: `node --test src/engine/*.test.mjs src/match/*.test.mjs src/timeline/*.test.mjs src/tracker/*.test.mjs`

### v20.24.1 — Tracker Restart regression correction

**Status:** Complete.

v20.24.0 mistakenly routed the shared Tracker Start/Restart UI through `MATCH_STARTED` in every offline mode. That rejected a Match already in progress as `MATCH_ALREADY_STARTED` and rejected Editor Mode as `MATCH_MODE_REQUIRED`; the generic UI displayed both as `Illegal Move`.

Editor Mode now deliberately retains its pre-Engine unrestricted Start/Restart route. Offline Single Player Match Mode uses `MATCH_STARTED` only for an unstarted Match and `MATCH_RESTARTED` for an existing Match. The restart Engine transition preserves pieces and ball positions while resetting canonical turn one, chosen attacker, Tracker action state, movement state, resolution and continuation. It emits the established `MATCH_STARTED` semantic event with `restarted: true`, preserving existing export vocabulary. Manual Multiplayer remains unchanged.

Delivered files and tests:

- `src/engine/matchLifecycleRules.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEngine.mjs`
- `src/engine/gameEngine.test.mjs`
- offline Match Mode branch of `startTrackedGame()` in `src/main.jsx`
- focused command: `node --test src/engine/*.test.mjs src/match/*.test.mjs src/timeline/*.test.mjs src/tracker/*.test.mjs`

### v20.25.0 — offline Single Player Pass start/cancel Engine migration

**Status:** Complete as the first deliberately narrow Pass slice.

`PASS_STARTED` and `PASS_CANCELLED` now flow through the pure Game Engine and Single Player Controller in offline Single Player Match Mode. Start validates canonical MatchState: started Match, valid active ball carrier, active normal phase with a remaining action or a ready owned Bonus Action, and no existing action resolution. It creates the established targeting-shaped canonical Pass resolution and emits the existing `PASS_TARGETING_STARTED` or `BONUS_PASS_TARGETING_STARTED` semantic event. It deliberately does not consume Tracker economy or perform any physical or dice resolution.

Cancel accepts only the established cancellable targeting or route-selection state. It clears normal Pass resolution stepwise; for Bonus Pass it restores the canonical continuation to ready within the existing atomic transaction. The Engine rejects unrelated commands while such a resolution exists. Offline UI entry/cancel now dispatches these commands. Manual Multiplayer remains exactly on its pre-existing path.

Deliberately not migrated: target selection, route confirmation and plan creation, interceptor choice, pending decision/roll, dice submission, delayed resolution, interception outcome, possession and final Pass completion. They remain the next Pass slices rather than hidden in this build.

Delivered files and tests:

- `src/engine/passStartRules.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEngine.mjs`
- `src/engine/gameEngine.test.mjs`
- `src/engine/singlePlayerController.test.mjs`
- offline Single Player branches of `beginPassTargeting()` and `commitPassCancellation()` in `src/main.jsx`
- focused command: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/multiplayer/actionStartAuthority.test.mjs`

### v20.25.1 — offline Single Player Pass target Engine migration and frozen route input

**Status:** Complete as the second narrow Pass slice.

`PASS_TARGET_SELECTED` now flows through the pure Game Engine and Single Player Controller in offline Single Player Match Mode. The Engine accepts only a canonical Pass in `targeting` state with its matching pass identity and an integer coordinate inside the immutable MatchContext board. It stores the requested target and enters `route-selection`, retaining the existing Timeline event name. It deliberately does not consume a normal Tracker action, reject an occupied requested target, construct a plan, select a route, open an interceptor choice or roll, or alter the ball/possession.

The offline route preview and remaining legacy `buildPassPlan()` call now use frozen MatchContext Rule Set, board geometry and gameplay-card projections rather than mutable editor data. This closes the active-match card/rule/editor drift without prematurely migrating route confirmation. Normal target selection remains a stepwise Timeline entry. Bonus Pass target selection retains the existing continuation group and atomic Undo/Redo transaction. Manual Multiplayer remains unchanged.

Delivered files and tests:

- `src/engine/passStartRules.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEngine.mjs`
- `src/engine/gameEngine.test.mjs`
- `src/engine/singlePlayerController.test.mjs`
- offline Single Player `commitPassTargetSelection()` and frozen route preview/plan inputs in `src/main.jsx`
- focused command: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/multiplayer/actionStartAuthority.test.mjs`

### v20.26.0 — offline Single Player Pass route confirmation and canonical plan

**Status:** Complete as the third narrow Pass slice.

`PASS_ROUTE_CONFIRMED` now flows through the pure Game Engine and Single Player Controller in offline Single Player Match Mode. It validates a matching Pass in `route-selection`, accepts only a legal origin for the frozen path mode, and rejects an opponent-blocked origin before altering action economy. The Engine invokes the existing pure `buildPassPlan()` with MatchState and immutable MatchContext, then stores the canonical plan and emits the existing `PASS_CONFIRMED` semantic event.

For a normal Pass it consumes exactly one Tracker action; for a Bonus Pass it retains the existing atomic continuation and consumes no Tracker action. The command may only produce the already-established downstream state: `completing`, `awaiting-interceptor-choice`, or `awaiting-interception-roll`. Declaring `pendingDecision` or `pendingRoll` is preparation of the canonical input contract, not an interceptor choice, dice submission or resolution. Ball movement, possession, roll results, interception outcomes and Bonus Action consequences remain outside this build on their current downstream path. Manual Multiplayer remains unchanged.

Approved deferred rule, deliberately not bundled here: a player card whose frozen `position` is `GK` must be rejected as a selected Pass target regardless of team. v20.26.1 later activates the distinct route rule: a goalkeeper is physically present but blocks a route rather than becoming its first-hit recipient.

Delivered files and tests:

- `src/engine/passStartRules.mjs`
- `src/engine/gameCommands.mjs`
- `src/engine/gameEngine.mjs`
- `src/engine/gameEngine.test.mjs`
- `src/engine/singlePlayerController.test.mjs`
- offline Single Player `confirmPassRoute()` branch in `src/main.jsx`
- focused command: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/multiplayer/actionStartAuthority.test.mjs`

### v20.26.1 — offline Single Player Pass route blockers and visual truth

**Status:** Complete as a correction to the confirmed-route boundary.

The pure Pass plan now identifies a first physical route intersection with a frozen `position: "GK"` card as `goalkeeperRouteBlocked`. `PASS_ROUTE_CONFIRMED` rejects this before action economy changes; the goalkeeper cannot be passed through or receive the ball as a direct hit. Single Player preserves the blocked option visually in grey and prevents its selection, for both path modes. The existing Manual Multiplayer route path is unchanged.

The Single Player preview also colors a route red when its canonical first physical hit is an opponent, even if no defensive-area interceptor exists. This fixes the adjacent-opponent green preview defect without changing any Pass geometry or resolution rule.

The deliberately separate goalkeeper-as-requested-target rule remains pending under `PASS_TARGET_SELECTED`.

Delivered files and tests:

- `src/rules/passEngine.mjs` and `src/rules/passEngine.test.mjs`
- `src/engine/passStartRules.mjs` and `src/engine/gameEngine.test.mjs`
- Single Player route presentation in `src/main.jsx`, `src/board/BoardCanvas.jsx`, and `src/styles.css`
- focused command: `node --test src/rules/passEngine.test.mjs src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/multiplayer/actionStartAuthority.test.mjs`

### v20.27.0 — offline Single Player Pass interceptor-choice Engine migration

**Status:** Complete as the fourth narrow Pass slice.

`PASS_INTERCEPTOR_SELECTED` now flows through the pure Game Engine and Single Player Controller in offline Single Player Match Mode. The Engine accepts only a matching active `CHOOSE_INTERCEPTOR` decision and validates that its stored candidate list remains identical to the equal-priority group in the canonical Pass plan. It applies the existing pure reorder/modifier rule using frozen MatchContext interception settings, records the selection on the plan, closes the decision and creates the existing next pending-roll descriptor.

The command does not consume another Tracker action, move the ball, change possession, create or submit a die event, resolve the interception, advance to another reaction, or create/close a Bonus Action. Normal choice is stepwise History; Bonus choice remains inside its existing atomic continuation. Manual Multiplayer keeps its legacy selection branch.

Delivered files and tests:

- `src/engine/gameCommands.mjs`, `src/engine/passStartRules.mjs`, and `src/engine/gameEngine.mjs`
- `src/engine/gameEngine.test.mjs` and `src/engine/singlePlayerController.test.mjs`
- offline Single Player `choosePassInterceptor()` branch in `src/main.jsx`
- focused command: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/rules/passEngine.test.mjs src/multiplayer/actionStartAuthority.test.mjs`

### v20.28.0 — offline Single Player Pass roll submission and dice access boundary

**Status:** Complete as the fifth narrow Pass slice, plus the approved administrative dice safeguard.

### v20.28.1 — startup regression correction

**Status:** Complete. No migration scope changed: this is a one-line React Hook declaration-order correction for v20.28.0. It restores application mount and changes neither MatchState, MatchContext, Engine, Timeline, game rules nor Manual Multiplayer.

### v20.29.0 — offline Single Player Pass interception mathematical result

**Status:** Complete as the sixth narrow Pass slice.

- `PASS_INTERCEPTION_RESOLUTION_DUE` verifies the consumed canonical RollEvent and produces the frozen deterministic result in Engine.
- `PASS_INTERCEPTION_RESOLVED` is a Timeline/Undo/Redo/AI-visible state transition containing the full resolution details.
- Ball movement, possession/turn transition, Bonus Action, reaction advancement and Pass completion remain intentionally outside this slice.
- `EXTRA ROLL` was aligned visually with the die selector without changing its administrative contract.

### v20.29.1 — Bonus Action Extra Roll correction

**Status:** Complete. `EXTRA_ROLL_SUBMITTED` was accidentally excluded from the active Bonus Action command allow-list. It is now explicitly allowed as an administrative Timeline event for either team, without consuming or changing the Bonus Action.

### v20.30.0 — offline Single Player ordinary Pass consequences and History follow

**Status:** Complete as the seventh Pass slice, excluding Natural 20.

- `PASS_CONSEQUENCE_DUE` is the only offline Single Player Engine command for a confirmed no-reaction Pass, direct opponent hit, ordinary interception, missed-interceptor advancement, final completion and Natural 1's cumulative next-interceptor penalty.
- The command validates canonical Pass and RollEvent identities. On ordinary interception/direct hit it moves the ball, transfers possession, resets action/movement state and starts the established next turn. On a miss it creates the next canonical decision or roll; when none remains it completes the Pass. A successful Bonus Pass enters `awaiting-end-bonus-action` without Tracker consumption.
- `natural-20-interception` is deliberately rejected without mutation and remains on the temporary legacy downstream branch. It is the next and final Pass consequence slice because it creates/replaces a Bonus Action continuation.
- Manual Multiplayer remains unchanged. The History panel is presentation-only and now scrolls to keep the active Timeline cursor visible after live steps, Undo/Redo and replay navigation.

### v20.31.0 — offline Single Player Natural 20 Pass consequence

**Status:** Complete as the final Pass slice.

- `PASS_CONSEQUENCE_DUE` now accepts the deterministic `natural-20-interception` outcome, validates its Pass/RollEvent identity, moves the ball to the interceptor and creates the existing ready Bonus Action continuation in canonical MatchState.
- Tracker state is intentionally not reset at the instant of interception. The continuation's existing `advance-turn` resume policy takes effect only at `BONUS_ACTION_ENDED`, preserving the approved rule that Natural 20 gives one complete Bonus Action before the new turn begins.
- A Natural 20 during an existing Bonus Action replaces that continuation and records the prior continuation as the new origin's `parentContinuationId`; the result event records the superseded identity. The continuation ID is deterministic from Pass and RollEvent identity.
- The existing roll-resolution undo transaction spans DICE, frozen interception result and `PASS_NATURAL_20`; the granted Bonus Action remains a later independent atomic transaction. Manual Multiplayer is unchanged.

`PASS_INTERCEPTION_ROLL_SUBMITTED` now flows through the Game Engine and Single Player Controller. It accepts only the active exact pending D20 request and its matching unique RollEvent, consumes that event once, stores the raw result in canonical MatchState, updates canonical dice display state and records the existing delayed-resolution descriptor. The legacy delayed resolver temporarily reads this canonical input and performs the existing outcome calculation. Outcome, possession, ball movement, Natural 1/Natural 20 consequences and later reaction advancement remain outside this build.

Offline Match Mode dice controls are disabled unless a pending mechanic roll requests the relevant team. `EXTRA ROLL` explicitly arms one administrative random or chosen roll. It creates `EXTRA_ROLL` in Timeline and AI analysis, never consumes Tracker economy, cannot satisfy a pending action roll, and closes after use. Editor Mode and Manual Multiplayer retain their legacy dice behavior.

Delivered files and tests:

- `src/engine/gameCommands.mjs`, `src/engine/passStartRules.mjs`, and `src/engine/gameEngine.mjs`
- `src/engine/gameEngine.test.mjs` and `src/engine/singlePlayerController.test.mjs`
- offline Single Player dice routing in `src/main.jsx`
- `src/timeline/aiAnalysisExport.mjs` and its regression test
- focused command: `node --test src/engine/gameEngine.test.mjs src/engine/singlePlayerController.test.mjs src/timeline/aiAnalysisExport.test.mjs src/match/delayedResolution.test.mjs src/multiplayer/actionStartAuthority.test.mjs`

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

**Status:** Complete for the current offline Single Player Pass rule set.

Migrate Match start, phase completion, turn change, possession change, action reset, and currently existing match-completion behavior.

Acceptance:

- engine is sole owner of turn progression and action-economy reset;
- Timeline/Replay/AI export retain current turn and possession semantics;
- React Tracker panels are presentation and command input only.

## Phase 6 — Pass initiation and decisions

**Status:** Complete for offline Single Player.

Migrate Pass start/cancel, target, route, plan creation, interceptor choice, pending decision, and pending roll. Reuse existing Pass, Interception, and generic action-resolution modules without changing rules.

Acceptance:

- each completed Pass slice removes its corresponding offline Match Mode direct mutation path from `main.jsx`;
- start and Cancel Pass act from canonical action state;
- existing geometry and eligibility remain unchanged;
- Timeline and AI semantic coverage remains intact.

## Phase 7 — Dice, Interception, and Bonus Action

**Status:** Complete for the current offline Single Player Pass/Interception/Bonus Action flow. Future mechanics require their own Engine-first vertical slices.

Migrate RollEvent submission, delayed resolution, Natural 1/20, interception outcome, possession consequence, Bonus continuation, completion/decline, and atomic Undo.

Acceptance:

- engine resolves a Pass end-to-end;
- Controller only schedules and sends `RESOLUTION_DUE`;
- stale or duplicate roll/timer paths cannot resolve twice;
- AI export preserves identity, modifiers, outcome, possession, and Bonus distinctions;
- no automated multiplayer work is added.

## Phase 8 — Single Player Controller completion

**Status:** Complete. Phase 8A is complete in v20.32.0, Phase 8B is complete in v20.33.0, Phase 8C.1 is complete in v20.34.0, Phase 8C.2a is complete in v20.35.0, Phase 8C.2b is complete in v20.36.0, and Phase 8C.2c is complete in v20.38.0. Phase 9 independently verified the completed boundary in the v20.47.0 documentation-only audit.

Centralize Single Player dispatch and remove remaining direct Match Mode mutation paths from `main.jsx`, preserving Editor Mode, card editing, and Manual Multiplayer.

### Phase 8A — audited Match boundary and temporary manual declarations

**Status:** Complete in v20.32.0.

The audit confirmed that existing offline Single Player mechanics already use Engine commands. The remaining direct Match mutations were administrative controls and placeholder action buttons.

- `PIECE_ACTIVITY_CHANGED` now owns offline Match `INACTIVE` / `ACTIVE`. Editor Mode deliberately retains its independent unrestricted workspace behavior.
- `TRACKER_ACTIONS_RESET` and `TRACKER_POSSESSION_CHANGED` now own the existing Reset Trackers and Change Possession safety controls. They remain temporarily available in offline Match testing, are labelled administrative in Timeline/AI, and preserve their pre-existing reset semantics. They may be visually and technically removed only after the automated Match flow is trusted.
- `MANUAL_ACTION_DECLARED` and `BONUS_MANUAL_ACTION_DECLARED` own the current test-only `SHOT`, `CROSS`, `DRIBBLE`, and `TACKLING` buttons. They validate normal Tracker or ready Bonus ownership, record a canonical declaration, and deliberately resolve no board effect, roll or probability. The player may complete that temporary test consequence with the existing Engine-owned safety tools. AI Export emits `MANUAL_DECLARATION` and `MANUAL_RESOLUTION_REQUIRED` rather than pretending the action was automated.
- A started offline Match now locks Editor Workspace mutations that could contradict frozen MatchContext or rewrite live setup: board geometry, formations, scenarios, card assignment/editing, and Tracker settings. Manual Multiplayer and Editor Mode are unchanged.

Delivered files and tests:

- `src/engine/matchAdministrationRules.mjs`, `src/engine/gameCommands.mjs`, `src/engine/gameEngine.mjs`, and `src/engine/gameEngine.test.mjs`
- offline Single Player handler branches in `src/main.jsx`
- `src/timeline/aiAnalysisExport.mjs` and `src/timeline/aiAnalysisExport.test.mjs`
- full verification: `npm test` (221 passing) and `npm run build`

### Phase 8B — Controller gateway and state projection boundary

**Status:** Complete in v20.33.0.

`src/engine/singlePlayerMatchGateway.mjs` is the UI-facing gateway for every existing offline Match Engine command, including one-command, dependent-sequence and Match-start routes. It calls the pure Controller, publishes only accepted results, and passes the exact returned Timeline and canonical cursor state to the UI projection. `main.jsx` owns the projection callback because React state and refs belong there, but it no longer repeats the command-result publication protocol in individual gameplay handlers.

No gameplay rule, Manual Multiplayer branch, Editor Workspace behavior, Firebase path or Timeline semantics changed. The gateway has focused accepted/rejected tests; full verification recorded 223 passing tests plus a production build.

### Phase 8C — Editor Workspace and persistence boundary

**Status:** Complete. Phase 8C.1 is complete in v20.34.0, Phase 8C.2a is complete in v20.35.0, Phase 8C.2b is complete in v20.36.0, and Phase 8C.2c is complete in v20.38.0.

#### Phase 8C.1 — Workspace persistence contract

`src/workspace/workspaceSnapshot.mjs` defines the future-Match Workspace profile and explicitly excludes live Match Runtime. Cloud Save, Cloud Load and full Cards & Board backup now write/read that profile. Legacy flat storage remains readable but Match fields from it are discarded rather than being restored outside Timeline.

During an active offline Match, Cloud Save, autosave and Workspace import are blocked; Workspace export uses the frozen Match-start setup. Manual Multiplayer persistence is unchanged. Focused contract tests are in `src/workspace/workspaceSnapshot.test.mjs` and are included in the normal test command.

#### Phase 8C.2a — structural Workspace operations

**Status:** Complete in v20.35.0.

`workspaceOperations.mjs` now plans board settings, formation application/saving, scenario save, Rule Set commit and card assignment/removal as pure operations. `main.jsx` applies the returned plan through its existing React/ref/History adapter. UI confirmation, Cloud/local persistence and the legacy Manual Multiplayer paths intentionally remain at that boundary.

#### Phase 8C.2b — structural Card Library boundary

**Status:** Complete in v20.36.0.

`cardLibraryOperations.mjs` now plans Card Library upsert, clone preparation, deletion with affected-piece detachment and Reset Cards as pure operations. Caller-supplied dependencies retain the existing inline-image policy, generated ID/time values and piece sanitation. `main.jsx` remains the UI/confirmation/History/legacy-sync adapter; visual card fields and layout controls remain unchanged.

#### Phase 8C.2c — visual Card Editor UI/controller boundary

**Status:** Complete in v20.38.0.

##### Phase 8C.2c.1 — Card render boundary

`src/cards/CardVisualCanvas.jsx` now owns the shared visual card canvas, its local layout-interaction presentation, special-text fitting and defensive-area preview. `CardPreview` passes the established render context through to Canvas. `main.jsx` still supplies pure presentation helpers plus the existing layout-change callbacks; it retains no Canvas JSX or DOM interaction code.

v20.37.1 corrects a missing Back-card numeric-text helper in that render context. The renderer now has a focused Front-and-Back regression test; no boundary or behavior changed.

##### Phase 8C.2c.2 — Card Editor form and panel boundary

**Status:** Complete in v20.38.0.

`CardEditorPanel.jsx`, `CardsPanel.jsx` and `AssignCardModal.jsx` now own those UI surfaces. Each receives a controller prop supplied by `main.jsx`; it contains existing visible data, UI selections and callbacks only. Workspace/card-library operations, state publication, browser file inputs and retained Manual Multiplayer synchronization remain at the application-shell boundary. No component owns a second Card State, Firebase path or Match rule path.

Acceptance:

- all existing Single Player Match Mode routes use engine;
- current MatchState comes from Timeline cursor;
- gameplay refs no longer compete as authority;
- only presentation/DOM/timer-cleanup refs remain;
- full regression audit passes.

## Phase 9 — Pre-multiplayer engine audit

**Status:** Complete in the v20.47.0 documentation-only audit. No automated multiplayer feature was implemented, repaired, or reopened.

Acceptance:

- current mechanics are engine-backed and testable without UI;
- MatchContext is frozen per match;
- Timeline, Undo/Redo, Replay, and AI Export use same state;
- Manual Multiplayer remains unchanged from baseline;
- Firebase contains no newly introduced rule or deterministic-resolution logic.

Audit result: accepted. The full report is [`PHASE_9_PRE_MULTIPLAYER_ENGINE_AUDIT.md`](PHASE_9_PRE_MULTIPLAYER_ENGINE_AUDIT.md). This closes the Single Player extraction/audit roadmap. It does **not** authorize automated Multiplayer implementation: that requires a later, separately approved clean-room scope after Single Player mechanics are sufficiently stable.

## Post-audit approved rule amendment — Personal Action Limits

**Status:** Complete in v20.48.0.

This is a rule amendment, not a reopened migration phase. The permanent contract is [`PERSONAL_ACTION_LIMITS.md`](PERSONAL_ACTION_LIMITS.md). It extends the accepted Single Player Engine boundary without changing Manual Multiplayer: the canonical offline MatchState carries each player's normal-action usage, and the Engine enforces the approved attack/defense maxima wherever a normal action is consumed.

## Phase 10 — Single Player authority and projection integrity

### Phase 10A — Full Offline Single Player Authority & Projection Audit

**Status:** Complete in v20.52.2.

The audit found that Phase 9 had accepted Engine-owned mutation and Timeline authority, but had not established a complete UI projection contract. The missing inventory included normal Movement preview, 3/2, Group Move, Inspector action availability, dice availability and Pass/Interception surfaces. It distinguishes frozen Manual Multiplayer from offline Single Player. v20.51.0 was a preparatory Pass/Interception slice, not completion of Phase 10B.

### Phase 10B — Authority & Projection Remediation

**Status:** Complete in v20.52.2. v20.52.0 was an intermediate build and is not an accepted Phase 10B closure.

`PASS_TARGET_SELECTED` persists route presentation facts in canonical MatchState and the Engine persists the Interception prompt breakdown whenever it requests a defender roll. `matchPresentationSelectors.mjs` is the offline Match UI projection boundary for Pass, normal Move, 3/2, Free Move, Free Ball, Group Move candidate/destination status, Inspector/End Turn/Bonus availability and dice-request availability. Preview capability is an evaluator-only argument and can never be delivered in a gameplay command payload. Free Ball validates board bounds through the frozen MatchContext. Interceptor-choice values read frozen gameplay cards, not the editable live card library. The UI no longer imports direct movement evaluators and offline Pass result presentation never falls back to a local Interception recomputation. Group Move zone setup reads the frozen MatchContext Rule Set. Timeline, Undo/Redo, Replay and AI retain the same stored action state and resolution sources. Manual Multiplayer remains unchanged.

v20.52.2 corrects a projection-contract regression introduced by v20.52.0: Normal Move geometry is now returned by the Engine evaluator before ordinary Tracker authorization gates, so a rejected but valid hover intent remains renderable. Invalid presentation input has explicit nullable geometry and UI renders it as unavailable; it never recreates geometry locally. Regression coverage includes the exact pre-start and inactive-team selected-player hover states that previously emptied the React root.

The next Engine mechanic must enter through this projection contract from its first build. Group Move diagonal/orthogonal is now eligible as the next approved scope and must use the same boundary.

## Required update after every implementation build

- mark only completed items complete;
- add exact files and tests used;
- record discovered blockers without silent scope expansion;
- update permanent architecture when its durable contract changed;
- provide complete new-chat handoff with phase, baseline, scope, prohibitions, acceptance criteria, and tests.
