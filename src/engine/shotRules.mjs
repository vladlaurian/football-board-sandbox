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
import { createSinglePlayerRollResultHold } from "../match/delayedResolution.mjs";

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

function goalTargetForCoordinate(settings, team, target) {
  const x = Number(target?.x);
  const y = Number(target?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const goalTop = Math.floor((Number(settings.rows) - Number(settings.goalWidth)) / 2);
  if (y < goalTop || y >= goalTop + Number(settings.goalWidth)) return null;
  const side = x >= Number(settings.cols) && x < Number(settings.cols) + Number(settings.goalDepth)
    ? "right"
    : x >= -Number(settings.goalDepth) && x < 0
      ? "left"
      : null;
  if (!side || side !== (team === "blue" ? "right" : "left")) return null;
  return { side, depth: side === "right" ? x - Number(settings.cols) : x + Number(settings.goalDepth), y: y - goalTop };
}

function targetCoordinate(settings, target) {
  const goalTop = Math.floor((Number(settings.rows) - Number(settings.goalWidth)) / 2);
  return {
    x: target.side === "right" ? Number(settings.cols) + Number(target.depth) : -Number(settings.goalDepth) + Number(target.depth),
    y: goalTop + Number(target.y),
  };
}

function requestedShotTarget(settings, team, target) {
  if (target && Number.isInteger(Number(target.x)) && Number.isInteger(Number(target.y))) {
    const coordinate = { x: Number(target.x), y: Number(target.y) };
    // A Shot may be attempted on every rendered board cell (pitch plus both
    // goal grids), but never outside that board domain.
    if (coordinate.x >= -Number(settings.goalDepth) && coordinate.x < Number(settings.cols) + Number(settings.goalDepth)
      && coordinate.y >= 0 && coordinate.y < Number(settings.rows)) return coordinate;
    return null;
  }
  if (isLegalGoalTarget(settings, target, team)) return targetCoordinate(settings, target);
  return null;
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
    sources.push({ type: "disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "disadvantage"), reason: "Defensive area", defenderId: crossing.defenderId, origin: Boolean(crossing.origin) });
  });
  if (band === "distant-long-shot") {
    const type = ruleSet.actions.shot.distantBandModifier;
    sources.push({ type, value: resolveDiceModifierStacks(ruleSet.diceModifiers, type), reason: "Distant Long Shot band" });
  }
  return sources;
}

// Resolves the frozen "post + name — Team" identity used by both the roll
// prompt and the result screen; no internal defender ID ever reaches either.
function defenderIdentityLabel(state, context, defenderId) {
  const defender = (state.pieces || []).find(piece => String(piece?.id) === String(defenderId));
  const card = context.gameplayCardsById[String(defender?.cardId)] || {};
  const identity = [card.position, card.name].filter(Boolean).join(" ") || "Unknown defender";
  return `Defensive area: ${identity} — ${teamKeyForPiece(defender) === "blue" ? "Blue" : "Red"}`;
}

// Shared labelled-source list, mirroring Lofted Through Ball's rollPreview
// shape. It excludes any bonus Tracker token, which is only known once a
// roll is submitted; resolveShotResult appends that source afterward.
function shotBaseModifierSources({ state, context, foot, defensiveAreaCrossings, band, attackerStat, attackerLabel }) {
  const ruleSet = context.ruleSet;
  const sources = [{ label: attackerLabel, value: Number(attackerStat) || 0, source: "card" }];
  if (!foot.dominant) {
    sources.push({ label: "Major Disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "majorDisadvantage"), source: "non-preferred-foot", detail: "non-preferred foot execution" });
  }
  defensiveAreaCrossings.forEach(crossing => {
    sources.push({
      label: "Disadvantage",
      value: resolveDiceModifierStacks(ruleSet.diceModifiers, "disadvantage"),
      source: "defensive-area",
      detail: defenderIdentityLabel(state, context, crossing.defenderId),
      defenderId: crossing.defenderId,
    });
  });
  if (band === "distant-long-shot") {
    const type = ruleSet.actions.shot.distantBandModifier;
    sources.push({ label: type === "majorDisadvantage" ? "Major Disadvantage" : "Disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, type), source: "shot-band", detail: "Distant Long Shot band" });
  }
  return sources;
}

// One shared, symmetric cap applies to every Shot roll modifier total,
// exactly as Lofted Through Ball and Interception already cap theirs.
function computeShotRollPreview(modifierSources, modifierCap, attackerStat) {
  const rawModifier = modifierSources.reduce((total, source) => source.source === "card" ? total : total + Number(source.value || 0), 0);
  const modifier = Math.max(-modifierCap, Math.min(modifierCap, rawModifier));
  return {
    modifier, rawModifier, modifierCap, capped: modifier !== rawModifier,
    totalBonus: Number(attackerStat) + modifier,
    modifierSources,
  };
}

function defensiveAreaOwnersForShooter(state, context, shooter, defendingTeam) {
  return (state.pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defendingTeam && !piece.inactive)
    .filter(defender => defensiveCellsForPiece(defender, context.gameplayCardsById[String(defender.cardId)], context.boardSettings)
      .some(cell => Number(cell.x) === Number(shooter.x) && Number(cell.y) === Number(shooter.y)))
    .map(defender => String(defender.id));
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
  const routeCrossings = (state.pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defendingTeam && !piece.inactive)
    .map(defender => ({
      defenderId: String(defender.id),
      cells: defensiveCellsForPiece(defender, context.gameplayCardsById[String(defender.cardId)], settings)
        .filter(cell => segmentEntryT(origin, endpoint, cell) !== null),
    }))
    .filter(crossing => crossing.cells.length > 0);
  // Occupying a defensive area is an execution fact before any corner route is
  // considered. The selected corner may add other crossed areas but can never
  // remove this origin DV; each defender contributes at most once.
  const originDefenderIds = defensiveAreaOwnersForShooter(state, context, shooter, defendingTeam);
  const crossingsByDefenderId = new Map(routeCrossings.map(crossing => [crossing.defenderId, crossing]));
  originDefenderIds.forEach(defenderId => {
    if (!crossingsByDefenderId.has(defenderId)) crossingsByDefenderId.set(defenderId, { defenderId, cells: [], origin: true });
    else crossingsByDefenderId.set(defenderId, { ...crossingsByDefenderId.get(defenderId), origin: true });
  });
  const defensiveAreaCrossings = Array.from(crossingsByDefenderId.values());
  const foot = footForPass(origin, endpoint, shooter, context.gameplayCardsById[String(shooter.cardId)]?.preferredFoot);
  const insidePenaltyArea = penaltyAreaContains(settings, shooter);
  const band = insidePenaltyArea ? "finishing" : distance <= Number(ruleSet.actions.shot.longShotNormalRangeMax) ? "long-shot" : "distant-long-shot";
  // Internal, uncapped, type-based facts: unchanged shape, still the source
  // for AI Export's routeModifierSources.
  const modifierSources = executionModifierSources(ruleSet, foot, defensiveAreaCrossings, band);
  const statId = insidePenaltyArea ? "stat:finishing" : "stat:long-shot";
  const attackerLabel = insidePenaltyArea ? "Finishing" : "Long Shot";
  const attackerStat = cardStat(context.gameplayCardsById[String(shooter.cardId)], statId);
  const modifierCap = Math.max(0, Number(ruleSet.diceModifiers?.stackCap) || 0);
  const rollPreview = computeShotRollPreview(
    shotBaseModifierSources({ state, context, foot, defensiveAreaCrossings, band, attackerStat, attackerLabel }),
    modifierCap,
    attackerStat,
  );
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
    statId,
    attackerStat,
    rollPreview,
    modifier: rollPreview.modifier,
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
  const requestedTarget = requestedShotTarget(context.boardSettings, action?.team, command.payload?.target);
  if (!action || action.kind !== "shot" || action.status !== "targeting" || String(command.payload?.shotId) !== String(action.id) || !requestedTarget) return { accepted: false, reason: "SHOT_TARGET_INVALID" };
  const shooter = pieceById(state, action.shooterId);
  const target = goalTargetForCoordinate(context.boardSettings, action.team, requestedTarget);
  if (!target) {
    const endpoint = { x: Number(requestedTarget.x) + .5, y: Number(requestedTarget.y) + .5 };
    const routes = PASS_CORNERS.map(corner => ({
      cornerId: corner.id,
      origin: pointForPassOrigin(shooter, "corner-to-center", corner.id),
      endpoint,
      foot: footForPass(pointForPassOrigin(shooter, "corner-to-center", corner.id), endpoint, shooter, context.gameplayCardsById[String(shooter.cardId)]?.preferredFoot),
      legal: false,
      modifier: 0,
      modifierSources: [],
      targetInvalidReason: "SHOT_TARGET_MUST_BE_OPPONENT_GOAL",
    }));
    return {
      accepted: true,
      nextState: { ...state, actionResolution: { ...action, attemptedTarget: requestedTarget, target: null, targetInvalidReason: "SHOT_TARGET_MUST_BE_OPPONENT_GOAL", routes } },
      event: { type: "SHOT_TARGET_SELECTED", team: action.team, metadata: { shotId: action.id, attemptedTarget: requestedTarget, targetInvalidReason: "SHOT_TARGET_MUST_BE_OPPONENT_GOAL" } },
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  const routes = PASS_CORNERS.map(corner => buildShotRoutePlan({ state, context, shooter, target, cornerId: corner.id }));
  return {
    accepted: true,
    nextState: { ...state, actionResolution: { ...action, status: "route-selection", attemptedTarget: requestedTarget, target: { side: target.side, depth: Number(target.depth), y: Number(target.y) }, targetInvalidReason: null, routes } },
    event: { type: "SHOT_TARGET_SELECTED", team: action.team, metadata: { shotId: action.id, target: { side: target.side, depth: Number(target.depth), y: Number(target.y) }, attemptedTarget: requestedTarget } },
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
        statId: plan.statId,
        goalkeeperStatId: plan.insidePenaltyArea ? "stat:reflexes" : "stat:diving-saves",
        trackerEntryId: trackerAction.entry.id,
        pendingRoll: { requestId: `shot_roll_${action.id}`, actionId: action.id, team: action.team, dieType: 20, subjectId: shooter.id, reactionIndex: 0, context: { actionType: "SHOT" } },
      },
    },
    event: { type: "SHOT_ROUTE_CONFIRMED", team: action.team, metadata: { shotId: action.id, cornerId: plan.cornerId, distance: plan.distance, band: plan.band, defensiveAreaDefenders: plan.defensiveAreaCrossings.map(item => item.defenderId) } },
    timeline: { groupId: trackerAction.entry.id, undoMode: "step", allowNoop: true },
  };
}

const BONUS_TOKEN_LABEL = Object.freeze({
  advantage: "Advantage",
  majorAdvantage: "Major Advantage",
  disadvantage: "Disadvantage",
  majorDisadvantage: "Major Disadvantage",
});

// Roll only: consumes the RollEvent and any selected Tracker token, writes
// canonical state.dice in the same shape as Lofted Through Ball, and opens
// the shared 1000 ms result hold. It calculates no outcome.
export function submitShotRoll(state, context, command) {
  const action = state.actionResolution;
  const rollEvent = createRollEvent(command.payload?.rollEvent);
  const createdAt = Number(command.payload?.createdAt);
  if (!action || action.kind !== "shot" || action.status !== "awaiting-roll" || !rollEvent || !action.pendingRoll
    || rollEvent.requestId !== action.pendingRoll.requestId || rollEvent.actionId !== action.id || rollEvent.team !== action.team) return { accepted: false, reason: "SHOT_ROLL_INVALID" };
  if (!Number.isFinite(createdAt) || createdAt < 0) return { accepted: false, reason: "SHOT_ROLL_TIME_INVALID" };
  const consumed = consumeActionEvent(action, rollEvent);
  if (!consumed) return { accepted: false, reason: "SHOT_ROLL_DUPLICATE" };
  const selectedTokenType = command.payload?.bonusModifierType || null;
  const token = selectedTokenType
    ? consumeTeamModifierToken(state.teamModifierTokens, { team: action.team, turn: state.tracker.currentTurn, modifierType: selectedTokenType })
    : { accepted: true, tokens: state.teamModifierTokens || [], consumed: null };
  if (!token.accepted) return { accepted: false, reason: "SHOT_MODIFIER_TOKEN_INVALID" };
  const resolutionTransaction = { id: `resolution_${action.id}_${command.id}`, source: "roll-resolution", undoMode: "atomic" };
  const delayedResolution = createSinglePlayerRollResultHold({
    kind: "shot",
    actionId: action.id,
    team: action.team,
    value: rollEvent.natural,
    createdAt,
    payload: { rollEvent, undoTransaction: resolutionTransaction },
  });
  const dice = {
    ...state.dice,
    dieType: rollEvent.dieType,
    blueResult: action.team === "blue" ? rollEvent.natural : state.dice?.blueResult,
    redResult: action.team === "red" ? rollEvent.natural : state.dice?.redResult,
    blueLastDieType: action.team === "blue" ? rollEvent.dieType : state.dice?.blueLastDieType,
    redLastDieType: action.team === "red" ? rollEvent.dieType : state.dice?.redLastDieType,
  };
  return {
    accepted: true,
    nextState: {
      ...state,
      dice,
      teamModifierTokens: token.tokens,
      actionResolution: {
        ...consumed,
        status: "awaiting-shot-resolution",
        lastRollEvent: rollEvent,
        bonusModifierType: token.consumed?.modifierType || null,
        resolutionTransaction,
      },
    },
    event: {
      type: "SHOT_ROLLED",
      team: action.team,
      metadata: {
        shotId: action.id,
        rollEvent,
        rollSource: rollEvent.source,
        chosenResult: rollEvent.source === "CHOSEN" ? rollEvent.natural : null,
        delayedResolution,
        undoTransaction: resolutionTransaction,
        bonusModifier: token.consumed ? { type: token.consumed.modifierType, source: token.consumed.source, tokenId: token.consumed.id } : null,
      },
    },
    timeline: { groupId: action.trackerEntryId, undoMode: "step", allowNoop: true },
  };
}

// SHOT_RESOLUTION_DUE: performs the deterministic Shot calculation only after
// the roll and its hold have already been persisted. It applies exactly one
// symmetric cap to the combined roll modifier, mirroring Lofted Through Ball.
export function resolveShotResult(state, context, command) {
  const action = state.actionResolution;
  const rollEventId = String(command.payload?.rollEventId || "").trim();
  if (!action || action.kind !== "shot" || action.status !== "awaiting-shot-resolution") return { accepted: false, reason: "SHOT_NOT_RESOLVING" };
  if (String(command.payload?.shotId || "") !== String(action.id) || !rollEventId || rollEventId !== String(action.lastRollEvent?.id || "")
    || !Array.isArray(action.consumedEventIds) || !action.consumedEventIds.includes(rollEventId)) return { accepted: false, reason: "SHOT_RESOLUTION_STALE" };
  const shooter = pieceById(state, action.shooterId);
  const goalkeeper = pieceById(state, action.goalkeeperId);
  const attackerStat = cardStat(context.gameplayCardsById[String(shooter.cardId)], action.statId);
  const goalkeeperStat = cardStat(context.gameplayCardsById[String(goalkeeper.cardId)], action.goalkeeperStatId);
  const tokenSource = action.bonusModifierType
    ? { label: BONUS_TOKEN_LABEL[action.bonusModifierType] || "Modifier", value: resolveDiceModifierStacks(context.ruleSet.diceModifiers, action.bonusModifierType), source: "team-modifier-token", detail: "earned team modifier" }
    : null;
  const modifierSources = [...(action.plan.rollPreview?.modifierSources || []), ...(tokenSource ? [tokenSource] : [])];
  const preview = computeShotRollPreview(modifierSources, action.plan.rollPreview?.modifierCap, attackerStat);
  const natural = Number(action.lastRollEvent.natural);
  const total = natural + attackerStat + preview.modifier;
  const outcome = natural === 20 ? "goal" : natural === 1 ? "goal-kick" : total > goalkeeperStat ? "goal" : total === goalkeeperStat ? "corner" : "goalkeeper-retains";
  const result = { natural, attackerStat, goalkeeperStat, total, outcome, ...preview };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: { ...action, status: "result-display", result } },
    event: {
      type: "SHOT_RESOLVED",
      team: action.team,
      metadata: { shotId: action.id, ...result, consequenceApplied: false, undoTransaction: action.resolutionTransaction || null },
    },
    timeline: { groupId: action.trackerEntryId, undoMode: "step", allowNoop: true },
  };
}
