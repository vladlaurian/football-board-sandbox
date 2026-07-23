// Single Player Match UI reads this projection boundary only.  It deliberately
// performs no gameplay resolution: all gameplay facts were persisted by Engine
// commands in MatchState using the frozen MatchContext.

import { evaluateNormalMove } from "./normalMoveRules.mjs";
import { evaluateThreeTwoMove } from "./threeTwoMoveRules.mjs";
import { evaluateGroupMovePieceEligibility, evaluateGroupMovePlayer } from "./groupMoveRules.mjs";
import { canUseTrackerActionForPiece, canUseTrackerFreeModeForPiece, hasGroupMoveAuthorization, isTeamActiveForTrackerPhase, movementAuthorizationForPiece, personalActionStatusForPiece, trackerActionStatusForTeam } from "../tracker/actionRules.mjs";
import { teamKeyForPiece } from "../rules/passEngine.mjs";

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
  return { id: `presentation:${type}:${piece?.id || ""}:${x}:${y}`, type, payload: { pieceId: piece?.id, x: Number(x), y: Number(y), presentationOnly: true } };
}

export function selectSinglePlayerNormalMovePresentation(state, context, { piece, x, y } = {}) {
  const result = evaluateNormalMove(state, context, previewCommand("NORMAL_MOVE_COMMITTED", piece, x, y));
  return { ...result, legal: Boolean(result.accepted) };
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
