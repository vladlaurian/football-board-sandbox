import { beginContinuationAction, completeContinuationAction, normalizeActionContinuation, CONTINUATION_STATUS } from "../match/actionContinuation.mjs";
import { teamKeyForPiece } from "../rules/passEngine.mjs";
import { activateTrackerAction, createEmptyTrackerTurnState, opposingTeam } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

const MANUAL_ACTION_TYPES = new Set(["SHOT", "CROSS", "DRIBBLE", "TACKLING"]);

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

function manualActionType(command) {
  const type = String(command.payload?.actionType || "");
  return MANUAL_ACTION_TYPES.has(type) ? type : null;
}

export function changePieceActivity(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  if (!piece || piece.team === "BALL" || !piece.cardId) return { accepted: false, reason: "PIECE_ACTIVITY_INVALID" };
  const inactive = Boolean(command.payload?.inactive);
  if (Boolean(piece.inactive) === inactive) return { accepted: false, reason: "PIECE_ACTIVITY_UNCHANGED" };
  const pieces = state.pieces.map(item => item.id === piece.id ? { ...item, inactive } : item);
  return {
    accepted: true,
    nextState: { ...state, pieces },
    event: {
      type: "PIECE_ACTIVITY_CHANGED",
      team: teamKeyForPiece(piece),
      metadata: { pieceId: piece.id, inactive, administrative: true },
    },
    timeline: { groupId: null, undoMode: "step", allowNoop: false },
  };
}

export function resetTrackerActions(state) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!tracker.gameStarted) return { accepted: false, reason: "MATCH_NOT_STARTED" };
  const emptyTurn = createEmptyTrackerTurnState();
  return {
    accepted: true,
    nextState: {
      ...state,
      movementStateByPieceId: {},
      tracker: {
        ...state.tracker,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        matchActionState: emptyTurn.matchActionState,
      },
    },
    event: { type: "TRACKER_RESET", metadata: { administrative: true } },
    timeline: { groupId: null, undoMode: "step", allowNoop: true },
  };
}

export function changeTrackerPossession(state) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!tracker.gameStarted) return { accepted: false, reason: "MATCH_NOT_STARTED" };
  const startingTeam = opposingTeam(tracker.startingTeam);
  const emptyTurn = createEmptyTrackerTurnState();
  return {
    accepted: true,
    nextState: {
      ...state,
      movementStateByPieceId: {},
      tracker: {
        ...state.tracker,
        startingTeam,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    },
    event: { type: "POSSESSION_CHANGED", team: startingTeam, metadata: { administrative: true } },
    timeline: { groupId: null, undoMode: "step", allowNoop: true },
  };
}

export function declareManualAction(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const actionType = manualActionType(command);
  if (!piece || piece.team === "BALL" || piece.inactive || !actionType) return { accepted: false, reason: "MANUAL_ACTION_INVALID" };
  const team = teamKeyForPiece(piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const activation = activateTrackerAction(tracker, { type: actionType, pieceId: piece.id, team, entryId: command.id });
  if (!activation.allowed) return { accepted: false, reason: activation.reason || "MANUAL_ACTION_NOT_ALLOWED" };
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
    event: {
      type: "MANUAL_ACTION_DECLARED",
      team,
      metadata: { actionType, pieceId: piece.id, manualResolutionRequired: true },
    },
    timeline: { groupId: command.id, undoMode: "step", allowNoop: true },
  };
}

export function declareManualBonusAction(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const actionType = manualActionType(command);
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const team = teamKeyForPiece(piece);
  if (!piece || piece.team === "BALL" || piece.inactive || !actionType || !continuation
    || continuation.kind !== "bonus-card-action" || continuation.status !== CONTINUATION_STATUS.READY || continuation.team !== team) {
    return { accepted: false, reason: "BONUS_MANUAL_ACTION_NOT_READY" };
  }
  const active = beginContinuationAction(continuation, { type: actionType, pieceId: piece.id });
  const completed = completeContinuationAction(active);
  if (!completed) return { accepted: false, reason: "BONUS_MANUAL_ACTION_NOT_READY" };
  return {
    accepted: true,
    nextState: { ...state, actionContinuation: completed },
    event: {
      type: "BONUS_MANUAL_ACTION_DECLARED",
      team,
      metadata: { continuationId: continuation.id, actionType, pieceId: piece.id, manualResolutionRequired: true },
    },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: true },
  };
}
