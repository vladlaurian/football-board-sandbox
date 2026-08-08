import { activeTeamForTrackerPhase, createEmptyTrackerTurnState, nextTrackerPhase } from "../tracker/actionRules.mjs";
import { clearGroupMoveState, normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { expiredRollModifierOpportunities, pruneRollModifierOpportunities } from "./rollModifierOpportunities.mjs";
import { markingTurnResetFields, opponentTeamOf } from "./markingRules.mjs";
import { computeTacklingEligibility, clearTacklingInactivityForNewTurn } from "./tacklingRules.mjs";

export function endTrackerPhase(state, context, command) {
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
    const expiredRollBonuses = expiredRollModifierOpportunities(state.teamModifierTokens, nextTurn);
    const reactivated = clearTacklingInactivityForNewTurn(state);
    return {
      accepted: true,
      nextState: {
        ...reactivated,
        movementStateByPieceId: {}, threeTwoOpportunity: null,
        teamModifierTokens: pruneRollModifierOpportunities(state.teamModifierTokens, nextTurn),
        ...markingTurnResetFields(),
        tracker: {
          ...baseTracker,
          currentTurn: nextTurn,
          usedActions: emptyTurn.usedActions,
          actionLog: emptyTurn.actionLog,
          personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
          matchActionState: emptyTurn.matchActionState,
          turnPhase: "attack",
        },
      },
      event: {
        type: "PHASE_ENDED",
        team,
        metadata: {
          endingTeam: team, nextPhase: "attack", automaticTurnAdvance: true, startedTurn: nextTurn,
          expiredRollBonuses: expiredRollBonuses.map(item => ({ id: item.id, team: item.team, modifierType: item.modifierType })),
        },
      },
      timeline: { groupId: null, undoMode: "step", allowNoop: false },
    };
  }
  // docs/TACKLING_RULES.md section 1.1: eligibility for the normal defensive
  // action is frozen the instant the defense phase starts — computed exactly
  // once here, never recomputed for the rest of that phase.
  const tacklingEligibility = nextPhase === "defense" ? computeTacklingEligibility(state, context, opponentTeamOf(team)) : state.tacklingEligibility || [];
  return {
    accepted: true,
    nextState: { ...state, threeTwoOpportunity: null, tacklingEligibility, tracker: { ...baseTracker, turnPhase: nextPhase } },
    event: {
      type: "PHASE_ENDED",
      team,
      metadata: { endingTeam: team, nextPhase, automaticTurnAdvance: false, startedTurn: null },
    },
    timeline: { groupId: null, undoMode: "step", allowNoop: false },
  };
}
