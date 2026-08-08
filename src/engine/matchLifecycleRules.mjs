import { createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

function validStartTeam(command) {
  return command.payload?.team === "blue" || command.payload?.team === "red" ? command.payload.team : null;
}

function playableFirstTurn(state, team, { restarted = false, blueFormationId = null, redFormationId = null } = {}) {
  const emptyTurn = createEmptyTrackerTurnState();
  return {
    accepted: true,
    nextState: {
      ...state,
      movementStateByPieceId: {},
      actionResolution: null,
      actionContinuation: null,
      // A newly started/restarted Match never inherits temporary opportunities
      // from an earlier Match lifecycle.
      teamModifierTokens: [],
      threeTwoOpportunity: null,
      score: { blue: 0, red: 0 },
      pendingFormation: { blue: null, red: null },
      tacticBlock: { blue: false, red: false },
      // Continue Game is frozen: it never reapplies a formation, so the
      // previously active tactic (if any) is left exactly as it was instead
      // of being reset — there is nothing new to record.
      activeFormation: restarted ? state.activeFormation : { blue: blueFormationId, red: redFormationId },
      kickoffRestart: null,
      goalkeeperRestartException: null,
      tracker: {
        ...state.tracker,
        gameStarted: true,
        startingTeam: team,
        currentTurn: 1,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
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
  const blueFormationId = command.payload?.blueFormationId ?? null;
  const redFormationId = command.payload?.redFormationId ?? null;
  return playableFirstTurn(state, team, { blueFormationId, redFormationId });
}

export function restartMatch(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const team = validStartTeam(command);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!team) return { accepted: false, reason: "MATCH_START_TEAM_INVALID" };
  if (!tracker.gameStarted) return { accepted: false, reason: "MATCH_NOT_STARTED" };
  return playableFirstTurn(state, team, { restarted: true });
}
