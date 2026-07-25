import { PASS_CORNERS, bodyBlockingPassOrigin, defensiveCellsForPiece, pointForPassOrigin, pointForPassTarget, segmentIntersectsOpenRect, teamKeyForPiece } from "../rules/passEngine.mjs";
import { activateTrackerAction, createEmptyTrackerTurnState, isTeamActiveForTrackerPhase } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { activeBonusActionFor, beginImplementedBonusAction, completeImplementedBonusAction } from "./bonusActionCapabilities.mjs";
import { expiredRollModifierOpportunities, pruneRollModifierOpportunities } from "./rollModifierOpportunities.mjs";

const EPSILON = 1e-9;
const otherTeam = team => team === "blue" ? "red" : "blue";
const hasBall = (state, piece) => state.pieces.some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
const distance = (a, b) => Math.hypot((Number(a.x) + .5) - (Number(b.x) + .5), (Number(a.y) + .5) - (Number(b.y) + .5));
const speed = (context, piece) => {
  const card = context.gameplayCardsById[String(piece.cardId || "")];
  const stat = [...(card?.passiveAttributes || []), ...(card?.bonuses || [])].find(value => value?.id === "stat:speed" || String(value?.name || "").toLowerCase() === "speed");
  return Number(stat?.value || 0);
};

function moveBall(state, target) {
  return state.pieces.map(piece => piece.team === "BALL" ? { ...piece, x: Number(target.x), y: Number(target.y) } : piece);
}

function areaContains(piece, context, target) {
  return defensiveCellsForPiece(piece, context.gameplayCardsById[String(piece.cardId || "")], context.boardSettings)
    .some(cell => cell.x === Number(target.x) && cell.y === Number(target.y));
}

export function planThroughBall(state, context, passer, target, cornerId) {
  const team = teamKeyForPiece(passer);
  const enemy = otherTeam(team);
  const origin = pointForPassOrigin(passer, context.ruleSet.actions.pass.pathMode, cornerId);
  const endpoint = pointForPassTarget(target);
  const maxDistance = context.ruleSet.actions.throughBall.maxDistance;
  const originBlocked = Boolean(bodyBlockingPassOrigin(origin, passer, state.pieces));
  const occupied = state.pieces.some(piece => piece?.team !== "BALL" && Number(piece.x) === Number(target.x) && Number(piece.y) === Number(target.y));
  const enemyPieces = state.pieces.filter(piece => teamKeyForPiece(piece) === enemy && !piece.inactive);
  const areaBlocked = enemyPieces.some(piece => areaContains(piece, context, passer)
    || areaContains(piece, context, target)
    || defensiveCellsForPiece(piece, context.gameplayCardsById[String(piece.cardId || "")], context.boardSettings).some(cell => segmentIntersectsOpenRect(origin, endpoint, cell)));
  const bodyBlocked = state.pieces.some(piece => piece?.id !== passer.id && piece?.team !== "BALL" && !piece.inactive && segmentIntersectsOpenRect(origin, endpoint, piece));
  const measuredDistance = distance(passer, target);
  return { origin, endpoint, maxDistance, distance: measuredDistance, originBlocked, occupied, areaBlocked, bodyBlocked, legal: !originBlocked && !occupied && !areaBlocked && !bodyBlocked && measuredDistance <= maxDistance };
}

export function selectThroughBallTarget(state, context, command) {
  const pending = state.actionResolution;
  const target = { x: Number(command.payload?.x), y: Number(command.payload?.y) };
  const passer = state.pieces.find(item => String(item?.id) === String(pending?.passerId)) || null;
  if (!pending || pending.kind !== "through-ball" || pending.status !== "targeting" || !passer || !Number.isInteger(target.x) || !Number.isInteger(target.y)) return { accepted: false, reason: "THROUGH_BALL_NOT_TARGETING" };
  const cols = Number(context.boardSettings?.cols), rows = Number(context.boardSettings?.rows);
  if (target.x < 0 || target.y < 0 || (cols > 0 && target.x >= cols) || (rows > 0 && target.y >= rows)) return { accepted: false, reason: "THROUGH_BALL_INVALID" };
  const routes = PASS_CORNERS.map(corner => ({ cornerId: corner.id, ...planThroughBall(state, context, passer, target, corner.id) }));
  return { accepted: true, nextState: { ...state, actionResolution: { ...pending, status: "route-selection", target, routes } }, event: { type: "THROUGH_BALL_TARGET_SELECTED", team: pending.team, metadata: { target } }, timeline: { allowNoop: true } };
}

export function startThroughBall(state, command) {
  const piece = state.pieces.find(item => String(item?.id) === String(command.payload?.pieceId)) || null;
  const team = teamKeyForPiece(piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!piece || !team || !hasBall(state, piece)) return { accepted: false, reason: "THROUGH_BALL_NOT_AVAILABLE" };
  const bonus = beginImplementedBonusAction(state, { team, pieceId: piece.id, type: "THROUGH_BALL" });
  if (!bonus && !isTeamActiveForTrackerPhase(tracker, team)) return { accepted: false, reason: "THROUGH_BALL_NOT_AVAILABLE" };
  return {
    accepted: true,
    nextState: { ...state, actionContinuation: bonus || state.actionContinuation, actionResolution: { id: String(command.payload?.throughBallId || command.id), kind: "through-ball", status: "targeting", passerId: piece.id, team, bonusContinuationId: bonus?.id || null } },
    event: { type: bonus ? "BONUS_THROUGH_BALL_TARGETING_STARTED" : "THROUGH_BALL_TARGETING_STARTED", team, metadata: { passerId: piece.id, continuationId: bonus?.id || null } },
    timeline: { groupId: bonus?.id || null, undoMode: bonus ? "atomic" : "step", allowNoop: true },
  };
}

export function cancelThroughBall(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "through-ball" || !["targeting", "route-selection"].includes(pending.status)) return { accepted: false, reason: "THROUGH_BALL_NOT_TARGETING" };
  const continuation = pending.bonusContinuationId
    ? activeBonusActionFor(state, { team: pending.team, pieceId: pending.passerId, type: "THROUGH_BALL", continuationId: pending.bonusContinuationId })
    : null;
  const reset = continuation ? { ...continuation, status: "ready", actionType: null, pieceId: null, movementStarted: false } : state.actionContinuation;
  return { accepted: true, nextState: { ...state, actionResolution: null, actionContinuation: reset }, event: { type: "THROUGH_BALL_CANCELLED", team: pending.team }, timeline: { groupId: pending.bonusContinuationId || null, undoMode: pending.bonusContinuationId ? "atomic" : "step", allowNoop: true } };
}

export function cancelThroughBallRoute(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "through-ball" || pending.status !== "route-selection") return { accepted: false, reason: "THROUGH_BALL_NOT_ROUTE_SELECTION" };
  // Re-selecting the chosen target does not abandon the action. It returns to
  // canonical target selection while retaining the visible target marker.
  const { routes, cornerId, ...targeting } = pending;
  return { accepted: true, nextState: { ...state, actionResolution: { ...targeting, status: "targeting" } }, event: { type: "THROUGH_BALL_ROUTE_CANCELLED", team: pending.team, metadata: { target: pending.target } }, timeline: { allowNoop: true } };
}

function recoveryCandidates(state, context, team, passer, target) {
  const ranked = requestedTeam => state.pieces.filter(piece => teamKeyForPiece(piece) === requestedTeam && !piece.inactive && piece.id !== passer.id)
    .map(piece => ({ piece, distance: distance(piece, target), speed: speed(context, piece) }));
  const attackers = ranked(team);
  const defenders = ranked(otherTeam(team));
  const bestDistance = list => list.length ? Math.min(...list.map(item => item.distance)) : null;
  const attackDistance = bestDistance(attackers);
  const defenseDistance = bestDistance(defenders);
  const attackAtDistance = attackers.filter(item => Math.abs(item.distance - attackDistance) < EPSILON);
  const defenseAtDistance = defenders.filter(item => Math.abs(item.distance - defenseDistance) < EPSILON);
  const attackSpeed = attackAtDistance.length ? Math.max(...attackAtDistance.map(item => item.speed)) : null;
  const defenseSpeed = defenseAtDistance.length ? Math.max(...defenseAtDistance.map(item => item.speed)) : null;
  const defenderWins = defenseDistance !== null && (attackDistance === null || defenseDistance < attackDistance - EPSILON || (Math.abs(defenseDistance - attackDistance) < EPSILON && defenseSpeed >= attackSpeed));
  const defenderCandidates = defenderWins ? defenseAtDistance.filter(item => item.speed === defenseSpeed) : [];
  return { attackDistance, defenseDistance, attackSpeed, defenseSpeed, defenderWins, defenderCandidates };
}

export function commitThroughBall(state, context, command) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "through-ball" || pending.status !== "route-selection") return { accepted: false, reason: "THROUGH_BALL_NOT_ROUTE_SELECTION" };
  const target = { x: Number(pending.target?.x), y: Number(pending.target?.y) };
  const passer = state.pieces.find(item => item.id === pending.passerId);
  const cornerId = String(command.payload?.cornerId || "top-left");
  if (!passer || !Number.isInteger(target.x) || !Number.isInteger(target.y) || !PASS_CORNERS.some(corner => corner.id === cornerId)) return { accepted: false, reason: "THROUGH_BALL_INVALID" };
  const route = planThroughBall(state, context, passer, target, cornerId);
  if (!route.legal) return { accepted: false, reason: route.distance > route.maxDistance ? "THROUGH_BALL_MAX_DISTANCE" : "THROUGH_BALL_ROUTE_BLOCKED" };
  const bonus = pending.bonusContinuationId
    ? activeBonusActionFor(state, { team: pending.team, pieceId: passer.id, type: "THROUGH_BALL", continuationId: pending.bonusContinuationId })
    : null;
  if (pending.bonusContinuationId && !bonus) return { accepted: false, reason: "BONUS_THROUGH_BALL_NOT_ACTIVE" };
  const activation = bonus
    ? { allowed: true, actionLog: state.tracker.actionLog, usedActions: state.tracker.usedActions, personalActionsByPieceId: state.tracker.personalActionsByPieceId, matchActionState: state.tracker.matchActionState }
    : activateTrackerAction(state.tracker, { type: "THROUGH_BALL", trackerMarker: "TB", pieceId: passer.id, team: pending.team, entryId: command.id, enforcePersonalActions: true });
  if (!activation.allowed) return { accepted: false, reason: activation.reason };
  const recovery = recoveryCandidates(state, context, pending.team, passer, target);
  const tracker = { ...state.tracker, actionLog: activation.actionLog, usedActions: activation.usedActions, personalActionsByPieceId: activation.personalActionsByPieceId, matchActionState: activation.matchActionState };
  if (!recovery.defenderWins) {
    const nextContinuation = bonus ? completeImplementedBonusAction(state, { team: pending.team, pieceId: passer.id, type: "THROUGH_BALL", continuationId: bonus.id }) : state.actionContinuation;
    return { accepted: true, nextState: { ...state, pieces: moveBall(state, target), actionResolution: null, actionContinuation: nextContinuation, threeTwoOpportunity: { sourceAction: "THROUGH_BALL", team: pending.team, passerId: passer.id, target, turn: normalizeTrackerSnapshot(state.tracker).currentTurn }, tracker }, event: { type: "THROUGH_BALL_COMPLETED", team: pending.team, metadata: { passerId: passer.id, target, cornerId, continuationId: bonus?.id || null, ...recovery } }, timeline: { groupId: bonus?.id || command.id, undoMode: bonus ? "atomic" : "step", allowNoop: false } };
  }
  const choiceRequired = recovery.defenderCandidates.length > 1;
  const selected = choiceRequired ? null : recovery.defenderCandidates[0]?.piece || null;
  const resolution = { ...pending, status: choiceRequired ? "awaiting-recoverer-choice" : "awaiting-recovery-confirmation", target, cornerId, recovery: { ...recovery, defenderCandidates: recovery.defenderCandidates.map(item => ({ pieceId: item.piece.id, distance: item.distance, speed: item.speed })), selectedRecovererId: selected?.id || null } };
  return { accepted: true, nextState: { ...state, pieces: moveBall(state, target), actionResolution: resolution, threeTwoOpportunity: null, tracker }, event: { type: choiceRequired ? "THROUGH_BALL_RECOVERER_CHOICE_REQUIRED" : "THROUGH_BALL_AUTO_RECOVERY_PENDING", team: otherTeam(pending.team), metadata: { passerId: passer.id, target, cornerId, ...resolution.recovery } }, timeline: { groupId: bonus?.id || command.id, undoMode: bonus ? "atomic" : "step", allowNoop: false } };
}

export function selectThroughBallRecoverer(state, command) {
  const pending = state.actionResolution;
  const pieceId = String(command.payload?.pieceId || "");
  if (!pending || pending.kind !== "through-ball" || pending.status !== "awaiting-recoverer-choice") return { accepted: false, reason: "THROUGH_BALL_RECOVERER_NOT_SELECTING" };
  const valid = (pending.recovery?.defenderCandidates || []).some(candidate => String(candidate.pieceId) === pieceId);
  if (!valid) return { accepted: false, reason: "THROUGH_BALL_RECOVERER_INVALID" };
  return { accepted: true, nextState: { ...state, actionResolution: { ...pending, status: "awaiting-recovery-confirmation", recovery: { ...pending.recovery, selectedRecovererId: pieceId } } }, event: { type: "THROUGH_BALL_RECOVERER_SELECTED", team: otherTeam(pending.team), metadata: { pieceId, target: pending.target } }, timeline: { allowNoop: true } };
}

export function confirmThroughBallRecovery(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "through-ball" || pending.status !== "awaiting-recovery-confirmation") return { accepted: false, reason: "THROUGH_BALL_RECOVERY_NOT_PENDING" };
  const recoverer = state.pieces.find(piece => String(piece?.id) === String(pending.recovery?.selectedRecovererId || ""));
  const nextTeam = teamKeyForPiece(recoverer);
  if (!recoverer || !nextTeam) return { accepted: false, reason: "THROUGH_BALL_RECOVERER_INVALID" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const emptyTurn = createEmptyTrackerTurnState();
  const nextTurn = Math.min(tracker.settings.turns, Math.max(1, tracker.currentTurn + 1));
  const expired = expiredRollModifierOpportunities(state.rollModifierOpportunities, nextTurn);
  return { accepted: true, nextState: { ...state, pieces: moveBall(state, recoverer), movementStateByPieceId: {}, actionResolution: null, threeTwoOpportunity: null, actionContinuation: null, rollModifierOpportunities: pruneRollModifierOpportunities(state.rollModifierOpportunities, nextTurn), tracker: { ...state.tracker, startingTeam: nextTeam, currentTurn: nextTurn, usedActions: emptyTurn.usedActions, actionLog: emptyTurn.actionLog, personalActionsByPieceId: emptyTurn.personalActionsByPieceId, matchActionState: emptyTurn.matchActionState, turnPhase: "attack" } }, event: { type: "THROUGH_BALL_AUTO_RECOVERED", team: nextTeam, metadata: { passerId: pending.passerId, target: pending.target, recovererId: recoverer.id, startedTurn: nextTurn, expiredRollModifierOpportunities: expired } }, timeline: { allowNoop: false } };
}
