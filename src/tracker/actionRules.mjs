import { clamp } from "../game/numberUtils.mjs";
import { normalizeMatchActionState, normalizeTrackerSnapshot } from "./trackerState.mjs";

export function opposingTeam(team) {
  return team === "blue" ? "red" : "blue";
}

export function trackerRoleForTeam(rawTracker, team) {
  const tracker = normalizeTrackerSnapshot(rawTracker);
  if (!tracker.gameStarted || tracker.currentTurn < 1) return "waiting";
  return team === tracker.startingTeam ? "attack" : "defense";
}

export function trackerActionLimitForTeam(rawTracker, team) {
  const tracker = normalizeTrackerSnapshot(rawTracker);
  return trackerRoleForTeam(tracker, team) === "attack"
    ? tracker.settings.attackActions
    : tracker.settings.defenseActions;
}

export function trackerActionStatusForTeam(rawTracker, team, usedOverride = null) {
  const tracker = normalizeTrackerSnapshot(rawTracker);
  const limit = trackerActionLimitForTeam(tracker, team);
  const source = usedOverride || tracker.usedActions;
  const used = clamp(Number(source?.[team]) || 0, 0, limit);
  return { limit, used, remaining: Math.max(0, limit - used), exhausted: used >= limit };
}

export function activeTeamForTrackerPhase(rawTracker, phaseOverride) {
  const tracker = normalizeTrackerSnapshot(rawTracker);
  const phase = phaseOverride ?? tracker.turnPhase;
  if (phase === "attack") return tracker.startingTeam;
  if (phase === "defense") return opposingTeam(tracker.startingTeam);
  return null;
}

export function isTeamActiveForTrackerPhase(rawTracker, team, phaseOverride) {
  return Boolean(team && activeTeamForTrackerPhase(rawTracker, phaseOverride) === team);
}

export function trackerPhaseBlockReason(phase) {
  return phase === "complete" ? "all-actions-complete" : "wait-active-team";
}

export function nextTrackerPhase(phase) {
  return phase === "attack" ? "defense" : "complete";
}

export function trackerTurnChangeDecision({ readOnly = false, gameStarted = false, currentTurn = 0, targetTurn = 0, turnPhase = "attack", gameMode = "match" } = {}) {
  const current = Math.max(0, Number(currentTurn) || 0);
  const target = Math.max(0, Number(targetTurn) || 0);
  if (readOnly || !gameStarted || target < 1 || target === current) return { allowed: false, reason: "unavailable" };
  if (target > current + 1) return { allowed: false, reason: "skip-not-allowed" };
  // Editor Mode is the deliberately unrestricted test sandbox. It retains
  // manual Tracker marking, but does not require inaccessible END TURN actions
  // before moving its numbered turn forward.
  if (target > current && gameMode !== "editor" && turnPhase !== "complete") {
    return { allowed: false, reason: "both-teams-must-end" };
  }
  return { allowed: true, direction: target > current ? "advance" : "reverse" };
}

export function createEmptyTrackerTurnState() {
  return {
    usedActions: { red: 0, blue: 0 },
    actionLog: { red: [], blue: [] },
    matchActionState: normalizeMatchActionState({}),
    turnPhase: "attack",
    movementStateByPieceId: {},
  };
}

export function hasGroupMoveAuthorization(rawTracker, team) {
  const tracker = normalizeTrackerSnapshot(rawTracker);
  if (!tracker.matchActionState.groupMove.active || tracker.matchActionState.groupMove.team !== team) return false;
  const log = Array.isArray(tracker.actionLog?.[team]) ? tracker.actionLog[team] : [];
  const lastAction = log[log.length - 1];
  const status = trackerActionStatusForTeam(tracker, team);
  return Boolean(
    tracker.gameStarted
    && lastAction?.type === "GROUP_MOVE"
    && status.exhausted
    && log.length === status.limit
  );
}

export function movementAuthorizationForPiece({ piece, team, gameMode, tracker: rawTracker }) {
  if (!piece || piece.team === "BALL" || gameMode === "editor") return { allowed: true, mode: "normal" };
  const tracker = normalizeTrackerSnapshot(rawTracker);
  if (!tracker.gameStarted || tracker.currentTurn < 1) {
    return { allowed: false, mode: "blocked", reason: "match-not-started" };
  }
  const state = tracker.matchActionState.byPieceId[piece.id] || {};
  if (tracker.matchActionState.freeMode?.active && tracker.matchActionState.freeMode?.pieceId === piece.id) {
    return { allowed: true, mode: "free" };
  }
  if (!isTeamActiveForTrackerPhase(tracker, team)) {
    return { allowed: false, mode: "blocked", reason: trackerPhaseBlockReason(tracker.turnPhase) };
  }
  if (hasGroupMoveAuthorization(tracker, team)) return { allowed: true, mode: "group" };
  if (state.moveAuthorized) return { allowed: true, mode: "normal" };
  return { allowed: false, mode: "blocked" };
}

export function canUseTrackerActionForPiece({ replay = false, piece, gameMode, gameStarted, sessionActive = false, myTeam = "spectator", pieceTeam = "" }) {
  if (replay || !piece || piece.team === "BALL" || piece.inactive || gameMode !== "match" || !gameStarted) return false;
  if (!sessionActive) return true;
  return myTeam !== "spectator" && pieceTeam === myTeam;
}

export function canUseTrackerFreeModeForPiece({ replay = false, piece, gameMode, gameStarted, sessionActive = false, myTeam = "spectator" }) {
  return Boolean(
    !replay
    && piece
    && piece.team !== "BALL"
    && !piece.inactive
    && gameMode === "match"
    && gameStarted
    && (!sessionActive || myTeam !== "spectator")
  );
}

export function toggleFreeModeState(rawActionState, { pieceId, team, timelineGroupId }) {
  const current = normalizeMatchActionState(rawActionState);
  const isSameFreePiece = Boolean(current.freeMode.active && current.freeMode.pieceId === pieceId);
  return {
    active: !isSameFreePiece,
    isSameFreePiece,
    state: normalizeMatchActionState({
      ...current,
      byPieceId: current.byPieceId,
      freeMode: isSameFreePiece
        ? { active: false, pieceId: null, team: null, timelineGroupId }
        : { active: true, pieceId, team, timelineGroupId },
    }),
  };
}

export function activateTrackerAction(rawTracker, { type, pieceId, team, entryId }) {
  const tracker = normalizeTrackerSnapshot(rawTracker);
  const currentPieceState = tracker.matchActionState.byPieceId[pieceId] || {};
  if (hasGroupMoveAuthorization(tracker, team)) return { allowed: false, reason: "group-move-active" };
  if (!isTeamActiveForTrackerPhase(tracker, team)) {
    return { allowed: false, reason: trackerPhaseBlockReason(tracker.turnPhase) };
  }
  const status = trackerActionStatusForTeam(tracker, team);
  if (status.exhausted) return { allowed: false, reason: "actions-complete-end-turn" };
  if (type === "MOVE" && currentPieceState.moveUsed) return { allowed: false, reason: "move-already-used" };
  if (type === "GROUP_MOVE" && status.remaining !== 1) return { allowed: false, reason: "group-move-last-action-only" };

  const entry = { id: String(entryId), type, pieceId: String(pieceId) };
  const actionLog = {
    ...tracker.actionLog,
    [team]: [...tracker.actionLog[team], entry],
  };
  const usedActions = { ...tracker.usedActions, [team]: actionLog[team].length };
  let matchActionState = tracker.matchActionState;
  if (type === "MOVE") {
    matchActionState = normalizeMatchActionState({
      ...tracker.matchActionState,
      byPieceId: {
        ...tracker.matchActionState.byPieceId,
        [pieceId]: {
          ...currentPieceState,
          moveUsed: true,
          moveAuthorized: true,
          moveGroupId: entry.id,
        },
      },
    });
  }
  if (type === "GROUP_MOVE") {
    matchActionState = normalizeMatchActionState({
      ...tracker.matchActionState,
      groupMove: { active: true, team, timelineGroupId: entry.id },
    });
  }
  return { allowed: true, entry, actionLog, usedActions, matchActionState };
}

export function toggleTrackerActionMarker(usedActions, team, index) {
  const nextValue = usedActions?.[team] === index + 1 ? index : index + 1;
  return { ...usedActions, [team]: nextValue };
}
