import {
  CONTINUATION_RESUME_TYPE,
  endContinuationAction,
  normalizeActionContinuation,
} from "../match/actionContinuation.mjs";
import { createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

function continuationForCommand(state, command) {
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const requestedId = String(command.payload?.continuationId || "");
  if (!continuation || continuation.kind !== "bonus-card-action") return null;
  if (requestedId && requestedId !== continuation.id) return null;
  return continuation;
}

export function endBonusAction(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  if (state.actionResolution) return { accepted: false, reason: "ACTION_RESOLUTION_ACTIVE" };
  const continuation = continuationForCommand(state, command);
  if (!continuation) return { accepted: false, reason: "BONUS_ACTION_NOT_ACTIVE" };
  const completion = endContinuationAction(continuation);
  if (!completion) return { accepted: false, reason: "BONUS_ACTION_NOT_ENDABLE" };

  const tracker = normalizeTrackerSnapshot(state.tracker);
  const policy = completion.resumePolicy;
  const declined = Boolean(completion.declined);
  let nextState = { ...state, actionContinuation: null };
  let metadata = {
    continuationId: continuation.id,
    resumePolicy: policy,
    bonusAction: {
      used: !declined,
      declined,
      actionType: continuation.actionType || null,
      pieceId: continuation.pieceId || null,
    },
    automaticTurnAdvance: false,
    startedTurn: null,
  };

  if (policy.type === CONTINUATION_RESUME_TYPE.ADVANCE_TURN) {
    const nextTeam = policy.team || continuation.team;
    const requestedTurn = Math.max(1, Number(policy.nextTurn) || 1);
    if (policy.phase === "complete" || requestedTurn > tracker.settings.turns) {
      nextState = {
        ...nextState,
        tracker: { ...state.tracker, turnPhase: "complete" },
      };
      metadata = { ...metadata, nextPhase: "complete", matchComplete: true };
    } else {
      const emptyTurn = createEmptyTrackerTurnState();
      nextState = {
        ...nextState,
        movementStateByPieceId: {},
        tracker: {
          ...state.tracker,
          startingTeam: nextTeam,
          currentTurn: requestedTurn,
          usedActions: emptyTurn.usedActions,
          actionLog: emptyTurn.actionLog,
          personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
          matchActionState: emptyTurn.matchActionState,
          turnPhase: policy.phase || "attack",
        },
      };
      metadata = {
        ...metadata,
        nextPhase: policy.phase || "attack",
        automaticTurnAdvance: true,
        startedTurn: requestedTurn,
      };
    }
  } else if (policy.type === CONTINUATION_RESUME_TYPE.RESUME_PHASE) {
    nextState = {
      ...nextState,
      tracker: { ...state.tracker, turnPhase: policy.phase || tracker.turnPhase },
    };
    metadata = { ...metadata, nextPhase: policy.phase || tracker.turnPhase };
  }

  return {
    accepted: true,
    nextState,
    event: {
      type: declined ? "BONUS_ACTION_DECLINED" : "BONUS_ACTION_ENDED",
      team: continuation.team,
      metadata,
    },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: false },
  };
}
