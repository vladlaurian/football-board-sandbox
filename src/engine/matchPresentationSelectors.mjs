// Single Player Match UI reads this projection boundary only.  It deliberately
// performs no gameplay resolution: all gameplay facts were persisted by Engine
// commands in MatchState using the frozen MatchContext.

import { evaluateNormalMove } from "./normalMoveRules.mjs";
import { evaluateFreeMove } from "./freeMoveRules.mjs";
import { applyGameCommand, evaluateFreeBallMoved } from "./gameEngine.mjs";
import { GAME_COMMAND_TYPE } from "./gameCommands.mjs";
import { evaluateThreeTwoMove } from "./threeTwoMoveRules.mjs";
import { evaluateGroupMovePieceEligibility, evaluateGroupMovePlayer } from "./groupMoveRules.mjs";
import { evaluateBonusMove } from "./bonusMoveRules.mjs";
import { canUseTrackerActionForPiece, canUseTrackerFreeModeForPiece, hasGroupMoveAuthorization, isTeamActiveForTrackerPhase, movementAuthorizationForPiece, personalActionStatusForPiece, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { cardStat, interceptorChoiceCandidates, teamKeyForPiece } from "../rules/passEngine.mjs";
import { activeTeamModifierTokens } from "./rollModifierOpportunities.mjs";
import { resolveDiceModifierStacks } from "../rules/ruleSets.mjs";
import { BONUS_ACTION_IMPLEMENTED_TYPES } from "./bonusActionCapabilities.mjs";
import { naturalRollOutcomeLine } from "./rollOutcomeEffects.mjs";

const OFFLINE_IMPLEMENTED_ACTION_TYPES = Object.freeze(["MOVE", "GROUP_MOVE", ...BONUS_ACTION_IMPLEMENTED_TYPES]);

export function selectNaturalRollOutcomePresentation(outcome) {
  return naturalRollOutcomeLine(outcome, { teamName: outcome?.team === "blue" ? "Blue" : outcome?.team === "red" ? "Red" : null });
}

function formatSigned(value) {
  const number = Number(value) || 0;
  return number < 0 ? `−${Math.abs(number)}` : number > 0 ? `+${number}` : "0";
}

export function selectSinglePlayerPassPresentation(state) {
  const pending = state?.actionResolution;
  if (!pending || pending.kind !== "pass") return null;
  const routeOptions = (pending.routePresentation || []).map(route => ({
    ...route,
    modifierLabel: formatSigned(route.modifier),
    // Route verdict and segments are canonical Engine projection facts. Keep
    // the fallback only for pre-v20.56.1 recordings that lack this field.
    status: route.verdict || (route.targetInvalidReason || route.goalkeeperRouteBlocked || route.endpointBodyBlocked ? "blocked" : (route.directContact?.team && route.directContact.team !== route.team) || route.risk ? "risk" : "clear"),
    disabled: Boolean(route.targetInvalidReason || route.goalkeeperRouteBlocked || route.endpointBodyBlocked),
  }));
  const selectedRoute = routeOptions.find(route => route.cornerId === pending.cornerId)
    || routeOptions[0]
    || null;
  return {
    target: pending.target || null,
    routeOptions,
    selectedRoute,
    rollPrompt: pending.status === "awaiting-interception-roll" ? pending.rollPresentation || null : null,
  };
}

function previewCommand(type, piece, x, y) {
  return { id: `presentation:${type}:${piece?.id || ""}:${x}:${y}`, type, payload: { pieceId: piece?.id, x: Number(x), y: Number(y) } };
}

export function selectSinglePlayerNormalMovePresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateNormalMove(state, context, previewCommand("NORMAL_MOVE_COMMITTED", piece, x, y), { preview: true });
  // A projection has an explicit nullable geometry field. Invalid piece/input
  // requests have no geometry; ordinary rejected moves still carry the Engine
  // geometry returned above.
  return { ...result, geometry: result.geometry || null, legal: Boolean(result.accepted) };
}

// BA Move presentation always uses the Engine evaluator, including rejected
// destinations. The command envelope intentionally does not expose internal
// calculation details, therefore it cannot be used as a hover evaluator.
export function selectSinglePlayerBonusMovePresentation(state, context, { piece, x, y } = {}) {
  const continuation = state?.actionContinuation;
  let previewState = state;
  if (continuation?.kind === "bonus-card-action" && continuation.status === "ready") {
    const start = applyGameCommand({ state, context, command: previewCommand(GAME_COMMAND_TYPE.BONUS_MOVE_STARTED, piece, x, y) });
    if (!start.accepted) return { ...start, geometry: null, legal: false };
    previewState = start.nextState;
  }
  const result = evaluateBonusMove(previewState, context, previewCommand(GAME_COMMAND_TYPE.BONUS_MOVE_COMMITTED, piece, x, y));
  return { ...result, geometry: result.geometry || null, legal: Boolean(result.accepted) };
}

export function selectSinglePlayerThreeTwoPresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateThreeTwoMove(state, context, previewCommand("THREE_TWO_MOVE_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.eligible) };
}

function selectNormalMoveRoutePresentation(state, context, { piece, x, y } = {}) {
  const current = state?.tracker?.matchActionState?.byPieceId?.[piece?.id] || {};
  if (current.moveAuthorized) {
    const result = evaluateNormalMove(state, context, previewCommand(GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, piece, x, y));
    return { ...result, legal: Boolean(result.accepted), mode: "existing-authorization" };
  }
  const start = applyGameCommand({
    state,
    context,
    command: previewCommand(GAME_COMMAND_TYPE.NORMAL_MOVE_STARTED, piece, x, y),
  });
  if (!start.accepted) return { ...start, legal: false, mode: "start-and-commit" };
  const commit = applyGameCommand({
    state: start.nextState,
    context,
    command: previewCommand(GAME_COMMAND_TYPE.NORMAL_MOVE_COMMITTED, piece, x, y),
  });
  return { ...commit, legal: Boolean(commit.accepted), mode: "start-and-commit" };
}

// A ball-cell choice is a presentation of two Engine-owned command routes.
// It deliberately evaluates the complete normal route when MOVE has not yet
// been started, because a direct board click is a valid second entrance to it.
export function selectSinglePlayerBallCellMoveChoicePresentation(state, context, { piece, x, y } = {}) {
  const threeTwo = selectSinglePlayerThreeTwoPresentation(state, context, { piece, x, y });
  const normal = selectNormalMoveRoutePresentation(state, context, { piece, x, y });
  return {
    threeTwo,
    normal,
    showChoice: Boolean(threeTwo.legal),
    showNormalMove: Boolean(normal.legal),
  };
}

export function selectSinglePlayerNormalMoveContinuationPresentation(state, context, { piece } = {}) {
  const pieceState = state?.tracker?.matchActionState?.byPieceId?.[piece?.id] || {};
  const movement = state?.movementStateByPieceId?.[piece?.id] || {};
  const speed = frozenSpeed(context, piece);
  return {
    allowed: Boolean(
      pieceState.moveAuthorized
      && !movement.movementEnded
      && speed !== null
      && Number(movement.spent) < speed
    ),
  };
}

export function selectSinglePlayerGroupMovePresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateGroupMovePlayer(state, context, previewCommand("GROUP_MOVE_PLAYER_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.accepted) };
}

// The draft band is local presentation, but its availability and frozen shape
// are projected by evaluating the same Engine command that will confirm it.
// The preview transition is never published to Timeline.
export function selectSinglePlayerGroupMoveDraftPresentation(state, context, { piece, replay = false } = {}) {
  const team = teamKeyForPiece(piece);
  if (replay) return { allowed: false, reason: "REPLAY_READ_ONLY", team, zoneLength: null, defaultZoneStartX: null, maxZoneStartX: null };
  const result = applyGameCommand({
    state,
    context,
    command: {
      id: `presentation:group-move-zone:${team || "unknown"}`,
      type: GAME_COMMAND_TYPE.GROUP_MOVE_ZONE_CONFIRMED,
      payload: { team, zoneStartX: 0 },
    },
  });
  if (!result.accepted) {
    return { allowed: false, reason: result.reason || "GROUP_MOVE_NOT_ALLOWED", team, zoneLength: null, defaultZoneStartX: null, maxZoneStartX: null };
  }
  const group = result.nextState?.tracker?.matchActionState?.groupMove || {};
  const cols = Math.max(1, Number(context?.boardSettings?.cols) || 0);
  const zoneLength = Math.max(1, Math.min(cols, Number(group.zoneLength) || 1));
  const maxZoneStartX = Math.max(0, cols - zoneLength);
  return {
    allowed: true,
    reason: null,
    team: group.team,
    zoneLength,
    defaultZoneStartX: Math.floor(maxZoneStartX / 2),
    maxZoneStartX,
  };
}

export function selectSinglePlayerGroupMovePieceStatuses(state) {
  const group = state?.tracker?.matchActionState?.groupMove;
  if (!group?.active) return {};
  return Object.fromEntries((state?.pieces || [])
    .filter(piece => piece?.team !== "BALL" && teamKeyForPiece(piece) === group.team
      && Number(piece.x) >= group.zoneStartX && Number(piece.x) < group.zoneStartX + group.zoneLength)
    .map(piece => [piece.id, evaluateGroupMovePieceEligibility(state, { payload: { pieceId: piece.id } }).accepted ? "eligible" : "ineligible"]));
}

export function selectSinglePlayerPieceActionPresentation(state, { piece, replay = false } = {}) {
  const tracker = state?.tracker || {};
  const team = teamKeyForPiece(piece);
  const actionStatus = trackerActionStatusForTeam(tracker, team);
  const personal = personalActionStatusForPiece(tracker, { team, pieceId: piece?.id });
  return {
    team,
    actionStatus,
    personal,
    teamActive: isTeamActiveForTrackerPhase(tracker, team),
    actionAllowed: canUseTrackerActionForPiece({ replay, piece, gameMode: state?.gameMode, gameStarted: tracker.gameStarted, sessionActive: false }),
    freeAllowed: canUseTrackerFreeModeForPiece({ replay, piece, gameMode: state?.gameMode, gameStarted: tracker.gameStarted, sessionActive: false }),
    movementAuthorization: movementAuthorizationForPiece({ piece, team, gameMode: state?.gameMode, tracker }),
    groupMoveAuthorized: hasGroupMoveAuthorization(tracker, team),
  };
}

export function selectSinglePlayerTeamActionPresentation(state, { team } = {}) {
  return { actionStatus: trackerActionStatusForTeam(state?.tracker || {}, team), teamActive: isTeamActiveForTrackerPhase(state?.tracker || {}, team) };
}

// Presentation only: the Engine owns granting, consuming and expiring these tokens.
export function selectSinglePlayerRollModifierTokenPresentation(state, { team } = {}) {
  const turn = Number(state?.tracker?.currentTurn) || 1;
  return activeTeamModifierTokens(state?.teamModifierTokens, team, turn);
}

// The UI may choose a token type, but this Engine selector owns the resulting
// numeric preview and source list. Prompt and submitted roll therefore share
// one calculation contract.
export function selectSinglePlayerRollPromptPresentation(state, context, { team, selectedModifierType = null } = {}) {
  const pending = state?.actionResolution;
  const base = pending?.kind === "lofted-through-ball"
    ? pending?.plan?.rollPreview
    : pending?.kind === "pass"
      ? pending?.rollPresentation
      : null;
  if (!base) return null;
  const token = activeTeamModifierTokens(state?.teamModifierTokens, team, state?.tracker?.currentTurn)
    .find(item => item.modifierType === selectedModifierType) || null;
  if (!token) return base;
  const value = resolveDiceModifierStacks(context?.ruleSet?.diceModifiers, token.modifierType);
  const rawModifier = (Number(base.rawModifier ?? base.modifier) || 0) + value;
  const cap = Math.max(0, Number(base.modifierCap ?? context?.ruleSet?.diceModifiers?.stackCap) || 0);
  const modifier = Math.max(-cap, Math.min(cap, rawModifier));
  return {
    ...base,
    rawModifier,
    modifier,
    modifierCap: cap,
    capped: modifier !== rawModifier,
    totalBonus: (Number(base.totalBonus ?? base.modifier) || 0) + (modifier - (Number(base.modifier) || 0)),
    modifierSources: [
      ...(Array.isArray(base.modifierSources) ? base.modifierSources : []),
      { label: ({ advantage: "Advantage", majorAdvantage: "Major Advantage", disadvantage: "Disadvantage", majorDisadvantage: "Major Disadvantage" })[token.modifierType], value, source: "team-modifier-token", detail: "earned team modifier" },
    ],
  };
}

export function selectSinglePlayerDicePresentation(state, { team, extraRollArmed = false } = {}) {
  const pending = state?.actionResolution;
  const request = pending?.pendingRoll || null;
  // Dice ownership is a persisted Engine request, not a list of mechanic
  // names maintained by the UI. Pass, Lofted Through and future D20 actions
  // all expose the same request shape when a team may roll.
  if (request?.team && Number.isFinite(Number(request.dieType))) {
    return {
      canRoll: request.team === team,
      reason: "GAMEPLAY_PENDING_ROLL",
      dieType: Number(request.dieType),
      requestId: request.requestId || null,
    };
  }
  if (pending) return { canRoll: false, reason: "ACTION_RESOLUTION_ACTIVE" };
  return { canRoll: Boolean(extraRollArmed), reason: extraRollArmed ? "EXTRA_ROLL" : "EXTRA_ROLL_NOT_ARMED" };
}

export function selectSinglePlayerFreeMovePresentation(state, { piece, x, y } = {}) {
  const result = evaluateFreeMove(state, previewCommand("FREE_MOVE_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.accepted) };
}

export function selectSinglePlayerFreeBallPresentation(state, context, { x, y } = {}) {
  const result = evaluateFreeBallMoved(state, context, { id: `presentation:free-ball:${x}:${y}`, payload: { x: Number(x), y: Number(y) } });
  return { ...result, legal: Boolean(result.accepted) };
}

export function selectSinglePlayerFreeBallControlPresentation(state, { replay = false } = {}) {
  const actionState = state?.tracker?.matchActionState || {};
  return {
    allowed: Boolean(
      !replay
      && state?.gameMode === "match"
      && !state?.actionResolution
      && !state?.actionContinuation
      && !actionState.freeMode?.active
      && !actionState.groupMove?.active
      && !actionState.activeMovement?.active
    ),
  };
}

function pieceHasBall(state, piece) {
  return Boolean(piece && (state?.pieces || []).some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y)));
}

function frozenSpeed(context, piece) {
  const card = context?.gameplayCardsById?.[String(piece?.cardId || "")];
  return card ? Math.max(0, Number(cardStat(card, "stat:speed")) || 0) : null;
}

export function selectSinglePlayerInspectorControlPresentation(state, context, { piece, replay = false } = {}) {
  const action = selectSinglePlayerPieceActionPresentation(state, { piece, replay });
  const current = state?.tracker?.matchActionState || {};
  const continuation = state?.actionContinuation?.kind === "bonus-card-action" ? state.actionContinuation : null;
  const pending = state?.actionResolution || null;
  const teamOwnsContinuation = !continuation || continuation.team === action.team;
  const freeMoveSamePiece = Boolean(current.freeMode?.active && String(current.freeMode.pieceId || "") === String(piece?.id || ""));
  return {
    ...action,
    endTurnAllowed: Boolean(
      action.actionAllowed
      && action.teamActive
      && !continuation
      && !pending
      && !current.freeMode?.active
      && !current.activeMovement?.active
    ),
    freeBall: selectSinglePlayerFreeBallControlPresentation(state, { replay }),
    freeMoveAllowed: Boolean(
      action.freeAllowed
      // A ready Bonus Action does not own a piece yet. Free Move remains an
      // explicit always-available action until a bonus card action is begun.
      && !(continuation && continuation.status !== "ready")
      && !current.activeMovement?.active
      && !current.groupMove?.active
      && (!current.freeMode?.active || freeMoveSamePiece)
    ),
    continuation,
    teamOwnsContinuation,
    pending,
  };
}

export function selectSinglePlayerInspectorActionPresentation(state, context, { piece, type, replay = false } = {}) {
  const control = selectSinglePlayerInspectorControlPresentation(state, context, { piece, replay });
  const current = state?.tracker?.matchActionState || {};
  const pieceState = current.byPieceId?.[piece?.id] || {};
  const continuation = control.continuation;
  // A pending resolution locks the ordinary action row regardless of its
  // mechanic. Only Pass has a row-level cancellation label; Through Ball
  // owns its inline control separately in the Inspector.
  const pending = control.pending || null;
  const passCancellable = type === "PASS" && pending?.kind === "pass" && pending?.passerId === piece?.id && ["targeting", "route-selection"].includes(pending.status);
  const normalMove = current.activeMovement || {};
  const moveCancellable = type === "MOVE" && normalMove.active && normalMove.kind === "normal-move" && String(normalMove.pieceId || "") === String(piece?.id || "");
  const bonusMoveCancellable = type === "MOVE" && continuation?.status === "action-active" && continuation.actionType === "MOVE" && String(continuation.pieceId || "") === String(piece?.id || "") && !continuation.movementStarted;
  const movement = state?.movementStateByPieceId?.[piece?.id] || {};
  const speed = frozenSpeed(context, piece);
  const normalHasRemaining = Boolean(pieceState.moveAuthorized && !movement.movementEnded && speed !== null && Number(movement.spent) < speed);
  const personalBlocked = Boolean(control.personal.limit > 0 && control.personal.exhausted && type !== "GROUP_MOVE" && !moveCancellable && !(type === "MOVE" && normalHasRemaining));
  const continuationReady = continuation?.status === "ready";
  const implementedBonusAction = BONUS_ACTION_IMPLEMENTED_TYPES.includes(type);
  const implementedOfflineAction = OFFLINE_IMPLEMENTED_ACTION_TYPES.includes(type);
  const trackerComplete = control.actionStatus.exhausted;
  const disabled = bonusMoveCancellable
    ? false
    : passCancellable
      ? false
      : moveCancellable
        ? false
        : normalMove.active
          ? true
          : continuationReady
            ? Boolean(
                !control.teamOwnsContinuation
                || !implementedBonusAction
                || type === "GROUP_MOVE"
                || piece?.inactive
                || current.freeMode?.active
                || current.groupMove?.active
                || (["PASS", "THROUGH_BALL", "LOFTED_THROUGH_BALL"].includes(type) && !pieceHasBall(state, piece))
              )
            : Boolean(
                !implementedOfflineAction
                || pending
                || !control.teamOwnsContinuation
                || Boolean(continuation)
                || !control.teamActive
                || !control.actionAllowed
                || personalBlocked
                || current.freeMode?.active
                || current.groupMove?.active
                || (["PASS", "THROUGH_BALL", "LOFTED_THROUGH_BALL"].includes(type) && !pieceHasBall(state, piece))
                || (type === "MOVE" && pieceState.moveUsed && !normalHasRemaining)
                || (type === "GROUP_MOVE" && control.actionStatus.remaining !== 1 && !trackerComplete)
              );
  return {
    ...control,
    disabled,
    actionLocked: trackerComplete && !continuationReady && !passCancellable && !moveCancellable,
    label: passCancellable ? "CANCEL PASS" : (moveCancellable || bonusMoveCancellable) ? "CANCEL MOVE" : type === "PASS" ? "PASS S/L" : String(type || "").replace("GROUP_MOVE", "GROUP MOVE"),
  };
}

export function selectSinglePlayerInterceptorChoicePresentation(state, context) {
  const pending = state?.actionResolution;
  if (pending?.kind !== "pass" || pending.status !== "awaiting-interceptor-choice") return null;
  const candidates = interceptorChoiceCandidates(pending.plan?.interceptors, pending.interceptorIndex);
  return {
    team: teamKeyForPiece(candidates[0]?.defender),
    candidates: candidates.map(item => ({
      ...item,
      interception: cardStat(context?.gameplayCardsById?.[String(item?.defender?.cardId || "")], pending.plan?.interceptionRules?.defenderRollStatId || "stat:interception"),
    })),
  };
}
