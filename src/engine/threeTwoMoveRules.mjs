import { getMovementGeometry } from "../board/movementState.mjs";
import { cardStat, teamKeyForPiece } from "../rules/passEngine.mjs";
import { isTeamActiveForTrackerPhase } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { firstPlayerBlockingMovementPath } from "./movementPathRules.mjs";

function threeTwoMovementState(value) {
  return {
    axis: value?.axis || null,
    spent: Math.max(0, Number(value?.spent) || 0),
    distance: Math.max(0, Number(value?.distance) || 0),
    threeTwoUsed: Boolean(value?.threeTwoUsed),
    movementEnded: Boolean(value?.movementEnded),
  };
}

function threeTwoSpeed(piece, context) {
  const card = context.gameplayCardsById[String(piece?.cardId || "")];
  if (!card) return null;
  return Math.max(0, Number(cardStat(card, "stat:speed")) || 0);
}

export function evaluateThreeTwoMove(state, context, command) {
  if (state.gameMode !== "match") return { eligible: false, reason: "MATCH_MODE_REQUIRED" };
  const pieceId = String(command.payload?.pieceId || "");
  const piece = state.pieces.find(item => String(item?.id || "") === pieceId) || null;
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!piece || piece.team === "BALL" || piece.inactive) return { eligible: false, reason: "MOVE_PIECE_INVALID" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { eligible: false, reason: "MOVE_DESTINATION_INVALID" };

  const tracker = normalizeTrackerSnapshot(state.tracker);
  const team = teamKeyForPiece(piece);
  const geometry = getMovementGeometry(piece, { x, y });
  const current = threeTwoMovementState(state.movementStateByPieceId[piece.id]);
  const ball = state.pieces.find(item => item?.team === "BALL");
  if (!tracker.gameStarted || tracker.currentTurn < 1) return { eligible: false, reason: "match-not-started", geometry, current };
  if (!team || !isTeamActiveForTrackerPhase(tracker, team)) return { eligible: false, reason: "wait-active-team", geometry, current };
  if (!ball || Number(ball.x) !== x || Number(ball.y) !== y) return { eligible: false, reason: "not-ball", geometry, current };
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) {
    return { eligible: false, reason: "occupied", geometry, current };
  }
  if (current.threeTwoUsed) return { eligible: false, reason: "used", geometry, current };
  if (geometry.kind === "same" || geometry.kind === "mixed") return { eligible: false, reason: "geometry", geometry, current };
  const withinRange = geometry.kind === "straight" ? geometry.distance <= 3 : geometry.distance <= 2;
  if (!withinRange) return { eligible: false, reason: "range", geometry, current };
  if (firstPlayerBlockingMovementPath({ pieces: state.pieces, movingPieceId: piece.id, from: piece, to: { x, y } })) {
    return { eligible: false, reason: "path-blocked", geometry, current };
  }
  const speed = threeTwoSpeed(piece, context);
  if (speed === null) return { eligible: false, reason: "no-speed", geometry, current };
  return { eligible: true, piece, team, x, y, geometry, current, speed };
}

export function commitThreeTwoMove(state, context, command) {
  const evaluation = evaluateThreeTwoMove(state, context, command);
  if (!evaluation.eligible) return { accepted: false, reason: evaluation.reason };
  const { piece, team, x, y, geometry, current, speed } = evaluation;
  const hadMoved = current.spent > 0;
  const pieces = state.pieces.map(item => item.id === piece.id ? { ...item, x, y } : item);
  const movementStateByPieceId = {
    ...state.movementStateByPieceId,
    [piece.id]: {
      axis: hadMoved ? geometry.axis : null,
      spent: hadMoved ? speed : 0,
      distance: hadMoved ? geometry.distance : 0,
      threeTwoUsed: true,
      movementEnded: hadMoved,
    },
  };
  return {
    accepted: true,
    nextState: { ...state, pieces, movementStateByPieceId },
    event: {
      type: "THREE_TWO_MOVE",
      team,
      metadata: {
        pieceId: piece.id,
        from: { x: Number(piece.x), y: Number(piece.y) },
        to: { x, y },
        movementReason: "THREE_TWO",
      },
    },
    timeline: { groupId: null, undoMode: "step", allowNoop: false },
  };
}
