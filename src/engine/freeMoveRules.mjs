import { teamKeyForPiece } from "../rules/passEngine.mjs";
import { toggleFreeModeState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

function administrativeMetadata(piece, extra = {}) {
  return {
    pieceId: piece.id,
    movementReason: "FREE_MODE",
    administrative: true,
    ...extra,
  };
}

export function startFreeMove(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const team = teamKeyForPiece(piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!piece || piece.team === "BALL" || piece.inactive || !team) return { accepted: false, reason: "FREE_MOVE_PIECE_INVALID" };
  if (!tracker.gameStarted || tracker.currentTurn < 1) return { accepted: false, reason: "match-not-started" };
  if (tracker.matchActionState.freeMode?.active) return { accepted: false, reason: "FREE_MOVE_ALREADY_ACTIVE" };
  const timelineGroupId = String(command.payload?.timelineGroupId || command.id);
  const transition = toggleFreeModeState(tracker.matchActionState, { pieceId: piece.id, team, timelineGroupId });
  return {
    accepted: true,
    nextState: { ...state, tracker: { ...state.tracker, matchActionState: transition.state } },
    event: { type: "FREE_MODE_STARTED", team, metadata: administrativeMetadata(piece) },
    timeline: { groupId: timelineGroupId, undoMode: "step", allowNoop: true },
  };
}

export function commitFreeMove(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const active = tracker.matchActionState.freeMode || {};
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!piece || piece.team === "BALL" || piece.inactive) return { accepted: false, reason: "FREE_MOVE_PIECE_INVALID" };
  if (!active.active || String(active.pieceId || "") !== String(piece.id)) return { accepted: false, reason: "FREE_MOVE_NOT_ACTIVE" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { accepted: false, reason: "MOVE_DESTINATION_INVALID" };
  if (Number(piece.x) === x && Number(piece.y) === y) return { accepted: false, reason: "same" };
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) {
    return { accepted: false, reason: "occupied" };
  }
  // Free Move deliberately moves only the selected player. The ball stays on
  // its square even when the player started on it or is placed onto it.
  const pieces = state.pieces.map(item => item.id === piece.id ? { ...item, x, y } : item);
  return {
    accepted: true,
    nextState: { ...state, pieces },
    event: { type: "FREE_MOVE", team: teamKeyForPiece(piece), metadata: administrativeMetadata(piece, { from: { x: Number(piece.x), y: Number(piece.y) }, to: { x, y } }) },
    timeline: { groupId: active.timelineGroupId || null, undoMode: "step", allowNoop: false },
  };
}

export function endFreeMove(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const active = tracker.matchActionState.freeMode || {};
  if (!piece || piece.team === "BALL" || piece.inactive) return { accepted: false, reason: "FREE_MOVE_PIECE_INVALID" };
  if (!active.active || String(active.pieceId || "") !== String(piece.id)) return { accepted: false, reason: "FREE_MOVE_NOT_ACTIVE" };
  const transition = toggleFreeModeState(tracker.matchActionState, {
    pieceId: piece.id,
    team: teamKeyForPiece(piece),
    timelineGroupId: active.timelineGroupId || command.id,
  });
  return {
    accepted: true,
    nextState: { ...state, tracker: { ...state.tracker, matchActionState: transition.state } },
    event: { type: "FREE_MODE_ENDED", team: teamKeyForPiece(piece), metadata: administrativeMetadata(piece) },
    timeline: { groupId: active.timelineGroupId || null, undoMode: "step", allowNoop: true },
  };
}
