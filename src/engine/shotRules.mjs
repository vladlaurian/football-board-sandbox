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
import { activateTrackerAction, createEmptyTrackerTurnState, isTeamActiveForTrackerPhase, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { createSinglePlayerRollResultHold } from "../match/delayedResolution.mjs";
import { sumAndCapRollModifier } from "../rules/rollModifierMath.mjs";
import { expiredTeamModifierTokens, pruneTeamModifierTokens } from "./rollModifierOpportunities.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { applyFormationToTeamPieces } from "../board/formationLayout.mjs";
import { formationById } from "../board/standardFormations.mjs";
import { isTeamTacticLegal } from "./tacticLegalityRules.mjs";
import { restartSetupAfterAction, buildRestartSetup, clearCellForPlacement, moveBallTo } from "./restartSetupRules.mjs";
import { markingTurnResetFields } from "./markingRules.mjs";
import { buildGkReposition, gkRepositionTriggerApplies } from "./gkRepositionRules.mjs";

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

// restartModifiers carries the hardcoded Corner/Free-Kick-Direct Shot
// exceptions (docs/SHOOTING_RULES.md sections 4-5): Corner adds a mandatory
// DVM and one DV per placed wall player on top of every ordinary modifier;
// Free Kick Direct replaces defensive-area DV entirely with one DV per wall
// player. Null for every ordinary Shot.
function executionModifierSources(ruleSet, foot, defensiveAreaCrossings, band, restartModifiers = null) {
  const sources = [];
  if (!foot.dominant) {
    sources.push({ type: "majorDisadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "majorDisadvantage"), reason: `Non-dominant ${foot.foot || "foot"}` });
  }
  if (!restartModifiers?.suppressDefensiveAreaDV) {
    defensiveAreaCrossings.forEach(crossing => {
      sources.push({ type: "disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "disadvantage"), reason: "Defensive area", defenderId: crossing.defenderId, origin: Boolean(crossing.origin) });
    });
  }
  if (band === "distant-long-shot") {
    const type = ruleSet.actions.shot.distantBandModifier;
    sources.push({ type, value: resolveDiceModifierStacks(ruleSet.diceModifiers, type), reason: "Distant Long Shot band" });
  }
  if (restartModifiers?.mandatoryDVM) {
    sources.push({ type: "majorDisadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "majorDisadvantage"), reason: "Corner execution" });
  }
  for (let i = 0; i < (restartModifiers?.wallDVCount || 0); i += 1) {
    sources.push({ type: "disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "disadvantage"), reason: "Wall player" });
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

// Shared labelled SITUATIONAL-only source list, mirroring Lofted Through
// Ball's rollPreview shape — deliberately excludes the shooter's own
// Finishing/Long Shot stat (added back in uncapped by computeShotRollPreview
// below; only these situational sources are ever capped, confirmed live
// with the user — see rollModifierMath.mjs). Also excludes any bonus
// Tracker token, which is only known once a roll is submitted;
// resolveShotResult appends that source afterward.
function shotBaseModifierSources({ state, context, foot, defensiveAreaCrossings, band, restartModifiers = null }) {
  const ruleSet = context.ruleSet;
  const sources = [];
  if (!foot.dominant) {
    sources.push({ label: "Major Disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "majorDisadvantage"), source: "non-preferred-foot", detail: "non-preferred foot execution" });
  }
  if (!restartModifiers?.suppressDefensiveAreaDV) {
    defensiveAreaCrossings.forEach(crossing => {
      sources.push({
        label: "Disadvantage",
        value: resolveDiceModifierStacks(ruleSet.diceModifiers, "disadvantage"),
        source: "defensive-area",
        detail: defenderIdentityLabel(state, context, crossing.defenderId),
        defenderId: crossing.defenderId,
      });
    });
  }
  if (band === "distant-long-shot") {
    const type = ruleSet.actions.shot.distantBandModifier;
    sources.push({ label: type === "majorDisadvantage" ? "Major Disadvantage" : "Disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, type), source: "shot-band", detail: "Distant Long Shot band" });
  }
  if (restartModifiers?.mandatoryDVM) {
    sources.push({ label: "Major Disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "majorDisadvantage"), source: "corner-execution", detail: "Corner execution" });
  }
  for (let i = 0; i < (restartModifiers?.wallDVCount || 0); i += 1) {
    sources.push({ label: "Disadvantage", value: resolveDiceModifierStacks(ruleSet.diceModifiers, "disadvantage"), source: "restart-wall", detail: "Wall player" });
  }
  return sources;
}

// Only the situational sources are ever capped — never the shooter's own
// Finishing/Long Shot stat, which is always added back in full afterward
// (confirmed live with the user; see rollModifierMath.mjs).
function computeShotRollPreview(baseStat, baseLabel, situationalSources, modifierCap) {
  const situational = sumAndCapRollModifier(situationalSources, modifierCap);
  const stat = Number(baseStat) || 0;
  return {
    modifier: stat + situational.modifier,
    rawModifier: stat + situational.rawModifier,
    modifierCap: situational.modifierCap,
    capped: situational.capped,
    modifierSources: [{ label: baseLabel, value: stat, source: "card" }, ...situationalSources],
  };
}

function defensiveAreaOwnersForShooter(state, context, shooter, defendingTeam) {
  return (state.pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defendingTeam && !piece.inactive && !isBenchReservePiece(piece))
    .filter(defender => defensiveCellsForPiece(defender, context.gameplayCardsById[String(defender.cardId)], context.boardSettings)
      .some(cell => Number(cell.x) === Number(shooter.x) && Number(cell.y) === Number(shooter.y)))
    .map(defender => String(defender.id));
}

// A normal Shot's straight-line route must stay inside the playable
// pitch+goal-notch area for its complete route (docs/SHOOTING_RULES.md
// section 1). The goal itself is a notch attached to the pitch only across
// the goal's own width band (goalTop..goalTop+goalWidth) — from a very open
// angle to the near post, the straight line crosses the goal-line plane
// while its y is still outside that band, spending a short stretch beyond
// the pitch before curving back into the notch at a later x. This is exactly
// the geometry a direct Corner Shot is later documented to be exempt from
// (section 5: "this physical route may leave the board... models a curved
// Corner trajectory"), which is why this check accepts an explicit opt-out
// rather than being unconditional.
function routeExitsBoard(settings, origin, endpoint, target) {
  const goalLineX = target.side === "right" ? Number(settings.cols) : 0;
  const dx = endpoint.x - origin.x;
  if (dx === 0) return false;
  const goalTop = Math.floor((Number(settings.rows) - Number(settings.goalWidth)) / 2);
  const goalBottom = goalTop + Number(settings.goalWidth);
  const t = (goalLineX - origin.x) / dx;
  const yAtGoalLine = origin.y + t * (endpoint.y - origin.y);
  return yAtGoalLine < goalTop || yAtGoalLine >= goalBottom;
}

// The selected origin changes only physical route truth. Regulatory range is
// always measured centre-to-centre from the shooter cell to the goal cell.
export function buildShotRoutePlan({ state, context, shooter, target, cornerId, exemptFromBoardBoundary = false }) {
  const settings = context.boardSettings;
  const ruleSet = context.ruleSet;
  const restartSetup = state.restartSetup;
  const restartShotActive = restartSetup?.phase === "execution" && String(restartSetup?.executorId) === String(shooter.id)
    && (restartSetup.type === "corner" || restartSetup.type === "freeKickDirect");
  // Corner Shot (docs/SHOOTING_RULES.md section 5): exempt from the board-
  // boundary rule, mandatory DVM, one DV if the optional wall was placed.
  // Free Kick Direct Shot (section 4): bodies (including every wall player)
  // never block the route, defensive-area crossings add no DV, and each
  // wall player instead adds its own DV.
  const cornerShotActive = restartShotActive && restartSetup.type === "corner";
  const freeKickShotActive = restartShotActive && restartSetup.type === "freeKickDirect";
  const restartModifiers = cornerShotActive
    ? { mandatoryDVM: true, wallDVCount: restartSetup.wallPlaced > 0 ? 1 : 0 }
    : freeKickShotActive
      ? { suppressDefensiveAreaDV: true, wallDVCount: restartSetup.wallPlaced || 0 }
      : null;
  const endpoint = goalTargetPoint(settings, target);
  const origin = pointForPassOrigin(shooter, "corner-to-center", cornerId);
  const exitsBoard = !exemptFromBoardBoundary && !cornerShotActive && routeExitsBoard(settings, origin, endpoint, target);
  const distance = Math.hypot(endpoint.x - (Number(shooter.x) + 0.5), endpoint.y - (Number(shooter.y) + 0.5));
  const originBlocker = freeKickShotActive ? null : bodyBlockingPassOrigin(origin, shooter, state.pieces || []);
  const bodyBlockers = freeKickShotActive ? [] : (state.pieces || []).filter(piece => piece && piece.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece) && String(piece.id) !== String(shooter.id)
    && segmentIntersectsOpenRect(origin, endpoint, { x: Number(piece.x), y: Number(piece.y), width: 1, height: 1 }));
  const defendingTeam = oppositeTeam(teamKeyForPiece(shooter));
  const routeCrossings = (state.pieces || [])
    .filter(piece => teamKeyForPiece(piece) === defendingTeam && !piece.inactive && !isBenchReservePiece(piece))
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
  const modifierSources = executionModifierSources(ruleSet, foot, defensiveAreaCrossings, band, restartModifiers);
  const statId = insidePenaltyArea ? "stat:finishing" : "stat:long-shot";
  const attackerLabel = insidePenaltyArea ? "Finishing" : "Long Shot";
  const attackerStat = cardStat(context.gameplayCardsById[String(shooter.cardId)], statId);
  const modifierCap = Math.max(0, Number(ruleSet.diceModifiers?.stackCap) || 0);
  const rollPreview = computeShotRollPreview(
    attackerStat,
    attackerLabel,
    shotBaseModifierSources({ state, context, foot, defensiveAreaCrossings, band, restartModifiers }),
    modifierCap,
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
    attackerLabel,
    rollPreview,
    modifier: rollPreview.modifier,
    maxDistanceExceeded: distance > Number(ruleSet.actions.shot.shotMaximumRange),
    exitsBoard,
    legal: !originBlocker && bodyBlockers.length === 0 && !exitsBoard && distance <= Number(ruleSet.actions.shot.shotMaximumRange),
  };
}

// Full cancel from targeting or route-selection, exactly mirroring Pass and
// Through Ball: it exits Shot entirely rather than only clearing the target.
export function cancelShot(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "shot" || !["targeting", "route-selection"].includes(pending.status)) return { accepted: false, reason: "SHOT_NOT_CANCELLABLE" };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: null },
    event: { type: "SHOT_CANCELLED", team: pending.team, metadata: { shotId: pending.id } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

export function startShot(state, command) {
  const shooter = pieceById(state, command.payload?.pieceId);
  const team = teamKeyForPiece(shooter);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const shotId = String(command.payload?.shotId || "");
  if (state.gameMode !== "match" || state.actionResolution || !shooter || shooter.team === "BALL" || shooter.inactive || isBenchReservePiece(shooter) || !team || !shotId
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
  const goalkeeper = (state.pieces || []).find(piece => teamKeyForPiece(piece) === oppositeTeam(action.team) && !isBenchReservePiece(piece) && context.gameplayCardsById[String(piece.cardId)]?.position === "GK");
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
  // Only the situational sources already on the plan, plus the optional
  // token, are ever capped here — the attacker's own stat is added back in
  // full by computeShotRollPreview, never part of this capped list.
  const situationalSources = [...(action.plan.rollPreview?.modifierSources || []).slice(1), ...(tokenSource ? [tokenSource] : [])];
  const preview = computeShotRollPreview(action.plan.attackerStat, action.plan.attackerLabel, situationalSources, action.plan.rollPreview?.modifierCap);
  const natural = Number(action.lastRollEvent.natural);
  const total = natural + preview.modifier;
  // goalKickInterval/cornerInterval are Rule-Set-editable (1-5, default 1 —
  // the original exact rule). Neither can ever reach a total that beats the
  // goalkeeper's stat: that comparison is checked first, unconditionally, so
  // no interval setting can turn an actual Goal into anything else.
  const goalKickInterval = Number(context.ruleSet.actions.shot.goalKickInterval) || 1;
  const cornerInterval = Number(context.ruleSet.actions.shot.cornerInterval) || 1;
  const outcome = natural === 20 ? "goal"
    : natural <= goalKickInterval ? "goal-kick"
    : total > goalkeeperStat ? "goal"
    : total > goalkeeperStat - cornerInterval ? "corner"
    : "goalkeeper-retains";
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

function applyGoalkeeperRetainsConsequence(state, context, action) {
  const goalkeeper = pieceById(state, action.goalkeeperId);
  const nextTeam = teamKeyForPiece(goalkeeper);
  const pieces = goalkeeper ? moveBallTo(state, goalkeeper.x, goalkeeper.y) : null;
  if (!nextTeam || !pieces) return { accepted: false, reason: "SHOT_CONSEQUENCE_INVALID" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const emptyTurn = createEmptyTrackerTurnState();
  const nextTurn = Math.min(tracker.settings.turns, Math.max(1, tracker.currentTurn + 1));
  const expiredRollBonuses = expiredTeamModifierTokens(state.teamModifierTokens, nextTurn);
  // Untracked extra repositions (confirmed live with the user): "any catch"
  // always applies when checked; "after Free Kick" only when this Shot was
  // itself a Free Kick restart's own execution action — read BEFORE the
  // caller (applyShotConsequence) clears state.restartSetup afterward, so
  // this is the only place that can still tell.
  const isFreeKickOrigin = state.restartSetup?.type === "freeKickDirect" || state.restartSetup?.type === "freeKickIndirect";
  const shouldReposition = gkRepositionTriggerApplies(context.ruleSet, "anyCatch")
    || (isFreeKickOrigin && gkRepositionTriggerApplies(context.ruleSet, "afterFreeKick"));
  const gkReposition = shouldReposition ? buildGkReposition(context.ruleSet, nextTeam) : null;
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      movementStateByPieceId: {},
      teamModifierTokens: pruneTeamModifierTokens(state.teamModifierTokens, nextTurn),
      actionResolution: null,
      actionContinuation: null,
      gkReposition,
      gkRepositionMovementByPieceId: {},
      // The goalkeeper's own restart (its very next Pass/Through Ball/Lofted
      // Through Ball) ignores opposing bodies and defensive areas inside its
      // own penalty area — see docs/SHOOTING_RULES.md. Consumed and cleared
      // by that one restart action, not by the turn boundary.
      goalkeeperRestartException: { team: nextTeam, goalkeeperId: goalkeeper.id },
      ...markingTurnResetFields(),
      tracker: {
        ...state.tracker,
        startingTeam: nextTeam,
        currentTurn: nextTurn,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    },
    event: {
      type: "SHOT_CONSEQUENCE_APPLIED",
      team: nextTeam,
      metadata: {
        shotId: action.id,
        outcome: "goalkeeper-retains",
        goalkeeperId: goalkeeper.id,
        startedTurn: nextTurn,
        expiredRollBonuses: expiredRollBonuses.map(item => ({ id: item.id, team: item.team, modifierType: item.modifierType })),
      },
    },
  };
}

// A Goal's Kick-off places the ball and the entitled team's kickoff piece in
// the cell adjacent to the centre point, in the ENTITLED team's own
// attacking half (docs/FINALISATION_AND_RESTARTS_RULES.md 3.2: "One attacker
// is placed in the cell adjacent to the centre point"; a real kick-off
// stands just past the halfway line, not on the centre line itself). Blue
// attacks increasing x (the right goal), red attacks decreasing x (the left
// goal) — the same convention Shot's own goal-side check already uses.
// v20.56.42: a goal now DOES re-lay out each team into its currently active
// tactic (`state.activeFormation`), since it is a restart from the centre —
// but only when that team actually has one recorded. "Continue Game" never
// records an active tactic (it intentionally skips Prep and freezes
// whatever was already on the board — see prepSelectionBoundary.test.mjs),
// so it is unaffected and every piece stays exactly where it was, as
// before. Whichever formation ends up active, the ball and the kick-off
// piece are always pinned to centre afterward, regardless of what that
// formation says for their slot.
function applyGoalConsequence(state, context, action) {
  const scoringTeam = action.team;
  const entitledTeam = oppositeTeam(scoringTeam);
  const cols = Number(context.boardSettings?.cols);
  const halfwayRight = Math.floor(cols / 2);
  const centre = { x: entitledTeam === "blue" ? halfwayRight : halfwayRight - 1, y: Math.floor(Number(context.boardSettings?.rows) / 2) };
  const teamCode = entitledTeam === "blue" ? "A" : "B";
  // A restart from the centre re-lays out BOTH teams in their currently
  // active tactic (a queued mid-match change becomes active now, for
  // whichever team queued one), then unconditionally pins the ball and the
  // entitled kick-off piece at centre regardless of what that tactic says
  // for their slot — a goal is a kickoff moment for both sides.
  const pendingFormation = state.pendingFormation || { blue: null, red: null };
  const activeFormationBefore = state.activeFormation || { blue: null, red: null };
  const nextActiveFormation = {
    blue: pendingFormation.blue || activeFormationBefore.blue,
    red: pendingFormation.red || activeFormationBefore.red,
  };
  let piecesWithTactics = state.pieces;
  if (nextActiveFormation.blue) piecesWithTactics = applyFormationToTeamPieces(piecesWithTactics, "A", formationById(nextActiveFormation.blue), context.boardSettings);
  if (nextActiveFormation.red) piecesWithTactics = applyFormationToTeamPieces(piecesWithTactics, "B", formationById(nextActiveFormation.red), context.boardSettings);
  const candidates = piecesWithTactics.filter(piece => piece?.team === teamCode && !piece.inactive && !isBenchReservePiece(piece));
  const kickoffPiece = candidates.find(piece => context.gameplayCardsById?.[String(piece.cardId)]?.position === "ST") || candidates[0] || null;
  if (!kickoffPiece) return { accepted: false, reason: "SHOT_CONSEQUENCE_INVALID" };
  const pieces = piecesWithTactics.map(piece => (piece?.team === "BALL" || String(piece.id) === String(kickoffPiece.id))
    ? { ...piece, x: centre.x, y: centre.y }
    : piece);
  const tacticBlock = {
    blue: nextActiveFormation.blue ? !isTeamTacticLegal(pieces, context.gameplayCardsById, "A", nextActiveFormation.blue) : Boolean(state.tacticBlock?.blue),
    red: nextActiveFormation.red ? !isTeamTacticLegal(pieces, context.gameplayCardsById, "B", nextActiveFormation.red) : Boolean(state.tacticBlock?.red),
  };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const emptyTurn = createEmptyTrackerTurnState();
  const nextTurn = Math.min(tracker.settings.turns, Math.max(1, tracker.currentTurn + 1));
  const expiredRollBonuses = expiredTeamModifierTokens(state.teamModifierTokens, nextTurn);
  const score = { ...state.score, [scoringTeam]: (Number(state.score?.[scoringTeam]) || 0) + 1 };
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      score,
      movementStateByPieceId: {},
      teamModifierTokens: pruneTeamModifierTokens(state.teamModifierTokens, nextTurn),
      actionResolution: null,
      actionContinuation: null,
      threeTwoOpportunity: null,
      pendingFormation: { blue: null, red: null },
      activeFormation: nextActiveFormation,
      tacticBlock,
      // Gates every other command until the entitled kick-off piece plays
      // (any pass type, since v20.56.42 — see gameEngine.mjs's
      // kickoffRestartActive guard and passStartRules.mjs's enforcement).
      kickoffRestart: { team: entitledTeam, pieceId: kickoffPiece.id },
      ...markingTurnResetFields(),
      tracker: {
        ...state.tracker,
        startingTeam: entitledTeam,
        currentTurn: nextTurn,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    },
    event: {
      type: "SHOT_CONSEQUENCE_APPLIED",
      team: entitledTeam,
      metadata: {
        shotId: action.id,
        outcome: "goal",
        scoringTeam,
        entitledTeam,
        kickoffPieceId: kickoffPiece.id,
        score,
        startedTurn: nextTurn,
        expiredRollBonuses: expiredRollBonuses.map(item => ({ id: item.id, team: item.team, modifierType: item.modifierType })),
      },
    },
  };
}

// Which half of the goal (top or bottom, relative to its own vertical
// centre) the shot that produced this restart was aimed at — the ball's
// side for both Corner and Goal Kick echoes that direction. A shot aimed
// exactly at the centre row has no side to echo, so the caller falls back
// to its own random choice, same as before this was tied to shot direction.
export function verticalSideFromShotTarget(settings, target) {
  const goalWidth = Number(settings?.goalWidth) || 0;
  const y = Number(target?.y);
  if (!goalWidth || !Number.isFinite(y)) return null;
  const center = (goalWidth - 1) / 2;
  if (y < center) return "top";
  if (y > center) return "bottom";
  return null;
}

// The corner is taken from the pitch corner adjacent to the goal that was
// shot at, on the touchline end matching which half of the goal the shot
// targeted (top/bottom) — a shot aimed dead centre falls back to the app's
// own random choice, since there is no side to echo.
export function randomCornerCell(settings, shootingTeam, target, rng = Math.random) {
  const x = shootingTeam === "blue" ? Number(settings.cols) - 1 : 0;
  const side = verticalSideFromShotTarget(settings, target);
  const y = side === "top" ? 0 : side === "bottom" ? Number(settings.rows) - 1 : (rng() < 0.5 ? 0 : Number(settings.rows) - 1);
  return { x, y };
}

// The goal kick cell is a cell inside the defending team's own small box,
// adjacent to the small-box line (the edge farthest from its own goal
// line), among the first three cells counted in from either end of the
// small box's width. Which end (top/bottom) matches which half of the goal
// the missed shot targeted; a shot aimed dead centre falls back to random,
// same as the exact index among the three cells always does.
export function randomGoalKickCell(settings, defendingTeam, target, rng = Math.random) {
  const smallWidth = Number(settings.smallWidth);
  const smallTop = Math.floor((Number(settings.rows) - smallWidth) / 2);
  const x = defendingTeam === "blue" ? Number(settings.smallDepth) - 1 : Number(settings.cols) - Number(settings.smallDepth);
  const offsets = Math.max(1, Math.min(3, smallWidth));
  const index = Math.floor(rng() * offsets);
  const side = verticalSideFromShotTarget(settings, target);
  const fromTop = side === "top" ? true : side === "bottom" ? false : rng() < 0.5;
  const y = fromTop ? smallTop + index : smallTop + smallWidth - 1 - index;
  return { x, y };
}

// A Corner does not begin a new numbered turn (docs/FINALISATION_AND_RESTARTS_RULES.md
// section 6) — the shooting team stays entitled and attacking, only the
// Tracker action economy resets, exactly as for the goalkeeper's own restart.
function applyCornerConsequence(state, context, action) {
  const shootingTeam = action.team;
  const ballCell = randomCornerCell(context.boardSettings, shootingTeam, action.target);
  // Whoever already stands on the ball cell is freely relocated right now —
  // before wall/reposition even start — so they become an entirely ordinary,
  // manually-repositionable piece for the rest of this setup, rather than a
  // surprise the coach can no longer address once the executor is chosen.
  const clearedState = { ...state, pieces: clearCellForPlacement(state.pieces, ballCell, context.boardSettings, null) };
  const pieces = moveBallTo(clearedState, ballCell.x, ballCell.y);
  if (!pieces) return { accepted: false, reason: "SHOT_CONSEQUENCE_INVALID" };
  const restartSetup = buildRestartSetup(context.ruleSet, "corner", shootingTeam, ballCell, pieces, context.boardSettings);
  if (!restartSetup) return { accepted: false, reason: "SHOT_CONSEQUENCE_INVALID" };
  const emptyTurn = createEmptyTrackerTurnState();
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      movementStateByPieceId: {},
      actionResolution: null,
      actionContinuation: null,
      restartSetup,
      tracker: {
        ...state.tracker,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    },
    event: { type: "SHOT_CONSEQUENCE_APPLIED", team: shootingTeam, metadata: { shotId: action.id, outcome: "corner", ballCell } },
  };
}

// A Goal Kick ends the current turn: possession changes and the defending
// (goalkeeper's) team starts a new numbered turn as the attacking team
// (docs/FINALISATION_AND_RESTARTS_RULES.md section 4) — mirrors
// applyGoalkeeperRetainsConsequence's turn handling exactly.
function applyGoalKickConsequence(state, context, action) {
  const entitledTeam = oppositeTeam(action.team);
  const ballCell = randomGoalKickCell(context.boardSettings, entitledTeam, action.target);
  // See applyCornerConsequence's matching comment: clear the ball cell right
  // now, not at executor selection, so a displaced occupant is still a
  // manually-repositionable ordinary piece for the rest of this setup.
  const clearedState = { ...state, pieces: clearCellForPlacement(state.pieces, ballCell, context.boardSettings, null) };
  const pieces = moveBallTo(clearedState, ballCell.x, ballCell.y);
  if (!pieces) return { accepted: false, reason: "SHOT_CONSEQUENCE_INVALID" };
  const restartSetup = buildRestartSetup(context.ruleSet, "goalKick", entitledTeam, ballCell, pieces, context.boardSettings);
  if (!restartSetup) return { accepted: false, reason: "SHOT_CONSEQUENCE_INVALID" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const emptyTurn = createEmptyTrackerTurnState();
  const nextTurn = Math.min(tracker.settings.turns, Math.max(1, tracker.currentTurn + 1));
  const expiredRollBonuses = expiredTeamModifierTokens(state.teamModifierTokens, nextTurn);
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      movementStateByPieceId: {},
      teamModifierTokens: pruneTeamModifierTokens(state.teamModifierTokens, nextTurn),
      actionResolution: null,
      actionContinuation: null,
      restartSetup,
      ...markingTurnResetFields(),
      tracker: {
        ...state.tracker,
        startingTeam: entitledTeam,
        currentTurn: nextTurn,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    },
    event: {
      type: "SHOT_CONSEQUENCE_APPLIED",
      team: entitledTeam,
      metadata: { shotId: action.id, outcome: "goal-kick", ballCell, startedTurn: nextTurn, expiredRollBonuses: expiredRollBonuses.map(item => ({ id: item.id, team: item.team, modifierType: item.modifierType })) },
    },
  };
}

// SHOT_CONSEQUENCE_DUE: consumes the terminal result-display checkpoint
// (ADR-058) and creates the physical consequence for every documented Shot
// outcome. Goalkeeper Retains mirrors Pass's completeNormalInterception
// exactly: the attacking team lost possession mid-turn to the other team, so
// the ball moves to the goalkeeper's own cell and a new numbered turn begins
// immediately for the goalkeeper's team. Corner and Goal Kick each start a
// restartSetup (see restartSetupRules.mjs) instead of resolving directly.
export function applyShotConsequence(state, context, command) {
  const action = state.actionResolution;
  const shotId = String(command.payload?.shotId || "").trim();
  if (!action || action.kind !== "shot" || action.status !== "result-display") return { accepted: false, reason: "SHOT_NOT_CONSEQUENCE_READY" };
  if (!shotId || shotId !== String(action.id)) return { accepted: false, reason: "SHOT_CONSEQUENCE_STALE" };
  const outcome = action.result?.outcome;
  const transition = outcome === "goal" ? applyGoalConsequence(state, context, action)
    : outcome === "goalkeeper-retains" ? applyGoalkeeperRetainsConsequence(state, context, action)
    : outcome === "corner" ? applyCornerConsequence(state, context, action)
    : outcome === "goal-kick" ? applyGoalKickConsequence(state, context, action)
    : { accepted: false, reason: "SHOT_CONSEQUENCE_OUTCOME_INVALID" };
  // A Shot taken as a fixed-restart's execution action (Corner, Free Kick
  // Direct) ends that restart setup here — unless the Shot's own outcome is
  // itself a new Corner/Goal Kick, which already started its own fresh
  // restartSetup above and must not be clobbered by the old one's clearing.
  if (transition.accepted && state.restartSetup && outcome !== "corner" && outcome !== "goal-kick") {
    return { ...transition, nextState: { ...transition.nextState, restartSetup: restartSetupAfterAction(state, action.shooterId) } };
  }
  return transition;
}
