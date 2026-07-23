// Single Player Match UI reads this projection boundary only.  It deliberately
// performs no gameplay resolution: all gameplay facts were persisted by Engine
// commands in MatchState using the frozen MatchContext.

import { evaluateNormalMove } from "./normalMoveRules.mjs";
import { evaluateFreeMove } from "./freeMoveRules.mjs";
import { evaluateFreeBallMoved } from "./gameEngine.mjs";
import { evaluateThreeTwoMove } from "./threeTwoMoveRules.mjs";
import { evaluateGroupMovePieceEligibility, evaluateGroupMovePlayer } from "./groupMoveRules.mjs";
import { canUseTrackerActionForPiece, canUseTrackerFreeModeForPiece, hasGroupMoveAuthorization, isTeamActiveForTrackerPhase, movementAuthorizationForPiece, personalActionStatusForPiece, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { cardStat, interceptorChoiceCandidates, teamKeyForPiece } from "../rules/passEngine.mjs";

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
    status: route.goalkeeperRouteBlocked ? "blocked" : route.risk ? "risk" : "clear",
    disabled: Boolean(route.goalkeeperRouteBlocked),
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

export function selectSinglePlayerThreeTwoPresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateThreeTwoMove(state, context, previewCommand("THREE_TWO_MOVE_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.eligible) };
}

export function selectSinglePlayerGroupMovePresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateGroupMovePlayer(state, context, previewCommand("GROUP_MOVE_PLAYER_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.accepted) };
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

export function selectSinglePlayerDicePresentation(state, { team, extraRollArmed = false } = {}) {
  const pending = state?.actionResolution;
  if (pending?.kind === "pass" && pending.status === "awaiting-interception-roll") {
    const interceptor = pending.plan?.interceptors?.[pending.interceptorIndex];
    return { canRoll: teamKeyForPiece(interceptor?.defender) === team, reason: "PASS_INTERCEPTION_ROLL" };
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
      && !continuation
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
  const pending = control.pending?.kind === "pass" ? control.pending : null;
  const passCancellable = type === "PASS" && pending?.passerId === piece?.id && ["targeting", "route-selection"].includes(pending.status);
  const normalMove = current.activeMovement || {};
  const moveCancellable = type === "MOVE" && normalMove.active && normalMove.kind === "normal-move" && String(normalMove.pieceId || "") === String(piece?.id || "");
  const bonusMoveCancellable = type === "MOVE" && continuation?.status === "action-active" && continuation.actionType === "MOVE" && String(continuation.pieceId || "") === String(piece?.id || "") && !continuation.movementStarted;
  const movement = state?.movementStateByPieceId?.[piece?.id] || {};
  const speed = frozenSpeed(context, piece);
  const normalHasRemaining = Boolean(pieceState.moveAuthorized && !movement.movementEnded && speed !== null && Number(movement.spent) < speed);
  const personalBlocked = Boolean(control.personal.limit > 0 && control.personal.exhausted && type !== "GROUP_MOVE" && !moveCancellable && !(type === "MOVE" && normalHasRemaining));
  const continuationReady = continuation?.status === "ready";
  const trackerComplete = control.actionStatus.exhausted;
  const disabled = bonusMoveCancellable
    ? false
    : passCancellable
      ? false
      : moveCancellable
        ? false
        : normalMove.active
          ? true
          : Boolean(
              pending
              || !control.teamOwnsContinuation
              || (continuationReady ? type === "GROUP_MOVE" : Boolean(continuation))
              || !control.teamActive
              || !control.actionAllowed
              || personalBlocked
              || current.freeMode?.active
              || current.groupMove?.active
              || (type === "PASS" && !pieceHasBall(state, piece))
              || (type === "MOVE" && pieceState.moveUsed && !normalHasRemaining)
              || (type === "GROUP_MOVE" && control.actionStatus.remaining !== 1 && !trackerComplete)
            );
  return {
    ...control,
    disabled,
    actionLocked: trackerComplete && !passCancellable && !moveCancellable,
    label: passCancellable ? "CANCEL PASS" : (moveCancellable || bonusMoveCancellable) ? "CANCEL MOVE" : String(type || "").replace("GROUP_MOVE", "GROUP MOVE"),
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
