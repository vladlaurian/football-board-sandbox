import { createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

export function startMatch(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const team = command.payload?.team === "blue" || command.payload?.team === "red" ? command.payload.team : null;
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!team) return { accepted: false, reason: "MATCH_START_TEAM_INVALID" };
  if (tracker.gameStarted) return { accepted: false, reason: "MATCH_ALREADY_STARTED" };
  const emptyTurn = createEmptyTrackerTurnState();
  return {
    accepted: true,
    nextState: {
      ...state,
      movementStateByPieceId: {},
      actionResolution: null,
      actionContinuation: null,
      tracker: {
        ...state.tracker,
        gameStarted: true,
        startingTeam: team,
        currentTurn: 1,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    },
    event: {
      type: "MATCH_STARTED",
      team,
      metadata: { startingTeam: team, startedTurn: 1 },
    },
    timeline: { groupId: null, undoMode: "step", allowNoop: true },
  };
}
