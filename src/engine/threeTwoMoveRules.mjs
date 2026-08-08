import { getMovementGeometry } from "../board/movementState.mjs";
import { cardStat, teamKeyForPiece } from "../rules/passEngine.mjs";
import { isTeamActiveForTrackerPhase } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { normalizeActionContinuation } from "../match/actionContinuation.mjs";
import { firstPlayerBlockingMovementPath } from "./movementPathRules.mjs";
import { isPieceInOffsidePosition, resolveOffsideWatchClaim } from "./offsidePositionRules.mjs";
import { opponentTeamOf } from "./markingRules.mjs";

function threeTwoMovementState(value) {
  return {
    axis: value?.axis || null,
    spent: Math.max(0, Number(value?.spent) || 0),
    distance: Math.max(0, Number(value?.distance) || 0),
    threeTwoUsed: Boolean(value?.threeTwoUsed),
    movementEnded: Boolean(value?.movementEnded),
    ...(value?.directionLocked ? { directionLocked: true } : {}),
    ...(value?.offsideDirectionLocked ? { offsideDirectionLocked: true } : {}),
    ...(value?.direction && Number.isInteger(Number(value.direction.dx)) && Number.isInteger(Number(value.direction.dy)) ? { direction: { dx: Math.sign(Number(value.direction.dx)), dy: Math.sign(Number(value.direction.dy)) } } : {}),
  };
}

function threeTwoSpeed(piece, context) {
  const card = context.gameplayCardsById[String(piece?.cardId || "")];
  if (!card) return null;
  return Math.max(0, Number(cardStat(card, "stat:speed")) || 0);
}

export function evaluateThreeTwoMove(state, context, command) {
  if (state.gameMode !== "match") return { eligible: false, reason: "MATCH_MODE_REQUIRED" };
  const pieceId = String(command.payload?.pieceId || "");
  const piece = state.pieces.find(item => String(item?.id || "") === pieceId) || null;
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!piece || piece.team === "BALL" || piece.inactive) return { eligible: false, reason: "MOVE_PIECE_INVALID" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { eligible: false, reason: "MOVE_DESTINATION_INVALID" };

  const tracker = normalizeTrackerSnapshot(state.tracker);
  const team = teamKeyForPiece(piece);
  const geometry = getMovementGeometry(piece, { x, y });
  const current = threeTwoMovementState(state.movementStateByPieceId[piece.id]);
  const ball = state.pieces.find(item => item?.team === "BALL");
  if (!tracker.gameStarted || tracker.currentTurn < 1) return { eligible: false, reason: "match-not-started", geometry, current };
  // 3/2 is a granted follow-up, not a Tracker card action.  It is legal for
  // the owner of an active Bonus Action as well as for the regular active
  // Tracker team.  The opportunity itself still supplies all target, turn,
  // passer, range and path restrictions below.
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const teamOwnsBonusAction = continuation?.kind === "bonus-card-action"
    && continuation.team === team
    && ["ready", "action-active", "awaiting-end-bonus-action"].includes(continuation.status);
  if (!team || (!isTeamActiveForTrackerPhase(tracker, team) && !teamOwnsBonusAction)) return { eligible: false, reason: "wait-active-team", geometry, current };
  if (!ball || Number(ball.x) !== x || Number(ball.y) !== y) return { eligible: false, reason: "not-ball", geometry, current };
  const opportunity = state.threeTwoOpportunity;
  if (!opportunity || opportunity.team !== team || opportunity.passerId === piece.id || Number(opportunity.target?.x) !== x || Number(opportunity.target?.y) !== y || Number(opportunity.turn) !== Number(tracker.currentTurn)) return { eligible: false, reason: "three-two-not-granted", geometry, current };
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) {
    return { eligible: false, reason: "occupied", geometry, current };
  }
  if (current.threeTwoUsed) return { eligible: false, reason: "used", geometry, current };
  if (geometry.kind === "same" || geometry.kind === "mixed") return { eligible: false, reason: "geometry", geometry, current };
  // Offside movement lock (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6,
  // confirmed live with the user): 3/2 is still a movement mechanism — a
  // piece already locked to a direction (from an earlier Normal/Bonus Move
  // this session) must not be able to use 3/2 to reverse out of it, and a
  // piece using 3/2 as its own first hop while currently offside gets locked
  // by it exactly like Normal Move's own first hop would. See
  // offsidePositionRules.mjs and the matching checks in normalMoveRules.mjs
  // / bonusMoveRules.mjs.
  const offsideLocked = !current.axis && !current.directionLocked
    && isPieceInOffsidePosition(state, context, { piece, attackingTeam: team });
  const directionLocked = current.directionLocked || offsideLocked;
  const direction = { dx: Math.sign(x - Number(piece.x)), dy: Math.sign(y - Number(piece.y)) };
  if (directionLocked && current.direction && (current.direction.dx !== direction.dx || current.direction.dy !== direction.dy)) {
    return { eligible: false, reason: "offside-direction", geometry, current };
  }
  const withinRange = geometry.kind === "straight" ? geometry.distance <= 3 : geometry.distance <= 2;
  if (!withinRange) return { eligible: false, reason: "range", geometry, current };
  if (firstPlayerBlockingMovementPath({ pieces: state.pieces, movingPieceId: piece.id, from: piece, to: { x, y } })) {
    return { eligible: false, reason: "path-blocked", geometry, current };
  }
  const speed = threeTwoSpeed(piece, context);
  if (speed === null) return { eligible: false, reason: "no-speed", geometry, current };
  return { eligible: true, piece, team, x, y, geometry, current, speed, offsideLocked };
}

export function commitThreeTwoMove(state, context, command) {
  const evaluation = evaluateThreeTwoMove(state, context, command);
  if (!evaluation.eligible) return { accepted: false, reason: evaluation.reason };
  const { piece, team, x, y, geometry, current, speed, offsideLocked } = evaluation;
  const hadMoved = current.spent > 0;
  const pieces = state.pieces.map(item => item.id === piece.id ? { ...item, x, y } : item);
  const continueAfterPriorMove = context.ruleSet.actions?.threeTwo?.allowMovementAfterPriorMove === true;
  // offsideLocked only ever applies when this 3/2 is the piece's own first
  // hop this session (evaluateThreeTwoMove's own !current.axis guard) — in
  // that case, unlike the ordinary "free axis for later moves" fresh-3/2
  // case, this hop's own axis/direction must be locked in now, or a
  // follow-up Normal Move afterward could pick an unrelated axis and slip
  // past the direction check entirely.
  const movementStateByPieceId = {
    ...state.movementStateByPieceId,
    [piece.id]: {
      axis: hadMoved ? current.axis : (offsideLocked ? geometry.axis : null),
      ...(hadMoved && current.direction
        ? { direction: current.direction }
        : offsideLocked ? { direction: { dx: Math.sign(x - Number(piece.x)), dy: Math.sign(y - Number(piece.y)) } } : {}),
      spent: hadMoved ? current.spent : 0,
      distance: hadMoved ? current.distance : 0,
      threeTwoUsed: true,
      movementEnded: hadMoved && !continueAfterPriorMove,
      ...((current.directionLocked || offsideLocked || (hadMoved && continueAfterPriorMove)) ? { directionLocked: true } : {}),
      ...((current.offsideDirectionLocked || offsideLocked) ? { offsideDirectionLocked: true } : {}),
    },
  };
  const baseState = { ...state, pieces, movementStateByPieceId, threeTwoOpportunity: null };
  // Offside Build 2 (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6): 3/2 by
  // definition always lands on the ball's own cell (evaluateThreeTwoMove's
  // own "not-ball" check above), so this is always a claim — exactly the
  // "reaches it through an applicable 3/2 resolution" case the doc names
  // explicitly. See the matching note in normalMoveRules.mjs.
  const offsideClaim = resolveOffsideWatchClaim(baseState, { piece, team });
  const outputState = offsideClaim
    ? {
        ...baseState,
        offsideWatch: null,
        ...(offsideClaim.offside ? {
          pendingRestartResult: { type: "indirectFreeKick", team: opponentTeamOf(offsideClaim.attackingTeam), spot: { x: Number(x), y: Number(y) }, executable: false },
          actionResolution: { kind: "offside", status: "result-display", team: offsideClaim.attackingTeam, result: { offside: true, recipientId: String(piece.id), team: offsideClaim.attackingTeam } },
        } : {}),
      }
    : baseState;
  return {
    accepted: true,
    nextState: outputState,
    event: {
      type: "THREE_TWO_MOVE",
      team,
      metadata: {
        pieceId: piece.id,
        from: { x: Number(piece.x), y: Number(piece.y) },
        to: { x, y },
        movementReason: "THREE_TWO",
        ...(offsideClaim?.offside ? { offside: true } : {}),
      },
    },
    timeline: { groupId: null, undoMode: "step", allowNoop: false },
  };
}
