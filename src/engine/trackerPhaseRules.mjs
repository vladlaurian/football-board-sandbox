import { activeTeamForTrackerPhase, createEmptyTrackerTurnState, nextTrackerPhase } from "../tracker/actionRules.mjs";
import { clearGroupMoveState, normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

export function endTrackerPhase(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  if (state.actionResolution) return { accepted: false, reason: "ACTION_RESOLUTION_ACTIVE" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const team = command.payload?.team === "blue" || command.payload?.team === "red" ? command.payload.team : null;
  if (!tracker.gameStarted || tracker.currentTurn < 1) return { accepted: false, reason: "MATCH_NOT_STARTED" };
  if (!team || activeTeamForTrackerPhase(tracker) !== team) return { accepted: false, reason: "WAIT_ACTIVE_TEAM" };
  if (tracker.turnPhase === "complete") return { accepted: false, reason: "MATCH_COMPLETE" };

  const nextPhase = nextTrackerPhase(tracker.turnPhase);
  const baseTracker = {
    ...state.tracker,
    matchActionState: clearGroupMoveState(tracker.matchActionState),
  };
  if (tracker.turnPhase === "defense" && tracker.currentTurn < tracker.settings.turns) {
    const emptyTurn = createEmptyTrackerTurnState();
    const nextTurn = tracker.currentTurn + 1;
    return {
      accepted: true,
      nextState: {
        ...state,
        movementStateByPieceId: {},
        tracker: {
          ...baseTracker,
          currentTurn: nextTurn,
          usedActions: emptyTurn.usedActions,
          actionLog: emptyTurn.actionLog,
          matchActionState: emptyTurn.matchActionState,
          turnPhase: "attack",
        },
      },
      event: {
        type: "PHASE_ENDED",
        team,
        metadata: { endingTeam: team, nextPhase: "attack", automaticTurnAdvance: true, startedTurn: nextTurn },
      },
      timeline: { groupId: null, undoMode: "step", allowNoop: false },
    };
  }
  return {
    accepted: true,
    nextState: { ...state, tracker: { ...baseTracker, turnPhase: nextPhase } },
    event: {
      type: "PHASE_ENDED",
      team,
      metadata: { endingTeam: team, nextPhase, automaticTurnAdvance: false, startedTurn: null },
    },
    timeline: { groupId: null, undoMode: "step", allowNoop: false },
  };
}
