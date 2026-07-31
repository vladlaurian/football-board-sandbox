import { createPendingRoll, createRollEvent } from "../match/actionResolutionEngine.mjs";
import { PASS_CORNERS, cardStat, pointForPassOrigin, pointForPassTarget, segmentIntersectsOpenRect, teamKeyForPiece } from "../rules/passEngine.mjs";
import { resolveDiceModifierStacks } from "../rules/ruleSets.mjs";
import { activateTrackerAction, createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { consumeTeamModifierToken } from "./rollModifierOpportunities.mjs";

const otherTeam = team => team === "blue" ? "red" : "blue";
const pieceFor = (state, id) => state.pieces.find(piece => String(piece?.id || "") === String(id || "")) || null;
const cardFor = (context, piece) => context?.gameplayCardsById?.[String(piece?.cardId || "")] || null;
const hasBall = (state, piece) => state.pieces.some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));

function geometry(context) {
  const cols = Number(context?.boardSettings?.cols) || 44;
  const rows = Number(context?.boardSettings?.rows) || 29;
  const goalWidth = Number(context?.boardSettings?.goalWidth) || 5;
  return { cols, rows, goalWidth, goalTop: Math.floor((rows - goalWidth) / 2), boxDepth: Number(context?.boardSettings?.boxDepth) || 7 };
}

function validGoalCell(context, team, target) {
  const { cols, goalTop, goalWidth } = geometry(context);
  return Number.isInteger(Number(target?.x)) && Number.isInteger(Number(target?.y))
    && Number(target.y) >= goalTop && Number(target.y) < goalTop + goalWidth
    && (team === "blue" ? Number(target.x) === cols : Number(target.x) === -1);
}

function goalkeeper(state, context, defendingTeam) {
  return state.pieces.find(piece => teamKeyForPiece(piece) === defendingTeam && cardFor(context, piece)?.position === "GK") || null;
}

export function startShot(state, command) {
  const shooter = pieceFor(state, command.payload?.pieceId);
  const team = teamKeyForPiece(shooter);
  if (!shooter || shooter.team === "BALL" || shooter.inactive || !team || !hasBall(state, shooter)) return { accepted: false, reason: "SHOT_REQUIRES_POSSESSION" };
  if (state.restart) return { accepted: false, reason: "RESTART_ACTIVE" };
  if (!normalizeTrackerSnapshot(state.tracker).gameStarted) return { accepted: false, reason: "MATCH_NOT_STARTED" };
  return { accepted: true, nextState: { ...state, actionResolution: { id: String(command.payload?.shotId || command.id), kind: "shot", status: "targeting", shooterId: shooter.id, team, target: null, cornerId: null, pendingRoll: null } }, event: { type: "SHOT_TARGETING_STARTED", team, metadata: { shooterId: shooter.id } }, timeline: { allowNoop: true } };
}

export function selectShotTarget(state, context, command) {
  const pending = state.actionResolution;
  const target = command.payload?.target;
  if (!pending || pending.kind !== "shot" || pending.status !== "targeting" || !validGoalCell(context, pending.team, target)) return { accepted: false, reason: "SHOT_TARGET_INVALID" };
  return { accepted: true, nextState: { ...state, actionResolution: { ...pending, status: "route-selection", target: { x: Number(target.x), y: Number(target.y) } } }, event: { type: "SHOT_TARGET_SELECTED", team: pending.team, metadata: { target } }, timeline: { allowNoop: true } };
}

export function confirmShotRoute(state, context, command) {
  const pending = state.actionResolution;
  const shooter = pieceFor(state, pending?.shooterId);
  const cornerId = String(command.payload?.cornerId || "");
  if (!pending || pending.kind !== "shot" || pending.status !== "route-selection" || !pending.target || !shooter || !PASS_CORNERS.some(corner => corner.id === cornerId)) return { accepted: false, reason: "SHOT_ROUTE_INVALID" };
  const origin = pointForPassOrigin(shooter, "corner-to-center", cornerId);
  const targetPoint = pointForPassTarget(pending.target);
  const distance = Math.hypot(Number(pending.target.x) - Number(shooter.x), Number(pending.target.y) - Number(shooter.y));
  const rules = context?.ruleSet?.actions?.shot || {};
  if (distance > (Number(rules.maximumRange) || 16)) return { accepted: false, reason: "SHOT_MAX_RANGE_EXCEEDED" };
  const blocker = state.pieces.find(piece => piece?.team !== "BALL" && piece.id !== shooter.id && !piece.inactive && cardFor(context, piece)?.position !== "GK" && segmentIntersectsOpenRect(origin, targetPoint, { x: Number(piece.x), y: Number(piece.y) }));
  if (blocker) return { accepted: false, reason: "SHOT_ROUTE_BLOCKED" };
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const activation = activateTrackerAction(tracker, { type: "SHOT", pieceId: shooter.id, team: pending.team, entryId: command.id, enforcePersonalActions: true });
  if (!activation.allowed) return { accepted: false, reason: activation.reason || "SHOT_NOT_ALLOWED" };
  const keeper = goalkeeper(state, context, otherTeam(pending.team));
  if (!keeper) return { accepted: false, reason: "SHOT_GOALKEEPER_REQUIRED" };
  const board = geometry(context);
  const inPenaltyArea = pending.team === "blue" ? Number(shooter.x) >= board.cols - board.boxDepth : Number(shooter.x) < board.boxDepth;
  const longShot = distance > (Number(rules.longShotNormalRangeMax) || 11);
  const attackerStatName = inPenaltyArea ? "Finishing" : "Long Shot";
  const keeperStatName = inPenaltyArea ? "Reflexes" : "Diving Saves";
  const distantPenalty = longShot ? resolveDiceModifierStacks(context?.ruleSet?.diceModifiers, rules.distantRangePenalty === "major-disadvantage" ? "majorDisadvantage" : "disadvantage") : 0;
  const plan = { shooterId: shooter.id, goalkeeperId: keeper.id, target: pending.target, cornerId, origin, distance, inPenaltyArea, longShot, attackerStatName, attackerStat: cardStat(cardFor(context, shooter), attackerStatName), goalkeeperStatName: keeperStatName, goalkeeperStat: cardStat(cardFor(context, keeper), keeperStatName), distantPenalty };
  return { accepted: true, nextState: { ...state, tracker: { ...state.tracker, actionLog: activation.actionLog, usedActions: activation.usedActions, personalActionsByPieceId: activation.personalActionsByPieceId, matchActionState: activation.matchActionState }, actionResolution: { ...pending, status: "awaiting-roll", cornerId, plan, pendingRoll: createPendingRoll({ requestId: `shot_roll_${pending.id}`, actionId: pending.id, team: pending.team, dieType: 20, subjectId: shooter.id, context: { actionType: "SHOT" } }) } }, event: { type: "SHOT_COMMITTED", team: pending.team, metadata: plan }, timeline: { allowNoop: false } };
}

export function submitShotRoll(state, context, command) {
  const pending = state.actionResolution;
  const roll = createRollEvent(command.payload?.rollEvent);
  if (!pending || pending.kind !== "shot" || pending.status !== "awaiting-roll" || !roll || roll.requestId !== pending.pendingRoll?.requestId || roll.actionId !== pending.id || roll.team !== pending.team) return { accepted: false, reason: "SHOT_ROLL_INVALID" };
  const token = consumeTeamModifierToken(state.teamModifierTokens, { team: pending.team, turn: normalizeTrackerSnapshot(state.tracker).currentTurn, modifierType: command.payload?.bonusModifierType });
  if (!token.accepted) return { accepted: false, reason: "ROLL_MODIFIER_NOT_AVAILABLE" };
  const tokenValue = token.consumed ? resolveDiceModifierStacks(context?.ruleSet?.diceModifiers, token.consumed.modifierType) : 0;
  const total = Number(roll.natural) + Number(pending.plan.attackerStat) + Number(pending.plan.distantPenalty) + tokenValue;
  const outcome = roll.natural === 20 ? "goal" : roll.natural === 1 ? "goal-kick" : total > Number(pending.plan.goalkeeperStat) ? "goal" : total === Number(pending.plan.goalkeeperStat) ? "corner" : "keeper-retains";
  return { accepted: true, nextState: { ...state, dice: { ...state.dice, dieType: 20, blueResult: pending.team === "blue" ? roll.natural : state.dice.blueResult, redResult: pending.team === "red" ? roll.natural : state.dice.redResult }, teamModifierTokens: token.tokens, actionResolution: { ...pending, status: "rolled", pendingRoll: null, result: { natural: roll.natural, total, outcome, modifierToken: token.consumed?.modifierType || null } } }, event: { type: "SHOT_ROLLED", team: pending.team, metadata: { rollEvent: roll } }, timeline: { allowNoop: false } };
}

export function resolveShot(state, context) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "shot" || pending.status !== "rolled") return { accepted: false, reason: "SHOT_NOT_READY_TO_RESOLVE" };
  const result = pending.result;
  const team = pending.team;
  const kind = result.outcome === "goal" ? "kickoff" : result.outcome === "goal-kick" ? "goal-kick" : result.outcome === "corner" ? "corner" : null;
  const restart = kind ? { id: `${kind}_${pending.id}`, kind, entitledTeam: kind === "corner" ? team : otherTeam(team), sourceActionId: pending.id, phase: kind === "kickoff" ? "awaiting-free-short-pass" : "setup" } : null;
  const empty = createEmptyTrackerTurnState();
  const tracker = result.outcome === "goal-kick" ? { ...state.tracker, startingTeam: otherTeam(team), currentTurn: normalizeTrackerSnapshot(state.tracker).currentTurn + 1, usedActions: empty.usedActions, actionLog: empty.actionLog, personalActionsByPieceId: empty.personalActionsByPieceId, matchActionState: empty.matchActionState, turnPhase: "attack" } : state.tracker;
  const score = result.outcome === "goal" ? { ...state.score, [team]: Number(state.score?.[team] || 0) + 1 } : state.score;
  return { accepted: true, nextState: { ...state, score, tracker, actionResolution: null, restart }, event: { type: result.outcome === "goal" ? "GOAL_SCORED" : result.outcome === "goal-kick" ? "GOAL_KICK_STARTED" : result.outcome === "corner" ? "CORNER_STARTED" : "SHOT_SAVED", team, metadata: { shooterId: pending.shooterId, result, restart } }, timeline: { allowNoop: false } };
}
