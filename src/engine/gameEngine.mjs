import { createGameState } from "../game/gameState.mjs";
import { GAME_COMMAND_TYPE, gameCommandValidationReason, normalizeGameCommand } from "./gameCommands.mjs";
import { createGameEvent } from "./gameEvents.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { cancelNormalMove, commitNormalMove, startNormalMove } from "./normalMoveRules.mjs";
import { commitThreeTwoMove } from "./threeTwoMoveRules.mjs";
import { commitFreeMove, endFreeMove, startFreeMove } from "./freeMoveRules.mjs";
import { commitGroupMovePlayer, confirmGroupMoveZone } from "./groupMoveRules.mjs";
import { cancelBonusMove, commitBonusMove, startBonusMove } from "./bonusMoveRules.mjs";
import { endBonusAction } from "./bonusActionRules.mjs";
import { endTrackerPhase } from "./trackerPhaseRules.mjs";
import { restartMatch, startMatch } from "./matchLifecycleRules.mjs";
import { applyPassConsequence, cancelPass, confirmPassRoute, resolvePassInterception, selectPassInterceptor, selectPassTarget, startPass, submitPassInterceptionRoll } from "./passStartRules.mjs";
import { changePieceActivity, changeTrackerPossession, declareManualAction, declareManualBonusAction, resetTrackerActions } from "./matchAdministrationRules.mjs";
import { cancelThroughBall, commitThroughBall, confirmThroughBallRecovery, selectThroughBallRecoverer, selectThroughBallTarget, startThroughBall } from "./throughBallRules.mjs";
import { cancelLoftedThroughBall, commitLoftedThroughBall, confirmLoftedThroughBallRecovery, resolveLoftedThroughBall, resolveLoftedThroughBallRoll, selectLoftedThroughBallRecoverer, selectLoftedThroughBallTarget, startLoftedThroughBall, submitLoftedThroughBallRoll } from "./loftedThroughBallRules.mjs";
import { isBonusActionCommand, isPendingBonusActionRollSubmission } from "./bonusActionCapabilities.mjs";
import { applyShotConsequence, cancelShot, confirmShotRoute, resolveShotResult, selectShotTarget, startShot, submitShotRoll } from "./shotRules.mjs";
import { confirmFormationTactic } from "./formationTacticRules.mjs";
import { placeAdjustPiece } from "./adjustPlacementRules.mjs";
import { confirmKickoffReady } from "./kickoffReadyRules.mjs";
import { setRestartWallPosition, setRestartWall, repositionRestartPiece, passRestartReposition, selectRestartExecutor, confirmRestartWallContinuation, declineRestartWallContinuation, RESTART_EXECUTION_ACTION_TYPE_FAMILIES } from "./restartSetupRules.mjs";
import { selectGkRepositionPiece, commitGkRepositionMove, endGkRepositionTurn } from "./gkRepositionRules.mjs";
import { acceptMarking, declineMarking, beginMarkingTrackMove, commitMarkingTrackMove, cancelMarkingTrack, acceptMarkingContinue, declineMarkingContinue, acceptMarkingSwitch, declineMarkingSwitch, MARKING_TRACKING_TRIGGER_COMMAND_TYPES } from "./markingRules.mjs";
import { startTackling, submitTacklingRoll, acknowledgeTacklingBlocked, resolveTacklingResult, applyTacklingConsequence } from "./tacklingRules.mjs";
import { confirmOffsideRestart } from "./offsidePositionRules.mjs";
import { teamKeyForPiece } from "../rules/passEngine.mjs";

function rejected(reason) {
  return { accepted: false, reason };
}

function accepted(nextState, events, timeline) {
  return { accepted: true, nextState, events, timeline };
}

function validGridCoordinate(value) {
  return Number.isFinite(Number(value)) && Number.isInteger(Number(value));
}

export function evaluateFreeBallMoved(state, context, command) {
  if (state.gameMode !== "match") return rejected("MATCH_MODE_REQUIRED");
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!validGridCoordinate(x) || !validGridCoordinate(y)) return rejected("BALL_DESTINATION_INVALID");
  const cols = Number(context?.boardSettings?.cols);
  const rows = Number(context?.boardSettings?.rows);
  if ((Number.isFinite(cols) && cols > 0 && (x < 0 || x >= cols)) || (Number.isFinite(rows) && rows > 0 && (y < 0 || y >= rows))) {
    return rejected("BALL_DESTINATION_OUT_OF_BOUNDS");
  }

  const ballIndex = state.pieces.findIndex(piece => piece?.team === "BALL");
  if (ballIndex < 0) return rejected("BALL_NOT_FOUND");
  const ball = state.pieces[ballIndex];
  if (Number(ball.x) === x && Number(ball.y) === y) return rejected("BALL_POSITION_UNCHANGED");
  return { accepted: true, ballIndex, ball, x, y };
}

function applyFreeBallMoved(state, context, command) {
  const evaluation = evaluateFreeBallMoved(state, context, command);
  if (!evaluation.accepted) return evaluation;
  const { ballIndex, ball, x, y } = evaluation;

  const pieces = state.pieces.map((piece, index) => index === ballIndex ? { ...piece, x, y } : piece);
  const nextState = createGameState({ ...state, pieces });
  return accepted(nextState, [createGameEvent({
    type: "BALL_MOVED",
    commandId: command.id,
    metadata: {
      pieceId: ball.id || "",
      from: { x: Number(ball.x), y: Number(ball.y) },
      to: { x, y },
      movementReason: "FREE_BALL",
    },
  })], {
    groupId: null,
    undoMode: "step",
    allowNoop: false,
  });
}

function applyExtraRoll(state, command) {
  if (state.gameMode !== "match") return rejected("MATCH_MODE_REQUIRED");
  if (state.actionResolution) return rejected("ACTION_RESOLUTION_ACTIVE");
  const team = command.payload?.team === "blue" ? "blue" : command.payload?.team === "red" ? "red" : null;
  const dieType = Number(command.payload?.dieType);
  const result = Number(command.payload?.result);
  const rollSource = command.payload?.rollSource === "CHOSEN" ? "CHOSEN" : "RANDOM";
  if (!team || !Number.isInteger(dieType) || dieType < 2 || !Number.isInteger(result) || result < 1 || result > dieType) {
    return rejected("EXTRA_ROLL_INVALID");
  }
  const dice = {
    ...state.dice,
    dieType,
    blueResult: team === "blue" ? result : state.dice?.blueResult,
    redResult: team === "red" ? result : state.dice?.redResult,
    blueLastDieType: team === "blue" ? dieType : state.dice?.blueLastDieType,
    redLastDieType: team === "red" ? dieType : state.dice?.redLastDieType,
  };
  return accepted(createGameState({ ...state, dice }), [createGameEvent({
    type: "EXTRA_ROLL",
    commandId: command.id,
    team,
    metadata: {
      rollSource,
      chosenResult: rollSource === "CHOSEN" ? result : null,
      dieType,
      result,
      administrative: true,
    },
  })], { groupId: null, undoMode: "step", allowNoop: true });
}

export function applyGameCommand({ state, context, command } = {}) {
  const normalizedCommand = normalizeGameCommand(command);
  const validationReason = gameCommandValidationReason(normalizedCommand);
  if (validationReason) return rejected(validationReason);

  const matchContext = createMatchContext(context);
  let currentState = createGameState(state);
  const freeMoveActive = Boolean(currentState.tracker?.matchActionState?.freeMode?.active);
  const groupMoveActive = Boolean(currentState.tracker?.matchActionState?.groupMove?.active);
  const bonusActionActive = currentState.actionContinuation?.kind === "bonus-card-action";
  const normalMoveInteractionActive = Boolean(currentState.tracker?.matchActionState?.activeMovement?.active);
  if (freeMoveActive && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.FREE_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.FREE_MOVE_ENDED,
    GAME_COMMAND_TYPE.PIECE_ACTIVITY_CHANGED,
    GAME_COMMAND_TYPE.TRACKER_ACTIONS_RESET,
    GAME_COMMAND_TYPE.TRACKER_POSSESSION_CHANGED,
  ].includes(normalizedCommand.type)) return rejected("FREE_MOVE_ACTIVE");
  if (groupMoveActive && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.GROUP_MOVE_PLAYER_COMMITTED,
    GAME_COMMAND_TYPE.TRACKER_PHASE_ENDED,
    GAME_COMMAND_TYPE.PIECE_ACTIVITY_CHANGED,
    GAME_COMMAND_TYPE.TRACKER_ACTIONS_RESET,
    GAME_COMMAND_TYPE.TRACKER_POSSESSION_CHANGED,
  ].includes(normalizedCommand.type)) return rejected("GROUP_MOVE_ACTIVE");
  if (normalMoveInteractionActive && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.NORMAL_MOVE_CANCELLED,
    GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.PIECE_ACTIVITY_CHANGED,
    GAME_COMMAND_TYPE.TRACKER_ACTIONS_RESET,
    GAME_COMMAND_TYPE.TRACKER_POSSESSION_CHANGED,
  ].includes(normalizedCommand.type)) return rejected("MOVE_INTERACTION_ACTIVE");
  if (bonusActionActive && !(
    isBonusActionCommand(normalizedCommand.type)
    || isPendingBonusActionRollSubmission(currentState, normalizedCommand.type)
    || [
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.THREE_TWO_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.BONUS_MOVE_STARTED,
    GAME_COMMAND_TYPE.BONUS_MOVE_CANCELLED,
    GAME_COMMAND_TYPE.BONUS_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.BONUS_ACTION_ENDED,
    GAME_COMMAND_TYPE.PASS_STARTED,
    GAME_COMMAND_TYPE.PASS_TARGET_SELECTED,
    GAME_COMMAND_TYPE.PASS_ROUTE_CONFIRMED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTOR_SELECTED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTION_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTION_RESOLUTION_DUE,
    GAME_COMMAND_TYPE.PASS_CONSEQUENCE_DUE,
    GAME_COMMAND_TYPE.PASS_CANCELLED,
    GAME_COMMAND_TYPE.EXTRA_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.FREE_MOVE_STARTED,
    GAME_COMMAND_TYPE.FREE_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.FREE_MOVE_ENDED,
    GAME_COMMAND_TYPE.PIECE_ACTIVITY_CHANGED,
    GAME_COMMAND_TYPE.TRACKER_ACTIONS_RESET,
    GAME_COMMAND_TYPE.TRACKER_POSSESSION_CHANGED,
    GAME_COMMAND_TYPE.BONUS_MANUAL_ACTION_DECLARED,
  ].includes(normalizedCommand.type)
  )) return rejected("BONUS_ACTION_ACTIVE");
  const kickoffRestartActive = Boolean(currentState.kickoffRestart);
  if (kickoffRestartActive && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.PASS_STARTED,
    GAME_COMMAND_TYPE.PASS_TARGET_SELECTED,
    GAME_COMMAND_TYPE.PASS_ROUTE_CONFIRMED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTOR_SELECTED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTION_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTION_RESOLUTION_DUE,
    GAME_COMMAND_TYPE.PASS_CONSEQUENCE_DUE,
    GAME_COMMAND_TYPE.PASS_CANCELLED,
    // Since v20.56.42 the kick-off's entitled piece may play any pass type —
    // Short/Long Pass above, plus both Through Ball families here — at
    // normal Tracker cost, under normal rules. Only the piece restriction
    // (passStartRules.mjs/throughBallRules.mjs/loftedThroughBallRules.mjs)
    // and this whitelist gate it.
    GAME_COMMAND_TYPE.THROUGH_BALL_STARTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_TARGET_SELECTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_COMMITTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_CANCELLED,
    GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERER_SELECTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERY_CONFIRMED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_STARTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_TARGET_SELECTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_COMMITTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_CANCELLED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RESOLUTION_CONFIRMED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERER_SELECTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERY_CONFIRMED,
    GAME_COMMAND_TYPE.GAMEPLAY_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.EXTRA_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.PIECE_ACTIVITY_CHANGED,
    GAME_COMMAND_TYPE.TRACKER_ACTIONS_RESET,
    GAME_COMMAND_TYPE.TRACKER_POSSESSION_CHANGED,
    GAME_COMMAND_TYPE.FORMATION_TACTIC_CONFIRMED,
    GAME_COMMAND_TYPE.ADJUST_PIECE_PLACED,
    GAME_COMMAND_TYPE.KICKOFF_READY_CONFIRMED,
  ].includes(normalizedCommand.type)) return rejected("KICKOFF_RESTART_ACTIVE");
  // A team whose active tactic no longer matches its assigned cards (only
  // reachable by confirming an incompatible tactic mid-Match, since cards
  // themselves are locked once the Match starts) cannot act at all until a
  // legal tactic is confirmed. Only the 7 canonical "start an action"
  // commands need this — everything else either doesn't move a piece or is
  // already mid-resolution for a piece that was legal when it started.
  if ([
    GAME_COMMAND_TYPE.PASS_STARTED,
    GAME_COMMAND_TYPE.SHOT_STARTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_STARTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_STARTED,
    GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED,
    GAME_COMMAND_TYPE.BONUS_MOVE_STARTED,
    GAME_COMMAND_TYPE.FREE_MOVE_STARTED,
    GAME_COMMAND_TYPE.TACKLING_STARTED,
  ].includes(normalizedCommand.type)) {
    const actingPiece = currentState.pieces.find(piece => String(piece?.id) === String(normalizedCommand.payload?.pieceId));
    const actingTeam = teamKeyForPiece(actingPiece);
    if (actingTeam && currentState.tacticBlock?.[actingTeam]) return rejected("TEAM_TACTIC_INVALID");
  }
  // A pending fixed-restart setup (Corner, Goal Kick and — once triggerable —
  // Free Kick/Throw-in) locks out everything except its own wall/reposition/
  // executor-selection commands until execution begins, then locks out
  // everything except the selected executor's listed action — see
  // restartSetupRules.mjs.
  const restartSetup = currentState.restartSetup;
  // Free Move / Free Ball are a testing-engine convenience, not part of
  // official play (confirmed live with the user) — they stay available in
  // every phase of a restart setup, pre-execution and execution alike, the
  // same way they already ignore ordinary Tracker/action gating elsewhere.
  const RESTART_SETUP_EXEMPT_COMMANDS = [
    GAME_COMMAND_TYPE.FREE_MOVE_STARTED,
    GAME_COMMAND_TYPE.FREE_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.FREE_MOVE_ENDED,
    GAME_COMMAND_TYPE.FREE_BALL_MOVED,
  ];
  if (restartSetup && restartSetup.phase !== "execution" && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.RESTART_WALL_POSITION_SET,
    GAME_COMMAND_TYPE.RESTART_WALL_SET,
    GAME_COMMAND_TYPE.RESTART_PIECE_REPOSITIONED,
    GAME_COMMAND_TYPE.RESTART_REPOSITION_PASSED,
    GAME_COMMAND_TYPE.RESTART_EXECUTOR_SELECTED,
    GAME_COMMAND_TYPE.RESTART_WALL_CONTINUATION_CONFIRMED,
    GAME_COMMAND_TYPE.RESTART_WALL_CONTINUATION_DECLINED,
    ...RESTART_SETUP_EXEMPT_COMMANDS,
  ].includes(normalizedCommand.type)) return rejected("RESTART_SETUP_ACTIVE");
  if (restartSetup && restartSetup.phase === "execution" && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    ...RESTART_SETUP_EXEMPT_COMMANDS,
    GAME_COMMAND_TYPE.PASS_STARTED,
    GAME_COMMAND_TYPE.PASS_TARGET_SELECTED,
    GAME_COMMAND_TYPE.PASS_ROUTE_CONFIRMED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTOR_SELECTED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTION_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.PASS_INTERCEPTION_RESOLUTION_DUE,
    GAME_COMMAND_TYPE.PASS_CONSEQUENCE_DUE,
    GAME_COMMAND_TYPE.PASS_CANCELLED,
    GAME_COMMAND_TYPE.THROUGH_BALL_STARTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_TARGET_SELECTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_COMMITTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_CANCELLED,
    GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERER_SELECTED,
    GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERY_CONFIRMED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_STARTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_TARGET_SELECTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_COMMITTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_CANCELLED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RESOLUTION_CONFIRMED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERER_SELECTED,
    GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERY_CONFIRMED,
    GAME_COMMAND_TYPE.SHOT_STARTED,
    GAME_COMMAND_TYPE.SHOT_TARGET_SELECTED,
    GAME_COMMAND_TYPE.SHOT_ROUTE_CONFIRMED,
    GAME_COMMAND_TYPE.SHOT_CANCELLED,
    GAME_COMMAND_TYPE.SHOT_RESOLUTION_DUE,
    GAME_COMMAND_TYPE.SHOT_CONSEQUENCE_DUE,
    GAME_COMMAND_TYPE.GAMEPLAY_ROLL_SUBMITTED,
    GAME_COMMAND_TYPE.EXTRA_ROLL_SUBMITTED,
  ].includes(normalizedCommand.type)) return rejected("RESTART_SETUP_ACTIVE");
  const RESTART_EXECUTION_ACTION_FAMILIES = {
    [GAME_COMMAND_TYPE.PASS_STARTED]: RESTART_EXECUTION_ACTION_TYPE_FAMILIES.PASS,
    [GAME_COMMAND_TYPE.SHOT_STARTED]: RESTART_EXECUTION_ACTION_TYPE_FAMILIES.SHOT,
    [GAME_COMMAND_TYPE.THROUGH_BALL_STARTED]: RESTART_EXECUTION_ACTION_TYPE_FAMILIES.THROUGH_BALL,
    [GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_STARTED]: RESTART_EXECUTION_ACTION_TYPE_FAMILIES.LOFTED_THROUGH_BALL,
  };
  if (restartSetup && restartSetup.phase === "execution" && RESTART_EXECUTION_ACTION_FAMILIES[normalizedCommand.type]) {
    const restartActor = currentState.pieces.find(piece => String(piece?.id) === String(normalizedCommand.payload?.pieceId));
    if (!restartActor || String(restartActor.id) !== String(restartSetup.executorId)) return rejected("RESTART_EXECUTOR_ONLY");
    const allowedFamily = RESTART_EXECUTION_ACTION_FAMILIES[normalizedCommand.type].some(id => restartSetup.availableActions.includes(id));
    if (!allowedFamily) return rejected("RESTART_ACTION_NOT_AVAILABLE");
  }
  // Untracked extra repositions after a Goalkeeper Retains (confirmed live
  // with the user: always resolves before anything else — a pending Bonus
  // Action or ordinary play — resumes). Free Move/Free Ball stay available,
  // same testing-engine exception as restartSetup's own gate above.
  if (currentState.gkReposition && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.GK_REPOSITION_PIECE_SELECTED,
    GAME_COMMAND_TYPE.GK_REPOSITION_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.GK_REPOSITION_TURN_ENDED,
    ...RESTART_SETUP_EXEMPT_COMMANDS,
  ].includes(normalizedCommand.type)) return rejected("GK_REPOSITION_ACTIVE");
  // A pending wall-continuation Yes/No (confirmed live with the user, same
  // pattern as pendingMarking below): blocks every other command until the
  // defending coach answers.
  if (currentState.pendingRestartWallContinuation && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.RESTART_WALL_CONTINUATION_CONFIRMED,
    GAME_COMMAND_TYPE.RESTART_WALL_CONTINUATION_DECLINED,
    ...RESTART_SETUP_EXEMPT_COMMANDS,
  ].includes(normalizedCommand.type)) return rejected("RESTART_WALL_CONTINUATION_PENDING");
  // Marking (docs/MARKING_RULES.md section 4): a pending first-entry decision
  // blocks every other command for both teams until the defending coach
  // accepts or declines — mirrors kickoffRestart's/restartSetup's own gates.
  if (currentState.pendingMarking && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.MARKING_ACCEPTED,
    GAME_COMMAND_TYPE.MARKING_DECLINED,
    GAME_COMMAND_TYPE.MARKING_TRACK_CANCELED,
  ].includes(normalizedCommand.type)) return rejected("MARKING_DECISION_PENDING");
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_ACCEPTED) {
    const transition = acceptMarking(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_DECLINED) {
    const transition = declineMarking(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  // Marking switch (docs/MARKING_RULES.md section 8): an already-marked
  // attacker entering a different eligible defender's area blocks every
  // other command until the defending coach keeps the current marker or
  // switches — mirrors pendingMarking's own gate.
  if (currentState.pendingMarkingSwitch && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.MARKING_SWITCH_ACCEPTED,
    GAME_COMMAND_TYPE.MARKING_SWITCH_DECLINED,
    GAME_COMMAND_TYPE.MARKING_TRACK_CANCELED,
  ].includes(normalizedCommand.type)) return rejected("MARKING_DECISION_PENDING");
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_SWITCH_ACCEPTED) {
    const transition = acceptMarkingSwitch(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_SWITCH_DECLINED) {
    const transition = declineMarkingSwitch(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  // The marker's own tracking move (docs/MARKING_RULES.md section 5) blocks
  // every other command for both teams until the coach clicks one of the
  // highlighted legal cells — mirrors pendingMarking's own gate. Any single
  // legal cell on any legal axis may be chosen; containment is validated at
  // commit time, not by restricting which cells are offered; see
  // markingRules.mjs.
  if (currentState.pendingMarkingTrack && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.MARKING_TRACK_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.MARKING_TRACK_CANCELED,
  ].includes(normalizedCommand.type)) return rejected("MARKING_DECISION_PENDING");
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_TRACK_MOVE_COMMITTED) {
    const transition = commitMarkingTrackMove(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  // "Continue Marking?" (docs/MARKING_RULES.md section 5): every tracking
  // check after a marking's first response asks this before opening the
  // actual move decision — mirrors the other two Marking gates.
  if (currentState.pendingMarkingContinue && ![
    GAME_COMMAND_TYPE.MATCH_STARTED,
    GAME_COMMAND_TYPE.MATCH_RESTARTED,
    GAME_COMMAND_TYPE.MARKING_CONTINUE_ACCEPTED,
    GAME_COMMAND_TYPE.MARKING_CONTINUE_DECLINED,
    GAME_COMMAND_TYPE.MARKING_TRACK_CANCELED,
  ].includes(normalizedCommand.type)) return rejected("MARKING_DECISION_PENDING");
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_CONTINUE_ACCEPTED) {
    const transition = acceptMarkingContinue(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_CONTINUE_DECLINED) {
    const transition = declineMarkingContinue(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  // Cancel MRK (docs/MARKING_RULES.md section 6): the defending coach may
  // voluntarily end an active Marking at any time it is active, regardless
  // of which other Marking gate (if any) is currently open.
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MARKING_TRACK_CANCELED) {
    const transition = cancelMarkingTrack(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  // Marking passive tracking (docs/MARKING_RULES.md section 5): the moment
  // the coach tries to start any new action, the previous mover's turn at
  // moving is over, so any tracking response owed for it becomes due first —
  // interrupting that new action until the coach resolves it (above), unless
  // every active marking either needs no move or has none available
  // (dropped per section 6), in which case the original command proceeds
  // straight through against the updated state.
  if (!currentState.pendingMarking && !currentState.pendingMarkingSwitch && !currentState.pendingMarkingContinue && (currentState.activeMarkings || []).length
    && MARKING_TRACKING_TRIGGER_COMMAND_TYPES.includes(normalizedCommand.type)) {
    const opened = beginMarkingTrackMove(currentState, matchContext);
    if (opened.changed) {
      currentState = createGameState({ ...opened.nextState, markingEndedNotices: opened.endedMarkings || [] });
      if (currentState.pendingMarkingTrack) {
        const pending = currentState.pendingMarkingTrack;
        return accepted(currentState, [createGameEvent({
          type: "MARKING_TRACK_MOVE_OPENED",
          team: pending.team,
          commandId: normalizedCommand.id,
          metadata: { markingId: pending.markingId, markerId: pending.markerId, attackerId: pending.attackerId },
        })], { allowNoop: true, undoMode: "step" });
      }
      if (currentState.pendingMarkingContinue) {
        const pending = currentState.pendingMarkingContinue;
        return accepted(currentState, [createGameEvent({
          type: "MARKING_CONTINUE_ASKED",
          team: pending.team,
          commandId: normalizedCommand.id,
          metadata: { markingId: pending.markingId, markerId: pending.markerId, attackerId: pending.attackerId },
        })], { allowNoop: true, undoMode: "step" });
      }
    }
  }
  if ([GAME_COMMAND_TYPE.MATCH_STARTED, GAME_COMMAND_TYPE.MATCH_RESTARTED].includes(normalizedCommand.type)) {
    const transition = normalizedCommand.type === GAME_COMMAND_TYPE.MATCH_RESTARTED
      ? restartMatch(currentState, normalizedCommand)
      : startMatch(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.FORMATION_TACTIC_CONFIRMED) {
    const transition = confirmFormationTactic(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.ADJUST_PIECE_PLACED) {
    const transition = placeAdjustPiece(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.KICKOFF_READY_CONFIRMED) {
    const transition = confirmKickoffReady(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.RESTART_WALL_POSITION_SET) {
    const transition = setRestartWallPosition(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.RESTART_WALL_SET) {
    const transition = setRestartWall(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.RESTART_PIECE_REPOSITIONED) {
    const transition = repositionRestartPiece(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.RESTART_REPOSITION_PASSED) {
    const transition = passRestartReposition(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.RESTART_EXECUTOR_SELECTED) {
    const transition = selectRestartExecutor(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.RESTART_WALL_CONTINUATION_CONFIRMED) {
    const transition = confirmRestartWallContinuation(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.RESTART_WALL_CONTINUATION_DECLINED) {
    const transition = declineRestartWallContinuation(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.GK_REPOSITION_PIECE_SELECTED) {
    const transition = selectGkRepositionPiece(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.GK_REPOSITION_MOVE_COMMITTED) {
    const transition = commitGkRepositionMove(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.GK_REPOSITION_TURN_ENDED) {
    const transition = endGkRepositionTurn(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PIECE_ACTIVITY_CHANGED) {
    const transition = changePieceActivity(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.TRACKER_ACTIONS_RESET) {
    const transition = resetTrackerActions(currentState);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.TRACKER_POSSESSION_CHANGED) {
    const transition = changeTrackerPossession(currentState);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.BONUS_MANUAL_ACTION_DECLARED) {
    const transition = declareManualBonusAction(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_STARTED) {
    const transition = startPass(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_CANCELLED) {
    const transition = cancelPass(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if ([GAME_COMMAND_TYPE.THROUGH_BALL_STARTED, GAME_COMMAND_TYPE.THROUGH_BALL_TARGET_SELECTED, GAME_COMMAND_TYPE.THROUGH_BALL_COMMITTED, GAME_COMMAND_TYPE.THROUGH_BALL_CANCELLED, GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERER_SELECTED, GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERY_CONFIRMED].includes(normalizedCommand.type)) {
    const transition = normalizedCommand.type === GAME_COMMAND_TYPE.THROUGH_BALL_STARTED
      ? startThroughBall(currentState, normalizedCommand)
      : normalizedCommand.type === GAME_COMMAND_TYPE.THROUGH_BALL_TARGET_SELECTED
        ? selectThroughBallTarget(currentState, matchContext, normalizedCommand)
        : normalizedCommand.type === GAME_COMMAND_TYPE.THROUGH_BALL_COMMITTED
        ? commitThroughBall(currentState, matchContext, normalizedCommand)
          : normalizedCommand.type === GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERER_SELECTED
          ? selectThroughBallRecoverer(currentState, normalizedCommand)
          : normalizedCommand.type === GAME_COMMAND_TYPE.THROUGH_BALL_RECOVERY_CONFIRMED
            ? confirmThroughBallRecovery(currentState, normalizedCommand)
            : cancelThroughBall(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if ([GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_STARTED, GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_TARGET_SELECTED, GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_COMMITTED, GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_CANCELLED, GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_ROLL_SUBMITTED, GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RESOLUTION_CONFIRMED, GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERER_SELECTED, GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERY_CONFIRMED].includes(normalizedCommand.type)) {
    const transition = normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_STARTED ? startLoftedThroughBall(currentState, normalizedCommand)
      : normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_TARGET_SELECTED ? selectLoftedThroughBallTarget(currentState, matchContext, normalizedCommand)
        : normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_COMMITTED ? commitLoftedThroughBall(currentState, matchContext, normalizedCommand)
            : normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_ROLL_SUBMITTED ? submitLoftedThroughBallRoll(currentState, matchContext, normalizedCommand)
              : normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RESOLUTION_CONFIRMED ? resolveLoftedThroughBall(currentState, matchContext)
                : normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERER_SELECTED ? selectLoftedThroughBallRecoverer(currentState, normalizedCommand)
                  : normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RECOVERY_CONFIRMED ? confirmLoftedThroughBallRecovery(currentState)
                    : cancelLoftedThroughBall(currentState);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_TARGET_SELECTED) {
    const transition = selectPassTarget(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_ROUTE_CONFIRMED) {
    const transition = confirmPassRoute(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_INTERCEPTOR_SELECTED) {
    const transition = selectPassInterceptor(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.GAMEPLAY_ROLL_SUBMITTED) {
    const resolution = currentState.actionResolution;
    const transition = resolution?.kind === "pass"
      ? submitPassInterceptionRoll(currentState, matchContext, {
          ...normalizedCommand,
          payload: { ...(normalizedCommand.payload || {}), passId: resolution.id },
        })
      : resolution?.kind === "lofted-through-ball"
        ? submitLoftedThroughBallRoll(currentState, matchContext, normalizedCommand)
        : resolution?.kind === "shot"
          ? submitShotRoll(currentState, matchContext, normalizedCommand)
        : resolution?.kind === "tackling"
          ? submitTacklingRoll(currentState, matchContext, normalizedCommand)
        : { accepted: false, reason: "GAMEPLAY_ROLL_NOT_REQUESTED" };
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if ([GAME_COMMAND_TYPE.SHOT_STARTED, GAME_COMMAND_TYPE.SHOT_TARGET_SELECTED, GAME_COMMAND_TYPE.SHOT_ROUTE_CONFIRMED, GAME_COMMAND_TYPE.SHOT_CANCELLED].includes(normalizedCommand.type)) {
    const transition = normalizedCommand.type === GAME_COMMAND_TYPE.SHOT_STARTED
      ? startShot(currentState, normalizedCommand)
      : normalizedCommand.type === GAME_COMMAND_TYPE.SHOT_TARGET_SELECTED
        ? selectShotTarget(currentState, matchContext, normalizedCommand)
        : normalizedCommand.type === GAME_COMMAND_TYPE.SHOT_ROUTE_CONFIRMED
          ? confirmShotRoute(currentState, matchContext, normalizedCommand)
          : cancelShot(currentState);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.TACKLING_STARTED) {
    const transition = startTackling(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.TACKLING_NOTICE_ACKNOWLEDGED) {
    const transition = acknowledgeTacklingBlocked(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.TACKLING_RESOLUTION_DUE) {
    const transition = resolveTacklingResult(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.TACKLING_CONSEQUENCE_DUE) {
    const transition = applyTacklingConsequence(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.OFFSIDE_RESTART_CONFIRMED) {
    const transition = confirmOffsideRestart(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.SHOT_RESOLUTION_DUE) {
    const transition = resolveShotResult(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.SHOT_CONSEQUENCE_DUE) {
    const transition = applyShotConsequence(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], {
      groupId: currentState.actionResolution?.trackerEntryId || null,
      undoMode: "step",
      allowNoop: false,
    });
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.LOFTED_THROUGH_BALL_RESOLUTION_DUE) {
    const transition = resolveLoftedThroughBallRoll(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_INTERCEPTION_ROLL_SUBMITTED) {
    const transition = submitPassInterceptionRoll(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_INTERCEPTION_RESOLUTION_DUE) {
    const transition = resolvePassInterception(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.PASS_CONSEQUENCE_DUE) {
    const transition = applyPassConsequence(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], {
      groupId: currentState.actionResolution?.bonusContinuationId || currentState.actionResolution?.entryId || null,
      undoMode: currentState.actionResolution?.bonusContinuationId ? "atomic" : "step",
      allowNoop: false,
    });
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.EXTRA_ROLL_SUBMITTED) {
    return applyExtraRoll(currentState, normalizedCommand);
  }
  if (currentState.actionResolution) return rejected("ACTION_RESOLUTION_ACTIVE");
  if (normalizedCommand.type === GAME_COMMAND_TYPE.MANUAL_ACTION_DECLARED) {
    const transition = declareManualAction(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({ ...transition.event, commandId: normalizedCommand.id })], transition.timeline);
  }
  const freeMoveTransition = normalizedCommand.type === GAME_COMMAND_TYPE.FREE_MOVE_STARTED
    ? startFreeMove(currentState, normalizedCommand)
    : normalizedCommand.type === GAME_COMMAND_TYPE.FREE_MOVE_COMMITTED
      ? commitFreeMove(currentState, normalizedCommand)
      : normalizedCommand.type === GAME_COMMAND_TYPE.FREE_MOVE_ENDED
        ? endFreeMove(currentState, normalizedCommand)
        : null;
  if (freeMoveTransition) {
    if (!freeMoveTransition.accepted) return rejected(freeMoveTransition.reason);
    return accepted(createGameState(freeMoveTransition.nextState), [createGameEvent({
      ...freeMoveTransition.event,
      commandId: normalizedCommand.id,
    })], freeMoveTransition.timeline);
  }
  const groupMoveTransition = normalizedCommand.type === GAME_COMMAND_TYPE.GROUP_MOVE_ZONE_CONFIRMED
    ? confirmGroupMoveZone(currentState, matchContext, normalizedCommand)
    : normalizedCommand.type === GAME_COMMAND_TYPE.GROUP_MOVE_PLAYER_COMMITTED
      ? commitGroupMovePlayer(currentState, matchContext, normalizedCommand)
      : null;
  if (groupMoveTransition) {
    if (!groupMoveTransition.accepted) return rejected(groupMoveTransition.reason);
    return accepted(createGameState(groupMoveTransition.nextState), [createGameEvent({
      ...groupMoveTransition.event,
      commandId: normalizedCommand.id,
    })], groupMoveTransition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.FREE_BALL_MOVED) {
    return applyFreeBallMoved(currentState, matchContext, normalizedCommand);
  }
  const normalMoveTransition = normalizedCommand.type === GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED
    ? startNormalMove(currentState, matchContext, normalizedCommand)
    : normalizedCommand.type === GAME_COMMAND_TYPE.NORMAL_MOVE_CANCELLED
      ? cancelNormalMove(currentState, normalizedCommand)
      : normalizedCommand.type === GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED
        ? commitNormalMove(currentState, matchContext, normalizedCommand)
        : null;
  if (normalMoveTransition) {
    if (!normalMoveTransition.accepted) return rejected(normalMoveTransition.reason);
    return accepted(createGameState(normalMoveTransition.nextState), [createGameEvent({
      ...normalMoveTransition.event,
      commandId: normalizedCommand.id,
    })], normalMoveTransition.timeline);
  }
  const bonusMoveTransition = normalizedCommand.type === GAME_COMMAND_TYPE.BONUS_MOVE_STARTED
    ? startBonusMove(currentState, normalizedCommand)
    : normalizedCommand.type === GAME_COMMAND_TYPE.BONUS_MOVE_CANCELLED
      ? cancelBonusMove(currentState, normalizedCommand)
      : normalizedCommand.type === GAME_COMMAND_TYPE.BONUS_MOVE_COMMITTED
        ? commitBonusMove(currentState, matchContext, normalizedCommand)
        : null;
  if (bonusMoveTransition) {
    if (!bonusMoveTransition.accepted) return rejected(bonusMoveTransition.reason);
    return accepted(createGameState(bonusMoveTransition.nextState), [createGameEvent({
      ...bonusMoveTransition.event,
      commandId: normalizedCommand.id,
    })], bonusMoveTransition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.BONUS_ACTION_ENDED) {
    const transition = endBonusAction(currentState, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.TRACKER_PHASE_ENDED) {
    const transition = endTrackerPhase(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  if (normalizedCommand.type === GAME_COMMAND_TYPE.THREE_TWO_MOVE_COMMITTED) {
    const transition = commitThreeTwoMove(currentState, matchContext, normalizedCommand);
    if (!transition.accepted) return rejected(transition.reason);
    return accepted(createGameState(transition.nextState), [createGameEvent({
      ...transition.event,
      commandId: normalizedCommand.id,
    })], transition.timeline);
  }
  return rejected("COMMAND_TYPE_UNSUPPORTED");
}
