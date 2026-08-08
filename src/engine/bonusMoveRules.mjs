import { getMovementGeometry, diagonalCostForDistance } from "../board/movementState.mjs";
import { beginContinuationAction, normalizeActionContinuation, CONTINUATION_STATUS } from "../match/actionContinuation.mjs";
import { cardStat, teamKeyForPiece } from "../rules/passEngine.mjs";
import { firstPlayerBlockingMovementPath } from "./movementPathRules.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { isPieceInOffsidePosition, resolveOffsideWatchClaim } from "./offsidePositionRules.mjs";
import { opponentTeamOf } from "./markingRules.mjs";

function pieceForCommand(state, command) {
  const pieceId = String(command.payload?.pieceId || "");
  return state.pieces.find(piece => String(piece?.id || "") === pieceId) || null;
}

// Mirrors normalMoveRules.mjs's own normalizer: axis/spent/distance/
// threeTwoUsed/movementEnded were already carried through commits here, but
// directionLocked/direction were not — a Bonus Move continuation silently
// dropped both every commit, which would have let the same offside-trap
// exploit (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6) slip back in through
// a Natural 20 bonus-action grant even after Normal Move was locked down.
function movementState(value) {
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

function speedFor(piece, context) {
  const card = context.gameplayCardsById[String(piece?.cardId || "")];
  if (!card) return null;
  return Math.max(0, Number(cardStat(card, "stat:speed")) || 0);
}

function activeBonusMove(state, piece) {
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const team = teamKeyForPiece(piece);
  return {
    continuation,
    team,
    valid: Boolean(
      continuation?.kind === "bonus-card-action"
      && continuation.status === CONTINUATION_STATUS.ACTION_ACTIVE
      && continuation.actionType === "MOVE"
      && continuation.pieceId === String(piece?.id || "")
      && continuation.team === team
    ),
  };
}

export function startBonusMove(state, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  if (!piece || piece.team === "BALL" || piece.inactive || isBenchReservePiece(piece)) return { accepted: false, reason: "MOVE_PIECE_INVALID" };
  const continuation = normalizeActionContinuation(state.actionContinuation);
  const team = teamKeyForPiece(piece);
  if (!continuation || continuation.kind !== "bonus-card-action" || continuation.status !== CONTINUATION_STATUS.READY || continuation.team !== team) {
    return { accepted: false, reason: "BONUS_MOVE_NOT_READY" };
  }
  const nextContinuation = beginContinuationAction(continuation, { type: "MOVE", pieceId: piece.id });
  if (!nextContinuation) return { accepted: false, reason: "BONUS_MOVE_NOT_READY" };
  return {
    accepted: true,
    nextState: { ...state, actionContinuation: { ...nextContinuation, movementStarted: false } },
    event: { type: "BONUS_MOVE_STARTED", team, metadata: { pieceId: piece.id, movementReason: "BONUS_MOVE" } },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: true },
  };
}

export function cancelBonusMove(state, command) {
  const piece = pieceForCommand(state, command);
  const { continuation, team, valid } = activeBonusMove(state, piece);
  if (!valid || continuation.movementStarted) return { accepted: false, reason: "BONUS_MOVE_NOT_CANCELLABLE" };
  const nextContinuation = {
    ...continuation,
    status: CONTINUATION_STATUS.READY,
    actionType: null,
    pieceId: null,
    movementStarted: false,
    transaction: { ...continuation.transaction, actionType: "BONUS_ACTION" },
  };
  return {
    accepted: true,
    nextState: { ...state, actionContinuation: nextContinuation },
    event: { type: "BONUS_MOVE_CANCELLED", team, metadata: { pieceId: piece.id, movementReason: "BONUS_MOVE" } },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: true },
  };
}

// This evaluator is the single source for both preview and commit.  Unlike the
// command envelope, it preserves geometry/cost/remaining for every rejection.
export function evaluateBonusMove(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  const piece = pieceForCommand(state, command);
  const { continuation, team, valid } = activeBonusMove(state, piece);
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  if (!valid) return { accepted: false, reason: "BONUS_MOVE_NOT_ACTIVE" };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { accepted: false, reason: "MOVE_DESTINATION_INVALID" };
  const geometry = getMovementGeometry(piece, { x, y });
  if (geometry.kind === "same") return { accepted: false, reason: "same" };
  if (geometry.kind === "mixed") return { accepted: false, reason: "mixed" };
  const current = movementState(state.movementStateByPieceId[piece.id]);
  const speed = speedFor(piece, context);
  const remaining = speed === null ? null : Math.max(0, speed - current.spent);
  if (state.pieces.some(item => item.id !== piece.id && item.team !== "BALL" && Number(item.x) === x && Number(item.y) === y)) return { accepted: false, reason: "occupied", piece, team, x, y, geometry, current, speed, remaining };
  if (firstPlayerBlockingMovementPath({ pieces: state.pieces, movingPieceId: piece.id, from: piece, to: { x, y } })) return { accepted: false, reason: "path-blocked", piece, team, x, y, geometry, current, speed, remaining };
  if (current.movementEnded) return { accepted: false, reason: "movement-ended", piece, team, x, y, geometry, current, speed, remaining: 0 };
  if (speed === null) return { accepted: false, reason: "no-speed", piece, team, x, y, geometry, current, speed, remaining };
  if (current.axis && current.axis !== geometry.axis) return { accepted: false, reason: "axis", piece, team, x, y, geometry, current, speed, remaining };
  // Same offside movement lock as Normal Move (see normalMoveRules.mjs and
  // docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6): a piece starting a fresh
  // movement session — here, a Bonus Move continuation with no axis
  // committed yet — while standing in an offside position locks to its first
  // hop's direction for the rest of the session.
  const offsideLocked = !current.axis && !current.directionLocked
    && isPieceInOffsidePosition(state, context, { piece, attackingTeam: team });
  const directionLocked = current.directionLocked || offsideLocked;
  const direction = { dx: Math.sign(x - Number(piece.x)), dy: Math.sign(y - Number(piece.y)) };
  if (directionLocked && current.direction && (current.direction.dx !== direction.dx || current.direction.dy !== direction.dy)) {
    // Distinct reason string, not reused "direction" — see the matching note
    // in normalMoveRules.mjs (applyGameCommand strips a rejection down to
    // {accepted, reason} before the UI sees it).
    return { accepted: false, reason: current.offsideDirectionLocked ? "offside-direction" : "direction", piece, team, x, y, geometry, current, speed, remaining };
  }
  const moveCost = geometry.kind === "diagonal"
    ? diagonalCostForDistance(current.distance + geometry.distance) - diagonalCostForDistance(current.distance)
    : geometry.cost;
  if (moveCost > remaining) return { accepted: false, reason: "speed", piece, team, x, y, geometry, current, speed, moveCost, remaining };
  return { accepted: true, piece, team, x, y, geometry, current, speed, moveCost, remaining, continuation, offsideLocked };
}

export function commitBonusMove(state, context, command) {
  const evaluation = evaluateBonusMove(state, context, command);
  if (!evaluation.accepted) return evaluation;
  const { piece, team, x, y, current, moveCost, geometry, continuation, offsideLocked } = evaluation;
  const carriesBall = state.pieces.some(item => item.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
  const pieces = state.pieces.map(item => {
    if (item.id === piece.id) return { ...item, x, y };
    if (carriesBall && item.team === "BALL") return { ...item, x, y };
    return item;
  });
  const baseState = {
    ...state,
    pieces,
    movementStateByPieceId: {
      ...state.movementStateByPieceId,
      [piece.id]: {
        ...current,
        axis: current.axis || geometry.axis,
        direction: current.direction || { dx: Math.sign(x - Number(piece.x)), dy: Math.sign(y - Number(piece.y)) },
        ...((current.directionLocked || offsideLocked) ? { directionLocked: true } : {}),
        ...((current.offsideDirectionLocked || offsideLocked) ? { offsideDirectionLocked: true } : {}),
        spent: current.spent + moveCost,
        distance: current.distance + geometry.distance,
      },
    },
    actionContinuation: { ...continuation, movementStarted: true },
  };
  // Offside Build 2 (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6) — see the
  // matching note in normalMoveRules.mjs. A Bonus Move reaching a
  // previously-loose ball is exactly the kind of later, asynchronous claim
  // that watch exists for.
  const ballBefore = state.pieces.find(item => item?.team === "BALL") || null;
  const landedOnLooseBall = Boolean(ballBefore) && !carriesBall && Number(ballBefore.x) === Number(x) && Number(ballBefore.y) === Number(y);
  const offsideClaim = landedOnLooseBall ? resolveOffsideWatchClaim(baseState, { piece, team }) : null;
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
    event: { type: "BONUS_MOVE_COMMITTED", team, metadata: { pieceId: piece.id, from: { x: Number(piece.x), y: Number(piece.y) }, to: { x, y }, movementReason: "BONUS_MOVE", ...(offsideClaim?.offside ? { offside: true } : {}) } },
    timeline: { groupId: continuation.id, undoMode: "atomic", allowNoop: false },
  };
}
