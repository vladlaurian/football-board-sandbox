import { createGameState } from "../game/gameState.mjs";
import { GAME_COMMAND_TYPE, gameCommandValidationReason, normalizeGameCommand } from "./gameCommands.mjs";
import { createGameEvent } from "./gameEvents.mjs";
import { createMatchContext } from "./matchContext.mjs";
import { cancelNormalMove, commitNormalMove, startNormalMove } from "./normalMoveRules.mjs";
import { commitThreeTwoMove } from "./threeTwoMoveRules.mjs";
import { commitFreeMove, endFreeMove, startFreeMove } from "./freeMoveRules.mjs";
import { commitGroupMovePlayer, confirmGroupMoveZone } from "./groupMoveRules.mjs";

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

export function applyGameCommand({ state, context, command } = {}) {
  const normalizedCommand = normalizeGameCommand(command);
  const validationReason = gameCommandValidationReason(normalizedCommand);
  if (validationReason) return rejected(validationReason);

  const matchContext = createMatchContext(context);
  const currentState = createGameState(state);
  const freeMoveActive = Boolean(currentState.tracker?.matchActionState?.freeMode?.active);
  const groupMoveActive = Boolean(currentState.tracker?.matchActionState?.groupMove?.active);
  const bonusActionActive = currentState.actionContinuation?.kind === "bonus-card-action";
  if (freeMoveActive && ![
    GAME_COMMAND_TYPE.FREE_MOVE_COMMITTED,
    GAME_COMMAND_TYPE.FREE_MOVE_ENDED,
  ].includes(normalizedCommand.type)) return rejected("FREE_MOVE_ACTIVE");
  if (groupMoveActive && normalizedCommand.type !== GAME_COMMAND_TYPE.GROUP_MOVE_PLAYER_COMMITTED) return rejected("GROUP_MOVE_ACTIVE");
  if (bonusActionActive && normalizedCommand.type !== GAME_COMMAND_TYPE.THREE_TWO_MOVE_COMMITTED) return rejected("BONUS_ACTION_ACTIVE");
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
