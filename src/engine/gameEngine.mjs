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

function rejected(reason) {
  return { accepted: false, reason };
}

function accepted(nextState, events, timeline) {
  return { accepted: true, nextState, events, timeline };
}

function validGridCoordinate(value) {
  return Number.isFinite(Number(value)) && Number.isInteger(Number(value));
}

function applyFreeBallMoved(state, command) {
  if (state.gameMode !== "match") return rejected("MATCH_MODE_REQUIRED");
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!validGridCoordinate(x) || !validGridCoordinate(y)) return rejected("BALL_DESTINATION_INVALID");

  const ballIndex = state.pieces.findIndex(piece => piece?.team === "BALL");
  if (ballIndex < 0) return rejected("BALL_NOT_FOUND");
  const ball = state.pieces[ballIndex];
  if (Number(ball.x) === x && Number(ball.y) === y) return rejected("BALL_POSITION_UNCHANGED");

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
  const currentState = createGameState(state);
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
  if (bonusActionActive && ![
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
    GAME_COMMAND_TYPE.PIECE_ACTIVITY_CHANGED,
    GAME_COMMAND_TYPE.TRACKER_ACTIONS_RESET,
    GAME_COMMAND_TYPE.TRACKER_POSSESSION_CHANGED,
    GAME_COMMAND_TYPE.BONUS_MANUAL_ACTION_DECLARED,
  ].includes(normalizedCommand.type)) return rejected("BONUS_ACTION_ACTIVE");
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
    const transition = applyPassConsequence(currentState, normalizedCommand);
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
    return applyFreeBallMoved(currentState, normalizedCommand);
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
    const transition = endTrackerPhase(currentState, normalizedCommand);
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
