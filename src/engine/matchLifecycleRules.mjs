import { createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

function validStartTeam(command) {
  return command.payload?.team === "blue" || command.payload?.team === "red" ? command.payload.team : null;
}

function playableFirstTurn(state, team, { restarted = false } = {}) {
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
      // The existing semantic vocabulary deliberately remains MATCH_STARTED.
      // Restart is lifecycle metadata, not a second game-rule event family.
      type: "MATCH_STARTED",
      team,
      metadata: { startingTeam: team, startedTurn: 1, restarted },
    },
    timeline: { groupId: null, undoMode: "step", allowNoop: true },
  };
}

export function startMatch(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const team = validStartTeam(command);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!team) return { accepted: false, reason: "MATCH_START_TEAM_INVALID" };
  if (tracker.gameStarted) return { accepted: false, reason: "MATCH_ALREADY_STARTED" };
  return playableFirstTurn(state, team);
}

export function restartMatch(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const team = validStartTeam(command);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!team) return { accepted: false, reason: "MATCH_START_TEAM_INVALID" };
  if (!tracker.gameStarted) return { accepted: false, reason: "MATCH_NOT_STARTED" };
  return playableFirstTurn(state, team, { restarted: true });
}
