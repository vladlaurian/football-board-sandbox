import { getMovementGeometry, diagonalCostForDistance } from "../board/movementState.mjs";
import { cardStat, teamKeyForPiece } from "../rules/passEngine.mjs";
import { activateTrackerAction } from "../tracker/actionRules.mjs";
import { normalizeMatchActionState, normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

function normalMovementState(value) {
  return {
    axis: value?.axis || null,
    spent: Math.max(0, Number(value?.spent) || 0),
    distance: Math.max(0, Number(value?.distance) || 0),
    threeTwoUsed: Boolean(value?.threeTwoUsed),
    movementEnded: Boolean(value?.movementEnded),
  };
}

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

function normalMoveSpeed(piece, context) {
  const card = context.gameplayCardsById[String(piece?.cardId || "")];
  if (!card) return null;
  return Math.max(0, Number(cardStat(card, "stat:speed")) || 0);
}

export function startNormalMove(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  if (!piece || piece.team === "BALL" || piece.inactive) return { accepted: false, reason: "MOVE_PIECE_INVALID" };
  const team = teamKeyForPiece(piece);
  if (!team) return { accepted: false, reason: "MOVE_TEAM_INVALID" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const activation = activateTrackerAction(tracker, { type: "MOVE", pieceId: piece.id, team, entryId: command.id });
  if (!activation.allowed) return { accepted: false, reason: activation.reason || "MOVE_NOT_ALLOWED" };
  return {
    accepted: true,
    nextState: {
      ...state,
      tracker: {
        ...state.tracker,
        actionLog: activation.actionLog,
        usedActions: activation.usedActions,
        matchActionState: activation.matchActionState,
      },
    },
    event: { type: "MOVE_ACTIVATED", team, metadata: { pieceId: piece.id, movementReason: "NORMAL_MOVE" } },
    timeline: { groupId: command.id, undoMode: "step", allowNoop: true },
  };
}

export function cancelNormalMove(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const team = teamKeyForPiece(piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const active = tracker.matchActionState.activeMovement || {};
  const log = Array.isArray(tracker.actionLog?.[team]) ? tracker.actionLog[team] : [];
  const last = log[log.length - 1];
  const valid = Boolean(piece && active.active && active.kind === "normal-move"
    && String(active.pieceId || "") === String(piece.id) && active.team === team
    && last?.type === "MOVE" && String(last.pieceId || "") === String(piece.id)
    && String(last.id || "") === String(active.timelineGroupId || ""));
  if (!valid) return { accepted: false, reason: "NORMAL_MOVE_NOT_ACTIVE" };
  const actionLog = { ...tracker.actionLog, [team]: log.slice(0, -1) };
  const usedActions = { ...tracker.usedActions, [team]: actionLog[team].length };
  const byPieceId = { ...tracker.matchActionState.byPieceId };
  delete byPieceId[piece.id];
  const matchActionState = normalizeMatchActionState({
    ...tracker.matchActionState,
    byPieceId,
    activeMovement: { active: false, kind: null, pieceId: null, team: null, timelineGroupId: null },
  });
  return {
    accepted: true,
    nextState: { ...state, tracker: { ...state.tracker, actionLog, usedActions, matchActionState } },
    event: { type: "MOVE_CANCELLED", team, metadata: { pieceId: piece.id, movementReason: "NORMAL_MOVE" } },
    timeline: { groupId: active.timelineGroupId || null, undoMode: "step", allowNoop: true },
  };
}

export function commitNormalMove(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const team = teamKeyForPiece(piece);
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!piece || piece.team === "BALL" || piece.inactive || !team) return { accepted: false, reason: "MOVE_PIECE_INVALID" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { accepted: false, reason: "MOVE_DESTINATION_INVALID" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const active = tracker.matchActionState.activeMovement || {};
  const pieceState = tracker.matchActionState.byPieceId[piece.id] || {};
  if (!active.active || active.kind !== "normal-move" || String(active.pieceId || "") !== String(piece.id)
    || active.team !== team || !pieceState.moveAuthorized) return { accepted: false, reason: "NORMAL_MOVE_NOT_ACTIVE" };
  const geometry = getMovementGeometry(piece, { x, y });
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) return { accepted: false, reason: "occupied" };
  if (geometry.kind === "same") return { accepted: false, reason: "same" };
  if (geometry.kind === "mixed") return { accepted: false, reason: "mixed" };
  const current = normalMovementState(state.movementStateByPieceId[piece.id]);
  if (current.movementEnded) return { accepted: false, reason: "movement-ended" };
  const speed = normalMoveSpeed(piece, context);
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
  const movementStateByPieceId = {
    ...state.movementStateByPieceId,
    [piece.id]: {
      ...current,
      axis: current.axis || geometry.axis,
      spent: current.spent + moveCost,
      distance: current.distance + geometry.distance,
    },
  };
  const matchActionState = normalizeMatchActionState({
    ...tracker.matchActionState,
    activeMovement: { active: false, kind: null, pieceId: null, team: null, timelineGroupId: null },
  });
  return {
    accepted: true,
    nextState: { ...state, pieces, movementStateByPieceId, tracker: { ...state.tracker, matchActionState } },
    event: { type: "PIECE_MOVED", team, metadata: { pieceId: piece.id, from: { x: Number(piece.x), y: Number(piece.y) }, to: { x, y }, movementReason: "NORMAL_MOVE" } },
    timeline: { groupId: active.timelineGroupId || null, undoMode: "step", allowNoop: false },
  };
}
