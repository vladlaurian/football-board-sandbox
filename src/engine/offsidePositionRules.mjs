import { teamKeyForPiece } from "../rules/passEngine.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { buildRestartSetup, clearCellForPlacement, moveBallTo } from "./restartSetupRules.mjs";
import { createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { pruneTeamModifierTokens, expiredTeamModifierTokens } from "./rollModifierOpportunities.mjs";
import { markingTurnResetFields } from "./markingRules.mjs";

// Shared by Pass's own offside check (docs/GAMEPLAY_RULES_FOUNDATIONS.md
// section 6) and Normal Move's movement-direction lock: confirmed with the
// user that in a turn-based game, a player who starts a movement session
// while standing in an offside position must stay locked to that one
// direction for the rest of the session — otherwise the same legal-in-real-
// football sequence (retreat onside, receive a pass from a teammate's own
// action, then reverse and break away alone) makes a defensive offside trap
// unusable, since a turn-based game has no real-time reaction cost the way
// continuous play does. The player may still retreat, become onside, receive
// a pass, build up play, or even shoot — only reversing axis direction
// within that one session is blocked.
//
// `advancement(x)` folds both attacking directions (team "A"/blue attacks
// toward higher x, team "B"/red toward lower x — see Shot's own
// isLegalGoalTarget) into one comparable "how far toward the opponent's
// goal" scale, so every condition below reads the same regardless of team.
export function attackAdvancementFn(attackingTeam) {
  const direction = attackingTeam === "blue" ? 1 : -1;
  return x => direction * Number(x);
}

// Live, stateless check: is `piece` in an offside position right now,
// against the ball's current position — not tied to any specific pass.
export function isPieceInOffsidePosition(state, context, { piece, attackingTeam }) {
  if (!piece) return false;
  const advancement = attackAdvancementFn(attackingTeam);
  const halfway = Number(context.boardSettings.cols) / 2;
  if (!(advancement(piece.x) > advancement(halfway))) return false;
  const ball = (state.pieces || []).find(item => item?.team === "BALL");
  if (ball && !(advancement(piece.x) > advancement(ball.x))) return false;
  const defendingTeam = attackingTeam === "blue" ? "red" : "blue";
  const defenders = (state.pieces || [])
    .filter(item => item && item.team !== "BALL" && !item.inactive && !isBenchReservePiece(item) && teamKeyForPiece(item) === defendingTeam)
    .sort((a, b) => advancement(b.x) - advancement(a.x));
  const secondLast = defenders[1];
  if (!secondLast) return false;
  return advancement(piece.x) > advancement(secondLast.x);
}

// Build 2: Through Ball and Lofted Through Ball can leave the ball in open
// space with no synchronous recipient — their own "recovery race" only
// decides attacker-team-vs-defender-team, never which specific attacker
// eventually reaches it. At the exact moment the attacking team wins that
// race (the ball is still at the passer's own cell — nothing has moved it
// yet, same reasoning as Pass Build 1), every attacking field piece standing
// in an offside position right then is flagged, not just the theoretically
// closest one, since the actual claimant is decided later by real gameplay,
// not by the race's own distance math. Returns null (nothing to watch) when
// no one is currently offside.
export function computeOffsideWatch(state, context, { attackingTeam, passerId }) {
  const flaggedPieceIds = (state.pieces || [])
    .filter(piece => piece && piece.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece)
      && teamKeyForPiece(piece) === attackingTeam && String(piece.id) !== String(passerId))
    .filter(piece => isPieceInOffsidePosition(state, context, { piece, attackingTeam }))
    .map(piece => String(piece.id));
  return flaggedPieceIds.length ? { attackingTeam, flaggedPieceIds } : null;
}

// Whenever a piece lands on a previously-loose ball (Normal Move, Bonus
// Move, or a Three-Two resolution — the three ways a player can "reach it"
// per docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6), check it against any
// live watch from a still-unclaimed Through Ball / Lofted Through Ball.
// Deliberately NOT reset by any turn/phase transition (confirmed live with
// the user) — an attacker who can only close part of the distance before its
// own actions run out, then reaches the ball on a later turn once Speed
// refills, is still offside from that original pass. Returns null when there
// is no active watch at all; otherwise { offside: true } for a flagged
// attacker actually claiming it, or { offside: false } for anyone else
// claiming it first — the watch is spent either way, since the phase of play
// this Through Ball started is over regardless of who ends it.
export function resolveOffsideWatchClaim(state, { piece, team }) {
  const watch = state.offsideWatch;
  if (!watch) return null;
  if (team === watch.attackingTeam && watch.flaggedPieceIds.includes(String(piece.id))) {
    return { offside: true, attackingTeam: watch.attackingTeam };
  }
  return { offside: false };
}

// OFFSIDE_RESTART_CONFIRMED: the offside result screen's own Continue
// button. One shared handler regardless of which of the four call sites
// (Pass Build 1's completePass, or the Normal/Bonus/Three-Two Move claim
// hooks for Build 2) froze the screen — all of them record the exact same
// { team, spot } shape on state.pendingRestartResult, so there is nothing
// mechanic-specific left to branch on here. Mirrors Corner/Goal Kick's own
// consequence functions, straight into the shared restart-setup engine
// (docs/FINALISATION_AND_RESTARTS_RULES.md section 7), never a separate
// "executable" flag to track. Offside genuinely changes possession — the
// ball goes from the attacking team to the defending team — so, confirmed
// live with the user as the general rule (a change of possession always
// means a real turn advance, contrast with Tackling's own foul, which
// never changes possession and only resets the Tracker within the same
// turn — see applyTacklingFailure's matching comment), this is a full new
// numbered turn: mirrors applyGoalKickConsequence exactly.
export function confirmOffsideRestart(state, context, command) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "offside" || pending.status !== "result-display") return { accepted: false, reason: "NO_PENDING_OFFSIDE_RESULT" };
  const restart = state.pendingRestartResult;
  if (!restart || restart.type !== "indirectFreeKick") return { accepted: false, reason: "OFFSIDE_RESTART_NOT_PENDING" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const emptyTurn = createEmptyTrackerTurnState();
  const nextTurn = Math.min(tracker.settings.turns, Math.max(1, tracker.currentTurn + 1));
  const expiredRollBonuses = expiredTeamModifierTokens(state.teamModifierTokens, nextTurn);
  // Same pattern as Corner/Goal Kick's own consequence functions
  // (shotRules.mjs): clear whoever stands on the spot, then move the ball
  // there — offside's spot is rarely where the ball already sits (it's the
  // offside player's own position, not the passer's), so this is never a
  // no-op the way it sometimes coincidentally is for Tackling.
  const clearedPieces = clearCellForPlacement(state.pieces, restart.spot, context.boardSettings, null);
  const pieces = moveBallTo({ ...state, pieces: clearedPieces }, restart.spot.x, restart.spot.y) || clearedPieces;
  const restartSetup = buildRestartSetup(context.ruleSet, "freeKickIndirect", restart.team, restart.spot, pieces, context.boardSettings);
  if (!restartSetup) return { accepted: false, reason: "OFFSIDE_RESTART_INVALID" };
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      movementStateByPieceId: {},
      teamModifierTokens: pruneTeamModifierTokens(state.teamModifierTokens, nextTurn),
      actionResolution: null,
      actionContinuation: null,
      pendingRestartResult: null,
      restartSetup,
      ...markingTurnResetFields(),
      tracker: {
        ...state.tracker,
        startingTeam: restart.team,
        currentTurn: nextTurn,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    },
    event: { type: "OFFSIDE_RESTART_CONFIRMED", team: restart.team, metadata: { spot: restart.spot, startedTurn: nextTurn, expiredRollBonuses: expiredRollBonuses.map(item => ({ id: item.id, team: item.team, modifierType: item.modifierType })) } },
    timeline: { groupId: command.id, undoMode: "step", allowNoop: false },
  };
}
