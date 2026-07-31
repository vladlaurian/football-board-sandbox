import { createRollEvent, consumeActionEvent } from "../match/actionResolutionEngine.mjs";
import {
  PASS_CORNERS,
  bodyBlockingPassOrigin,
  cardStat,
  defensiveCellsForPiece,
  footForPass,
  pointForPassOrigin,
  segmentEntryT,
  segmentIntersectsOpenRect,
  teamKeyForPiece,
} from "../rules/passEngine.mjs";
import { resolveDiceModifierStacks } from "../rules/ruleSets.mjs";
import { consumeTeamModifierToken } from "./rollModifierOpportunities.mjs";
import { activateTrackerAction, isTeamActiveForTrackerPhase, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

const oppositeTeam = team => team === "blue" ? "red" : "blue";

function pieceById(state, pieceId) {
  return (state?.pieces || []).find(piece => String(piece?.id) === String(pieceId)) || null;
}

function ballIsWith(state, piece) {
  return Boolean(piece) && (state?.pieces || []).some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
}

function penaltyAreaContains(settings, piece) {
  const top = Math.floor((Number(settings.rows) - Number(settings.boxWidth)) / 2);
  return Number(piece.y) >= top && Number(piece.y) < top + Number(settings.boxWidth)
    && (Number(piece.x) < Number(settings.boxDepth) || Number(piece.x) >= Number(settings.cols) - Number(settings.boxDepth));
}

function goalTargetPoint(settings, target) {
  const goalTop = Math.floor((Number(settings.rows) - Number(settings.goalWidth)) / 2);
  const depth = Number(target.depth);
  const row = Number(target.y);
  const x = target.side === "right"
    ? Number(settings.cols) + depth
    : -Number(settings.goalDepth) + depth;
  return { x: x + 0.5, y: goalTop + row + 0.5 };
}

export function goalCellsForTeam(settings, team) {
  const side = team === "blue" ? "right" : "left";
  return Array.from({ length: Math.max(1, Number(settings.goalDepth) || 1) }, (_, depth) =>
    Array.from({ length: Math.max(1, Number(settings.goalWidth) || 1) }, (_, y) => ({ side, depth, y })),
  ).flat();
}

function isLegalGoalTarget(settings, target, team) {
  if (!target || (target.side !== "left" && target.side !== "right")) return false;
  const expectedSide = team === "blue" ? "right" : "left";
  return target.side === expectedSide
    && Number.isInteger(Number(target.depth)) && Number(target.depth) >= 0 && Number(target.depth) < Number(settings.goalDepth)
    && Number.isInteger(Number(target.y)) && Number(target.y) >= 0 && Number(target.y) < Number(settings.goalWidth);
}

function executionModifierSources(ruleSet, foot, defensiveAreaCrossings, band) {
  const sources = [];
  if (!foot.dominant) {
    sources.push({ type: "majorDisadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "majorDisadvantage"), reason: `Non-dominant ${foot.foot || "foot"}` });
  }
  defensiveAreaCrossings.forEach(crossing => {
    sources.push({ type: "disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "disadvantage"), reason: `Defensive area: ${crossing.defenderId}` });
  });
  if (band === "distant-long-shot") {
    const type = ruleSet.actions.shot.distantBandModifier;
    sources.push({ type, value: resolveDiceModifierStacks(ruleSet.diceModifiers, type), reason: "Distant Long Shot band" });
  }
  return sources;
}

// The selected origin changes only physical route truth. Regulatory range is
// always measured centre-to-centre from the shooter cell to the goal cell.
export function buildShotRoutePlan({ state, context, shooter, target, cornerId }) {
  const settings = context.boardSettings;
  const ruleSet = context.ruleSet;
  const endpoint = goalTargetPoint(settings, target);
  const origin = pointForPassOrigin(shooter, "corner-to-center", cornerId);
  const distance = Math.hypot(endpoint.x - (Number(shooter.x) + 0.5), endpoint.y - (Number(shooter.y) + 0.5));
  const originBlocker = bodyBlockingPassOrigin(origin, shooter, state.pieces || []);
  const bodyBlockers = (state.pieces || []).filter(piece => piece && piece.team !== "BALL" && !piece.inactive && String(piece.id) !== String(shooter.id)
    && segmentIntersectsOpenRect(origin, endpoint, { x: Number(piece.x), y: Number(piece.y), width: 1, height: 1 }));
  const defendingTeam = oppositeTeam(teamKeyForPiece(shooter));
  const defensiveAreaCrossings = (state.pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defendingTeam && !piece.inactive)
    .map(defender => ({
      defenderId: String(defender.id),
      cells: defensiveCellsForPiece(defender, context.gameplayCardsById[String(defender.cardId)], settings)
        .filter(cell => segmentEntryT(origin, endpoint, cell) !== null),
    }))
    .filter(crossing => crossing.cells.length > 0);
  const foot = footForPass(origin, endpoint, shooter, context.gameplayCardsById[String(shooter.cardId)]?.preferredFoot);
  const insidePenaltyArea = penaltyAreaContains(settings, shooter);
  const band = insidePenaltyArea ? "finishing" : distance <= Number(ruleSet.actions.shot.longShotNormalRangeMax) ? "long-shot" : "distant-long-shot";
  const modifierSources = executionModifierSources(ruleSet, foot, defensiveAreaCrossings, band);
  return {
    kind: "shot-route-plan",
    cornerId,
    target: { side: target.side, depth: Number(target.depth), y: Number(target.y) },
    origin,
    endpoint,
    distance,
    foot,
    insidePenaltyArea,
    band,
    originBlocker: originBlocker ? { pieceId: String(originBlocker.id), team: teamKeyForPiece(originBlocker) } : null,
    bodyBlockers: bodyBlockers.map(piece => ({ pieceId: String(piece.id), team: teamKeyForPiece(piece) })),
    defensiveAreaCrossings,
    modifierSources,
    modifier: modifierSources.reduce((total, source) => total + Number(source.value || 0), 0),
    maxDistanceExceeded: distance > Number(ruleSet.actions.shot.shotMaximumRange),
    legal: !originBlocker && bodyBlockers.length === 0 && distance <= Number(ruleSet.actions.shot.shotMaximumRange),
  };
}

export function startShot(state, command) {
  const shooter = pieceById(state, command.payload?.pieceId);
  const team = teamKeyForPiece(shooter);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const shotId = String(command.payload?.shotId || "");
  if (state.gameMode !== "match" || state.actionResolution || !shooter || shooter.team === "BALL" || shooter.inactive || !team || !shotId
    || !ballIsWith(state, shooter) || !tracker.gameStarted || !isTeamActiveForTrackerPhase(tracker, team) || trackerActionStatusForTeam(tracker, team).exhausted) return { accepted: false, reason: "SHOT_UNAVAILABLE" };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: { id: shotId, kind: "shot", status: "targeting", team, shooterId: shooter.id, target: null, routes: [], pendingRoll: null, consumedEventIds: [] } },
    event: { type: "SHOT_STARTED", team, metadata: { shotId, shooterId: shooter.id } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

export function selectShotTarget(state, context, command) {
  const action = state.actionResolution;
  const target = command.payload?.target;
  if (!action || action.kind !== "shot" || action.status !== "targeting" || String(command.payload?.shotId) !== String(action.id)
    || !isLegalGoalTarget(context.boardSettings, target, action.team)) return { accepted: false, reason: "SHOT_TARGET_INVALID" };
  const shooter = pieceById(state, action.shooterId);
  const routes = PASS_CORNERS.map(corner => buildShotRoutePlan({ state, context, shooter, target, cornerId: corner.id }));
  return {
    accepted: true,
    nextState: { ...state, actionResolution: { ...action, status: "route-selection", target: { side: target.side, depth: Number(target.depth), y: Number(target.y) }, routes } },
    event: { type: "SHOT_TARGET_SELECTED", team: action.team, metadata: { shotId: action.id, target: { side: target.side, depth: Number(target.depth), y: Number(target.y) } } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

export function confirmShotRoute(state, context, command) {
  const action = state.actionResolution;
  if (!action || action.kind !== "shot" || action.status !== "route-selection" || String(command.payload?.shotId) !== String(action.id)) return { accepted: false, reason: "SHOT_ROUTE_INVALID" };
  const cornerId = String(command.payload?.cornerId || "");
  if (!PASS_CORNERS.some(corner => corner.id === cornerId)) return { accepted: false, reason: "SHOT_ROUTE_INVALID" };
  const shooter = pieceById(state, action.shooterId);
  const plan = buildShotRoutePlan({ state, context, shooter, target: action.target, cornerId });
  if (!plan.legal) return { accepted: false, reason: "SHOT_ROUTE_BLOCKED" };
  const trackerAction = activateTrackerAction(normalizeTrackerSnapshot(state.tracker), { type: "SHOT", trackerMarker: "SH", pieceId: shooter.id, team: action.team, entryId: command.id, enforcePersonalActions: true });
  if (!trackerAction.allowed) return { accepted: false, reason: trackerAction.reason };
  const goalkeeper = (state.pieces || []).find(piece => teamKeyForPiece(piece) === oppositeTeam(action.team) && context.gameplayCardsById[String(piece.cardId)]?.position === "GK");
  if (!goalkeeper) return { accepted: false, reason: "SHOT_GOALKEEPER_MISSING" };
  return {
    accepted: true,
    nextState: {
      ...state,
      tracker: { ...state.tracker, actionLog: trackerAction.actionLog, usedActions: trackerAction.usedActions, personalActionsByPieceId: trackerAction.personalActionsByPieceId, matchActionState: trackerAction.matchActionState },
      actionResolution: {
        ...action,
        status: "awaiting-roll",
        plan,
        goalkeeperId: goalkeeper.id,
        statId: plan.insidePenaltyArea ? "stat:finishing" : "stat:long-shot",
        goalkeeperStatId: plan.insidePenaltyArea ? "stat:reflexes" : "stat:diving-saves",
        trackerEntryId: trackerAction.entry.id,
        pendingRoll: { requestId: `shot_roll_${action.id}`, actionId: action.id, team: action.team, dieType: 20, subjectId: shooter.id, reactionIndex: 0, context: { actionType: "SHOT" } },
      },
    },
    event: { type: "SHOT_ROUTE_CONFIRMED", team: action.team, metadata: { shotId: action.id, cornerId: plan.cornerId, distance: plan.distance, band: plan.band, defensiveAreaDefenders: plan.defensiveAreaCrossings.map(item => item.defenderId) } },
    timeline: { groupId: trackerAction.entry.id, undoMode: "step", allowNoop: true },
  };
}

export function submitShotRoll(state, context, command) {
  const action = state.actionResolution;
  const rollEvent = createRollEvent(command.payload?.rollEvent);
  if (!action || action.kind !== "shot" || action.status !== "awaiting-roll" || !rollEvent || !action.pendingRoll
    || rollEvent.requestId !== action.pendingRoll.requestId || rollEvent.actionId !== action.id || rollEvent.team !== action.team) return { accepted: false, reason: "SHOT_ROLL_INVALID" };
  const consumed = consumeActionEvent(action, rollEvent);
  if (!consumed) return { accepted: false, reason: "SHOT_ROLL_DUPLICATE" };
  const selectedTokenType = command.payload?.bonusModifierType || null;
  const token = selectedTokenType
    ? consumeTeamModifierToken(state.teamModifierTokens, { team: action.team, turn: state.tracker.currentTurn, modifierType: selectedTokenType })
    : { accepted: true, tokens: state.teamModifierTokens || [], consumed: null };
  if (!token.accepted) return { accepted: false, reason: "SHOT_MODIFIER_TOKEN_INVALID" };
  const shooter = pieceById(state, action.shooterId);
  const goalkeeper = pieceById(state, action.goalkeeperId);
  const tokenSources = token.consumed ? [{ type: token.consumed.modifierType, value: resolveDiceModifierStacks(context.ruleSet.diceModifiers, token.consumed.modifierType), reason: "Tracker modifier token", tokenId: token.consumed.id }] : [];
  const modifierSources = [...(action.plan.modifierSources || []), ...tokenSources];
  const modifier = modifierSources.reduce((total, source) => total + Number(source.value || 0), 0);
  const attackerStat = cardStat(context.gameplayCardsById[String(shooter.cardId)], action.statId);
  const goalkeeperStat = cardStat(context.gameplayCardsById[String(goalkeeper.cardId)], action.goalkeeperStatId);
  const total = Number(rollEvent.natural) + attackerStat + modifier;
  const outcome = rollEvent.natural === 20 ? "goal" : rollEvent.natural === 1 ? "goal-kick" : total > goalkeeperStat ? "goal" : total === goalkeeperStat ? "corner" : "goalkeeper-retains";
  return {
    accepted: true,
    nextState: { ...state, teamModifierTokens: token.tokens, actionResolution: { ...consumed, status: "result-display", result: { natural: rollEvent.natural, attackerStat, goalkeeperStat, modifier, modifierSources, total, outcome } } },
    event: { type: "SHOT_RESOLVED", team: action.team, metadata: { shotId: action.id, natural: rollEvent.natural, attackerStat, goalkeeperStat, modifier, modifierSources, total, outcome, consequenceApplied: false } },
    timeline: { groupId: action.trackerEntryId, undoMode: "step", allowNoop: true },
  };
}
