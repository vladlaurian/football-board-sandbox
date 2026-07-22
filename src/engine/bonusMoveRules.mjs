import { getMovementGeometry, diagonalCostForDistance } from "../board/movementState.mjs";
import { beginContinuationAction, normalizeActionContinuation, CONTINUATION_STATUS } from "../match/actionContinuation.mjs";
import { cardStat, teamKeyForPiece } from "../rules/passEngine.mjs";
import { firstPlayerBlockingMovementPath } from "./movementPathRules.mjs";

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

function movementState(value) {
  return {
    axis: value?.axis || null,
    spent: Math.max(0, Number(value?.spent) || 0),
    distance: Math.max(0, Number(value?.distance) || 0),
    threeTwoUsed: Boolean(value?.threeTwoUsed),
    movementEnded: Boolean(value?.movementEnded),
  };
}

function speedFor(piece, context) {
  const card = context.gameplayCardsById[String(piece?.cardId || "")];
  if (!card) return null;
  return Math.max(0, Number(cardStat(card, "stat:speed")) || 0);
}

function activeBonusMove(state, piece) {
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const team = teamKeyForPiece(piece);
  return {
    continuation,
    team,
    valid: Boolean(
      continuation?.kind === "bonus-card-action"
      && continuation.status === CONTINUATION_STATUS.ACTION_ACTIVE
      && continuation.actionType === "MOVE"
      && continuation.pieceId === String(piece?.id || "")
      && continuation.team === team
    ),
  };
}

export function startBonusMove(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  if (!piece || piece.team === "BALL" || piece.inactive) return { accepted: false, reason: "MOVE_PIECE_INVALID" };
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const team = teamKeyForPiece(piece);
  if (!continuation || continuation.kind !== "bonus-card-action" || continuation.status !== CONTINUATION_STATUS.READY || continuation.team !== team) {
    return { accepted: false, reason: "BONUS_MOVE_NOT_READY" };
  }
  const nextContinuation = beginContinuationAction(continuation, { type: "MOVE", pieceId: piece.id });
  if (!nextContinuation) return { accepted: false, reason: "BONUS_MOVE_NOT_READY" };
  return {
    accepted: true,
    nextState: { ...state, actionContinuation: { ...nextContinuation, movementStarted: false } },
    event: { type: "BONUS_MOVE_STARTED", team, metadata: { pieceId: piece.id, movementReason: "BONUS_MOVE" } },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: true },
  };
}

export function cancelBonusMove(state, command) {
  const piece = pieceForCommand(state, command);
  const { continuation, team, valid } = activeBonusMove(state, piece);
  if (!valid || continuation.movementStarted) return { accepted: false, reason: "BONUS_MOVE_NOT_CANCELLABLE" };
  const nextContinuation = {
    ...continuation,
    status: CONTINUATION_STATUS.READY,
    actionType: null,
    pieceId: null,
    movementStarted: false,
    transaction: { ...continuation.transaction, actionType: "BONUS_ACTION" },
  };
  return {
    accepted: true,
    nextState: { ...state, actionContinuation: nextContinuation },
    event: { type: "BONUS_MOVE_CANCELLED", team, metadata: { pieceId: piece.id, movementReason: "BONUS_MOVE" } },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: true },
  };
}

export function commitBonusMove(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const { continuation, team, valid } = activeBonusMove(state, piece);
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!valid) return { accepted: false, reason: "BONUS_MOVE_NOT_ACTIVE" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { accepted: false, reason: "MOVE_DESTINATION_INVALID" };
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) return { accepted: false, reason: "occupied" };
  const geometry = getMovementGeometry(piece, { x, y });
  if (geometry.kind === "same") return { accepted: false, reason: "same" };
  if (geometry.kind === "mixed") return { accepted: false, reason: "mixed" };
  if (firstPlayerBlockingMovementPath({ pieces: state.pieces, movingPieceId: piece.id, from: piece, to: { x, y } })) return { accepted: false, reason: "path-blocked" };
  const current = movementState(state.movementStateByPieceId[piece.id]);
  if (current.movementEnded) return { accepted: false, reason: "movement-ended" };
  const speed = speedFor(piece, context);
  if (speed === null) return { accepted: false, reason: "no-speed" };
  if (current.axis && current.axis !== geometry.axis) return { accepted: false, reason: "axis" };
  const moveCost = geometry.kind === "diagonal"
    ? diagonalCostForDistance(current.distance + geometry.distance) - diagonalCostForDistance(current.distance)
    : geometry.cost;
  if (moveCost > Math.max(0, speed - current.spent)) return { accepted: false, reason: "speed" };
  const carriesBall = state.pieces.some(item => item.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
  const pieces = state.pieces.map(item => {
    if (item.id === piece.id) return { ...item, x, y };
    if (carriesBall && item.team === "BALL") return { ...item, x, y };
    return item;
  });
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      movementStateByPieceId: {
        ...state.movementStateByPieceId,
        [piece.id]: { ...current, axis: current.axis || geometry.axis, spent: current.spent + moveCost, distance: current.distance + geometry.distance },
      },
      actionContinuation: { ...continuation, movementStarted: true },
    },
    event: { type: "BONUS_MOVE_COMMITTED", team, metadata: { pieceId: piece.id, from: { x: Number(piece.x), y: Number(piece.y) }, to: { x, y }, movementReason: "BONUS_MOVE" } },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: false },
  };
}
