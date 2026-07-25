import { createBonusCardActionContinuation } from "../match/actionContinuation.mjs";
import { createRollEvent } from "../match/actionResolutionEngine.mjs";
import { PASS_CORNERS, bodyBlockingPassOrigin, cardStat, defensiveCellsForPiece, footForPass, pointForPassOrigin, pointForPassTarget, segmentIntersectsOpenRect, teamKeyForPiece } from "../rules/passEngine.mjs";
import { resolveDiceModifierStacks } from "../rules/ruleSets.mjs";
import { activateTrackerAction, createEmptyTrackerTurnState, isTeamActiveForTrackerPhase, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { consumeRollModifierOpportunity, grantRollModifierOpportunity, pruneRollModifierOpportunities } from "./rollModifierOpportunities.mjs";

const EPSILON = 1e-9;
const otherTeam = team => team === "blue" ? "red" : "blue";
const distance = (a, b) => Math.hypot((Number(a.x) + .5) - (Number(b.x) + .5), (Number(a.y) + .5) - (Number(b.y) + .5));
const hasBall = (state, piece) => state.pieces.some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
const moveBall = (state, target) => state.pieces.map(piece => piece.team === "BALL" ? { ...piece, x: Number(target.x), y: Number(target.y) } : piece);

function areaContains(piece, context, target) {
  return defensiveCellsForPiece(piece, context.gameplayCardsById[String(piece.cardId || "")], context.boardSettings)
    .some(cell => cell.x === Number(target.x) && cell.y === Number(target.y));
}

function loftedStat(context, passer) {
  const id = String(context.ruleSet.actions?.loftedThroughBall?.rollStatId || "");
  return { id, value: cardStat(context.gameplayCardsById[String(passer.cardId || "")], id) };
}

export function planLoftedThroughBall(state, context, passer, target, cornerId) {
  const team = teamKeyForPiece(passer);
  const enemy = otherTeam(team);
  const origin = pointForPassOrigin(passer, context.ruleSet.actions.loftedThroughBall.pathMode, cornerId);
  const endpoint = pointForPassTarget(target);
  const rules = context.ruleSet.actions.loftedThroughBall;
  const enemyPieces = state.pieces.filter(piece => teamKeyForPiece(piece) === enemy && !piece.inactive);
  const crossedDefenderIds = enemyPieces.filter(defender => defensiveCellsForPiece(defender, context.gameplayCardsById[String(defender.cardId || "")], context.boardSettings)
    .some(cell => segmentIntersectsOpenRect(origin, endpoint, cell))).map(defender => defender.id);
  const stat = loftedStat(context, passer);
  const foot = footForPass(origin, endpoint, passer, context.gameplayCardsById[String(passer.cardId || "")]?.preferredFoot);
  const areaDisadvantage = resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage", crossedDefenderIds.length);
  const footDisadvantage = foot?.dominant ? 0 : resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage");
  const rawModifier = areaDisadvantage + footDisadvantage;
  const modifierCap = Math.max(0, Number(context.ruleSet.diceModifiers?.stackCap) || 0);
  const modifier = Math.max(-modifierCap, Math.min(modifierCap, rawModifier));
  return {
    origin, endpoint, cornerId, target, distance: distance(passer, target), maxDistance: rules.maxDistance,
    difficultyThreshold: rules.difficultyThreshold, originBlocked: Boolean(bodyBlockingPassOrigin(origin, passer, state.pieces)),
    occupied: state.pieces.some(piece => piece?.team !== "BALL" && !piece.inactive && Number(piece.x) === Number(target.x) && Number(piece.y) === Number(target.y)),
    passerInDefensiveArea: enemyPieces.some(defender => areaContains(defender, context, passer)),
    targetInDefensiveArea: enemyPieces.some(defender => areaContains(defender, context, target)),
    crossedDefenderIds, disadvantageStacks: crossedDefenderIds.length,
    rollStatId: stat.id, rollStatValue: stat.value, foot,
    rollPreview: { modifier, rawModifier, modifierCap, capped: modifier !== rawModifier, totalBonus: Number(stat.value) + modifier, modifierSources: [
      { label: "Lofted Through", value: Number(stat.value) || 0, source: "card" },
      ...(footDisadvantage ? [{ label: "Disadvantage", value: footDisadvantage, source: "non-preferred-foot", detail: "non-preferred foot execution" }] : []),
      ...(areaDisadvantage ? [{ label: "Disadvantage", value: areaDisadvantage, source: "defensive-areas", detail: `${crossedDefenderIds.length} defensive area${crossedDefenderIds.length === 1 ? "" : "s"} crossed` }] : []),
    ] },
    legal: !Boolean(bodyBlockingPassOrigin(origin, passer, state.pieces)) && !state.pieces.some(piece => piece?.team !== "BALL" && !piece.inactive && Number(piece.x) === Number(target.x) && Number(piece.y) === Number(target.y))
      && !enemyPieces.some(defender => areaContains(defender, context, passer)) && !enemyPieces.some(defender => areaContains(defender, context, target)) && distance(passer, target) <= rules.maxDistance && Boolean(stat.id),
  };
}

export function startLoftedThroughBall(state, command) {
  const piece = state.pieces.find(item => String(item?.id) === String(command.payload?.pieceId)) || null;
  const team = teamKeyForPiece(piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!piece || !team || !hasBall(state, piece) || !isTeamActiveForTrackerPhase(tracker, team) || trackerActionStatusForTeam(tracker, team).exhausted) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_AVAILABLE" };
  return { accepted: true, nextState: { ...state, actionResolution: { id: String(command.payload?.loftedThroughBallId || command.id), kind: "lofted-through-ball", status: "targeting", passerId: piece.id, team } }, event: { type: "LOFTED_THROUGH_BALL_TARGETING_STARTED", team, metadata: { passerId: piece.id } }, timeline: { allowNoop: true } };
}

export function selectLoftedThroughBallTarget(state, context, command) {
  const pending = state.actionResolution;
  const target = { x: Number(command.payload?.x), y: Number(command.payload?.y) };
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  const cols = Number(context.boardSettings?.cols), rows = Number(context.boardSettings?.rows);
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "targeting" || !passer || !Number.isInteger(target.x) || !Number.isInteger(target.y) || target.x < 0 || target.y < 0 || target.x >= cols || target.y >= rows) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_TARGETING" };
  const cornerIds = context.ruleSet.actions.loftedThroughBall.pathMode === "center-to-center" ? [null] : PASS_CORNERS.map(corner => corner.id);
  const routes = cornerIds.map(cornerId => planLoftedThroughBall(state, context, passer, target, cornerId));
  return { accepted: true, nextState: { ...state, actionResolution: { ...pending, status: "route-selection", target, routes } }, event: { type: "LOFTED_THROUGH_BALL_TARGET_SELECTED", team: pending.team, metadata: { target } }, timeline: { allowNoop: true } };
}

export function cancelLoftedThroughBall(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "lofted-through-ball" || !["targeting", "route-selection"].includes(pending.status)) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_CANCELLABLE" };
  return { accepted: true, nextState: { ...state, actionResolution: null }, event: { type: "LOFTED_THROUGH_BALL_CANCELLED", team: pending.team }, timeline: { allowNoop: true } };
}

export function cancelLoftedThroughBallRoute(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "route-selection") return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_ROUTE_SELECTION" };
  const { routes, cornerId, ...targeting } = pending;
  return { accepted: true, nextState: { ...state, actionResolution: { ...targeting, status: "targeting" } }, event: { type: "LOFTED_THROUGH_BALL_ROUTE_CANCELLED", team: pending.team, metadata: { target: pending.target } }, timeline: { allowNoop: true } };
}

export function commitLoftedThroughBall(state, context, command) {
  const pending = state.actionResolution;
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  const cornerId = context.ruleSet.actions.loftedThroughBall.pathMode === "center-to-center" ? null : String(command.payload?.cornerId || "");
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "route-selection" || !passer) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_ROUTE_SELECTION" };
  const plan = planLoftedThroughBall(state, context, passer, pending.target, cornerId);
  if (!plan.legal) return { accepted: false, reason: plan.distance > plan.maxDistance ? "LOFTED_THROUGH_BALL_MAX_DISTANCE" : "LOFTED_THROUGH_BALL_ROUTE_BLOCKED" };
  const activation = activateTrackerAction(state.tracker, { type: "LOFTED_THROUGH_BALL", trackerMarker: "LT", pieceId: passer.id, team: pending.team, entryId: command.id, enforcePersonalActions: true });
  if (!activation.allowed) return { accepted: false, reason: activation.reason };
  const tracker = { ...state.tracker, actionLog: activation.actionLog, usedActions: activation.usedActions, personalActionsByPieceId: activation.personalActionsByPieceId, matchActionState: activation.matchActionState };
  const next = { ...pending, status: "awaiting-roll", cornerId, plan, pendingRoll: { requestId: `lofted_roll_${pending.id}`, actionId: pending.id, team: pending.team, dieType: 20, subjectId: passer.id, reactionIndex: 0 } };
  return { accepted: true, nextState: { ...state, tracker, actionResolution: next }, event: { type: "LOFTED_THROUGH_BALL_COMMITTED", team: pending.team, metadata: { passerId: passer.id, target: pending.target, cornerId, plan } }, timeline: { allowNoop: false } };
}

function successRace(state, context, team, passer, target) {
  const rank = requested => state.pieces.filter(piece => teamKeyForPiece(piece) === requested && !piece.inactive && piece.id !== passer.id).map(piece => ({ piece, distance: distance(piece, target), speed: Number(cardStat(context.gameplayCardsById[String(piece.cardId || "")], "stat:speed")) || 0 }));
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
  const defenders = state.pieces.filter(piece => teamKeyForPiece(piece) === otherTeam(team) && !piece.inactive).map(piece => ({
    piece,
    distance: pointToSegmentDistance(piece, plan.origin, plan.endpoint),
    speed: Number(cardStat(context.gameplayCardsById[String(piece.cardId || "")], "stat:speed")) || 0,
  }));
  const best = defenders.length ? Math.min(...defenders.map(item => item.distance)) : null;
  const nearest = defenders.filter(item => Math.abs(item.distance - best) < EPSILON);
  const speed = nearest.length ? Math.max(...nearest.map(item => item.speed)) : null;
  return nearest.filter(item => item.speed === speed);
}

export function submitLoftedThroughBallRoll(state, context, command) {
  const pending = state.actionResolution;
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  const raw = command.payload?.rollEvent;
  const event = createRollEvent({ id: raw?.id, requestId: raw?.requestId, actionId: raw?.actionId, team: raw?.team, dieType: raw?.dieType, natural: raw?.natural, source: raw?.source, createdAt: raw?.createdAt, subjectId: raw?.subjectId, reactionIndex: raw?.reactionIndex });
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "awaiting-roll" || !passer || !event || event.team !== pending.team || event.dieType !== 20 || event.requestId !== pending.pendingRoll?.requestId || event.actionId !== pending.id || event.subjectId !== passer.id) return { accepted: false, reason: "LOFTED_THROUGH_BALL_ROLL_INVALID" };
  const modifierType = command.payload?.bonusModifierType === "advantage" || command.payload?.bonusModifierType === "majorAdvantage" ? command.payload.bonusModifierType : null;
  const token = consumeRollModifierOpportunity(state.rollModifierOpportunities, { team: pending.team, turn: normalizeTrackerSnapshot(state.tracker).currentTurn, modifierType });
  if (!token.accepted) return { accepted: false, reason: "ROLL_MODIFIER_NOT_AVAILABLE" };
  const areaDisadvantage = resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage", pending.plan.disadvantageStacks);
  const footDisadvantage = pending.plan.foot?.dominant ? 0 : resolveDiceModifierStacks(context.ruleSet.diceModifiers, "disadvantage");
  const bonus = modifierType ? resolveDiceModifierStacks(context.ruleSet.diceModifiers, modifierType) : 0;
  const rawModifier = areaDisadvantage + footDisadvantage + bonus;
  const modifierCap = Math.max(0, Number(context.ruleSet.diceModifiers?.stackCap) || 0);
  const modifier = Math.max(-modifierCap, Math.min(modifierCap, rawModifier));
  const total = Number(event.natural) + Number(pending.plan.rollStatValue) + modifier;
  const naturalOne = event.natural === 1, naturalTwenty = event.natural === 20;
  const succeeds = naturalTwenty || (!naturalOne && (total > Number(pending.plan.difficultyThreshold) || (total === Number(pending.plan.difficultyThreshold) && context.ruleSet.actions.loftedThroughBall.equalRollOutcome === "lofted-succeeds")));
  const modifierSources = [
    { label: "Lofted Through", value: Number(pending.plan.rollStatValue) || 0, source: "card" },
    ...(footDisadvantage ? [{ label: "Disadvantage", value: footDisadvantage, source: "non-preferred-foot", detail: "non-preferred foot execution" }] : []),
    ...(areaDisadvantage ? [{ label: "Disadvantage", value: areaDisadvantage, source: "defensive-areas", detail: `${pending.plan.disadvantageStacks} defensive area${pending.plan.disadvantageStacks === 1 ? "" : "s"} crossed` }] : []),
    ...(bonus ? [{ label: modifierType === "majorAdvantage" ? "Major Advantage" : "Advantage", value: bonus, source: "bonus-roll-token", detail: "earned roll bonus" }] : []),
  ];
  const result = { natural: event.natural, total, totalBonus: Number(pending.plan.rollStatValue) + modifier, modifier, rawModifier, modifierCap, capped: modifier !== rawModifier, modifierSources, bonus, bonusModifierType: modifierType, succeeds, equal: total === Number(pending.plan.difficultyThreshold), naturalEffect: naturalOne ? context.ruleSet.actions.loftedThroughBall.naturalOneEffect : naturalTwenty ? context.ruleSet.actions.loftedThroughBall.naturalTwentyEffect : "none" };
  const dice = { ...state.dice, dieType: 20, blueResult: pending.team === "blue" ? event.natural : state.dice.blueResult, redResult: pending.team === "red" ? event.natural : state.dice.redResult, blueLastDieType: pending.team === "blue" ? 20 : state.dice.blueLastDieType, redLastDieType: pending.team === "red" ? 20 : state.dice.redLastDieType };
  return { accepted: true, nextState: { ...state, dice, rollModifierOpportunities: token.opportunities, actionResolution: { ...pending, status: "roll-resolved", lastRollEvent: event, result } }, event: { type: "LOFTED_THROUGH_BALL_ROLLED", team: pending.team, metadata: { passerId: passer.id, target: pending.target, rollEvent: event, result } }, timeline: { allowNoop: false } };
}

export function resolveLoftedThroughBall(state, context) {
  const pending = state.actionResolution;
  const passer = state.pieces.find(piece => String(piece?.id) === String(pending?.passerId)) || null;
  if (!pending || pending.kind !== "lofted-through-ball" || pending.status !== "roll-resolved" || !passer) return { accepted: false, reason: "LOFTED_THROUGH_BALL_NOT_RESOLVED" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const grantCurrentTurnToken = pending.result.naturalEffect === "current-turn-roll-advantage" || pending.result.naturalEffect === "current-turn-roll-major-advantage";
  const opportunities = grantCurrentTurnToken ? grantRollModifierOpportunity(state.rollModifierOpportunities, {
    id: `roll_bonus_lofted_${pending.id}`, team: pending.team,
    modifierType: pending.result.naturalEffect === "current-turn-roll-major-advantage" ? "majorAdvantage" : "advantage",
    availableFromTurn: tracker.currentTurn, expiresAfterTurn: tracker.currentTurn,
    source: "natural-20-lofted-through", sourceActionId: pending.id,
  }) : state.rollModifierOpportunities;
  if (pending.result.succeeds) {
    const recovery = successRace(state, context, pending.team, passer, pending.target);
    if (!recovery.defenderWins) {
      const continuation = pending.result.naturalEffect === "passer-bonus-action"
        ? createBonusCardActionContinuation({ id: `continuation_lofted_${pending.id}_${pending.lastRollEvent.id}`, team: pending.team, nextTurn: tracker.currentTurn, sourceEntryId: pending.id, resumePolicy: { type: "resume-phase", team: pending.team, nextTurn: tracker.currentTurn, phase: tracker.turnPhase }, origin: { actionType: "LOFTED_THROUGH_BALL", outcome: "SUCCESS", reason: "NATURAL_20", sourceEntryId: pending.id } }) : null;
      return { accepted: true, nextState: { ...state, pieces: moveBall(state, pending.target), actionResolution: null, actionContinuation: continuation, rollModifierOpportunities: opportunities, threeTwoOpportunity: { sourceAction: "LOFTED_THROUGH_BALL", team: pending.team, passerId: passer.id, target: pending.target, turn: tracker.currentTurn } }, event: { type: "LOFTED_THROUGH_BALL_COMPLETED", team: pending.team, metadata: { passerId: passer.id, target: pending.target, result: pending.result, ...recovery, bonusAction: continuation?.origin || null } }, timeline: { allowNoop: false } };
    }
    const candidates = recovery.defenderCandidates.map(item => ({ pieceId: item.piece.id, distance: item.distance, speed: item.speed }));
    return { accepted: true, nextState: { ...state, pieces: moveBall(state, pending.target), rollModifierOpportunities: opportunities, actionResolution: { ...pending, status: candidates.length > 1 ? "awaiting-recoverer-choice" : "awaiting-recovery-confirmation", recovery: { type: "success-race", ...recovery, defenderCandidates: candidates, selectedRecovererId: candidates.length === 1 ? candidates[0].pieceId : null } }, threeTwoOpportunity: null }, event: { type: candidates.length > 1 ? "LOFTED_THROUGH_BALL_RECOVERER_CHOICE_REQUIRED" : "LOFTED_THROUGH_BALL_AUTO_RECOVERY_PENDING", team: otherTeam(pending.team), metadata: { passerId: passer.id, target: pending.target, result: pending.result, ...recovery } }, timeline: { allowNoop: false } };
  }
  const candidates = failureCandidates(state, context, pending.team, pending.plan).map(item => ({ pieceId: item.piece.id, distance: item.distance, speed: item.speed }));
  return { accepted: true, nextState: { ...state, rollModifierOpportunities: opportunities, actionResolution: { ...pending, status: candidates.length > 1 ? "awaiting-recoverer-choice" : "awaiting-recovery-confirmation", recovery: { type: "failure", defenderCandidates: candidates, selectedRecovererId: candidates.length === 1 ? candidates[0].pieceId : null } }, threeTwoOpportunity: null }, event: { type: candidates.length > 1 ? "LOFTED_THROUGH_BALL_FAILURE_RECOVERER_CHOICE_REQUIRED" : "LOFTED_THROUGH_BALL_FAILURE_PENDING", team: otherTeam(pending.team), metadata: { passerId: passer.id, target: pending.target, result: pending.result, defenderCandidates: candidates } }, timeline: { allowNoop: false } };
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
  const base = { ...state, pieces: moveBall(state, recoverer), movementStateByPieceId: {}, actionResolution: null, threeTwoOpportunity: null };
  if (pending.recovery.type === "failure" && pending.result.natural === 1 && pending.result.naturalEffect === "recoverer-bonus-action") {
    const continuation = createBonusCardActionContinuation({ id: `continuation_lofted_${pending.id}_${pending.lastRollEvent.id}`, team, nextTurn, sourceEntryId: pending.id, origin: { actionType: "LOFTED_THROUGH_BALL", outcome: "FAILURE", reason: "NATURAL_1", sourceEntryId: pending.id } });
    return { accepted: true, nextState: { ...base, actionContinuation: continuation }, event: { type: "LOFTED_THROUGH_BALL_NATURAL_1", team, metadata: { recovererId: recoverer.id, bonusAction: continuation.origin } }, timeline: { allowNoop: false } };
  }
  if (pending.result?.naturalEffect === "passer-bonus-action") {
    const continuation = createBonusCardActionContinuation({ id: `continuation_lofted_${pending.id}_${pending.lastRollEvent.id}`, team: pending.team, nextTurn, sourceEntryId: pending.id, resumePolicy: { type: "advance-turn", team, nextTurn, phase: "attack" }, origin: { actionType: "LOFTED_THROUGH_BALL", outcome: pending.result.succeeds ? "SUCCESS_DEFENDED" : "FAILURE", reason: "NATURAL_20", sourceEntryId: pending.id } });
    return { accepted: true, nextState: { ...base, actionContinuation: continuation }, event: { type: "LOFTED_THROUGH_BALL_NATURAL_20", team: pending.team, metadata: { recovererId: recoverer.id, bonusAction: continuation.origin } }, timeline: { allowNoop: false } };
  }
  const empty = createEmptyTrackerTurnState();
  return { accepted: true, nextState: { ...base, actionContinuation: null, rollModifierOpportunities: pruneRollModifierOpportunities(state.rollModifierOpportunities, nextTurn), tracker: { ...state.tracker, startingTeam: team, currentTurn: nextTurn, usedActions: empty.usedActions, actionLog: empty.actionLog, personalActionsByPieceId: empty.personalActionsByPieceId, matchActionState: empty.matchActionState, turnPhase: "attack" } }, event: { type: "LOFTED_THROUGH_BALL_RECOVERED", team, metadata: { recovererId: recoverer.id, startedTurn: nextTurn, result: pending.result } }, timeline: { allowNoop: false } };
}
