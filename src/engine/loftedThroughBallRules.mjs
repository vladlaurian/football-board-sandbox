import { createBonusCardActionContinuation } from "../match/actionContinuation.mjs";
import { createRollEvent } from "../match/actionResolutionEngine.mjs";
import { PASS_CORNERS, bodyBlockingPassOrigin, cardStat, defensiveCellsForPiece, footForPass, insideOwnPenaltyArea, pointForPassOrigin, pointForPassTarget, segmentIntersectsOpenRect, teamKeyForPiece } from "../rules/passEngine.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { resolveDiceModifierStacks } from "../rules/ruleSets.mjs";
import { activateTrackerAction, createEmptyTrackerTurnState, isTeamActiveForTrackerPhase, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { consumeTeamModifierToken, effectiveCurrentTurnForRollOpportunity, expiredTeamModifierTokens, grantTeamModifierToken, pruneTeamModifierTokens } from "./rollModifierOpportunities.mjs";
import { naturalRollOutcome } from "./rollOutcomeEffects.mjs";
import { activeBonusActionFor, beginImplementedBonusAction, completeImplementedBonusAction } from "./bonusActionCapabilities.mjs";
import { sumAndCapRollModifier } from "../rules/rollModifierMath.mjs";
import { createSinglePlayerRollResultHold } from "../match/delayedResolution.mjs";
import { kickoffRestartAfterAction } from "./kickoffMomentRules.mjs";
import { restartSetupAfterAction } from "./restartSetupRules.mjs";
import { markingTurnResetFields } from "./markingRules.mjs";
import { computeOffsideWatch } from "./offsidePositionRules.mjs";

const BONUS_TOKEN_LABEL = Object.freeze({
  advantage: "Advantage",
  majorAdvantage: "Major Advantage",
  disadvantage: "Disadvantage",
  majorDisadvantage: "Major Disadvantage",
});

const EPSILON = 1e-9;
const otherTeam = team => team === "blue" ? "red" : "blue";
const distance = (a, b) => Math.hypot((Number(a.x) + .5) - (Number(b.x) + .5), (Number(a.y) + .5) - (Number(b.y) + .5));
const hasBall = (state, piece) => state.pieces.some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
const moveBall = (state, target) => state.pieces.map(piece => piece.team === "BALL" ? { ...piece, x: Number(target.x), y: Number(target.y) } : piece);

function areaContains(piece, context, target) {
  return defensiveCellsForPiece(piece, context.gameplayCardsById[String(piece.cardId || "")], context.boardSettings)
    .some(cell => cell.x === Number(target.x) && cell.y === Number(target.y));
}

function restartExceptionFor(state, passer) {
  const exception = state.goalkeeperRestartException;
  if (!exception || String(exception.goalkeeperId) !== String(passer?.id || "")) return null;
  return { team: exception.team, pieceId: exception.goalkeeperId };
}

function goalkeeperRestartExceptionAfterPass(state, passerId) {
  return state.goalkeeperRestartException?.goalkeeperId === String(passerId) ? null : state.goalkeeperRestartException;
}

function loftedStat(context, passer) {
  const id = String(context.ruleSet.actions?.loftedThroughBall?.rollStatId || "");
  return { id, value: cardStat(context.gameplayCardsById[String(passer.cardId || "")], id) };
}

// Goalkeeper Retains' restart exception (docs/SHOOTING_RULES.md): inside the
// executing goalkeeper's own penalty area, every body and defensive area is
// ignored for this one restart. Lofted Through Ball has no separate
// body-block mechanic (only the defensive-area checks below, an
// opponent-only concept already), so nothing else changes here.
export function planLoftedThroughBall(state, context, passer, target, cornerId, restartException = null) {
  const team = teamKeyForPiece(passer);
  const enemy = otherTeam(team);
  const exceptionActive = Boolean(restartException) && String(restartException.pieceId) === String(passer.id);
  const ignoredByException = cell => exceptionActive && insideOwnPenaltyArea(context.boardSettings, cell, restartException.team);
  const origin = pointForPassOrigin(passer, context.ruleSet.actions.loftedThroughBall.pathMode, cornerId);
  const endpoint = pointForPassTarget(target);
  const rules = context.ruleSet.actions.loftedThroughBall;
  // Free Kick's own Lofted Through Ball contract (docs/SHOOTING_RULES.md
  // section 7): its difficulty threshold is overridden and the number of
  // defensive areas crossed has no effect — every other legality rule
  // (origin/occupied/defensive-area body checks below) stays ordinary. The
  // "defensive areas crossed has no effect" exemption is Free-Kick-specific
  // (confirmed by the doc's own "all ordinary rules apply" for Corner) and
  // stays scoped to just those two types. The difficulty threshold override
  // itself, though, is a plain Rule-Set field any restart type can carry
  // (confirmed live with the user: Corner gets one too, defaulting to the
  // same 16 as the ordinary threshold so it changes nothing until edited) —
  // read generically off whichever restart type is actually executing,
  // rather than a hardcoded type list.
  const executingRestartType = state.restartSetup?.phase === "execution" && String(state.restartSetup?.executorId) === String(passer.id)
    ? state.restartSetup?.type : null;
  const freeKickException = executingRestartType === "freeKickDirect" || executingRestartType === "freeKickIndirect";
  const thresholdOverride = executingRestartType ? context.ruleSet.actions.restarts?.[executingRestartType]?.loftedThroughBallDifficultyOverride : undefined;
  const enemyPieces = state.pieces.filter(piece => teamKeyForPiece(piece) === enemy && !piece.inactive && !isBenchReservePiece(piece));
  const crossedDefenderIds = enemyPieces.filter(defender => defensiveCellsForPiece(defender, context.gameplayCardsById[String(defender.cardId || "")], context.boardSettings)
    .filter(cell => !ignoredByException(cell))
    .some(cell => segmentIntersectsOpenRect(origin, endpoint, cell))).map(defender => defender.id);
  const stat = loftedStat(context, passer);
  const foot = footForPass(origin, endpoint, passer, context.gameplayCardsById[String(passer.cardId || "")]?.preferredFoot);
  const areaDisadvantage = freeKickException ? 0 : resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage", crossedDefenderIds.length);
  const footDisadvantage = foot?.dominant ? 0 : resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage");
  const difficultyThreshold = thresholdOverride !== undefined
    ? Math.max(1, Math.floor(Number(thresholdOverride)) || rules.difficultyThreshold)
    : rules.difficultyThreshold;
  const modifierCap = Math.max(0, Number(context.ruleSet.diceModifiers?.stackCap) || 0);
  // Only the situational sources are ever capped — never the passer's own
  // Lofted Through stat (confirmed live with the user; see
  // rollModifierMath.mjs).
  const situationalSources = [
    ...(footDisadvantage ? [{ label: "Disadvantage", value: footDisadvantage, source: "non-preferred-foot", detail: "non-preferred foot execution" }] : []),
    ...(areaDisadvantage ? [{ label: "Disadvantage", value: areaDisadvantage, source: "defensive-areas", detail: `${crossedDefenderIds.length} defensive area${crossedDefenderIds.length === 1 ? "" : "s"} crossed` }] : []),
  ];
  const baseStat = Number(stat.value) || 0;
  const situational = sumAndCapRollModifier(situationalSources, modifierCap);
  const rollPreview = {
    modifier: baseStat + situational.modifier,
    rawModifier: baseStat + situational.rawModifier,
    modifierCap: situational.modifierCap,
    capped: situational.capped,
    modifierSources: [{ label: "Lofted Through", value: baseStat, source: "card" }, ...situationalSources],
  };
  const rawOriginBlocker = bodyBlockingPassOrigin(origin, passer, state.pieces);
  const originBlocked = Boolean(rawOriginBlocker) && !ignoredByException(rawOriginBlocker);
  const occupied = state.pieces.some(piece => piece?.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece) && Number(piece.x) === Number(target.x) && Number(piece.y) === Number(target.y));
  const passerInDefensiveArea = enemyPieces.some(defender => areaContains(defender, context, passer)) && !ignoredByException(passer);
  const targetInDefensiveArea = enemyPieces.some(defender => areaContains(defender, context, target)) && !ignoredByException(target);
  return {
    origin, endpoint, cornerId, target, distance: distance(passer, target), maxDistance: rules.maxDistance,
    difficultyThreshold, originBlocked,
    occupied,
    passerInDefensiveArea,
    targetInDefensiveArea,
    crossedDefenderIds, disadvantageStacks: crossedDefenderIds.length,
    rollStatId: stat.id, rollStatValue: stat.value, foot,
    rollPreview,
    legal: !originBlocked && !occupied && !passerInDefensiveArea && !targetInDefensiveArea && distance(passer, target) <= rules.maxDistance && Boolean(stat.id),
  };
}

export function startLoftedThroughBall(state, command) {
  const piece = state.pieces.find(item => String(item?.id) === String(command.payload?.pieceId)) || null;
  const team = teamKeyForPiece(piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!piece || !team || !hasBall(state, piece) || isBenchReservePiece(piece)) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_AVAILABLE" };
  // A pending kick-off restart's entitled piece must act first (any pass
  // type is legal there since v20.56.42) — see passStartRules.mjs's
  // matching guard.
  if (state.kickoffRestart && String(state.kickoffRestart.pieceId) !== String(piece.id)) return { accepted: false, reason: "KICKOFF_RESTART_WRONG_PLAYER" };
  const bonus = beginImplementedBonusAction(state, { team, pieceId: piece.id, type: "LOFTED_THROUGH_BALL" });
  if (!bonus && (!isTeamActiveForTrackerPhase(tracker, team) || trackerActionStatusForTeam(tracker, team).exhausted)) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_AVAILABLE" };
  return { accepted: true, nextState: { ...state, actionContinuation: bonus || state.actionContinuation, actionResolution: { id: String(command.payload?.loftedThroughBallId || command.id), kind: "lofted-through-ball", status: "targeting", passerId: piece.id, team, bonusContinuationId: bonus?.id || null } }, event: { type: bonus ? "BONUS_LOFTED_THROUGH_BALL_TARGETING_STARTED" : "LOFTED_THROUGH_BALL_TARGETING_STARTED", team, metadata: { passerId: piece.id, continuationId: bonus?.id || null } }, timeline: { groupId: bonus?.id || null, undoMode: bonus ? "atomic" : "step", allowNoop: true } };
}

export function selectLoftedThroughBallTarget(state, context, command) {
  const pending = state.actionResolution;
  const target = { x: Number(command.payload?.x), y: Number(command.payload?.y) };
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  const cols = Number(context.boardSettings?.cols), rows = Number(context.boardSettings?.rows);
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "targeting" || !passer || !Number.isInteger(target.x) || !Number.isInteger(target.y) || target.x < 0 || target.y < 0 || target.x >= cols || target.y >= rows) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_TARGETING" };
  const cornerIds = context.ruleSet.actions.loftedThroughBall.pathMode === "center-to-center" ? [null] : PASS_CORNERS.map(corner => corner.id);
  const restartException = restartExceptionFor(state, passer);
  const routes = cornerIds.map(cornerId => planLoftedThroughBall(state, context, passer, target, cornerId, restartException));
  return { accepted: true, nextState: { ...state, actionResolution: { ...pending, status: "route-selection", target, routes } }, event: { type: "LOFTED_THROUGH_BALL_TARGET_SELECTED", team: pending.team, metadata: { target } }, timeline: { allowNoop: true } };
}

export function cancelLoftedThroughBall(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "lofted-through-ball" || !["targeting", "route-selection"].includes(pending.status)) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_CANCELLABLE" };
  const continuation = pending.bonusContinuationId ? activeBonusActionFor(state, { team: pending.team, pieceId: pending.passerId, type: "LOFTED_THROUGH_BALL", continuationId: pending.bonusContinuationId }) : null;
  const reset = continuation ? { ...continuation, status: "ready", actionType: null, pieceId: null, movementStarted: false } : state.actionContinuation;
  return { accepted: true, nextState: { ...state, actionResolution: null, actionContinuation: reset }, event: { type: "LOFTED_THROUGH_BALL_CANCELLED", team: pending.team }, timeline: { groupId: pending.bonusContinuationId || null, undoMode: pending.bonusContinuationId ? "atomic" : "step", allowNoop: true } };
}

export function commitLoftedThroughBall(state, context, command) {
  const pending = state.actionResolution;
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  const cornerId = context.ruleSet.actions.loftedThroughBall.pathMode === "center-to-center" ? null : String(command.payload?.cornerId || "");
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "route-selection" || !passer) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_ROUTE_SELECTION" };
  const plan = planLoftedThroughBall(state, context, passer, pending.target, cornerId, restartExceptionFor(state, passer));
  if (!plan.legal) return { accepted: false, reason: plan.distance > plan.maxDistance ? "LOFTED_THROUGH_BALL_MAX_DISTANCE" : "LOFTED_THROUGH_BALL_ROUTE_BLOCKED" };
  const bonus = pending.bonusContinuationId ? activeBonusActionFor(state, { team: pending.team, pieceId: passer.id, type: "LOFTED_THROUGH_BALL", continuationId: pending.bonusContinuationId }) : null;
  if (pending.bonusContinuationId && !bonus) return { accepted: false, reason: "BONUS_LOFTED_THROUGH_BALL_NOT_ACTIVE" };
  const activation = bonus ? { allowed: true, actionLog: state.tracker.actionLog, usedActions: state.tracker.usedActions, personalActionsByPieceId: state.tracker.personalActionsByPieceId, matchActionState: state.tracker.matchActionState } : activateTrackerAction(state.tracker, { type: "LOFTED_THROUGH_BALL", trackerMarker: "LT", pieceId: passer.id, team: pending.team, entryId: command.id, enforcePersonalActions: true });
  if (!activation.allowed) return { accepted: false, reason: activation.reason };
  const tracker = { ...state.tracker, actionLog: activation.actionLog, usedActions: activation.usedActions, personalActionsByPieceId: activation.personalActionsByPieceId, matchActionState: activation.matchActionState };
  const next = { ...pending, status: "awaiting-roll", cornerId, plan, pendingRoll: { requestId: `lofted_roll_${pending.id}`, actionId: pending.id, team: pending.team, dieType: 20, subjectId: passer.id, reactionIndex: 0, context: { actionType: "LOFTED_THROUGH_BALL" } } };
  return { accepted: true, nextState: { ...state, tracker, actionResolution: next, kickoffRestart: kickoffRestartAfterAction(state, passer.id), restartSetup: restartSetupAfterAction(state, passer.id) }, event: { type: "LOFTED_THROUGH_BALL_COMMITTED", team: pending.team, metadata: { passerId: passer.id, target: pending.target, cornerId, plan, continuationId: bonus?.id || null } }, timeline: { groupId: bonus?.id || command.id, undoMode: bonus ? "atomic" : "step", allowNoop: false } };
}

function successRace(state, context, team, passer, target) {
  const rank = requested => state.pieces.filter(piece => teamKeyForPiece(piece) === requested && !piece.inactive && !isBenchReservePiece(piece) && piece.id !== passer.id).map(piece => ({ piece, distance: distance(piece, target), speed: Number(cardStat(context.gameplayCardsById[String(piece.cardId || "")], "stat:speed")) || 0 }));
  const attackers = rank(team), defenders = rank(otherTeam(team));
  const best = list => list.length ? Math.min(...list.map(item => item.distance)) : null;
  const attackDistance = best(attackers), defenseDistance = best(defenders);
  const attackAt = attackers.filter(item => Math.abs(item.distance - attackDistance) < EPSILON), defenseAt = defenders.filter(item => Math.abs(item.distance - defenseDistance) < EPSILON);
  const attackSpeed = attackAt.length ? Math.max(...attackAt.map(item => item.speed)) : null, defenseSpeed = defenseAt.length ? Math.max(...defenseAt.map(item => item.speed)) : null;
  const defenderWins = defenseDistance !== null && (attackDistance === null || defenseDistance < attackDistance - EPSILON || (Math.abs(defenseDistance - attackDistance) < EPSILON && defenseSpeed >= attackSpeed));
  return { attackDistance, defenseDistance, attackSpeed, defenseSpeed, defenderWins, defenderCandidates: defenderWins ? defenseAt.filter(item => item.speed === defenseSpeed) : [] };
}

function pointToSegmentDistance(point, start, end) {
  const px = Number(point.x) + .5, py = Number(point.y) + .5;
  const dx = Number(end.x) - Number(start.x), dy = Number(end.y) - Number(start.y);
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - Number(start.x)) * dx + (py - Number(start.y)) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (Number(start.x) + t * dx), py - (Number(start.y) + t * dy));
}

function failureCandidates(state, context, team, plan) {
  const defenders = state.pieces.filter(piece => teamKeyForPiece(piece) === otherTeam(team) && !piece.inactive && !isBenchReservePiece(piece)).map(piece => ({
    piece,
    distance: pointToSegmentDistance(piece, plan.origin, plan.endpoint),
    speed: Number(cardStat(context.gameplayCardsById[String(piece.cardId || "")], "stat:speed")) || 0,
  }));
  const best = defenders.length ? Math.min(...defenders.map(item => item.distance)) : null;
  const nearest = defenders.filter(item => Math.abs(item.distance - best) < EPSILON);
  const speed = nearest.length ? Math.max(...nearest.map(item => item.speed)) : null;
  return nearest.filter(item => item.speed === speed);
}

// Roll only: consumes the RollEvent and any selected Tracker token, writes
// canonical state.dice, and opens the shared 1000 ms result hold — the same
// contract Pass and Shot already use. It calculates no succeed/fail result.
export function submitLoftedThroughBallRoll(state, context, command) {
  const pending = state.actionResolution;
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  const raw = command.payload?.rollEvent;
  const event = createRollEvent({ id: raw?.id, requestId: raw?.requestId, actionId: raw?.actionId, team: raw?.team, dieType: raw?.dieType, natural: raw?.natural, source: raw?.source, createdAt: raw?.createdAt, subjectId: raw?.subjectId, reactionIndex: raw?.reactionIndex });
  const createdAt = Number(command.payload?.createdAt);
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "awaiting-roll" || !passer || !event || event.team !== pending.team || event.dieType !== 20 || event.requestId !== pending.pendingRoll?.requestId || event.actionId !== pending.id || event.subjectId !== passer.id) return { accepted: false, reason: "LOFTED_THROUGH_BALL_ROLL_INVALID" };
  if (!Number.isFinite(createdAt) || createdAt < 0) return { accepted: false, reason: "LOFTED_THROUGH_BALL_ROLL_TIME_INVALID" };
  const modifierType = ["advantage", "majorAdvantage", "disadvantage", "majorDisadvantage"].includes(command.payload?.bonusModifierType) ? command.payload.bonusModifierType : null;
  const token = consumeTeamModifierToken(state.teamModifierTokens, { team: pending.team, turn: normalizeTrackerSnapshot(state.tracker).currentTurn, modifierType });
  if (!token.accepted) return { accepted: false, reason: "ROLL_MODIFIER_NOT_AVAILABLE" };
  const resolutionTransaction = { id: `resolution_${pending.id}_${command.id}`, source: "roll-resolution", undoMode: "atomic" };
  const delayedResolution = createSinglePlayerRollResultHold({
    kind: "lofted-through-ball",
    actionId: pending.id,
    team: pending.team,
    value: event.natural,
    createdAt,
    payload: { rollEvent: event, undoTransaction: resolutionTransaction },
  });
  const dice = { ...state.dice, dieType: 20, blueResult: pending.team === "blue" ? event.natural : state.dice.blueResult, redResult: pending.team === "red" ? event.natural : state.dice.redResult, blueLastDieType: pending.team === "blue" ? 20 : state.dice.blueLastDieType, redLastDieType: pending.team === "red" ? 20 : state.dice.redLastDieType };
  return {
    accepted: true,
    nextState: {
      ...state,
      dice,
      teamModifierTokens: token.tokens,
      actionResolution: { ...pending, status: "awaiting-lofted-resolution", lastRollEvent: event, bonusModifierType: modifierType, resolutionTransaction },
    },
    event: {
      type: "LOFTED_THROUGH_BALL_ROLLED",
      team: pending.team,
      metadata: {
        passerId: passer.id, target: pending.target, rollEvent: event, rollSource: event.source,
        chosenResult: event.source === "CHOSEN" ? event.natural : null,
        delayedResolution, undoTransaction: resolutionTransaction,
        bonusModifier: token.consumed ? { type: token.consumed.modifierType, source: token.consumed.source, tokenId: token.consumed.id } : null,
      },
    },
    timeline: { groupId: pending.bonusContinuationId || null, undoMode: pending.bonusContinuationId ? "atomic" : "step", allowNoop: true },
  };
}

// LOFTED_THROUGH_BALL_RESOLUTION_DUE: performs the deterministic succeed/fail
// calculation only after the roll and its hold have already been persisted,
// exactly mirroring Shot's SHOT_RESOLUTION_DUE.
export function resolveLoftedThroughBallRoll(state, context, command) {
  const pending = state.actionResolution;
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "awaiting-lofted-resolution" || !passer) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_RESOLVING" };
  const rollEventId = String(command.payload?.rollEventId || "").trim();
  if (String(command.payload?.loftedThroughBallId || "") !== String(pending.id) || !rollEventId || rollEventId !== String(pending.lastRollEvent?.id || "")) return { accepted: false, reason: "LOFTED_THROUGH_BALL_RESOLUTION_STALE" };
  const event = pending.lastRollEvent;
  const modifierType = pending.bonusModifierType;
  const areaDisadvantage = resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage", pending.plan.disadvantageStacks);
  const footDisadvantage = pending.plan.foot?.dominant ? 0 : resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage");
  const bonus = modifierType ? resolveDiceModifierStacks(context.ruleSet.diceModifiers, modifierType) : 0;
  const modifierCap = Math.max(0, Number(context.ruleSet.diceModifiers?.stackCap) || 0);
  // Only the situational sources are ever capped — never the passer's own
  // Lofted Through stat (confirmed live with the user; see
  // rollModifierMath.mjs).
  const situationalSources = [
    ...(footDisadvantage ? [{ label: "Disadvantage", value: footDisadvantage, source: "non-preferred-foot", detail: "non-preferred foot execution" }] : []),
    ...(areaDisadvantage ? [{ label: "Disadvantage", value: areaDisadvantage, source: "defensive-areas", detail: `${pending.plan.disadvantageStacks} defensive area${pending.plan.disadvantageStacks === 1 ? "" : "s"} crossed` }] : []),
    ...(bonus ? [{ label: BONUS_TOKEN_LABEL[modifierType] || "Modifier", value: bonus, source: "team-modifier-token", detail: "earned team modifier" }] : []),
  ];
  const baseStat = Number(pending.plan.rollStatValue) || 0;
  const modifierSources = [{ label: "Lofted Through", value: baseStat, source: "card" }, ...situationalSources];
  const situational = sumAndCapRollModifier(situationalSources, modifierCap);
  const modifier = baseStat + situational.modifier;
  const rawModifier = baseStat + situational.rawModifier;
  const capped = situational.capped;
  const total = Number(event.natural) + modifier;
  const naturalOne = event.natural === 1, naturalTwenty = event.natural === 20;
  const succeeds = naturalTwenty || (!naturalOne && (total > Number(pending.plan.difficultyThreshold) || (total === Number(pending.plan.difficultyThreshold) && context.ruleSet.actions.loftedThroughBall.equalRollOutcome === "lofted-succeeds")));
  const naturalEffect = naturalOne ? context.ruleSet.actions.loftedThroughBall.naturalOneEffect : naturalTwenty ? context.ruleSet.actions.loftedThroughBall.naturalTwentyEffect : "none";
  const result = { natural: event.natural, total, modifier, rawModifier, modifierCap, capped, modifierSources, bonus, bonusModifierType: modifierType, succeeds, equal: total === Number(pending.plan.difficultyThreshold), naturalEffect, naturalOutcome: naturalRollOutcome({ mechanic: "lofted-through-ball", natural: event.natural, effect: naturalEffect, team: pending.team }) };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: { ...pending, status: "roll-resolved", result } },
    event: { type: "LOFTED_THROUGH_BALL_RESOLVED", team: pending.team, metadata: { passerId: passer.id, target: pending.target, result, undoTransaction: pending.resolutionTransaction || null } },
    timeline: { groupId: pending.bonusContinuationId || null, undoMode: pending.bonusContinuationId ? "atomic" : "step", allowNoop: false },
  };
}

export function resolveLoftedThroughBall(state, context) {
  const pending = state.actionResolution;
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "roll-resolved" || !passer) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_RESOLVED" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  // A Natural 20 earned while resolving an existing BA replaces that BA, but
  // it must inherit its numbered-turn resume policy.  Otherwise the child BA
  // would resume the current phase and a token earned "this turn" could be
  // stranded/expired at the wrong boundary.
  const parentBonus = pending.bonusContinuationId
    ? activeBonusActionFor(state, { team: pending.team, pieceId: passer.id, type: "LOFTED_THROUGH_BALL", continuationId: pending.bonusContinuationId })
    : null;
  const grantCurrentTurnToken = pending.result.naturalEffect === "current-turn-roll-advantage" || pending.result.naturalEffect === "current-turn-roll-major-advantage";
  const tokenTurn = effectiveCurrentTurnForRollOpportunity(state, tracker.currentTurn);
  const grant = grantCurrentTurnToken ? grantTeamModifierToken(state.teamModifierTokens, {
    id: `roll_bonus_lofted_${pending.id}`, team: pending.team,
    modifierType: pending.result.naturalEffect === "current-turn-roll-major-advantage" ? "majorAdvantage" : "advantage",
    availableFromTurn: tokenTurn, expiresAfterTurn: tokenTurn,
    source: "natural-20-lofted-through", sourceActionId: pending.id,
  }, { capacity: context.teamModifierCapacity }) : null;
  const tokens = grant ? grant.tokens : state.teamModifierTokens;
  if (pending.result.succeeds) {
    const recovery = successRace(state, context, pending.team, passer, pending.target);
    if (!recovery.defenderWins) {
      const completedBonus = parentBonus
        ? completeImplementedBonusAction(state, { team: pending.team, pieceId: passer.id, type: "LOFTED_THROUGH_BALL", continuationId: parentBonus.id })
        : null;
      const continuation = pending.result.naturalEffect === "passer-bonus-action"
        ? createBonusCardActionContinuation({ id: `continuation_lofted_${pending.id}_${pending.lastRollEvent.id}`, team: pending.team, nextTurn: parentBonus?.resumePolicy?.nextTurn || tracker.currentTurn, sourceEntryId: pending.id, resumePolicy: parentBonus?.resumePolicy || { type: "resume-phase", team: pending.team, nextTurn: tracker.currentTurn, phase: tracker.turnPhase }, origin: { actionType: "LOFTED_THROUGH_BALL", outcome: "SUCCESS", reason: "NATURAL_20", sourceEntryId: pending.id, parentContinuationId: parentBonus?.id || null } }) : null;
      // Offside Build 2 (docs/GAMEPLAY_RULES_FOUNDATIONS.md section 6) — see
      // the matching note in throughBallRules.mjs. Computed against the
      // pre-move `state` (the ball is still at the passer's own cell here).
      const offsideWatch = computeOffsideWatch(state, context, { attackingTeam: pending.team, passerId: passer.id });
      return { accepted: true, nextState: { ...state, pieces: moveBall(state, pending.target), actionResolution: null, actionContinuation: continuation || completedBonus || null, teamModifierTokens: tokens, threeTwoOpportunity: { sourceAction: "LOFTED_THROUGH_BALL", team: pending.team, passerId: passer.id, target: pending.target, turn: tracker.currentTurn }, goalkeeperRestartException: goalkeeperRestartExceptionAfterPass(state, passer.id), offsideWatch }, event: { type: "LOFTED_THROUGH_BALL_COMPLETED", team: pending.team, metadata: { passerId: passer.id, target: pending.target, result: pending.result, ...recovery, bonusAction: continuation?.origin || null, modifierTokenTransition: grant ? { kind: grant.kind || "rejected", granted: grant.granted, cancelled: grant.cancelled, reason: grant.reason || null } : null } }, timeline: { groupId: pending.bonusContinuationId || pending.id, undoMode: pending.bonusContinuationId ? "atomic" : "step", allowNoop: false } };
    }
    const candidates = recovery.defenderCandidates.map(item => ({ pieceId: item.piece.id, distance: item.distance, speed: item.speed }));
    return { accepted: true, nextState: { ...state, pieces: moveBall(state, pending.target), teamModifierTokens: tokens, actionResolution: { ...pending, status: candidates.length > 1 ? "awaiting-recoverer-choice" : "awaiting-recovery-confirmation", recovery: { type: "success-race", ...recovery, defenderCandidates: candidates, selectedRecovererId: candidates.length === 1 ? candidates[0].pieceId : null } }, threeTwoOpportunity: null }, event: { type: candidates.length > 1 ? "LOFTED_THROUGH_BALL_RECOVERER_CHOICE_REQUIRED" : "LOFTED_THROUGH_BALL_AUTO_RECOVERY_PENDING", team: otherTeam(pending.team), metadata: { passerId: passer.id, target: pending.target, result: pending.result, ...recovery } }, timeline: { allowNoop: false } };
  }
  const candidates = failureCandidates(state, context, pending.team, pending.plan).map(item => ({ pieceId: item.piece.id, distance: item.distance, speed: item.speed }));
  return { accepted: true, nextState: { ...state, teamModifierTokens: tokens, actionResolution: { ...pending, status: candidates.length > 1 ? "awaiting-recoverer-choice" : "awaiting-recovery-confirmation", recovery: { type: "failure", defenderCandidates: candidates, selectedRecovererId: candidates.length === 1 ? candidates[0].pieceId : null } }, threeTwoOpportunity: null }, event: { type: candidates.length > 1 ? "LOFTED_THROUGH_BALL_FAILURE_RECOVERER_CHOICE_REQUIRED" : "LOFTED_THROUGH_BALL_FAILURE_PENDING", team: otherTeam(pending.team), metadata: { passerId: passer.id, target: pending.target, result: pending.result, defenderCandidates: candidates } }, timeline: { allowNoop: false } };
}

export function selectLoftedThroughBallRecoverer(state, command) {
  const pending = state.actionResolution, pieceId = String(command.payload?.pieceId || "");
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "awaiting-recoverer-choice" || !(pending.recovery?.defenderCandidates || []).some(item => item.pieceId === pieceId)) return { accepted: false, reason: "LOFTED_THROUGH_BALL_RECOVERER_INVALID" };
  return { accepted: true, nextState: { ...state, actionResolution: { ...pending, status: "awaiting-recovery-confirmation", recovery: { ...pending.recovery, selectedRecovererId: pieceId } } }, event: { type: "LOFTED_THROUGH_BALL_RECOVERER_SELECTED", team: otherTeam(pending.team), metadata: { pieceId } }, timeline: { allowNoop: true } };
}

export function confirmLoftedThroughBallRecovery(state) {
  const pending = state.actionResolution;
  const recoverer = state.pieces.find(piece => String(piece?.id) === String(pending?.recovery?.selectedRecovererId || "")) || null;
  const team = teamKeyForPiece(recoverer), tracker = normalizeTrackerSnapshot(state.tracker);
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "awaiting-recovery-confirmation" || !recoverer || !team) return { accepted: false, reason: "LOFTED_THROUGH_BALL_RECOVERER_INVALID" };
  const nextTurn = Math.min(tracker.settings.turns, Math.max(1, tracker.currentTurn + 1));
  const base = { ...state, pieces: moveBall(state, recoverer), movementStateByPieceId: {}, actionResolution: null, threeTwoOpportunity: null, goalkeeperRestartException: goalkeeperRestartExceptionAfterPass(state, pending.passerId) };
  if (pending.recovery.type === "failure" && pending.result.natural === 1 && pending.result.naturalEffect === "recoverer-bonus-action") {
    const continuation = createBonusCardActionContinuation({ id: `continuation_lofted_${pending.id}_${pending.lastRollEvent.id}`, team, nextTurn, sourceEntryId: pending.id, origin: { actionType: "LOFTED_THROUGH_BALL", outcome: "FAILURE", reason: "NATURAL_1", sourceEntryId: pending.id } });
    return { accepted: true, nextState: { ...base, actionContinuation: continuation }, event: { type: "LOFTED_THROUGH_BALL_NATURAL_1", team, metadata: { recovererId: recoverer.id, bonusAction: continuation.origin } }, timeline: { allowNoop: false } };
  }
  if (pending.result?.naturalEffect === "passer-bonus-action") {
    const continuation = createBonusCardActionContinuation({ id: `continuation_lofted_${pending.id}_${pending.lastRollEvent.id}`, team: pending.team, nextTurn, sourceEntryId: pending.id, resumePolicy: { type: "advance-turn", team, nextTurn, phase: "attack" }, origin: { actionType: "LOFTED_THROUGH_BALL", outcome: pending.result.succeeds ? "SUCCESS_DEFENDED" : "FAILURE", reason: "NATURAL_20", sourceEntryId: pending.id } });
    return { accepted: true, nextState: { ...base, actionContinuation: continuation }, event: { type: "LOFTED_THROUGH_BALL_NATURAL_20", team: pending.team, metadata: { recovererId: recoverer.id, bonusAction: continuation.origin } }, timeline: { allowNoop: false } };
  }
  const empty = createEmptyTrackerTurnState();
  const expiredRollBonuses = expiredTeamModifierTokens(state.teamModifierTokens, nextTurn);
  return { accepted: true, nextState: { ...base, actionContinuation: null, teamModifierTokens: pruneTeamModifierTokens(state.teamModifierTokens, nextTurn), ...markingTurnResetFields(), tracker: { ...state.tracker, startingTeam: team, currentTurn: nextTurn, usedActions: empty.usedActions, actionLog: empty.actionLog, personalActionsByPieceId: empty.personalActionsByPieceId, matchActionState: empty.matchActionState, turnPhase: "attack" } }, event: { type: "LOFTED_THROUGH_BALL_RECOVERED", team, metadata: { recovererId: recoverer.id, startedTurn: nextTurn, result: pending.result, expiredRollBonuses: expiredRollBonuses.map(item => ({ id: item.id, team: item.team, modifierType: item.modifierType })) } }, timeline: { allowNoop: false } };
}
